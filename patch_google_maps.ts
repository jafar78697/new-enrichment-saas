import * as fs from 'fs';

const filePath = 'apps/api/src/routes/google-maps.ts';
let content = fs.readFileSync(filePath, 'utf8');

// 1. Re-enable wallet reservation
content = content.replace(
  `        // Wallet reservation bypassed: Google Maps leads are now free.
        reservationId = null;`,
  `        reservationId = await walletService.reserve({
          tenantId,
          unit: 'maps_credits',
          amount: maxResults, // Reserve max possible cost (assuming 1 credit per lead)
          referenceType: 'google_maps_scrape',
          referenceId: \`batch_\${Date.now()}\`,
          description: \`Reserved for up to \${maxResults} maps leads\`
        }, initClient);`
);

// 2. Fetch from DB and fallback to Google Maps
const googleScrapeLogic = `      const searchUrl = 'https://places.googleapis.com/v1/places:searchText';
      const allLeads: any[] = [];
      const seenPhones = new Set<string>();
      let uniqueLeadCount = 0;
      let newLeadCount = 0;
      let existingLeadCount = 0;

      for (const keyword of keywords) {
        let pageToken: string | undefined = undefined;
        let leadsForKeyword = 0;

        while (leadsForKeyword < resultsPerKeyword && allLeads.length < maxResults) {
          const textQuery = \`\${keyword} in \${requestedLocation}\`;
          const body: any = { textQuery, pageSize: 20 };
          if (pageToken) body.pageToken = pageToken;

          const response = await fetch(searchUrl, {
            method: 'POST',
            headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': apiKey,
            'X-Goog-FieldMask': 'places.id,places.displayName,places.nationalPhoneNumber,places.websiteUri,places.formattedAddress,places.rating,places.userRatingCount,places.primaryType,nextPageToken'
          },
            body: JSON.stringify(body)
          });

          const data: any = await response.json();
          if (!response.ok || !data.places || data.places.length === 0) break;

          const leads = data.places.flatMap((place: any) => {
            const phone = normalizeUSPhone(place.nationalPhoneNumber);
            if (!phone || !isUSPlace(place)) return [];

            return [{
              name: place.displayName?.text || 'Unknown',
              phone,
              website: place.websiteUri || null,
              address: place.formattedAddress || ''
            }];
          });

          const allowedLeads: any[] = [];
          const remainingForKeyword = resultsPerKeyword - leadsForKeyword;
          const remainingForBatch = maxResults - allLeads.length;
          for (const lead of leads) {
            if (seenPhones.has(lead.phone)) continue;
            seenPhones.add(lead.phone);
            allowedLeads.push(lead);
            if (allowedLeads.length >= Math.min(remainingForKeyword, remainingForBatch)) break;
          }
          allLeads.push(...allowedLeads);
          leadsForKeyword += allowedLeads.length;

          pageToken = data.nextPageToken;
          if (!pageToken) break;
          await delay(2000);
        }
      }`;

const dbAndGoogleScrapeLogic = `      const searchUrl = 'https://places.googleapis.com/v1/places:searchText';
      const allLeads: any[] = [];
      const seenPhones = new Set<string>();
      let uniqueLeadCount = 0;
      let newLeadCount = 0;
      let existingLeadCount = 0;
      let dbLeadsCount = 0;
      let googleLeadsCount = 0;

      for (const keyword of keywords) {
        const normalizedQuery = \`\${keyword.toLowerCase().trim()} in \${requestedLocation.toLowerCase().trim()}\`;
        let leadsForKeyword = 0;

        // 1. Check Global Lead Cache first
        const cacheClient = await (db as any).connect?.() || db;
        let cachedLeads: any[] = [];
        try {
          const { rows } = await cacheClient.query(
            \`SELECT name, phone, website, address, place_id
             FROM global_lead_cache
             WHERE search_query = $1
             LIMIT $2\`,
            [normalizedQuery, resultsPerKeyword]
          );
          cachedLeads = rows;
        } catch (err) {
          fastify.log.error('Failed to read from global_lead_cache: ' + err);
        } finally {
          if (cacheClient.release) cacheClient.release();
        }

        for (const lead of cachedLeads) {
          if (seenPhones.has(lead.phone)) continue;
          seenPhones.add(lead.phone);
          allLeads.push(lead);
          leadsForKeyword++;
          dbLeadsCount++;
          if (leadsForKeyword >= resultsPerKeyword || allLeads.length >= maxResults) break;
        }

        // 2. Fetch from Google if we need more leads
        let pageToken: string | undefined = undefined;
        let newLeadsToCache: any[] = [];

        while (leadsForKeyword < resultsPerKeyword && allLeads.length < maxResults) {
          const textQuery = \`\${keyword} in \${requestedLocation}\`;
          const body: any = { textQuery, pageSize: 20 };
          if (pageToken) body.pageToken = pageToken;

          const response = await fetch(searchUrl, {
            method: 'POST',
            headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': apiKey,
            'X-Goog-FieldMask': 'places.id,places.displayName,places.nationalPhoneNumber,places.websiteUri,places.formattedAddress,places.rating,places.userRatingCount,places.primaryType,nextPageToken'
          },
            body: JSON.stringify(body)
          });

          const data: any = await response.json();
          if (!response.ok || !data.places || data.places.length === 0) break;

          const leads = data.places.flatMap((place: any) => {
            const phone = normalizeUSPhone(place.nationalPhoneNumber);
            if (!phone || !isUSPlace(place)) return [];

            return [{
              name: place.displayName?.text || 'Unknown',
              phone,
              website: place.websiteUri || null,
              address: place.formattedAddress || '',
              place_id: place.id || null,
              category: place.primaryType || null,
              raw_data: place
            }];
          });

          const allowedLeads: any[] = [];
          const remainingForKeyword = resultsPerKeyword - leadsForKeyword;
          const remainingForBatch = maxResults - allLeads.length;
          
          for (const lead of leads) {
            if (seenPhones.has(lead.phone)) continue;
            seenPhones.add(lead.phone);
            allowedLeads.push(lead);
            newLeadsToCache.push(lead);
            if (allowedLeads.length >= Math.min(remainingForKeyword, remainingForBatch)) break;
          }
          
          allLeads.push(...allowedLeads);
          leadsForKeyword += allowedLeads.length;
          googleLeadsCount += allowedLeads.length;

          pageToken = data.nextPageToken;
          if (!pageToken) break;
          await delay(2000);
        }

        // 3. Save new leads to Global Cache
        if (newLeadsToCache.length > 0) {
          const insertCacheClient = await (db as any).connect?.() || db;
          try {
            const cacheValues: any[] = [];
            const cachePlaceholders: string[] = [];
            let cIdx = 0;
            for (const lead of newLeadsToCache) {
              const offset = cIdx * 8;
              cacheValues.push(
                normalizedQuery,
                lead.name,
                lead.phone,
                lead.website || null,
                lead.address || null,
                lead.category || null,
                lead.place_id || null,
                JSON.stringify(lead.raw_data || {})
              );
              cachePlaceholders.push(\`($\${offset + 1}, $\${offset + 2}, $\${offset + 3}, $\${offset + 4}, $\${offset + 5}, $\${offset + 6}, $\${offset + 7}, $\${offset + 8}::jsonb)\`);
              cIdx++;
            }

            await insertCacheClient.query(
              \`INSERT INTO global_lead_cache (search_query, name, phone, website, address, category, place_id, raw_data)
               VALUES \${cachePlaceholders.join(', ')}
               ON CONFLICT (search_query, phone) DO NOTHING\`,
              cacheValues
            );
          } catch (err) {
            fastify.log.error('Failed to write to global_lead_cache: ' + err);
          } finally {
            if (insertCacheClient.release) insertCacheClient.release();
          }
        }
      }`;

content = content.replace(googleScrapeLogic, dbAndGoogleScrapeLogic);

// 3. Update settle amount
content = content.replace(
  `        if (reservationId) {
          await walletService.settle(reservationId, allLeads.length, finishClient);
        }`,
  `        if (reservationId) {
          const finalCost = Math.ceil(googleLeadsCount + (dbLeadsCount * 0.5));
          await walletService.settle(reservationId, finalCost, finishClient);
        }`
);

// 4. Update reply.send costCredits
content = content.replace(
  `        costCredits: allLeads.length,`,
  `        costCredits: Math.ceil(googleLeadsCount + (dbLeadsCount * 0.5)),
        sourceBreakdown: { db: dbLeadsCount, google: googleLeadsCount },`
);

fs.writeFileSync(filePath, content, 'utf8');
console.log('done');
