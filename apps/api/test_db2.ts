import pg from 'pg';
require('dotenv').config();
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
async function run() {
  await client.connect();
  const res = await client.query("SELECT * FROM ai_calling_scripts");
  console.log(res.rows);
  await client.end();
}
run().catch(console.error);
