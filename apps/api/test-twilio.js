import axios from 'axios';
import { config } from 'dotenv';
config();

const mediaUrl = `https://api.twilio.com/2010-04-01/Accounts/${process.env.TWILIO_ACCOUNT_SID}/Recordings/RE1c3de146dfdbe3ba73e5ff65a95cb8b7.mp3?RequestedChannels=1`;

async function test() {
  try {
    let response = await axios({
      method: 'get',
      url: mediaUrl,
      maxRedirects: 0,
      auth: {
        username: process.env.TWILIO_ACCOUNT_SID,
        password: process.env.TWILIO_AUTH_TOKEN,
      },
      validateStatus: (status) => status >= 200 && status < 400,
    });
    console.log('Status 1:', response.status);
    console.log('Location 1:', response.headers.location);

    if (response.status >= 300 && response.status < 400 && response.headers.location) {
      response = await axios({
        method: 'get',
        url: response.headers.location,
        validateStatus: (status) => status >= 200 && status < 400,
      });
      console.log('Status 2:', response.status);
      console.log('Content-Type:', response.headers['content-type']);
      console.log('Content-Length:', response.headers['content-length']);
    }
  } catch(e) {
    console.error('Error:', e.message);
    if(e.response) {
       console.log('Response status:', e.response.status);
       console.log('Response data:', e.response.data);
    }
  }
}
test();
