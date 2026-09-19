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
      if (request.tenant?.role === 'agent' || request.tenant?.role === 'employee') {
        return reply.code(403).send({ error: 'Employees cannot search for new phone numbers.' });
      }
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
    if (request.tenant?.role === 'agent' || request.tenant?.role === 'employee') {
      return reply.code(403).send({ error: 'Employees cannot purchase phone numbers.' });
    }
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
      const { tenantId, userId, role } = request.tenant;
      const query = role === 'agent' || role === 'employee'
        ? `SELECT 
             COALESCE(pn.id::text, dp.id::text, '0') as id,
             a.signalwire_phone_number as phone_number,
             COALESCE(pn.status, dp.status, 'active') as status,
             COALESCE(pn.capabilities, '{}'::jsonb) as capabilities,
             COALESCE(pn.monthly_cost, 0) as monthly_cost,
             COALESCE(pn.purchased_at, dp.assigned_at, a.created_at) as purchased_at
           FROM agents a
           JOIN users u ON (u.id = a.platform_user_id OR (u.email = a.email AND u.email != '')) AND u.tenant_id = a.tenant_id
           LEFT JOIN phone_numbers pn ON pn.phone_number = a.signalwire_phone_number AND pn.tenant_id = a.tenant_id
           LEFT JOIN demo_number_pool dp ON dp.phone_number = a.signalwire_phone_number AND dp.assigned_tenant_id = a.tenant_id
           WHERE a.tenant_id = $1 AND u.id = $2 AND a.signalwire_phone_number IS NOT NULL`
        : `SELECT id, phone_number, status, capabilities, monthly_cost, purchased_at FROM phone_numbers WHERE tenant_id = $1`;
      const { rows } = await fastify.db.query(query, role === 'agent' || role === 'employee' ? [tenantId, userId] : [tenantId]);
      
      // If customer, also append their assigned demo number (if any)
      if (role !== 'agent' && role !== 'employee') {
        const { rows: demoRows } = await fastify.db.query(
          `SELECT id, phone_number, status, '{}'::jsonb as capabilities, 0 as monthly_cost, assigned_at as purchased_at 
           FROM demo_number_pool 
           WHERE assigned_tenant_id = $1 AND status = 'assigned'`,
          [tenantId]
        );
        rows.push(...demoRows);
      }

      const uniqueRows = [];
      const seen = new Set();
      for (const row of rows) {
        if (!seen.has(row.phone_number)) {
          seen.add(row.phone_number);
          uniqueRows.push(row);
        }
      }

      return reply.send({ success: true, phoneNumbers: uniqueRows });
    } catch (err: any) {
      fastify.log.error(err);
      return reply.code(500).send({ error: 'Failed to fetch phone numbers' });
    }
  });

  // POST /v1/phone-numbers/demo-assign
  fastify.post('/v1/phone-numbers/demo-assign', {
    preHandler: [(fastify as any).authenticate]
  }, async (request: any, reply) => {
    const db = fastify.db;
    const client = await (db as any).connect?.() || db;
    if (client.query !== db.query) await client.query('BEGIN');
    
    try {
      const { tenantId } = request.tenant;
      
      const { rows: tenantRows } = await client.query(
        `SELECT plan FROM tenants WHERE id = $1 FOR UPDATE`,
        [tenantId]
      );
      
      if (tenantRows[0]?.plan !== 'demo') {
        throw new Error('Only demo accounts can request a demo number.');
      }

      // Check durable trial
      const { rows: trialRows } = await client.query(
        `SELECT * FROM tenant_demo_trials WHERE tenant_id = $1 FOR UPDATE`,
        [tenantId]
      );

      let trial = trialRows[0];

      if (trial) {
        if (new Date(trial.expires_at) < new Date() || trial.status === 'expired') {
          if (trial.status !== 'expired') {
             await client.query(`UPDATE tenant_demo_trials SET status = 'expired' WHERE id = $1`, [trial.id]);
          }
          const error: any = new Error('Your free demo has expired. Please upgrade your account to continue.');
          error.code = 'DEMO_EXPIRED';
          error.statusCode = 403;
          throw error;
        }

        const { rows: existingAssignment } = await client.query(
          `SELECT phone_number, expires_at FROM demo_number_pool WHERE assigned_tenant_id = $1 AND status = 'assigned'`,
          [tenantId]
        );

        if (existingAssignment.length > 0) {
          if (client.query !== db.query) await client.query('COMMIT');
          return reply.send({ success: true, assignment: existingAssignment[0] });
        }
      }

      const { rows: callRows } = await client.query(
        `SELECT COUNT(*)::int AS used FROM tracked_calls WHERE tenant_id = $1 AND direction = 'outbound'`,
        [tenantId]
      );
      if (Number(callRows[0]?.used || 0) >= 3) {
        throw new Error('You have exhausted your free demo calls. Please upgrade to continue.');
      }

      const { rows: availableRows } = await client.query(
        `SELECT id, phone_number FROM demo_number_pool 
         WHERE status = 'available' OR (status = 'assigned' AND expires_at < NOW())
         LIMIT 1 FOR UPDATE SKIP LOCKED`
      );
      
      if (availableRows.length === 0) {
        throw { statusCode: 409, message: 'Demo lines are currently busy. Please try again in 2 minutes.' };
      }

      // 1 hour timer!
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
      if (!trial) {
        await client.query(
          `INSERT INTO tenant_demo_trials (tenant_id, status, expires_at) VALUES ($1, 'active', $2)`,
          [tenantId, expiresAt]
        );
      }

      const numberId = availableRows[0].id;
      
      const { rows: assignedRows } = await client.query(
        `UPDATE demo_number_pool 
         SET status = 'assigned', assigned_tenant_id = $1, assigned_at = NOW(), expires_at = $2
         WHERE id = $3
         RETURNING phone_number, expires_at`,
        [tenantId, expiresAt, numberId]
      );
      
      const assignedPhone = assignedRows[0].phone_number;
      
      // Update the tenant owner's agent with this demo number
      await client.query(
        `UPDATE agents 
         SET signalwire_phone_number = $1
         WHERE tenant_id = $2 AND role = 'manager'`,
        [assignedPhone, tenantId]
      );
      
      if (client.query !== db.query) await client.query('COMMIT');
      
      return reply.send({ success: true, assignment: assignedRows[0] });
    } catch (err: any) {
      if (client.query !== db.query) await client.query('ROLLBACK');
      fastify.log.error(err);
      return reply.code(err.statusCode || 500).send({ error: err.message || 'Failed to assign demo number', code: err.code });
    } finally {
      if (client.release) client.release();
    }
  });

  // POST /v1/demo-pool/release
  fastify.post('/v1/demo-pool/release', {
    preHandler: [(fastify as any).authenticate]
  }, async (request: any, reply) => {
    try {
      const { tenantId } = request.tenant;
      await fastify.db.query(
        `UPDATE demo_number_pool SET status = 'available', assigned_tenant_id = NULL, expires_at = NULL WHERE assigned_tenant_id = $1`,
        [tenantId]
      );
      return reply.send({ success: true });
    } catch (err: any) {
      fastify.log.error(err);
      return reply.code(500).send({ error: 'Failed to release demo number' });
    }
  });

}
