import dotenv from 'dotenv';
import { RestClient } from '@signalwire/compatibility-api';

dotenv.config({ path: '.env' });

const { SIGNALWIRE_PROJECT_ID, SIGNALWIRE_API_TOKEN, SIGNALWIRE_SPACE_URL, TEST_CALL_SID } = process.env;
if (!SIGNALWIRE_PROJECT_ID || !SIGNALWIRE_API_TOKEN || !SIGNALWIRE_SPACE_URL || !TEST_CALL_SID) {
  throw new Error('SignalWire credentials and TEST_CALL_SID are required.');
}

const client = RestClient(SIGNALWIRE_PROJECT_ID, SIGNALWIRE_API_TOKEN, { signalwireSpaceUrl: SIGNALWIRE_SPACE_URL });
const call = await client.calls(TEST_CALL_SID).fetch();
console.log(JSON.stringify({ callSid: call.sid, status: call.status, direction: call.direction }));
