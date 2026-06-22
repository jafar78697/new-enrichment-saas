import dotenv from 'dotenv';
dotenv.config({ path: 'apps/api/.env' });
import { createPool } from './packages/db/src/index.js'; // or wherever it is
// actually, let me just use a simpler query:
  } finally {
    await pool.end();
  }
}

alterDb();
