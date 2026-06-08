import { FastifyInstance } from 'fastify';

export default async function googleMapsRoutes(fastify: FastifyInstance) {
  fastify.post('/v1/google-maps/scrape', {
    preValidation: [(fastify as any).authenticate]
  }, async (request, reply) => {
    try {
      const { keyword, location } = request.body as { keyword: string; location: string };
      
      if (!keyword || !location) {
        return reply.code(400).send({ error: 'Keyword and location are required.' });
      }

      const apiKey = process.env.GOOGLE_MAPS_API_KEY;
      if (!apiKey) {
        fastify.log.warn('GOOGLE_MAPS_API_KEY is not set. Returning error.');
        return reply.code(400).send({ error: 'Google Maps API key is not configured on the server. Please add it to the .env file.' });
      }

      fastify.log.info(`Searching New Places API v2 for: ${keyword} in ${location}`);

      // Use the New Places API (v2) to save costs by fetching everything in one call
      const searchUrl = 'https://places.googleapis.com/v1/places:searchText';
      
      const response = await fetch(searchUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': apiKey,
          'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.websiteUri,places.rating,places.userRatingCount'
        },
        body: JSON.stringify({
          textQuery: `${keyword} in ${location}`,
          pageSize: 20 // Can fetch up to 20 leads per single low-cost request
        })
      });

      const data: any = await response.json();

      if (!response.ok) {
        fastify.log.error(`Google API Error: ${JSON.stringify(data)}`);
        return reply.code(500).send({ error: 'Failed to fetch from Google Maps API' });
      }

      if (!data.places || data.places.length === 0) {
        return reply.send({ success: true, leads: [] });
      }

      // Map the v2 response format to our frontend ScrapedLead format
      const leads = data.places.map((place: any) => ({
        id: place.id,
        name: place.displayName?.text || 'Unknown',
        phone: place.nationalPhoneNumber || null,
        website: place.websiteUri || null,
        rating: place.rating || 0,
        reviews: place.userRatingCount || 0,
        address: place.formattedAddress || 'No Address',
        socialLinks: [],
        status: 'scraped',
      }));

      return reply.send({ success: true, leads });
    } catch (err: any) {
      fastify.log.error(err);
      return reply.code(500).send({ error: 'Internal Server Error' });
    }
  });
}
