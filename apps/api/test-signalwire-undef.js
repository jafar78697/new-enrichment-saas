import { RestClient } from '@signalwire/compatibility-api';

const projectId = '16b22a3d-b2fd-4cde-8972-df058ae5f8cd';
const apiToken = 'PTafab0dde73ae395f1c09a1df0205ca589bdc81dd9f418ef2';
const spaceUrl = 'jentoai.signalwire.com';

const client = RestClient(projectId, apiToken, { signalwireSpaceUrl: spaceUrl });

async function run() {
  try {
    console.log('Creating call with undefined from...');
    const call = await client.calls.create({
      url: 'https://api.jentoai.pro/api/voice/twiml/outbound?contactId=test',
      to: '+13106368180',
      from: undefined,
      method: 'POST'
    });
    console.log('Call created:', call.sid);
  } catch (err) {
    console.error('Error creating call:', err);
  }
}

run();
