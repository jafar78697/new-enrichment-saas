import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { db } from '../db/index.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  const relativeFile = process.argv[2];

  if (!relativeFile) {
    throw new Error('SQL file path is required');
  }

  const sqlPath = path.resolve(__dirname, relativeFile);
  const sql = await fs.readFile(sqlPath, 'utf8');
  db.exec(sql);
  console.log(`Executed SQL file: ${sqlPath}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
