import { FastifyInstance } from 'fastify';
import { WalletService } from '../services/wallet.service';

const delay = (ms: number) => new Promise(res => setTimeout(res, ms));
const DEFAULT_US_LOCATION = 'United States';
const MAX_KEYWORDS_PER_BATCH = 10;
const MAX_LEADS_PER_KEYWORD = 60;
const DEMO_KEYWORD_LIMIT = 2;

function normalizeUSPhone(raw: unknown): string | null {
  const digits = String(raw || '').replace(/\D/g, '');
  if (/^[2-9]\d{9}$/.test(digits)) return `+1${digits}`;
  if (/^1[2-9]\d{9}$/.test(digits)) return `+${digits}`;
  return null;
}

function isUSPlace(place: any): boolean {
  const country = place.addressComponents?.find((component: any) => component.types?.includes('country'));
  if (country?.shortText) return country.shortText === 'US';
  return /(?:USA|United States)$/i.test(place.formattedAddress || '');
}

export default async function googleMapsRoutes(fastify: FastifyInstance) {
  fastify.post('/v1/google-maps/scrape', {
    preHandler: [(fastify as any).authenticate]
  }, async (request: any, reply) => {
    const db = fastify.db;
    let reservationId: string | null = null;
    let meteredJobId: string | null = null;
    let enrichmentJobId: string | null = null;
    const walletService = new WalletService(db);

    try {
      const {
        keywords: submittedKeywords,
        location,
        limit,
        limitPerKeyword
      } = request.body as { keywords?: unknown; location?: string; limit?: number; limitPerKeyword?: number };
      const requestedLocation = String(location || '').trim() || DEFAULT_US_LOCATION;
      const { tenantId, userId, workspaceId } = request.tenant;
      const keywordLookup = new Map<string, string>();
      if (Array.isArray(submittedKeywords)) {
        submittedKeywords.forEach((value) => {
          const keyword = String(value || '').trim();
          if (keyword) keywordLookup.set(keyword.toLowerCase(), keyword);
        });
      }
      const keywords = [...keywordLookup.values()];
      const resultsPerKeyword = MAX_LEADS_PER_KEYWORD;
      const maxResults = keywords.length * resultsPerKeyword;
      
      fastify.log.info(`google-maps route called with: ${JSON.stringify({ keywords, location: requestedLocation, resultsPerKeyword, maxResults })}`);
      if (keywords.length === 0) {
        throw new Error('At least one keyword is required in keywords array.');
      }
      if (keywords.length > MAX_KEYWORDS_PER_BATCH) {
        throw new Error(`A Maps batch can contain up to ${MAX_KEYWORDS_PER_BATCH} unique keywords.`);
      }

      // Enforce can_scrape permission before any expensive operations
      if (userId) {
        const { rows: permRows } = await db.query(
          `SELECT can_scrape FROM users WHERE id = $1 AND tenant_id = $2 LIMIT 1`,
          [userId, tenantId]
        );
        if (permRows[0] && permRows[0].can_scrape === false) {
          const err: any = new Error('Your scraping access has been disabled by the administrator.');
          err.statusCode = 403;
          err.code = 'SCRAPING_PERMISSION_DENIED';
          throw err;
        }
      }

      const apiKeys = [
        process.env.GOOGLE_MAPS_API_KEY,
        process.env.GOOGLE_MAPS_API_KEY_1,
        process.env.GOOGLE_MAPS_API_KEY_2
      ].filter(Boolean) as string[];

      if (apiKeys.length === 0) {
        throw new Error('Google Maps API key is not configured.');
      }

      // Randomly pick an API key to distribute the load across multiple Google Cloud accounts
      let apiKey = apiKeys[Math.floor(Math.random() * apiKeys.length)];

      let isDemo = false;
      let demoMaxResults = maxResults;

      const initClient = await (db as any).connect?.() || db;
      const usesInitTransaction = typeof (db as any).connect === 'function';
      try {
        if (usesInitTransaction) await initClient.query('BEGIN');

        const { rows: tenantRows } = await initClient.query(
          `SELECT plan FROM tenants WHERE id = $1 FOR UPDATE`,
          [tenantId]
        );
        
        const { rows: walletRows } = await initClient.query(
          `SELECT available FROM wallets WHERE tenant_id = $1 AND unit = 'maps_credits'`,
          [tenantId]
        );
        const availableCredits = walletRows.length > 0 ? Number(walletRows[0].available) : 0;
        
        let amountToReserve = Math.min(maxResults, availableCredits);
        
        if (tenantRows[0]?.plan === 'demo') {
          isDemo = true;
          // Check 1-hour expiration via durable trial
          const { rows: trialRows } = await initClient.query(
            `SELECT * FROM tenant_demo_trials WHERE tenant_id = $1`,
            [tenantId]
          );
          const trial = trialRows[0];
          if (!trial || new Date(trial.expires_at) < new Date() || trial.status === 'expired') {
            const error: any = new Error('Your 1-hour free demo has expired or has not been started. Please start a demo session on the dashboard or upgrade your account to continue.');
            error.statusCode = 403;
            throw error;
          }

          // Limit to 3 keywords maximum across all searches
          const { rows: keywordUsageRows } = await initClient.query(
            `SELECT COALESCE(SUM(cardinality(keywords)), 0)::int AS used
             FROM metered_maps_jobs
             WHERE tenant_id = $1 AND status IN ('queued', 'running', 'completed')`,
            [tenantId]
          );
          const keywordsUsed = Number(keywordUsageRows[0]?.used || 0);
          if (keywordsUsed + keywords.length > 3) {
            const error: any = new Error(`Your free demo includes 3 keywords total. You have used ${keywordsUsed}. Upgrade your account to continue.`);
            error.statusCode = 402;
            error.code = 'DEMO_KEYWORD_LIMIT_REACHED';
            throw error;
          }
        }

        if (amountToReserve <= 0) {
          const error: any = new Error('Insufficient maps_credits balance. Please upgrade your account to continue.');
          error.statusCode = 402;
          throw error;
        }
        
        demoMaxResults = amountToReserve;

        reservationId = await walletService.reserve({
          tenantId,
          unit: 'maps_credits',
          amount: demoMaxResults, // Reserve available cost
          referenceType: 'google_maps_scrape',
          referenceId: `batch_${Date.now()}`,
          description: `Reserved for up to ${demoMaxResults} maps leads`
        }, initClient);

        const { rows: meteredRows } = await initClient.query(
          `INSERT INTO metered_maps_jobs (tenant_id, user_id, keywords, location, max_credits, status, reservation_id, started_at)
           VALUES ($1, $2, $3, $4, $5, 'running', $6, NOW())
           RETURNING id`,
          [tenantId, userId || null, keywords, requestedLocation, demoMaxResults, reservationId]
        );
        meteredJobId = meteredRows[0].id;

        const { rows: jobRows } = await initClient.query(
          `INSERT INTO enrichment_jobs (tenant_id, workspace_id, status, source_type, mode)
           VALUES ($1, $2, 'processing', 'google-maps', 'maps_scrape') RETURNING id`,
          [tenantId, workspaceId]
        );
        enrichmentJobId = jobRows[0].id;
        if (usesInitTransaction) await initClient.query('COMMIT');
      } catch (err: any) {
        if (usesInitTransaction) await initClient.query('ROLLBACK');
        throw new Error(`Failed to reserve maps credits: ${err.message}`);
      } finally {
        if (initClient.release) initClient.release();
      }

      const searchUrl = 'https://places.googleapis.com/v1/places:searchText';
      const allLeads: any[] = [];
      const seenPhones = new Set<string>();
      let uniqueLeadCount = 0;
      let newLeadCount = 0;
      let existingLeadCount = 0;
      let dbLeadsCount = 0;
      let googleLeadsCount = 0;

      for (const keyword of keywords) {
        const normalizedQuery = `${keyword.toLowerCase().trim()} in ${requestedLocation.toLowerCase().trim()}`;
        let leadsForKeyword = 0;

        // 1. Check Global Lead Cache first
        const cacheClient = await (db as any).connect?.() || db;
        let cachedLeads: any[] = [];
        try {
          const { rows } = await cacheClient.query(
            `SELECT name, phone, website, address, place_id
             FROM global_lead_cache
             WHERE search_query = $1
             LIMIT $2`,
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
        const actualMaxResults = isDemo ? demoMaxResults : maxResults;

        while (leadsForKeyword < resultsPerKeyword && allLeads.length < actualMaxResults) {
          const textQuery = `${keyword} in ${requestedLocation}`;
          const body: any = { textQuery, pageSize: 20 };
          if (pageToken) body.pageToken = pageToken;

          const makeRequest = async (key: string) => {
            return await fetch(searchUrl, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'X-Goog-Api-Key': key,
                'X-Goog-FieldMask': 'places.id,places.displayName,places.nationalPhoneNumber,places.websiteUri,places.formattedAddress,places.rating,places.userRatingCount,places.primaryType,nextPageToken'
              },
              body: JSON.stringify(body)
            });
          };

          let response = await makeRequest(apiKey);
          let data: any = await response.json();

          if (!response.ok) {
            fastify.log.error(`Google Maps API Error with key ${apiKey.substring(0, 5)}: ${JSON.stringify(data)}`);
            let fallbackSuccess = false;
            for (const fallbackKey of apiKeys) {
              if (fallbackKey === apiKey) continue;
              response = await makeRequest(fallbackKey);
              data = await response.json();
              if (response.ok) {
                apiKey = fallbackKey; // stick with the working key
                fallbackSuccess = true;
                break;
              } else {
                fastify.log.error(`Google Maps API Fallback Error: ${JSON.stringify(data)}`);
              }
            }
            if (!fallbackSuccess) {
              throw new Error(data?.error?.message || 'Google Maps API failed to return results.');
            }
          }
          
          if (!data.places || data.places.length === 0) break;

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
          const remainingForBatch = actualMaxResults - allLeads.length;
          
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
              cachePlaceholders.push(`($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8}::jsonb)`);
              cIdx++;
            }

            await insertCacheClient.query(
              `INSERT INTO global_lead_cache (search_query, name, phone, website, address, category, place_id, raw_data)
               VALUES ${cachePlaceholders.join(', ')}
               ON CONFLICT (search_query, phone) DO NOTHING`,
              cacheValues
            );
          } catch (err) {
            fastify.log.error('Failed to write to global_lead_cache: ' + err);
          } finally {
            if (insertCacheClient.release) insertCacheClient.release();
          }
        }
      }

      const finishClient = await (db as any).connect?.() || db;
      const usesFinishTransaction = typeof (db as any).connect === 'function';
      try {
        if (usesFinishTransaction) await finishClient.query('BEGIN');

        // Keep Maps leads in the standard enrichment pipeline: every result needs a
        // completed job item before it can be inserted into enrichment_results.
        if (allLeads.length > 0) {
          const jobItemValues: any[] = [];
          const jobItemPlaceholders: string[] = [];
          const meteredValues: any[] = [];
          const meteredPlaceholders: string[] = [];

          let idx = 0;
          for (const lead of allLeads) {
            const jobItemOffset = idx * 5;
            const leadInput = lead.website || lead.name || lead.place_id || `google-maps-${idx}`;
            jobItemValues.push(
              enrichmentJobId, tenantId, leadInput, leadInput, idx
            );
            jobItemPlaceholders.push(`($${jobItemOffset + 1}, $${jobItemOffset + 2}, $${jobItemOffset + 3}, $${jobItemOffset + 4}, 'completed', $${jobItemOffset + 5}, NOW(), NOW())`);

            const meteredOffset = idx * 9;
            meteredValues.push(
              meteredJobId, tenantId, lead.place_id || null, lead.name, lead.address, lead.phone, lead.website || null, lead.category || null, JSON.stringify(lead)
            );
            meteredPlaceholders.push(`($${meteredOffset + 1}, $${meteredOffset + 2}, $${meteredOffset + 3}, $${meteredOffset + 4}, $${meteredOffset + 5}, $${meteredOffset + 6}, $${meteredOffset + 7}, NULL, NULL, $${meteredOffset + 8}, $${meteredOffset + 9}::jsonb)`);
            idx++;
          }

          const { rows: jobItems } = await finishClient.query(
            `INSERT INTO enrichment_job_items (
               job_id, tenant_id, raw_input, normalized_domain, status, shard_index, started_at, finished_at
             ) VALUES ${jobItemPlaceholders.join(', ')}
             RETURNING id, shard_index`,
            jobItemValues
          );

          const jobItemIds = new Map(jobItems.map((item: any) => [Number(item.shard_index), item.id]));
          const enrichmentValues: any[] = [];
          const enrichmentPlaceholders: string[] = [];

          for (let resultIndex = 0; resultIndex < allLeads.length; resultIndex++) {
            const lead = allLeads[resultIndex];
            const jobItemId = jobItemIds.get(resultIndex);
            if (!jobItemId) throw new Error('Could not create an enrichment job item for a Maps lead.');

            const rawLead = {
              ...lead,
              source: 'google_maps',
              enrichment_job_id: enrichmentJobId,
              metered_maps_job_id: meteredJobId
            };
            const enrichmentOffset = resultIndex * 6;
            enrichmentValues.push(
              jobItemId, tenantId, lead.website || lead.name, lead.phone, lead.name, JSON.stringify(rawLead)
            );
            enrichmentPlaceholders.push(`($${enrichmentOffset + 1}, $${enrichmentOffset + 2}, $${enrichmentOffset + 3}, $${enrichmentOffset + 4}, $${enrichmentOffset + 5}, $${enrichmentOffset + 6}::jsonb)`);
          }

          await finishClient.query(
            `INSERT INTO enrichment_results (job_item_id, tenant_id, domain, primary_phone, company_name, raw_data)
             VALUES ${enrichmentPlaceholders.join(', ')}`,
            enrichmentValues
          );

          // The calling Lead List reads from contacts. Mirror the lean Maps fields
          // there so a successful scrape is immediately ready for manual calling.
          const contactsByPhone = new Map<string, any>();
          for (const lead of allLeads) {
            const phone = String(lead.phone || '').trim();
            if (!phone) continue;

            const existing = contactsByPhone.get(phone);
            if (!existing || (!existing.website && lead.website)) {
              contactsByPhone.set(phone, lead);
            }
          }

          const contactLeads = [...contactsByPhone.values()];
          uniqueLeadCount = contactLeads.length;
          if (contactLeads.length > 0) {
            const contactValues: any[] = [];
            const contactPlaceholders: string[] = [];

            contactLeads.forEach((lead, contactIndex) => {
              const contactOffset = contactIndex * 6;
              const businessName = String(lead.name || '').trim() || 'Google Maps business';
              contactValues.push(
                tenantId,
                businessName,
                String(lead.phone).trim(),
                businessName,
                lead.website || null,
                'google_maps'
              );
              contactPlaceholders.push(`($${contactOffset + 1}::uuid, $${contactOffset + 2}, $${contactOffset + 3}, $${contactOffset + 4}, $${contactOffset + 5}, $${contactOffset + 6})`);
            });

            const incomingContacts = `(VALUES ${contactPlaceholders.join(', ')}) AS incoming(tenant_id, name, phone_number, company, website, source)`;

            const { rows: existingContacts } = await finishClient.query(
              `SELECT phone_number
               FROM contacts
               WHERE tenant_id = $1 AND phone_number = ANY($2::TEXT[])`,
              [tenantId, contactLeads.map((lead) => String(lead.phone).trim())]
            );
            existingLeadCount = existingContacts.length;
            newLeadCount = Math.max(0, contactLeads.length - existingLeadCount);

            await finishClient.query(
              `UPDATE contacts AS contact
               SET company = COALESCE(NULLIF(contact.company, ''), incoming.company),
                   website = COALESCE(NULLIF(contact.website, ''), incoming.website),
                   source = COALESCE(NULLIF(contact.source, ''), incoming.source),
                   updated_at = NOW()
               FROM ${incomingContacts}
               WHERE contact.tenant_id = incoming.tenant_id
                 AND contact.phone_number = incoming.phone_number`,
              contactValues
            );

            await finishClient.query(
              `INSERT INTO contacts (tenant_id, name, phone_number, company, website, source)
               SELECT incoming.tenant_id, incoming.name, incoming.phone_number,
                      incoming.company, incoming.website, incoming.source
               FROM ${incomingContacts}
               WHERE NOT EXISTS (
                 SELECT 1 FROM contacts AS contact
                 WHERE contact.tenant_id = incoming.tenant_id
                   AND contact.phone_number = incoming.phone_number
               )`,
              contactValues
            );
          }

          await finishClient.query(
            `INSERT INTO metered_maps_results (job_id, tenant_id, place_id, business_name, address, phone, website, rating, review_count, category, raw_data)
             VALUES ${meteredPlaceholders.join(', ')}`,
            meteredValues
          );
        }

        await finishClient.query(
          `UPDATE enrichment_jobs SET status = 'completed', total_items = $1, completed_items = $1 WHERE id = $2`,
          [allLeads.length, enrichmentJobId]
        );

        const finalCost = uniqueLeadCount;

        await finishClient.query(
          `UPDATE metered_maps_jobs
           SET status = 'completed', credits_used = $1, results_count = $2, completed_at = NOW()
           WHERE id = $3`,
          [finalCost, allLeads.length, meteredJobId]
        );

        if (reservationId) {
          await walletService.settle(reservationId, finalCost, finishClient);
        }

        if (usesFinishTransaction) await finishClient.query('COMMIT');
      } catch (err) {
        if (usesFinishTransaction) await finishClient.query('ROLLBACK');
        throw err;
      } finally {
        if (finishClient.release) finishClient.release();
      }

      return reply.send({
        success: true,
        jobId: meteredJobId,
        enrichmentJobId,
        leadsCount: allLeads.length,
        uniqueLeadCount,
        newLeadCount,
        existingLeadCount,
        costCredits: newLeadCount,
        sourceBreakdown: { db: dbLeadsCount, google: googleLeadsCount },
      });
    } catch (err: any) {
      if (reservationId) {
        try { await walletService.release(reservationId); } catch (e) {}
      }
      if (meteredJobId) {
        try {
          await db.query(
            `UPDATE metered_maps_jobs SET status = 'failed', error_message = $1, completed_at = NOW() WHERE id = $2`,
            [err.message || 'Maps job failed', meteredJobId]
          );
        } catch {}
      }
      if (enrichmentJobId) {
        try {
          await db.query(`UPDATE enrichment_jobs SET status = 'failed' WHERE id = $1`, [enrichmentJobId]);
        } catch {}
      }
      fastify.log.error(err);
      return reply.code(err.statusCode || (err.message.includes('Insufficient') ? 402 : 500)).send({
        error: err.message || 'Internal Server Error',
        code: err.code,
      });
    }
  });
}
