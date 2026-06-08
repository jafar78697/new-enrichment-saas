import { twilioClient } from '../config/twilio.js';
import { env } from '../config/env.js';

async function updateTwilio() {
  try {
    const baseUrl = env.PUBLIC_BASE_URL.replace(/\/$/, '');
    if (!baseUrl) {
      console.error('PUBLIC_BASE_URL is missing in .env');
      process.exit(1);
    }

    const inboundUrl = `${baseUrl}/api/twilio/twiml/inbound`;
    const outboundUrl = `${baseUrl}/api/twilio/twiml/outbound`;

    console.log(`Setting Twilio Webhooks to: 
    - Inbound: ${inboundUrl}
    - Outbound: ${outboundUrl}
    `);

    // 1. Update the TwiML App (Used for outbound calls)
    console.log(`Updating TwiML App (${env.TWILIO_TWIML_APP_SID})...`);
    await twilioClient.applications(env.TWILIO_TWIML_APP_SID).update({
      voiceUrl: outboundUrl,
    });
    console.log('✅ TwiML App updated successfully.');

    // 2. Fetch Phone Numbers associated with the account and update the configured one
    console.log(`Searching for Phone Number: ${env.TWILIO_PHONE_NUMBER}...`);
    const _numbers = await twilioClient.incomingPhoneNumbers.list({
      phoneNumber: env.TWILIO_PHONE_NUMBER,
      limit: 1
    });

    if (_numbers.length > 0) {
      const numberSid = _numbers[0].sid;
      console.log(`Updating Phone Number SID: ${numberSid}...`);
      await twilioClient.incomingPhoneNumbers(numberSid).update({
        voiceUrl: inboundUrl,
        voiceMethod: 'POST',
      });
      console.log('✅ Phone Number updated successfully.');
    } else {
      console.log('⚠️ Could not find the phone number in this account to update automatically. (You may have to do it manually)');
    }

    console.log('🎉 Setup Complete!');
  } catch (err) {
    console.error('Error updating Twilio:', err.message);
  }
}

updateTwilio();
