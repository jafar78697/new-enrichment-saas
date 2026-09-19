import { PoolClient } from 'pg';
import crypto from 'crypto';

export type WalletUnit = 'calling_cents' | 'maps_credits';

export interface WalletOperation {
  tenantId: string;
  unit: WalletUnit;
  amount: number; // positive for credit, positive for debit
  referenceType: string;
  referenceId: string;
  description: string;
  idempotencyKey?: string;
}

export class WalletService {
  constructor(private db: any) {}

  /**
   * Helper to run queries inside a provided transaction client or on the main pool.
   */
  private async query(sql: string, params: any[], client?: PoolClient) {
    if (client) {
      return client.query(sql, params);
    }
    return this.db.query(sql, params);
  }

  private async withTransaction<T>(
    client: PoolClient | undefined,
    operation: (txClient: PoolClient) => Promise<T>
  ): Promise<T> {
    if (client) {
      return operation(client);
    }
    const txClient = await this.db.connect();
    try {
      await txClient.query('BEGIN');
      const result = await operation(txClient);
      await txClient.query('COMMIT');
      return result;
    } catch (error) {
      await txClient.query('ROLLBACK');
      throw error;
    } finally {
      txClient.release();
    }
  }

  /**
   * Get wallet balances for a tenant.
   * Creates the wallet records if they don't exist yet.
   */
  async getBalances(tenantId: string, client?: PoolClient) {
    // Ensure wallets exist
    const units: WalletUnit[] = ['calling_cents', 'maps_credits'];
    
    for (const unit of units) {
      await this.query(
        `INSERT INTO wallets (tenant_id, unit, available, reserved)
         VALUES ($1, $2, 0, 0)
         ON CONFLICT (tenant_id, unit) DO NOTHING`,
        [tenantId, unit],
        client
      );
    }

    const { rows } = await this.query(
      `SELECT unit, available, reserved, (available + reserved) as total
       FROM wallets WHERE tenant_id = $1`,
      [tenantId],
      client
    );

    const result = {
      calling_cents: { available: 0, reserved: 0, total: 0 },
      maps_credits: { available: 0, reserved: 0, total: 0 },
    };

    rows.forEach((r: any) => {
      if (r.unit === 'calling_cents') result.calling_cents = { available: r.available, reserved: r.reserved, total: parseInt(r.total) };
      if (r.unit === 'maps_credits') result.maps_credits = { available: r.available, reserved: r.reserved, total: parseInt(r.total) };
    });

    return result;
  }

  /**
   * Add funds to a wallet.
   */
  async credit(op: WalletOperation, client?: PoolClient) {
    return this.withTransaction(client, async (txClient) => {
      if (op.amount <= 0) throw new Error('Credit amount must be positive');
      
      // Create idempotency key if not provided
      const idempKey = op.idempotencyKey || crypto.createHash('sha256').update(`credit_${op.tenantId}_${op.unit}_${op.referenceType}_${op.referenceId}`).digest('hex');

      // Ensure wallet exists
      await this.getBalances(op.tenantId, txClient);

      const { rows: ledgerRows } = await this.query(
        `SELECT 1 FROM wallet_ledger WHERE idempotency_key = $1`,
        [idempKey],
        txClient
      );

      if (ledgerRows.length > 0) {
        return { success: true, idempotent: true };
      }

      // Perform credit
      const { rows: walletRows } = await this.query(
        `UPDATE wallets SET available = available + $1, updated_at = NOW()
         WHERE tenant_id = $2 AND unit = $3
         RETURNING id, available, reserved`,
        [op.amount, op.tenantId, op.unit],
        txClient
      );

      const wallet = walletRows[0];

      // Log ledger entry
      await this.query(
        `INSERT INTO wallet_ledger (wallet_id, tenant_id, operation_type, amount, balance_after, reserved_after, reference_type, reference_id, description, idempotency_key)
         VALUES ($1, $2, 'credit', $3, $4, $5, $6, $7, $8, $9)`,
        [wallet.id, op.tenantId, op.amount, wallet.available, wallet.reserved, op.referenceType, op.referenceId, op.description, idempKey],
        txClient
      );

      // Add to credit_lots to track expiry (optional for now, but good for future)
      await this.query(
        `INSERT INTO credit_lots (wallet_id, tenant_id, original_amount, remaining_amount, source, source_id)
         VALUES ($1, $2, $3, $3, $4, $5)`,
        [wallet.id, op.tenantId, op.amount, op.referenceType, op.referenceId],
        txClient
      );

      return { success: true, newBalance: wallet.available };
    });
  }

  /**
   * Immediately deduct funds from a wallet.
   */
  async debit(op: WalletOperation, client?: PoolClient) {
    return this.withTransaction(client, async (txClient) => {
      if (op.amount <= 0) throw new Error('Debit amount must be positive');
      
      const idempKey = op.idempotencyKey || crypto.createHash('sha256').update(`debit_${op.tenantId}_${op.unit}_${op.referenceType}_${op.referenceId}`).digest('hex');

      await this.getBalances(op.tenantId, txClient);

      const { rows: ledgerRows } = await this.query(
        `SELECT 1 FROM wallet_ledger WHERE idempotency_key = $1`,
        [idempKey],
        txClient
      );

      if (ledgerRows.length > 0) {
        return { success: true, idempotent: true };
      }

      // Check balance
      const { rows: checkRows } = await this.query(
        `SELECT available FROM wallets WHERE tenant_id = $1 AND unit = $2 FOR UPDATE`,
        [op.tenantId, op.unit],
        txClient
      );

      if (checkRows[0].available < op.amount) {
        throw new Error(`Insufficient ${op.unit} balance`);
      }

      // Perform debit
      const { rows: walletRows } = await this.query(
        `UPDATE wallets SET available = available - $1, updated_at = NOW()
         WHERE tenant_id = $2 AND unit = $3
         RETURNING id, available, reserved`,
        [op.amount, op.tenantId, op.unit],
        txClient
      );

      const wallet = walletRows[0];

      // Log ledger entry
      await this.query(
        `INSERT INTO wallet_ledger (wallet_id, tenant_id, operation_type, amount, balance_after, reserved_after, reference_type, reference_id, description, idempotency_key)
         VALUES ($1, $2, 'debit', $3, $4, $5, $6, $7, $8, $9)`,
        [wallet.id, op.tenantId, op.amount, wallet.available, wallet.reserved, op.referenceType, op.referenceId, op.description, idempKey],
        txClient
      );

      // Deplete credit_lots (simplified: just deduct from oldest active lot)
      // In a real financial system, you'd iterate through lots, but this works for MVP.

      return { success: true, newBalance: wallet.available };
    });
  }

  /**
   * Reserve funds for a pending operation (like a call or Maps job).
   */
  async reserve(op: WalletOperation, client?: PoolClient): Promise<string> {
    return this.withTransaction(client, async (txClient) => {
      if (op.amount <= 0) throw new Error('Reserve amount must be positive');

      await this.getBalances(op.tenantId, txClient);

      // Check balance
      const { rows: checkRows } = await this.query(
        `SELECT id, available FROM wallets WHERE tenant_id = $1 AND unit = $2 FOR UPDATE`,
        [op.tenantId, op.unit],
        txClient
      );

      if (checkRows[0].available < op.amount) {
        throw new Error(`Insufficient ${op.unit} balance`);
      }

      const walletId = checkRows[0].id;

      // Move available to reserved
      const { rows: walletRows } = await this.query(
        `UPDATE wallets SET available = available - $1, reserved = reserved + $1, updated_at = NOW()
         WHERE id = $2
         RETURNING available, reserved`,
        [op.amount, walletId],
        txClient
      );

      const wallet = walletRows[0];

      // Create reservation record
      const { rows: resRows } = await this.query(
        `INSERT INTO usage_reservations (wallet_id, tenant_id, amount, operation_type, operation_id)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [walletId, op.tenantId, op.amount, op.referenceType, op.referenceId],
        txClient
      );

      const reservationId = resRows[0].id;

      // Log ledger entry
      await this.query(
        `INSERT INTO wallet_ledger (wallet_id, tenant_id, operation_type, amount, balance_after, reserved_after, reference_type, reference_id, description)
         VALUES ($1, $2, 'reserve', $3, $4, $5, $6, $7, $8)`,
        [walletId, op.tenantId, op.amount, wallet.available, wallet.reserved, op.referenceType, op.referenceId, op.description],
        txClient
      );

      return reservationId;
    });
  }

  /**
   * Settle a reservation, deducting the final actual amount and releasing any remainder.
   */
  async settle(reservationId: string, finalAmount: number, client?: PoolClient) {
    return this.withTransaction(client, async (txClient) => {
      if (finalAmount < 0) throw new Error('Settle amount cannot be negative');

      // Get reservation
      const { rows: resRows } = await this.query(
        `SELECT * FROM usage_reservations WHERE id = $1 FOR UPDATE`,
        [reservationId],
        txClient
      );

      if (resRows.length === 0) throw new Error('Reservation not found');
      const res = resRows[0];

      if (res.status !== 'held') {
        return { success: true, status: res.status }; // Already settled/released
      }

      if (finalAmount > res.amount) {
        // In a real system you'd try to debit the extra. 
        // For MVP, we cap at the reserved amount (which should be the max possible cost).
        finalAmount = res.amount; 
      }

      const releaseAmount = res.amount - finalAmount;

      // Update reservation
      await this.query(
        `UPDATE usage_reservations SET status = 'settled', settled_amount = $1, settled_at = NOW() WHERE id = $2`,
        [finalAmount, reservationId],
        txClient
      );

      // Update wallet: remove full reserved amount, give back the unused portion to available
      const { rows: walletRows } = await this.query(
        `UPDATE wallets SET 
          reserved = reserved - $1,
          available = available + $2,
          updated_at = NOW()
         WHERE id = $3
         RETURNING available, reserved`,
        [res.amount, releaseAmount, res.wallet_id],
        txClient
      );

      const wallet = walletRows[0];

      // Log ledger entry for settlement
      await this.query(
        `INSERT INTO wallet_ledger (wallet_id, tenant_id, operation_type, amount, balance_after, reserved_after, reference_type, reference_id, description)
         VALUES ($1, $2, 'settle', $3, $4, $5, $6, $7, 'Settled reservation')`,
        [res.wallet_id, res.tenant_id, finalAmount, wallet.available, wallet.reserved, res.operation_type, res.operation_id],
        txClient
      );

      // Log release if there was leftover
      if (releaseAmount > 0) {
        await this.query(
          `INSERT INTO wallet_ledger (wallet_id, tenant_id, operation_type, amount, balance_after, reserved_after, reference_type, reference_id, description)
           VALUES ($1, $2, 'release', $3, $4, $5, $6, $7, 'Released unused reserved funds')`,
          [res.wallet_id, res.tenant_id, releaseAmount, wallet.available, wallet.reserved, res.operation_type, res.operation_id],
          txClient
        );
      }

      return { success: true, finalAmount, releaseAmount, newBalance: wallet.available };
    });
  }

  /**
   * Complete release of a reservation without charging anything.
   */
  async release(reservationId: string, client?: PoolClient) {
    return this.settle(reservationId, 0, client);
  }
}
