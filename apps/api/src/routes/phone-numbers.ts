import { FastifyInstance } from 'fastify';
import dotenv from 'dotenv';
import { RestClient } from '@signalwire/compatibility-api';
import { WalletService } from '../services/wallet.service';

// See admin-customers.ts: route modules initialize before index.ts in ESM.
dotenv.config();

// Use environment variables for SignalWire credentials
const projectId = process.env.SIGNALWIRE_PROJECT_ID || '';
const apiToken = process.env.SIGNALWIRE_API_TOKEN || '';
const spaceUrl = process.env.SIGNALWIRE_SPACE_URL || 'jentoai.signalwire.com';

function inboundRouting() {
  const baseUrl = String(process.env.PUBLIC_BASE_URL || 'https://api.jentoai.pro').replace(/\/$/, '');
  return {
    voiceUrl: `${baseUrl}/api/signalwire/twiml/inbound`,
    voiceMethod: 'POST',
    statusCallback: `${baseUrl}/api/signalwire/webhooks/call-status`,
    statusCallbackMethod: 'POST',
  };
}

export default async function phoneNumberRoutes(fastify: FastifyInstance) {
  // GET /v1/phone-numbers/search
  fastify.get('/v1/phone-numbers/search', {
    preHandler: [(fastify as any).authenticate]
  }, async (request: any, reply) => {
    try {
      const { countryCode = 'US', areaCode } = request.query as any;

      if (!projectId || !apiToken) {
        // Return mock data if SignalWire is not configured
        return reply.send({
          success: true,
          mock: true,
          availablePhoneNumbers: [
            { phoneNumber: '+12345678901', locality: 'San Francisco', region: 'CA' },
            { phoneNumber: '+12345678902', locality: 'Los Angeles', region: 'CA' }
          ]
        });
      }

      const client = RestClient(projectId, apiToken, { signalwireSpaceUrl: spaceUrl });
      let listOptions: any = { limit: 20 };
      if (areaCode) listOptions.areaCode = areaCode;

      const availableNumbers = await client.availablePhoneNumbers(countryCode).local.list(listOptions);

      return reply.send({
        success: true,
        availablePhoneNumbers: availableNumbers.map(n => ({
          phoneNumber: n.phoneNumber,
          locality: n.locality,
          region: n.region,
          postalCode: n.postalCode,
          isoCountry: n.isoCountry,
          capabilities: n.capabilities
        }))
      });
    } catch (err: any) {
      fastify.log.error(err);
      return reply.code(500).send({ error: 'Failed to search phone numbers via SignalWire' });
    }
  });

  // POST /v1/phone-numbers/purchase
  fastify.post('/v1/phone-numbers/purchase', {
    preHandler: [(fastify as any).authenticate]
  }, async (request: any, reply) => {
    const db = fastify.db;
    const client = await (db as any).connect?.() || db;
    if (client.query !== db.query) await client.query('BEGIN');

    try {
      const { phoneNumber } = request.body as { phoneNumber: string };
      const { tenantId } = request.tenant;

      if (!phoneNumber) {
        throw new Error('Phone number is required');
      }

      // Check limits
      const { rows: limitRows } = await client.query(
        `SELECT tl.max_phone_numbers, (SELECT COUNT(*) FROM phone_numbers WHERE tenant_id = $1 AND status = 'active') as current_count
         FROM tenant_limits tl WHERE tenant_id = $1`,
        [tenantId]
      );
      
      const limits = limitRows[0];
      if (limits && parseInt(limits.current_count) >= limits.max_phone_numbers) {
        throw new Error(`Limit reached: You can only have ${limits.max_phone_numbers} active phone numbers.`);
      }

      if (!projectId || !apiToken) {
        throw new Error('SignalWire is not configured. Phone number purchase is disabled.');
      }

      // Deduct setup cost from wallet (e.g., 200 cents = $2.00 setup fee)
      const setupFeeCents = 200;
      const walletService = new WalletService(db);
      
      await walletService.debit({
        tenantId,
        unit: 'calling_cents',
        amount: setupFeeCents,
        referenceType: 'admin_adjustment', // Or 'phone_number_purchase'
        referenceId: `setup_${Date.now()}`,
        description: `Setup fee for phone number ${phoneNumber}`
      }, client);

      const swClient = RestClient(projectId, apiToken, { signalwireSpaceUrl: spaceUrl });
      const incomingNumber = await swClient.incomingPhoneNumbers.create({ phoneNumber, ...inboundRouting() });
      const purchasedNumber = incomingNumber.phoneNumber;
      const providerSid = incomingNumber.sid;
      const capabilities = incomingNumber.capabilities;

      // Save to database
      const result = await client.query(
        `INSERT INTO phone_numbers (tenant_id, phone_number, provider, provider_sid, capabilities, monthly_cost)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, phone_number`,
        [tenantId, purchasedNumber, 'signalwire', providerSid, JSON.stringify(capabilities), 150] // 150 cents = $1.50 monthly
      );

      if (client.query !== db.query) await client.query('COMMIT');

      return reply.code(201).send({
        success: true,
        phoneNumber: result.rows[0]
      });
    } catch (err: any) {
      if (client.query !== db.query) await client.query('ROLLBACK');
      fastify.log.error(err);
      return reply.code(err.message.includes('Limit reached') || err.message.includes('Insufficient') ? 400 : 500).send({ 
        error: err.message || 'Failed to purchase phone number via SignalWire' 
      });
    } finally {
      if (client.release) client.release();
    }
  });

  // GET /v1/phone-numbers
  fastify.get('/v1/phone-numbers', {
    preHandler: [(fastify as any).authenticate]
  }, async (request: any, reply) => {
    try {
      const { tenantId } = request.tenant;
      const { rows } = await fastify.db.query(
        `SELECT id, phone_number, status, capabilities, monthly_cost, purchased_at FROM phone_numbers WHERE tenant_id = $1`,
        [tenantId]
      );
      
      return reply.send({ success: true, phoneNumbers: rows });
    } catch (err: any) {
      fastify.log.error(err);
      return reply.code(500).send({ error: 'Failed to fetch phone numbers' });
    }
  });
}
