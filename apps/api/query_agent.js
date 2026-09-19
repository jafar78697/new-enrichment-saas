require('dotenv').config({ path: '../../.env.production' });
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.query('SELECT signalwire_phone_number FROM agents WHERE id=18')
  .then(res => console.log(res.rows))
  .catch(console.error)
  .finally(() => pool.end());
