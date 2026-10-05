import Fastify from 'fastify';
import pg from 'pg';
require('dotenv').config();
console.log("DB URL:", process.env.DATABASE_URL);
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
async function run() {
  await client.connect();
  const res = await client.query("SELECT id, status, script_id FROM ai_calling_script_versions");
  console.log(res.rows);
  await client.end();
}
run().catch(console.error);
