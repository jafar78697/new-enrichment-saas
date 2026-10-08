import re
import os

# 1. Update deploy-to-gcp.sh
with open('deploy-to-gcp.sh', 'r') as f:
    content = f.read()

deploy_old = """  '032_multi_calling_shared_niche.sql',
  '033_call_session_agent_snapshot.sql'"""
deploy_new = """  '032_multi_calling_shared_niche.sql',
  '033_call_session_agent_snapshot.sql',
  '034_call_session_compiled_script.sql',
  '035_script_version_revision.sql'"""

if deploy_old in content:
    content = content.replace(deploy_old, deploy_new)

with open('deploy-to-gcp.sh', 'w') as f:
    f.write(content)

# 2. Update run-migration.js
with open('apps/api/run-migration.js', 'r') as f:
    run_mig_content = f.read()

run_mig_new = """import fs from 'fs';
import path from 'path';
import pkg from 'pg';
const { Client } = pkg;
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function migrate() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL
  });

  try {
    await client.connect();
    console.log('Connected to database.');

    const migrationsDir = path.join(__dirname, 'src/db/migrations');
    const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();
    
    for (const file of files) {
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
      console.log(`Applying ${file}`);
      try {
        await client.query(sql);
      } catch (e) {
        if (['42P07', '42710', '42701'].includes(e.code)) {
          console.log(`[skip] ${file} (already applied)`);
        } else {
          console.error(`Failed at ${file}:`, e);
          throw e;
        }
      }
    }
    console.log('Migration completed successfully.');
  } catch (error) {
    console.error('Migration failed:', error);
  } finally {
    await client.end();
  }
}

migrate();"""

with open('apps/api/run-migration.js', 'w') as f:
    f.write(run_mig_new)

# 3. Update deepgram-signalwire-bridge.js (loadSessionContext)
with open('apps/api/src/voice-agent/orchestrator/deepgram-signalwire-bridge.js', 'r') as f:
    bridge = f.read()

bridge_old = """      const { rows } = await query(
        `SELECT
           acs.*,
           sc.definition AS script_definition,
           sv.definition AS script_version_definition,
           sv.compiled_prompt AS compiled_script_prompt,
           sv.script_hash AS script_compiled_hash,
           sv.version AS script_version_number
         FROM ai_call_sessions acs"""

bridge_new = """      const { rows } = await query(
        `SELECT
           acs.*,
           sc.definition AS script_definition,
           sv.definition AS script_version_definition,
           COALESCE(acs.compiled_script_prompt, sv.compiled_prompt) AS compiled_script_prompt,
           COALESCE(acs.script_compiled_hash, sv.script_hash) AS script_compiled_hash,
           sv.version AS script_version_number
         FROM ai_call_sessions acs"""

if bridge_old in bridge:
    bridge = bridge.replace(bridge_old, bridge_new)
else:
    print("Could not find loadSessionContext SELECT")

with open('apps/api/src/voice-agent/orchestrator/deepgram-signalwire-bridge.js', 'w') as f:
    f.write(bridge)

print("Migrations, run-migration.js, and loadSessionContext patched.")
