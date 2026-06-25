import WebSocket from 'ws';
import * as dotenv from 'dotenv';
dotenv.config();

const wsUrl = 'wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-10-01';
const apiKey = process.env.OPENAI_API_KEY;

console.log("Key prefix:", apiKey ? apiKey.substring(0, 10) : "MISSING");

const ws = new WebSocket(wsUrl, {
  headers: {
    Authorization: `Bearer ${apiKey}`,
    "OpenAI-Beta": "realtime=v1"
  },
});

ws.on('open', () => {
  console.log('✅ WebSocket OPEN');
  process.exit(0);
});

ws.on('unexpected-response', (req, res) => {
  console.log('❌ unexpected-response:', res.statusCode);
  process.exit(1);
});

ws.on('error', (err) => {
  console.error('❌ error:', err.message);
  process.exit(1);
});

ws.on('close', (code) => {
  console.log('🔌 close:', code);
  process.exit(1);
});

setTimeout(() => {
  console.log('Timeout');
  process.exit(1);
}, 5000);
