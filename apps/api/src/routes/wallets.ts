import { FastifyInstance } from 'fastify';
import { WalletService } from '../services/wallet.service';

export default async function walletRoutes(fastify: FastifyInstance) {
  const walletService = new WalletService(fastify.db);

  // GET /v1/wallets — Get current balances
  fastify.get('/v1/wallets', {
    preHandler: [fastify.authenticate as any]
  }, async (request: any) => {
    const { tenantId } = request.tenant;
    const balances = await walletService.getBalances(tenantId);
    return { success: true, balances };
  });

  // GET /v1/wallets/ledger — Get transaction history
  fastify.get('/v1/wallets/ledger', {
    preHandler: [fastify.authenticate as any]
  }, async (request: any) => {
    const { tenantId } = request.tenant;
    const { unit, page = 1, limit = 50 } = request.query as any;
    
    const offset = (parseInt(page) - 1) * parseInt(limit);
    let whereClause = `WHERE l.tenant_id = $1`;
    const params: any[] = [tenantId];
    let paramIndex = 2;

    if (unit) {
      whereClause += ` AND w.unit = $${paramIndex}`;
      params.push(unit);
      paramIndex++;
    }

    const { rows } = await fastify.db.query(
      `SELECT l.id, w.unit, l.operation_type, l.amount, l.balance_after, l.reference_type, l.description, l.created_at
       FROM wallet_ledger l
       JOIN wallets w ON l.wallet_id = w.id
       ${whereClause}
       ORDER BY l.created_at DESC
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...params, parseInt(limit), offset]
    );

    const { rows: countRows } = await fastify.db.query(
      `SELECT COUNT(*) as total FROM wallet_ledger l
       JOIN wallets w ON l.wallet_id = w.id
       ${whereClause}`,
      params
    );

    return {
      success: true,
      transactions: rows,
      total: parseInt(countRows[0]?.total || '0'),
      page: parseInt(page),
      limit: parseInt(limit)
    };
  });
}
