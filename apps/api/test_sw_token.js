import dotenv from 'dotenv';
import axios from 'axios';

dotenv.config({ path: '.env' });

const { SIGNALWIRE_PROJECT_ID, SIGNALWIRE_API_TOKEN, SIGNALWIRE_SPACE_URL } = process.env;
if (!SIGNALWIRE_PROJECT_ID || !SIGNALWIRE_API_TOKEN || !SIGNALWIRE_SPACE_URL) {
  throw new Error('SignalWire credentials are required.');
}

const spaceUrl = SIGNALWIRE_SPACE_URL.replace(/^https?:\/\//, '').replace(/\/$/, '');
const credentials = Buffer.from(`${SIGNALWIRE_PROJECT_ID}:${SIGNALWIRE_API_TOKEN}`).toString('base64');
const response = await axios.post(`https://${spaceUrl}/api/relay/rest/tokens`, {}, {
  headers: { Authorization: `Basic ${credentials}` },
});
console.log(JSON.stringify({ tokenEndpointReached: true, status: response.status }));
