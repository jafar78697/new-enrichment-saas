import WebSocket from 'ws';

const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) {
  console.error("No API key");
  process.exit(1);
}

function testModel(modelName) {
  return new Promise((resolve, reject) => {
    console.log(`Testing model: ${modelName}`);
    const ws = new WebSocket(`wss://api.openai.com/v1/realtime?model=${modelName}`, {
      headers: { 'Authorization': `Bearer ${apiKey}` }
    });

    ws.on('open', () => {
      console.log(`[${modelName}] Connected successfully!`);
      ws.close();
      resolve(true);
    });

    ws.on('error', (err) => {
      console.log(`[${modelName}] Error:`, err.message);
      reject(err);
    });
    
    ws.on('unexpected-response', (req, res) => {
       console.log(`[${modelName}] Unexpected response:`, res.statusCode);
       res.on('data', chunk => console.log(chunk.toString()));
       resolve(false);
    });
  });
}

async function run() {
  await testModel('gpt-realtime').catch(e => {});
  await testModel('gpt-4o-realtime-preview').catch(e => {});
  await testModel('gpt-4o-realtime-preview-2024-10-01').catch(e => {});
}

run();
