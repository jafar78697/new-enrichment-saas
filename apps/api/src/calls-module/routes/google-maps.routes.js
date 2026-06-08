import { Router } from 'express';
import { query } from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

const delay = (ms) => new Promise(res => setTimeout(res, ms));

// POST /api/google-maps/scrape
router.post(
  '/scrape',
  requireAuth,
  async (req, res) => {
    try {
      const { keywords, location, niche_name } = req.body;
      const limit = 1000; // A high arbitrary limit to let it fetch all available pages (Google max is usually ~60-120 per search anyway)

      console.log('[google-maps] Route called with:', JSON.stringify({ keywords, location, niche_name }));

      if (!keywords || !Array.isArray(keywords) || keywords.length === 0) {
        return res.status(400).json({ error: 'At least one keyword is required in keywords array.' });
      }

      const apiKey = process.env.GOOGLE_MAPS_API_KEY || 'AIzaSyBaLbEYExP3eJtIuEtnS4x1W2B3rH_h-1M';
      if (!apiKey) {
        console.warn('[google-maps] GOOGLE_MAPS_API_KEY is not set.');
        return res.status(400).json({ error: 'Google Maps API key is not configured on the server.' });
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
        console.log(`[google-maps] Searching for: ${keyword} ${location ? 'in ' + location : ''} limit: ${limit}`);

        let pageToken = undefined;
        let leadsForKeyword = 0;

        while (leadsForKeyword < limit) {
          const textQuery = location && location.trim() !== '' ? `${keyword} in ${location}` : keyword;
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
              'X-Goog-FieldMask': 'places.id,places.displayName,places.nationalPhoneNumber,places.websiteUri,places.rating,places.userRatingCount,nextPageToken'
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

          const leads = data.places.map((place) => ({
            id: place.id,
            name: place.displayName?.text || 'Unknown',
            phone: place.nationalPhoneNumber || null,
            website: place.websiteUri || null,
            rating: place.rating || 0,
            reviews: place.userRatingCount || 0,
            address: '',
            socialLinks: [],
            status: niche_id ? 'enriched' : 'scraped',
            niche_id: niche_id || null
          }));

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

export default router;
