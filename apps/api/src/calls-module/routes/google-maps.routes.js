import { Router } from 'express';
import { query } from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

const delay = (ms) => new Promise(res => setTimeout(res, ms));
const DEFAULT_US_LOCATION = 'United States';

function normalizeUSPhone(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  if (/^[2-9]\d{9}$/.test(digits)) return `+1${digits}`;
  if (/^1[2-9]\d{9}$/.test(digits)) return `+${digits}`;
  return null;
}

function isUSPlace(place) {
  const country = place.addressComponents?.find((component) => component.types?.includes('country'));
  if (country?.shortText) return country.shortText === 'US';
  return /(?:USA|United States)$/i.test(place.formattedAddress || '');
}

// POST /api/google-maps/scrape
router.post(
  '/scrape',
  requireAuth,
  async (req, res) => {
    try {
      const { keywords, location, niche_name, google_cloud_account } = req.body;
      const requestedLocation = String(location || '').trim() || DEFAULT_US_LOCATION;
      const limit = 1000; // A high arbitrary limit to let it fetch all available pages (Google max is usually ~60-120 per search anyway)

      console.log('[google-maps] Route called with:', JSON.stringify({ keywords, location: requestedLocation, niche_name, google_cloud_account }));

      if (!keywords || !Array.isArray(keywords) || keywords.length === 0) {
        return res.status(400).json({ error: 'At least one keyword is required in keywords array.' });
      }

      if (!google_cloud_account || !['account_1', 'account_2'].includes(google_cloud_account)) {
        return res.status(400).json({ error: 'Please select a valid Google Cloud account for scraping.' });
      }

      // Enforce can_scrape permission if the user is logged in via the platform
      if (req.user && req.user.platform_user_id && req.tenantId) {
        const permResult = await query(
          `SELECT can_scrape FROM users WHERE id = $1 AND tenant_id = $2 LIMIT 1`,
          [req.user.platform_user_id, req.tenantId]
        );
        if (permResult.rows[0] && permResult.rows[0].can_scrape === false) {
          return res.status(403).json({ error: 'Your scraping access has been disabled by the administrator.' });
        }
      }

      // Guard: check maps_credits wallet if tenant context is available.
      // This route is a legacy path — the metered Fastify route is preferred.
      // We do a minimum viability check (must have > 0 credits) but don't reserve.
      if (req.tenantId) {
        const walletResult = await query(
          `SELECT available FROM wallets WHERE tenant_id = $1 AND unit = 'maps_credits' LIMIT 1`,
          [req.tenantId]
        );
        const available = Number(walletResult.rows[0]?.available || 0);
        if (available <= 0) {
          return res.status(402).json({ error: 'Insufficient maps credits. Please top up your balance to continue scraping.' });
        }
      }

      let apiKey = null;
      if (google_cloud_account === 'account_1') apiKey = process.env.GOOGLE_MAPS_API_KEY_1;
      if (google_cloud_account === 'account_2') apiKey = process.env.GOOGLE_MAPS_API_KEY_2;

      if (!apiKey) {
        console.warn('[google-maps] Requested GOOGLE_MAPS_API_KEY is not set.');
        return res.status(400).json({ error: 'The selected Google Maps API key is not configured on the server.' });
      }

      let niche_id = null;
      let assignedAgentId = null;
      if (niche_name && niche_name.trim() !== '') {
        const trimmedName = niche_name.trim();
        console.log('[google-maps] Checking niche:', trimmedName);
        const nicheResult = await query('SELECT id, assigned_agent_id FROM niches WHERE name = $1', [trimmedName]);
        if (nicheResult.rowCount > 0) {
          niche_id = nicheResult.rows[0].id;
          assignedAgentId = nicheResult.rows[0].assigned_agent_id;
          console.log('[google-maps] Found niche:', niche_id);
        } else {
          console.log('[google-maps] Creating niche:', trimmedName);
          const insertResult = await query('INSERT INTO niches (name) VALUES ($1) RETURNING id', [trimmedName]);
          niche_id = insertResult.rows[0].id;
          console.log('[google-maps] Created niche:', niche_id);
        }
      }

      const searchUrl = 'https://places.googleapis.com/v1/places:searchText';
      const allLeads = [];

      for (const keyword of keywords) {
        console.log(`[google-maps] Searching for: ${keyword} in ${requestedLocation} limit: ${limit}`);

        try {
          await query('INSERT INTO google_maps_usage (account_id, keyword) VALUES ($1, $2)', [google_cloud_account, keyword]);
        } catch (err) {
          console.error('[google-maps] Failed to log usage:', err);
        }

        let pageToken = undefined;
        let leadsForKeyword = 0;

        while (leadsForKeyword < limit) {
          const textQuery = `${keyword} in ${requestedLocation}`;
          const body = {
            textQuery: textQuery,
            pageSize: 20
          };

          if (pageToken) {
            body.pageToken = pageToken;
          }

          console.log('[google-maps] Sending fetch to Google Places API...');
          const response = await fetch(searchUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Goog-Api-Key': apiKey,
              'X-Goog-FieldMask': 'places.id,places.displayName,places.nationalPhoneNumber,places.websiteUri,places.rating,places.userRatingCount,places.formattedAddress,places.addressComponents,nextPageToken'
            },
            body: JSON.stringify(body)
          });

          console.log('[google-maps] Google responded with status:', response.status);
          const data = await response.json();

          if (!response.ok) {
            console.error('[google-maps] Google API Error:', JSON.stringify(data));
            break;
          }

          if (!data.places || data.places.length === 0) {
            break;
          }

          const leads = data.places.flatMap((place) => {
            const phone = normalizeUSPhone(place.nationalPhoneNumber);
            if (!phone || !isUSPlace(place)) return [];

            return [{
              id: place.id,
              name: place.displayName?.text || 'Unknown',
              phone,
              website: place.websiteUri || null,
              rating: place.rating || 0,
              reviews: place.userRatingCount || 0,
              address: place.formattedAddress || '',
              socialLinks: [],
              status: niche_id ? 'enriched' : 'scraped',
              niche_id: niche_id || null
            }];
          });

          allLeads.push(...leads);
          leadsForKeyword += leads.length;

          pageToken = data.nextPageToken;
          if (!pageToken) {
            break;
          }

          // In the new Places API (v1), the next page token is valid almost immediately.
          // Reduced delay from 2000ms to 200ms to dramatically improve scraping speed.
          await delay(200);
        }
      }

      // Save leads to database if niche provided
      if (niche_id && allLeads.length > 0) {
        const values = [];
        const placeholders = [];
        const seenPhones = new Set();

        let idx = 0;
        for (const lead of allLeads) {
          if (!lead.phone) continue;
          if (seenPhones.has(lead.phone)) continue;
          seenPhones.add(lead.phone);

          const offset = idx * 13;
          values.push(
            lead.name.trim(),
            lead.phone.trim(),
            null, // company
            null, // email
            null, // notes
            assignedAgentId,
            'google-maps-scraper',
            niche_id,
            lead.website || null,
            null, // linkedin
            null, // facebook
            null, // instagram
            0 // score
          );
          placeholders.push(`($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8}, $${offset + 9}, $${offset + 10}, $${offset + 11}, $${offset + 12}, $${offset + 13})`);
          idx++;
        }

        if (placeholders.length > 0) {
          await query(
            `
              INSERT INTO contacts (name, phone_number, company, email, notes, assigned_agent_id, source, niche_id, website, linkedin, facebook, instagram, score)
              VALUES ${placeholders.join(', ')}
              ON CONFLICT(phone_number) DO UPDATE SET
                niche_id = COALESCE(contacts.niche_id, EXCLUDED.niche_id),
                assigned_agent_id = COALESCE(contacts.assigned_agent_id, EXCLUDED.assigned_agent_id),
                website = COALESCE(contacts.website, EXCLUDED.website)
            `,
            values
          );
        }
      }

      console.log(`[google-maps] Done! Total leads: ${allLeads.length}`);
      return res.json({ success: true, leads: allLeads });
    } catch (err) {
      console.error('[google-maps] Error:', err);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  }
);

// GET /api/google-maps/usage
router.get(
  '/usage',
  requireAuth,
  async (req, res) => {
    try {
      const result = await query(`
        SELECT account_id, COUNT(*) as count 
        FROM google_maps_usage 
        WHERE created_at = CURRENT_DATE 
        GROUP BY account_id
      `);
      
      const usage = {
        account_1: 0,
        account_2: 0
      };
      
      result.rows.forEach(row => {
        usage[row.account_id] = parseInt(row.count, 10);
      });
      
      return res.json({ success: true, usage });
    } catch (err) {
      console.error('[google-maps] Error fetching usage:', err);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  }
);

export default router;
