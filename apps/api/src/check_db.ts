import Database from 'better-sqlite3';
const db = new Database('./storage/cold-calling.sqlite');
db.exec("ALTER TABLE campaigns ADD COLUMN channel TEXT DEFAULT 'email';");
console.log("Added channel column");
const campaigns = db.prepare("PRAGMA table_info(campaigns)").all();
console.log(campaigns);
