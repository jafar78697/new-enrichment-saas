import { FastifyInstance } from 'fastify';
import { requireRole } from '../middleware/require-role';
import { ROLES, DRAFT_PACKAGES } from '../config/saas';
import { WalletService } from '../services/wallet.service';
import { recordAuditLog } from '../services/audit-log.service';
import crypto from 'crypto';

export default async function manualPaymentRoutes(fastify: FastifyInstance) {
  const walletService = new WalletService(fastify.db);
  const adminAuth = [fastify.authenticate as any, requireRole(ROLES.PLATFORM_ADMIN)];

  // ── Customer Endpoints ───────────────────────────────────────────────

  // GET /v1/billing/payment-accounts — Get receiving details for JazzCash
  fastify.get('/v1/billing/payment-accounts', {
    preHandler: [fastify.authenticate as any]
  }, async () => {
    const { rows } = await fastify.db.query(
      `SELECT id, provider, account_number, account_title FROM payment_accounts WHERE is_active = true`
    );
    // If no DB accounts, return the ones from env/config
    if (rows.length === 0) {
      return {
        success: true,
        accounts: [{
          id: 'default',
          provider: 'JazzCash',
          account_number: process.env.JAZZCASH_RECEIVER_NUMBER || 'TBD',
          account_title: process.env.JAZZCASH_ACCOUNT_TITLE || 'TBD'
        }]
      };
    }
    return { success: true, accounts: rows };
  });

  // POST /v1/billing/orders — Create a quote/order for a package
  fastify.post('/v1/billing/orders', {
    preHandler: [fastify.authenticate as any]
  }, async (request: any, reply) => {
    const { tenantId, userId } = request.tenant;
    const { plan_name, custom_details } = request.body as any;

    let pkg: any;

    if (plan_name === 'custom') {
      const teamSize = Number(custom_details?.team_size || 0);
      const leadsBudget = Number(custom_details?.leads_budget || 0);

      if (teamSize === 0 && leadsBudget === 0) {
        return reply.code(400).send({ error: 'Must specify team size or leads budget' });
      }

      const usdToPkr = 280;
      
      // Calculate Team Price ($20 per user, 5% off for 3+, 10% off for 5+)
      let discount = 0;
      if (teamSize >= 5) discount = 0.10;
      else if (teamSize >= 3) discount = 0.05;
      
      const teamCostUsd = Math.round(teamSize * 20 * (1 - discount));
      const teamCostPkr = teamCostUsd * usdToPkr;
      
      // Calculate Leads Price ($1 = 100 leads)
      const leadsCostPkr = leadsBudget * usdToPkr;
      const mapsCredits = leadsBudget * 100;
      
      // Calculate Calling Balance (Give $10 / 1000 cents of calling balance per team member by default)
      const callingBalanceCents = teamSize * 1000;

      const totalPkr = teamCostPkr + leadsCostPkr;

      pkg = {
        name: 'Custom Plan',
        pkr_price: totalPkr,
        calling_balance_cents: callingBalanceCents,
        maps_credits: mapsCredits,
        duration_days: 30,
        max_phone_numbers: teamSize > 0 ? teamSize : 1,
        max_seats: teamSize > 0 ? teamSize : 1,
        max_concurrent_calls: teamSize > 0 ? teamSize * 2 : 1,
        max_daily_unique_destinations: teamSize > 0 ? teamSize * 100 : 50,
        max_daily_call_attempts: teamSize > 0 ? teamSize * 300 : 150,
        max_call_seconds: 7200,
      };
    } else {
      pkg = DRAFT_PACKAGES[plan_name];
      if (!pkg) return reply.code(400).send({ error: 'Invalid plan name' });
    }

    const orderRef = 'ORD-' + crypto.randomBytes(4).toString('hex').toUpperCase();

    const { rows } = await fastify.db.query(
      `INSERT INTO orders (tenant_id, order_ref, plan_name, amount_pkr, calling_cents, maps_credits, duration_days, snapshot, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id, order_ref, amount_pkr`,
      [tenantId, orderRef, plan_name, pkg.pkr_price, pkg.calling_balance_cents, pkg.maps_credits, pkg.duration_days, JSON.stringify(pkg), userId]
    );

    return { success: true, order: rows[0] };
  });

  // POST /v1/billing/payment-proof — Submit JazzCash screenshot/ref
  fastify.post('/v1/billing/payment-proof', {
    preHandler: [fastify.authenticate as any]
  }, async (request: any, reply) => {
    const { tenantId } = request.tenant;
    const { order_id, transaction_reference, sender_number, sender_name, proof_url } = request.body as any;

    if (!order_id || !transaction_reference) {
      return reply.code(400).send({ error: 'order_id and transaction_reference are required' });
    }

    const { rows: orderRows } = await fastify.db.query(
      `SELECT amount_pkr, status FROM orders WHERE id = $1 AND tenant_id = $2`,
      [order_id, tenantId]
    );

    if (orderRows.length === 0) return reply.code(404).send({ error: 'Order not found' });
    if (orderRows[0].status !== 'pending') return reply.code(400).send({ error: 'Order is not pending' });

    const { rows } = await fastify.db.query(
      `INSERT INTO manual_payment_requests (tenant_id, order_id, amount_pkr, transaction_reference, sender_number, sender_name, proof_url)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [tenantId, order_id, orderRows[0].amount_pkr, transaction_reference, sender_number, sender_name, proof_url]
    );

    return { success: true, request_id: rows[0].id };
  });

  // ── Admin Endpoints ──────────────────────────────────────────────────

  // GET /v1/admin/payments — List payment requests
  fastify.get('/v1/admin/payments', {
    preHandler: adminAuth
  }, async (request: any) => {
    const { status = 'pending' } = request.query as any;
    const { rows } = await fastify.db.query(
      `SELECT p.*, t.customer_name, t.name as tenant_name, o.plan_name, o.order_ref
       FROM manual_payment_requests p
       JOIN tenants t ON p.tenant_id = t.id
       JOIN orders o ON p.order_id = o.id
       WHERE p.status = $1
       ORDER BY p.created_at DESC`,
      [status]
    );
    return { success: true, requests: rows };
  });

  // POST /v1/admin/payments/:id/approve — Approve payment and grant credits
  fastify.post('/v1/admin/payments/:id/approve', {
    preHandler: adminAuth
  }, async (request: any, reply) => {
    const { id } = request.params as any;
    const adminUserId = request.tenant.userId;
    const { actual_transaction_ref, receiving_account_id, actual_amount_pkr } = request.body as any || {};
    const db = fastify.db;
    const usesTransactionClient = typeof (db as any).connect === 'function';

    if (!adminUserId) {
      return reply.code(401).send({ error: 'Admin user context is missing' });
    }

    if (!actual_transaction_ref || String(actual_transaction_ref).trim().length < 4) {
      return reply.code(400).send({
        error: 'actual_transaction_ref is required after verifying the JazzCash payment.',
        code: 'VERIFIED_REFERENCE_REQUIRED',
      });
    }

    // Use a transaction for atomic approval + wallet credit
    const client = await (db as any).connect?.() || db;
    let committed = false;
    if (usesTransactionClient) await client.query('BEGIN');

    try {
      const { rows: reqRows } = await client.query(
        `SELECT p.*, o.calling_cents, o.maps_credits, o.plan_name, o.duration_days, o.snapshot 
         FROM manual_payment_requests p
         JOIN orders o ON p.order_id = o.id
         WHERE p.id = $1 FOR UPDATE`,
        [id]
      );

      if (reqRows.length === 0) throw new Error('Payment request not found');
      const req = reqRows[0];
      if (req.status !== 'pending' && req.status !== 'under_review') {
        throw new Error('Payment request is already processed');
      }
      if (actual_amount_pkr != null && Number(actual_amount_pkr) !== Number(req.amount_pkr)) {
        const amountErr: any = new Error(`Verified amount does not match order amount (${req.amount_pkr} PKR).`);
        amountErr.statusCode = 400;
        amountErr.code = 'AMOUNT_MISMATCH';
        throw amountErr;
      }

      // 1. Mark request as approved
      await client.query(
        `UPDATE manual_payment_requests SET status = 'approved', reviewed_by = $1, reviewed_at = NOW() WHERE id = $2`,
        [adminUserId, id]
      );

      // 2. Mark order as paid
      await client.query(
        `UPDATE orders SET status = 'paid' WHERE id = $1`,
        [req.order_id]
      );

      // 3. Create receipt
      await client.query(
        `INSERT INTO payment_receipts (payment_request_id, tenant_id, amount_pkr, actual_transaction_ref, receiving_account_id, verified_by, credits_granted)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          id,
          req.tenant_id,
          req.amount_pkr,
          String(actual_transaction_ref).trim(),
          receiving_account_id || null,
          adminUserId,
          JSON.stringify({ calling_cents: req.calling_cents, maps_credits: req.maps_credits }),
        ]
      );

      // 4. Update tenant subscription and limits (only if it's a calling plan or custom plan, not just a leads top-up)
      const pkg = typeof req.snapshot === 'string' ? JSON.parse(req.snapshot) : req.snapshot;
      
      if (!req.plan_name.startsWith('leads_')) {
        await client.query(
          `UPDATE tenant_limits SET
            max_phone_numbers = COALESCE($2, max_phone_numbers),
            max_seats = COALESCE($3, max_seats),
            max_concurrent_calls = COALESCE($4, max_concurrent_calls),
            max_daily_unique_destinations = COALESCE($5, max_daily_unique_destinations),
            max_daily_call_attempts = COALESCE($6, max_daily_call_attempts),
            max_call_seconds = COALESCE($7, max_call_seconds)
           WHERE tenant_id = $1`,
          [req.tenant_id, pkg.max_phone_numbers, pkg.max_seats, pkg.max_concurrent_calls, pkg.max_daily_unique_destinations, pkg.max_daily_call_attempts, pkg.max_call_seconds]
        );

        await client.query(
          `INSERT INTO customer_subscriptions (tenant_id, plan_name, pkr_price, start_date, end_date, snapshot)
           VALUES ($1, $2, $3, NOW(), NOW() + ($4::int * interval '1 day'), $5)`,
          [req.tenant_id, req.plan_name, req.amount_pkr, req.duration_days, req.snapshot]
        );

        await client.query(`UPDATE tenants SET plan = $1 WHERE id = $2`, [req.plan_name, req.tenant_id]);
      }

      // 5. Credit wallets
      if (req.calling_cents > 0) {
        await walletService.credit({
          tenantId: req.tenant_id,
          unit: 'calling_cents',
          amount: req.calling_cents,
          referenceType: 'payment',
          referenceId: req.order_id,
          description: `Package recharge: ${req.plan_name}`,
          idempotencyKey: `payment:${id}:calling_cents`,
        }, client);
      }

      if (req.maps_credits > 0) {
        await walletService.credit({
          tenantId: req.tenant_id,
          unit: 'maps_credits',
          amount: req.maps_credits,
          referenceType: 'payment',
          referenceId: req.order_id,
          description: `Package recharge: ${req.plan_name}`,
          idempotencyKey: `payment:${id}:maps_credits`,
        }, client);
      }

      if (usesTransactionClient) {
        await client.query('COMMIT');
        committed = true;
      }
      await recordAuditLog(client, {
        tenantId: req.tenant_id,
        actorUserId: adminUserId,
        actorRole: ROLES.PLATFORM_ADMIN,
        action: 'payment_approved',
        resource: 'payment_request',
        targetId: id,
        details: { amount: req.amount_pkr, plan: req.plan_name },
      }).catch((error) => fastify.log.warn({ error, paymentRequestId: id }, 'Payment approval audit log was not written'));
      return { success: true, message: 'Payment approved and credits granted' };

    } catch (err: any) {
      if (usesTransactionClient && !committed) await client.query('ROLLBACK');
      fastify.log.error(err, 'Failed to approve payment');
      const status = err.statusCode || (err.code === '23505' ? 409 : 500);
      return reply.code(status).send({ error: err.message || 'Failed to approve payment', code: err.code });
    } finally {
      if (client.release) client.release();
    }
  });

  // POST /v1/admin/payments/:id/reject — Reject payment
  fastify.post('/v1/admin/payments/:id/reject', {
    preHandler: adminAuth
  }, async (request: any, reply) => {
    const { id } = request.params as any;
    const { reason } = request.body as any;
    const adminUserId = request.tenant.userId;

    const { rows } = await fastify.db.query(
      `UPDATE manual_payment_requests SET status = 'rejected', reviewed_by = $1, reviewed_at = NOW(), rejection_reason = $2 
       WHERE id = $3 AND status IN ('pending', 'under_review') RETURNING id`,
      [adminUserId, reason || 'Invalid proof', id]
    );

    if (rows.length === 0) return reply.code(400).send({ error: 'Request not found or already processed' });

    return { success: true, message: 'Payment rejected' };
  });
}
