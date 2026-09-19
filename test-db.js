import { query } from './apps/api/src/calls-module/db/index.js';
async function test() {
  try {
    const res = await query('SELECT u.id as u_id, u.email as u_email, a.id as a_id, a.email as a_email, a.status FROM users u LEFT JOIN agents a ON a.email = u.email AND a.tenant_id = u.tenant_id');
    console.log("Joined Users & Agents:", res.rows);
  } catch (e) {
    console.error("Error:", e);
  }
  process.exit(0);
}
test();
