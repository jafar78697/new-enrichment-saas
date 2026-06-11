import dotenv from 'dotenv';
import path from 'path';

// Set path explicitly for local testing, overriding .env.production
process.env.GOOGLE_APPLICATION_CREDENTIALS = path.resolve(process.cwd(), 'google-credentials.json');
dotenv.config({ path: path.resolve(process.cwd(), '.env.production') });
delete process.env.GEMINI_API_KEY; // Prevent SDK from using the API key instead of Service Account

import { GoogleGenAI } from '@google/genai';

async function testVertex() {
  console.log('Using Credentials File:', process.env.GOOGLE_APPLICATION_CREDENTIALS);
  
  try {
    console.log('Initializing GoogleGenAI client for Vertex AI...');
    const ai = new GoogleGenAI({
      vertexai: {
        project: 'learned-acolyte-489619-d2',
        location: 'us-central1'
      }
    });
    
    console.log('Generating sample email for Jafar Bhai...');
    const response = await ai.models.generateContent({
      model: 'gemini-1.5-flash',
      contents: 'Write a short 2-sentence introductory email to a client named Jafar.',
      config: {
        temperature: 0.75,
        maxOutputTokens: 200
      }
    });
    
    console.log('\n==================================');
    console.log('✅ GENERATED EMAIL:');
    console.log('==================================');
    console.log(response.text);
    console.log('==================================\n');
    console.log('TEST PASSED SUCCESSFULLY! Vertex AI is fully functional.');
    
  } catch (err) {
    console.error('❌ TEST FAILED:', err);
  }
}

testVertex();
