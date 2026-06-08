#!/usr/bin/env node
// Bootstrap the first manager password so they can log in via /api/auth/login.
// Usage:
//   node src/scripts/set-manager-password.js <email> <password>
// Example:
//   node src/scripts/set-manager-password.js owner@jentoai.com SuperSecret123
import bcrypt from 'bcryptjs';
import { db } from '../db/index.js';

const [, , rawEmail, rawPassword] = process.argv;
if (!rawEmail || !rawPassword) {
  console.error('Usage: node src/scripts/set-manager-password.js <email> <password>');
  process.exit(1);
}
const email = rawEmail.trim();
const password = rawPassword;
if (password.length < 6) {
  console.error('Password must be at least 6 characters long');
  process.exit(1);
}

const hash = await bcrypt.hash(password, 10);
const row = db.prepare('SELECT id, name, role FROM agents WHERE LOWER(email) = LOWER(?)').get(email);
if (row) {
  db.prepare(
    `UPDATE agents
       SET password_hash = ?, role = 'manager', status = 'active',
           invite_token = NULL, invite_expires_at = NULL, invite_accepted_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
  ).run(hash, row.id);
  console.log(`[bootstrap] updated ${email} as manager (agent #${row.id})`);
} else {
  // Generate a valid Twilio identity slug
  const base = email.split('@')[0].toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  let identity = base || `manager_${Date.now()}`;
  let suffix = 1;
  while (db.prepare('SELECT id FROM agents WHERE twilio_identity = ?').get(identity)) {
    identity = `${base}_${suffix++}`;
  }
  const result = db
    .prepare(
      `INSERT INTO agents (name, email, twilio_identity, role, status, password_hash, is_available, invite_accepted_at)
       VALUES (?, ?, ?, 'manager', 'active', ?, 1, CURRENT_TIMESTAMP)`,
    )
    .run(email.split('@')[0], email, identity, hash);
  console.log(`[bootstrap] created manager ${email} as agent #${result.lastInsertRowid}`);
}

process.exit(0);
