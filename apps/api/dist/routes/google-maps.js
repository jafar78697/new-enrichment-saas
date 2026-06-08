"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = googleMapsRoutes;
const index_js_1 = require("../calls-module/db/index.js");
const auth_js_1 = require("../calls-module/middleware/auth.js");
const delay = (ms) => new Promise(res => setTimeout(res, ms));
async function googleMapsRoutes(fastify) {
    fastify.post('/v1/google-maps/scrape', {
        preValidation: async (request, reply) => {
            try {
                const authHeader = request.headers.authorization;
                if (!authHeader || !authHeader.startsWith('Bearer ')) {
                    return reply.code(401).send({ error: 'Missing token' });
                }
                const token = authHeader.split(' ')[1];
                (0, auth_js_1.verifyToken)(token); // Validates the HS256 token from calls-module
            }
            catch (err) {
                return reply.code(401).send({ error: 'Invalid token' });
            }
        }
    }, async (request, reply) => {
        try {
            const { keywords, location, limit = 60, niche_name } = request.body;
            fastify.log.info(`google-maps route called with: ${JSON.stringify({ keywords, location, limit, niche_name })}`);
            if (!keywords || !Array.isArray(keywords) || keywords.length === 0) {
                return reply.code(400).send({ error: 'At least one keyword is required in keywords array.' });
            }
            const apiKey = process.env.GOOGLE_MAPS_API_KEY;
            if (!apiKey) {
                fastify.log.warn('GOOGLE_MAPS_API_KEY is not set. Returning error.');
                return reply.code(400).send({ error: 'Google Maps API key is not configured on the server. Please add it to the .env file.' });
            }
            let niche_id = null;
            let assignedAgentId = null;
            if (niche_name && niche_name.trim() !== '') {
                const trimmedName = niche_name.trim();
                fastify.log.info(`Checking niche: ${trimmedName}`);
                const nicheResult = await (0, index_js_1.query)('SELECT id, assigned_agent_id FROM niches WHERE name = $1', [trimmedName]);
                if (nicheResult.rowCount > 0) {
                    niche_id = nicheResult.rows[0].id;
                    assignedAgentId = nicheResult.rows[0].assigned_agent_id;
                    fastify.log.info(`Found niche: ${niche_id}`);
                }
                else {
                    fastify.log.info(`Creating niche: ${trimmedName}`);
                    const insertResult = await (0, index_js_1.query)('INSERT INTO niches (name) VALUES ($1) RETURNING id', [trimmedName]);
                    niche_id = insertResult.rows[0].id;
                    fastify.log.info(`Created niche: ${niche_id}`);
                }
            }
            const searchUrl = 'https://places.googleapis.com/v1/places:searchText';
            const allLeads = [];
            for (const keyword of keywords) {
                fastify.log.info(`Searching Places API for: ${keyword} ${location ? 'in ' + location : ''} with limit: ${limit}`);
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
                    fastify.log.info(`Sending fetch request to google places API...`);
                    const response = await fetch(searchUrl, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'X-Goog-Api-Key': apiKey,
                            'X-Goog-FieldMask': 'places.id,places.displayName,places.nationalPhoneNumber,places.websiteUri,places.rating,places.userRatingCount,nextPageToken'
                        },
                        body: JSON.stringify(body)
                    });
                    fastify.log.info(`Received response from google: ${response.status}`);
                    const data = await response.json();
                    if (!response.ok) {
                        fastify.log.error(`Google API Error: ${JSON.stringify(data)}`);
                        break; // Stop fetching for this keyword, move to next
                    }
                    if (!data.places || data.places.length === 0) {
                        break; // No more results for this keyword
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
                    // Add to overall list
                    allLeads.push(...leads);
                    leadsForKeyword += leads.length;
                    pageToken = data.nextPageToken;
                    if (!pageToken) {
                        break; // No more pages
                    }
                    await delay(2000); // Google Places API limit delay
                }
            }
            // If a niche is provided, save these leads directly into the database
            if (niche_id && allLeads.length > 0) {
                const values = [];
                const placeholders = [];
                let idx = 0;
                for (const lead of allLeads) {
                    // Skip leads without a phone number because DB requires phone_number UNIQUE NOT NULL
                    // and we don't want to insert dummy phones that clash.
                    if (!lead.phone)
                        continue;
                    const offset = idx * 13;
                    values.push(lead.name.trim(), lead.phone.trim(), null, // company
                    null, // email
                    null, // notes
                    assignedAgentId, 'google-maps-scraper', // source
                    niche_id, lead.website || null, null, // linkedin
                    null, // facebook
                    null, // instagram
                    0 // score
                    );
                    placeholders.push(`($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8}, $${offset + 9}, $${offset + 10}, $${offset + 11}, $${offset + 12}, $${offset + 13})`);
                    idx++;
                }
                if (placeholders.length > 0) {
                    await (0, index_js_1.query)(`
              INSERT INTO contacts (name, phone_number, company, email, notes, assigned_agent_id, source, niche_id, website, linkedin, facebook, instagram, score)
              VALUES ${placeholders.join(', ')}
              ON CONFLICT(phone_number) DO UPDATE SET
                niche_id = COALESCE(contacts.niche_id, EXCLUDED.niche_id),
                assigned_agent_id = COALESCE(contacts.assigned_agent_id, EXCLUDED.assigned_agent_id),
                website = COALESCE(contacts.website, EXCLUDED.website)
            `, values);
                }
            }
            return reply.send({ success: true, leads: allLeads });
        }
        catch (err) {
            fastify.log.error(err);
            return reply.code(500).send({ error: 'Internal Server Error' });
        }
    });
}
//# sourceMappingURL=google-maps.js.map