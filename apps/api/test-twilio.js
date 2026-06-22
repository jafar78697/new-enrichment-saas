import twilio from 'twilio';
import dotenv from 'dotenv';
dotenv.config();

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;

if (!accountSid || !authToken) {
  console.log("Missing Twilio credentials in .env");
  process.exit(1);
}

const client = twilio(accountSid, authToken);

async function checkBalance() {
  try {
    const balance = await client.balance.fetch();
    console.log(`✅ Twilio connection successful!`);
    console.log(`Balance: ${balance.balance} ${balance.currency}`);
    
    const numbers = await client.incomingPhoneNumbers.list({limit: 5});
    console.log(`Found ${numbers.length} phone numbers.`);
    numbers.forEach(n => console.log(`- ${n.phoneNumber}`));
    
  } catch (error) {
    console.error(`❌ Twilio API Error: ${error.message}`);
    process.exit(1);
  }
}

checkBalance();
