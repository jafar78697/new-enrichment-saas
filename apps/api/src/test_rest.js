import { GoogleAuth } from 'google-auth-library';
import dotenv from 'dotenv';
import path from 'path';

process.env.GOOGLE_APPLICATION_CREDENTIALS = path.resolve(process.cwd(), 'google-credentials.json');
dotenv.config({ path: path.resolve(process.cwd(), '.env.production') });

async function testREST() {
  try {
    const auth = new GoogleAuth({
      scopes: 'https://www.googleapis.com/auth/cloud-platform'
    });
    const client = await auth.getClient();
    const projectId = await auth.getProjectId();
    const accessToken = (await client.getAccessToken()).token;

    const modelsToTest = ['gemini-3.5-flash'];
    const locations = ['us-central1'];

    for (const location of locations) {
      for (const model of modelsToTest) {
        console.log(`\nTesting ${model} in ${location}...`);
        const endpoint = `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/publishers/google/models/${model}:generateContent`;

        const res = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: 'Say hi' }] }],
            generationConfig: { temperature: 0.75, maxOutputTokens: 20 }
          })
        });

        const data = await res.json();
        
        if (!res.ok) {
          console.error(`❌ ${model} ERROR:`, data.error?.message || JSON.stringify(data));
        } else {
          console.log(`✅ ${model} SUCCESS. Response data:`, JSON.stringify(data, null, 2));
          return; // Stop on first success
        }
      }
    }
  } catch (err) {
    console.error('❌ TEST FAILED:', err);
  }
}

testREST();
