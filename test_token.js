import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config();

const url = `https://${process.env.SIGNALWIRE_SPACE_URL}/api/relay/rest/jwt`;
const auth = {
  username: process.env.SIGNALWIRE_PROJECT_ID,
  password: process.env.SIGNALWIRE_API_TOKEN
};

async function test() {
  try {
    const { data } = await axios.post(
      url,
      { resource: 'test-resource', expires_in: 7200 },
      { auth, headers: { 'Content-Type': 'application/json' } }
    );
    console.log('Success, token returned');
  } catch (err) {
    console.error('Error:', err.response?.data || err.message);
  }
}
test();
