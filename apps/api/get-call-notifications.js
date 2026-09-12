import { RestClient } from '@signalwire/compatibility-api';

const projectId = '16b22a3d-b2fd-4cde-8972-df058ae5f8cd';
const apiToken = 'PTafab0dde73ae395f1c09a1df0205ca589bdc81dd9f418ef2';
const spaceUrl = 'jentoai.signalwire.com';

const client = RestClient(projectId, apiToken, { signalwireSpaceUrl: spaceUrl });

async function run() {
  try {
    const notifications = await client.calls('c77f67d1-a79c-4ea7-905b-7e843ddfa684').notifications.list();
    console.log('Notifications:', notifications);
  } catch (err) {
    console.error('Error fetching notifications:', err);
  }
}

run();
