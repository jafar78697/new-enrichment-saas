import axios from 'axios';
async function test() {
  try {
    const creds = Buffer.from('52cc08f5-0818-4a57-b09a-f4efb707a216:PT923e592759ad263e77d704daecf1ffbf8a77d8da60cb9a56').toString('base64');
    const res = await axios.post('https://jentoai.signalwire.com/api/relay/rest/tokens', {
      // what payload?
    }, {
      headers: { Authorization: `Basic ${creds}` }
    });
    console.log(res.data);
  } catch (err) {
    console.log(err.response?.data || err.message);
  }
}
test();
