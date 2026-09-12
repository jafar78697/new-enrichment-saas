#!/usr/bin/env npx tsx
/**
 * Bootstrap script to create the initial platform_admin account.
 * Run this ONCE after running migration 013.
 * 
 * Usage:
 *   npx tsx scripts/create-admin.ts
 * 
 * Environment variables required:
 *   DATABASE_URL - PostgreSQL connection string
 */

import pg from 'pg';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../apps/api/.env') });
dotenv.config();

const DATABASE_URL = process.env.DATABASE_URL || process.env.DB_URL || 'postgresql://localhost:5432/enrichment_saas';

async function main() {
  const pool = new pg.Pool({ connectionString: DATABASE_URL });

  try {
    console.log('🔗 Connecting to database...');
    await pool.query('SELECT 1');
    console.log('✅ Connected!\n');

    // Check if admin already exists
    const { rows: existing } = await pool.query(
      `SELECT u.username FROM users u WHERE u.role = 'platform_admin' LIMIT 1`
    );
    if (existing.length > 0) {
      console.log(`⚠️  A platform_admin already exists: ${existing[0].username}`);
      console.log('   If you need to reset their password, use the API or update the DB directly.');
      process.exit(0);
    }

    // Generate credentials
    const username = 'admin';
    const tempPassword = crypto.randomBytes(16).toString('base64url').slice(0, 24);
    const passwordHash = bcrypt.hashSync(tempPassword, 12);

    // Create admin tenant
    const { rows: tenantRows } = await pool.query(
      `INSERT INTO tenants (name, slug, plan, status, customer_name)
       VALUES ('JentoAI Platform', 'jentoai-platform', 'pro', 'active', 'Platform Admin')
       RETURNING id`
    );
    const tenantId = tenantRows[0].id;

    // Create admin user
    await pool.query(
      `INSERT INTO users (tenant_id, username, email, password_hash, role, must_change_password, display_name)
       VALUES ($1, $2, NULL, $3, 'platform_admin', true, 'Platform Admin')`,
      [tenantId, username, passwordHash]
    );

    // Create workspace
    await pool.query(
      `INSERT INTO workspaces (tenant_id, name) VALUES ($1, 'Admin Workspace')`,
      [tenantId]
    );

    // Create tenant limits (generous for admin)
    await pool.query(
      `INSERT INTO tenant_limits (tenant_id, max_phone_numbers, max_seats, max_concurrent_calls, max_daily_unique_destinations, max_daily_call_attempts, max_call_seconds)
       VALUES ($1, 100, 100, 50, 10000, 50000, 7200)`,
      [tenantId]
    );

    console.log('═══════════════════════════════════════════');
    console.log('  🎉 Platform Admin Account Created!');
    console.log('═══════════════════════════════════════════');
    console.log(`  Username: ${username}`);
    console.log(`  Password: ${tempPassword}`);
    console.log('');
    console.log('  ⚠️  SAVE THIS PASSWORD NOW!');
    console.log('  It cannot be retrieved later.');
    console.log('  You will be asked to change it on first login.');
    console.log('═══════════════════════════════════════════');

  } catch (err: any) {
    console.error('❌ Error:', err.message);
    if (err.message.includes('relation') && err.message.includes('does not exist')) {
      console.error('\n💡 Have you run migration 013_saas_tenant_schema.sql yet?');
    }
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
