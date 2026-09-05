export async function acquireOutboundLock(pool, tenantId) {
  const client = await pool.connect();
  try {
    const { rows } = await client.query("SELECT pg_try_advisory_lock(hashtext('ai-outbound'), hashtext($1)) AS locked", [tenantId]);
    if (!rows[0].locked) {
      client.release();
      return null;
    }
  } catch (error) {
    client.release(error);
    throw error;
  }
  let released = false;
  return async () => {
    if (released) return;
    released = true;
    try {
      await client.query("SELECT pg_advisory_unlock(hashtext('ai-outbound'), hashtext($1))", [tenantId]);
      client.release();
    } catch (error) {
      client.release(error);
    }
  };
}
