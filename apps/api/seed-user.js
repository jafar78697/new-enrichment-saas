const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const pool = new Pool({
  connectionString: 'postgresql://enrichment_user:enrichment_pass_2024@127.0.0.1:5432/enrichment_saas'
});

async function run() {
  try {
    const hash = await bcrypt.hash('password123', 10);
    
    // Create a default tenant
    const tenantRes = await pool.query(`
      INSERT INTO tenants (name, slug) 
      VALUES ('Jento Admin', 'jento-admin') 
      ON CONFLICT (slug) DO UPDATE SET name='Jento Admin'
      RETURNING id
    `);
    const tenantId = tenantRes.rows[0].id;
    
    // Check if user exists
    const userCheck = await pool.query(`SELECT id FROM users WHERE username = 'jafar' OR email = 'jafar@jento.ai'`);
    if (userCheck.rows.length > 0) {
      await pool.query(`UPDATE users SET password_hash = $1 WHERE id = $2`, [hash, userCheck.rows[0].id]);
    } else {
      await pool.query(`
        INSERT INTO users (tenant_id, email, username, password_hash, role)
        VALUES ($1, 'jafar@jento.ai', 'jafar', $2, 'admin')
      `, [tenantId, hash]);
    }

    console.log("SUCCESS! User 'jafar' with password 'password123' created.");
  } catch(e) {
    console.error(e);
  } finally {
    pool.end();
  }
}
run();
