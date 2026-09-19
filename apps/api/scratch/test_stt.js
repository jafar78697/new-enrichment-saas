import { createSTTSession } from '../src/voice-agent/services/stt/google-stt.service.js';
const stt = createSTTSession({
  streamSid: 'test',
  callSid: 'test',
  onTranscription: console.log,
  onBargeIn: console.log,
  onError: console.error
});
console.log('STT created:', stt);
