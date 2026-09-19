import { createPool } from '@enrichment-saas/db';
import dotenv from 'dotenv';
dotenv.config();

const numbers = [
    '+13292064399',
    '+13292064392',
    '+13292064386',
    '+13292064377',
    '+13292064366',
    '+12048171667',
    '+12038715553',
    '+12032047415'
];

async function run() {
    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) {
        console.error('DATABASE_URL is not set.');
        process.exit(1);
    }

    const pool = createPool({ connectionString: dbUrl });
    const client = await pool.connect();

    try {
        await client.query('BEGIN');
        for (const number of numbers) {
            await client.query(
                `INSERT INTO demo_number_pool (phone_number, provider, status)
                 VALUES ($1, 'signalwire', 'available')
                 ON CONFLICT (phone_number) DO NOTHING`,
                [number]
            );
            console.log(`Added/Verified: ${number}`);
        }
        await client.query('COMMIT');
        console.log('Successfully added demo numbers to the pool.');
    } catch (e) {
        await client.query('ROLLBACK');
        console.error('Error:', e);
    } finally {
        client.release();
        await pool.end();
    }
}
run();
