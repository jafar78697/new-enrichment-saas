import { FastifyInstance } from 'fastify';

/**
 * Starts a background interval to check for expired demo numbers and release them.
 * @param fastify The initialized fastify instance with db attached
 */
export function startDemoReleaser(fastify: FastifyInstance) {
  // Run every 1 minute (60000 ms)
  setInterval(async () => {
    try {
      const client = await (fastify as any).db.connect();
      try {
        await client.query('BEGIN');

        // 1. Find expired demo numbers
        const { rows: expiredNumbers } = await client.query(`
          SELECT id, phone_number, assigned_tenant_id 
          FROM demo_number_pool 
          WHERE status = 'assigned' AND expires_at < NOW()
          FOR UPDATE
        `);

        if (expiredNumbers.length > 0) {
          for (const row of expiredNumbers) {
            fastify.log.info({ tenantId: row.assigned_tenant_id, phoneNumber: row.phone_number }, 'Releasing expired demo number');

            // 2. Clear the assigned agent's caller ID so they immediately know they have no number
            if (row.assigned_tenant_id) {
              await client.query(
                `UPDATE agents SET signalwire_phone_number = NULL WHERE tenant_id = $1 AND signalwire_phone_number = $2`,
                [row.assigned_tenant_id, row.phone_number]
              );
              
              // Also expire their trial row
              await client.query(
                `UPDATE tenant_demo_trials SET status = 'expired' WHERE tenant_id = $1 AND status != 'expired'`,
                [row.assigned_tenant_id]
              );
            }

            // 3. Mark the demo number back as available
            await client.query(
              `UPDATE demo_number_pool 
               SET status = 'available', assigned_tenant_id = NULL, assigned_at = NULL, expires_at = NULL, updated_at = NOW()
               WHERE id = $1`,
              [row.id]
            );
          }
        }

        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        fastify.log.error(err, 'Failed to sweep expired demo numbers');
      } finally {
        client.release();
      }
    } catch (dbErr) {
      fastify.log.error(dbErr, 'DB connection failed in demo releaser job');
    }
  }, 60000);
}
