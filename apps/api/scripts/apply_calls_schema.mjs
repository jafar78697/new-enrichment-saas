import fs from 'fs';
import pg from 'pg';
import * as dotenv from 'dotenv';
dotenv.config();

const { Client } = pg;
const client = new Client({ connectionString: process.env.DATABASE_URL });

async function check() {
  await client.connect();
  const sql = fs.readFileSync('database/calls-schema-pg.sql', 'utf8');
  await client.query(sql);
  console.log('Successfully created calls-schema-pg.sql tables');
  await client.end();
}
check().catch(console.error);
