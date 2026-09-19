import pg from 'pg';
const { Client } = pg;
const client = new Client({ connectionString: 'postgres://localhost/enrichment_saas' });

async function check() {
  await client.connect();
  const res = await client.query(`
    SELECT column_name, is_nullable, column_default 
    FROM information_schema.columns 
    WHERE table_name = 'users';
  `);
  console.log('Users schema:', res.rows);
  const tRes = await client.query(`
    SELECT column_name, is_nullable, column_default 
    FROM information_schema.columns 
    WHERE table_name = 'tenants';
  `);
  console.log('Tenants schema:', tRes.rows);
  await client.end();
}
check().catch(console.error);
