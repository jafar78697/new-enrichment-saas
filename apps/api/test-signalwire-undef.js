import dotenv from 'dotenv';
import { RestClient } from '@signalwire/compatibility-api';

dotenv.config({ path: '.env' });

if (process.env.ALLOW_REAL_TEST_CALL !== 'true') {
  throw new Error('Set ALLOW_REAL_TEST_CALL=true explicitly before placing a test call.');
}

const { SIGNALWIRE_PROJECT_ID, SIGNALWIRE_API_TOKEN, SIGNALWIRE_SPACE_URL, TEST_CALL_TO } = process.env;
if (!SIGNALWIRE_PROJECT_ID || !SIGNALWIRE_API_TOKEN || !SIGNALWIRE_SPACE_URL || !TEST_CALL_TO) {
  throw new Error('SignalWire credentials and TEST_CALL_TO are required.');
}

const client = RestClient(SIGNALWIRE_PROJECT_ID, SIGNALWIRE_API_TOKEN, { signalwireSpaceUrl: SIGNALWIRE_SPACE_URL });
const call = await client.calls.create({
  url: 'https://api.jentoai.pro/api/voice/twiml/outbound?contactId=test',
  to: TEST_CALL_TO,
  from: undefined,
  method: 'POST',
});
console.log(JSON.stringify({ created: true, callSid: call.sid, status: call.status }));
