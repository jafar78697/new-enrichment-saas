require('dotenv').config({ path: 'apps/api/.env.production' });
const axios = require('axios');

async function run() {
  const projectId = process.env.SIGNALWIRE_PROJECT_ID;
  const token = process.env.SIGNALWIRE_API_TOKEN;
  const spaceUrl = process.env.SIGNALWIRE_SPACE_URL;

  console.log('Project:', projectId);
  
  const auth = Buffer.from(`${projectId}:${token}`).toString('base64');
  
  try {
    const res = await axios.post(`https://${spaceUrl}/api/relay/rest/domain_applications`, {
      name: "Jento Manual Dialer",
      identifier: "sellervertex-call",
      call_handler: "laml_webhooks",
      call_request_url: "https://api.jentoai.pro/api/signalwire/twiml/outbound",
      call_request_method: "POST"
    }, {
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json'
      }
    });
    console.log('Successfully created Domain App:', res.data.id);
    console.log('Domain:', res.data.identifier + '.sip.signalwire.com');
  } catch (err) {
    console.error('Error creating domain app:', err.response ? err.response.data : err.message);
  }
}

run();
