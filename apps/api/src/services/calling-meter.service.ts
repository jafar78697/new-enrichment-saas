import { WalletService } from './wallet.service';
import { PoolClient } from 'pg';

export class CallingMeterService {
  private walletService: WalletService;

  constructor(private db: any) {
    this.walletService = new WalletService(db);
  }

  /**
   * Helper to run queries
   */
  private async query(sql: string, params: any[], client?: PoolClient) {
    if (client) {
      return client.query(sql, params);
    }
    return this.db.query(sql, params);
  }

  /**
   * Called before dialing to check limits and reserve funds.
   */
  async authorizeCall(params: {
    tenantId: string;
    userId?: string;
    callerNumber: string;
    destinationNumber: string;
    expectedMaxDurationSeconds?: number;
    ratePerMinuteCents?: number;
  }, client?: PoolClient) {
    const maxDuration = params.expectedMaxDurationSeconds || 1800;
    const rate = params.ratePerMinuteCents || 1.5; // default 1.5 cents/min
    
    // Convert duration to minutes (ceil)
    const expectedMinutes = Math.ceil(maxDuration / 60);
    const requiredReservation = Math.ceil(expectedMinutes * rate);

    // 1. Check Limits (Concurrent, Daily Attempts, etc.)
    const { rows: limitRows } = await this.query(
      `SELECT tl.max_concurrent_calls, tl.max_daily_call_attempts, tl.max_daily_unique_destinations, tl.max_call_seconds
       FROM tenant_limits tl WHERE tenant_id = $1`,
      [params.tenantId],
      client
    );

    const limits = limitRows[0];
    if (!limits) throw new Error('Tenant limits not found');

    const effectiveMaxDuration = Math.min(maxDuration, limits.max_call_seconds || maxDuration);

    // Check max duration limit
    if (limits.max_call_seconds && maxDuration > limits.max_call_seconds) {
      throw new Error(`Call exceeds maximum allowed duration of ${limits.max_call_seconds}s`);
    }

    // Check concurrent calls
    const { rows: concurrentRows } = await this.query(
      `SELECT COUNT(*) as active_calls FROM tracked_calls 
       WHERE tenant_id = $1 AND status IN ('initiated', 'ringing', 'connected')`,
      [params.tenantId],
      client
    );
    if (parseInt(concurrentRows[0].active_calls) >= limits.max_concurrent_calls) {
      throw new Error(`Max concurrent calls limit reached (${limits.max_concurrent_calls})`);
    }

    // Check daily attempts
    const { rows: dailyRows } = await this.query(
      `SELECT total_attempts, unique_destinations, destination_numbers FROM daily_call_counters 
       WHERE tenant_id = $1 AND date = CURRENT_DATE`,
      [params.tenantId],
      client
    );
    const todayAttempts = dailyRows[0] ? parseInt(dailyRows[0].total_attempts) : 0;
    if (todayAttempts >= limits.max_daily_call_attempts) {
      throw new Error(`Daily call attempt limit reached (${limits.max_daily_call_attempts})`);
    }
    const destinationNumbers = dailyRows[0]?.destination_numbers || [];
    const isNewDestination = !destinationNumbers.includes(params.destinationNumber);
    const todayUnique = dailyRows[0] ? parseInt(dailyRows[0].unique_destinations) : 0;
    if (isNewDestination && todayUnique >= limits.max_daily_unique_destinations) {
      throw new Error(`Daily unique destination limit reached (${limits.max_daily_unique_destinations})`);
    }

    // 2. Reserve Funds
    // This will throw if insufficient balance
    const callId = `call_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    
    const reservationId = await this.walletService.reserve({
      tenantId: params.tenantId,
      unit: 'calling_cents',
      amount: requiredReservation,
      referenceType: 'call',
      referenceId: callId,
      description: `Reserve for call to ${params.destinationNumber}`
    }, client);

    // 3. Increment Daily Counter
    await this.query(
      `INSERT INTO daily_call_counters (tenant_id, date, total_attempts, unique_destinations, destination_numbers)
       VALUES ($1, CURRENT_DATE, 1, 1, ARRAY[$2]::TEXT[])
       ON CONFLICT (tenant_id, date) DO UPDATE SET
         total_attempts = daily_call_counters.total_attempts + 1,
         destination_numbers = array_append(daily_call_counters.destination_numbers, $2),
         unique_destinations = (
           SELECT COUNT(DISTINCT destination)
           FROM unnest(array_append(daily_call_counters.destination_numbers, $2)) AS destination
         )`,
      [params.tenantId, params.destinationNumber],
      client
    );

    // 4. Create Tracked Call Record
    const { rows: trackRows } = await this.query(
      `INSERT INTO tracked_calls (tenant_id, user_id, caller_number, destination_number, reservation_id, rate_per_minute, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'initiated') RETURNING id`,
      [params.tenantId, params.userId || null, params.callerNumber, params.destinationNumber, reservationId, rate],
      client
    );

    return {
      allowed: true,
      reservationId,
      callId,
      trackedCallId: trackRows[0].id,
      maxDurationAllowed: effectiveMaxDuration
    };
  }

  /**
   * Called when a webhook indicates the call has finished.
   */
  async settleCall(params: {
    trackedCallId: string;
    providerCallId?: string;
    durationSeconds: number;
    billableSeconds: number;
    status: string; // 'completed', 'failed', 'no_answer', etc.
  }, client?: PoolClient) {
    
    const { rows } = await this.query(
      `SELECT * FROM tracked_calls WHERE id = $1 FOR UPDATE`,
      [params.trackedCallId],
      client
    );

    if (rows.length === 0) throw new Error('Tracked call not found');
    const call = rows[0];

    if (call.settled) return { success: true, alreadySettled: true };

    const rate = parseFloat(call.rate_per_minute);
    const billableMinutes = Math.ceil(params.billableSeconds / 60);
    const finalCostCents = Math.ceil(billableMinutes * rate);

    // Settle reservation
    if (call.reservation_id) {
      await this.walletService.settle(call.reservation_id, finalCostCents, client);
    }

    // Update tracked call
    await this.query(
      `UPDATE tracked_calls SET
        provider_call_id = COALESCE($2, provider_call_id),
        duration_seconds = $3,
        billable_seconds = $4,
        cost_cents = $5,
        status = $6,
        ended_at = NOW(),
        settled = TRUE
       WHERE id = $1`,
      [params.trackedCallId, params.providerCallId || null, params.durationSeconds, params.billableSeconds, finalCostCents, params.status],
      client
    );

    return { success: true, costCents: finalCostCents };
  }
}
