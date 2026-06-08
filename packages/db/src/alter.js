import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  connectionString: 'postgresql://postgres:postgres@localhost:5432/enrichment_saas'
});

async function run() {
  try {
    const res1 = await pool.query(`
      ALTER TABLE campaigns 
      ADD COLUMN IF NOT EXISTS channel VARCHAR(50) DEFAULT 'email';
    `);
    console.log("Added channel column to campaigns table", res1);
  } catch (e) {
    console.error("Error altering campaigns table:", e);
  }
  process.exit(0);
}

run();
