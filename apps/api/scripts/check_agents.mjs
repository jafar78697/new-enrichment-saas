import pg from 'pg';
import * as dotenv from 'dotenv';
dotenv.config();

const { Client } = pg;
const client = new Client({ connectionString: process.env.DATABASE_URL });

async function check() {
  await client.connect();
  try {
    const res = await client.query('SELECT * FROM agents LIMIT 1');
    console.log('agents table exists:', res.rows);
  } catch (err) {
    console.error('Error querying agents:', err.message);
  }
  await client.end();
}
check().catch(console.error);
