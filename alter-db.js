import dotenv from 'dotenv';
dotenv.config({ path: 'apps/api/.env' });
import { createPool } from './packages/db/src/index.js'; // or wherever it is
async function alterDb() {
  const pool = createPool();
  try {
    // actually, let me just use a simpler query:
    // TODO: add your query here
  } catch (error) {
    console.error('Error in alterDb:', error);
  } finally {
    await pool.end();
  }
}

alterDb();
