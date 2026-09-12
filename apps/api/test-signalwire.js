import { RestClient } from '@signalwire/compatibility-api';

const projectId = '16b22a3d-b2fd-4cde-8972-df058ae5f8cd';
const apiToken = 'PTafab0dde73ae395f1c09a1df0205ca589bdc81dd9f418ef2';
const spaceUrl = 'jentoai.signalwire.com';
const PUBLIC_BASE_URL = 'https://api.jentoai.pro';

const client = RestClient(projectId, apiToken, { signalwireSpaceUrl: spaceUrl });

async function run() {
  try {
    const leadId = 123;
    const webhookUrl = `${PUBLIC_BASE_URL}/api/voice/twiml/outbound?contactId=${leadId}`;
    console.log('Creating call...');
    const call = await client.calls.create({
      url: webhookUrl,
      to: '+13106368180',
      from: '+12014092628',
      method: 'POST',
      statusCallback: `${PUBLIC_BASE_URL}/api/voice/webhooks/call-status?contactId=${leadId}`,
      statusCallbackMethod: 'POST',
      statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
      record: true,
      recordingChannels: 'mono',
      recordingTrack: 'both',
      recordingStatusCallback: `${PUBLIC_BASE_URL}/api/voice/webhooks/call-status?contactId=${leadId}`,
      recordingStatusCallbackMethod: 'POST',
      recordingStatusCallbackEvent: ['in-progress', 'completed', 'absent'],
      trim: 'do-not-trim',
      machineDetection: 'Enable',
      machineDetectionTimeout: 8,
    });
    console.log('Call created:', call.sid);
  } catch (err) {
    console.error('Error creating call:', err);
  }
}

run();
