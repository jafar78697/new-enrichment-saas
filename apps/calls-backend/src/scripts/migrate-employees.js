#!/usr/bin/env node
// Phase C1 migration — add employee/manager fields to agents table.
// Idempotent: each ALTER is wrapped and ignored when the column already exists.
import { db } from '../db/index.js';

const ADDITIONS = [
  // Auth & identity
  `ALTER TABLE agents ADD COLUMN role TEXT NOT NULL DEFAULT 'employee'`,
  `ALTER TABLE agents ADD COLUMN password_hash TEXT`,
  `ALTER TABLE agents ADD COLUMN invite_token TEXT`,
  `ALTER TABLE agents ADD COLUMN invite_expires_at TEXT`,
  `ALTER TABLE agents ADD COLUMN invite_accepted_at TEXT`,
  `ALTER TABLE agents ADD COLUMN status TEXT NOT NULL DEFAULT 'pending'`,
  `ALTER TABLE agents ADD COLUMN last_login_at TEXT`,
  // Twilio phone provisioning
  `ALTER TABLE agents ADD COLUMN twilio_phone_number TEXT`,
  `ALTER TABLE agents ADD COLUMN twilio_phone_sid TEXT`,
  `ALTER TABLE agents ADD COLUMN twilio_phone_area_code TEXT`,
  `ALTER TABLE agents ADD COLUMN twilio_phone_purchased_at TEXT`,
  // Aggregate metrics cache (optional — fill via triggers or job)
  `ALTER TABLE agents ADD COLUMN stats_total_calls INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE agents ADD COLUMN stats_connected_calls INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE agents ADD COLUMN stats_total_seconds INTEGER NOT NULL DEFAULT 0`,
];

const INDEXES = [
  `CREATE INDEX IF NOT EXISTS idx_agents_role ON agents(role)`,
  `CREATE INDEX IF NOT EXISTS idx_agents_status ON agents(status)`,
  `CREATE INDEX IF NOT EXISTS idx_agents_invite_token ON agents(invite_token)`,
  `CREATE INDEX IF NOT EXISTS idx_agents_twilio_phone_number ON agents(twilio_phone_number)`,
];

let addedCount = 0;
for (const stmt of ADDITIONS) {
  try {
    db.exec(stmt);
    addedCount += 1;
    console.log(`[migrate] applied: ${stmt}`);
  } catch (err) {
    const msg = String(err?.message || err);
    if (msg.includes('duplicate column name')) {
      // Already present — skip silently.
      continue;
    }
    console.error(`[migrate] failed: ${stmt}\n  → ${msg}`);
    process.exit(1);
  }
}

for (const stmt of INDEXES) {
  try {
    db.exec(stmt);
  } catch (err) {
    console.error(`[migrate] index failed: ${stmt}\n  → ${err?.message || err}`);
  }
}

// Backfill: any existing agent gets role=manager if it is the only one, else employee.
const agents = db.prepare('SELECT id, role, status FROM agents').all();
if (agents.length > 0) {
  const hasManager = agents.some((a) => a.role === 'manager');
  if (!hasManager && agents.length >= 1) {
    const first = agents[0];
    db.prepare(`UPDATE agents SET role = 'manager', status = 'active' WHERE id = ?`).run(first.id);
    console.log(`[migrate] promoted agent #${first.id} to manager/active`);
  }
  // Mark any password-less, non-manager agents as 'pending' so invite flow is required.
  db.prepare(
    `UPDATE agents SET status = 'active' WHERE (status IS NULL OR status = '') AND password_hash IS NOT NULL`,
  ).run();
}

console.log(`[migrate] done (applied ${addedCount} new columns).`);
process.exit(0);
