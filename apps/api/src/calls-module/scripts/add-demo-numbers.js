import 'dotenv/config';
import { db } from '../../db/index.js';

const numbers = [
    // add numbers here like '+1234567890'
];

async function run() {
    if (numbers.length === 0) {
        console.log('Edit this script and add your purchased numbers to the "numbers" array.');
        process.exit(1);
    }
    
    const client = await db.connect();
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
    }
}
run();
