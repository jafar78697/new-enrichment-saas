import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

async function generateEmailWithAI(prompt, contact) {
  if (!GEMINI_API_KEY) {
    console.error('No GEMINI_API_KEY found');
    return null;
  }
  try {
    const systemPrompt = prompt
      .replace(/\{\{contact_name\}\}/gi, contact.name || 'there')
      .replace(/\{\{company_name\}\}/gi, contact.company || 'your company')
      .replace(/\{\{website\}\}/gi, contact.website || '')
      .replace(/\{\{location\}\}/gi, contact.location || '')
      .replace(/\{\{services\}\}/gi, contact.niche || '')
      .replace(/\{\{company_description\}\}/gi, contact.company_description || '')
      .replace(/\{\{research_data\}\}/gi, contact.notes || '');

    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: [{
          parts: [{ text: systemPrompt }]
        }],
        generationConfig: {
          temperature: 0.75,
          maxOutputTokens: 500
        }
      })
    });
    const data = await res.json();
    if (!data.candidates) {
      console.log('Gemini Error Response:', JSON.stringify(data, null, 2));
    }
    return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || null;
  } catch (err) {
    console.error('AI generation failed:', err.message);
    return null;
  }
}

function parseEmailContent(rawText, contact) {
  if (!rawText) return null;

  const subjectMatch = rawText.match(/^Subject:\s*(.+)/im);
  const subject = subjectMatch
    ? subjectMatch[1].trim()
    : `A small improvement for ${contact.company || 'your company'}`;

  const body = rawText.replace(/^Subject:\s*.+\n?/im, '').trim();
  return { subject, body };
}

async function runTest() {
  const dummyContact = {
    name: 'John Doe',
    company: 'Acme Corp',
    website: 'acme.com',
    niche: 'SaaS',
    notes: 'They recently raised series A.'
  };

  const dummyTemplate = `You are an expert B2B sales copywriter.
Write a short, casual cold email to {{contact_name}} at {{company_name}}.
Include their recent news: {{research_data}}.
Format the output EXACTLY as:
Subject: [Your Subject Here]
[Your Body Here]`;

  console.log('--- Sending Prompt to Gemini ---');
  const rawText = await generateEmailWithAI(dummyTemplate, dummyContact);
  
  console.log('\\n--- Raw Output from Gemini ---');
  console.log(rawText);

  console.log('\\n--- Parsed Output ---');
  const parsed = parseEmailContent(rawText, dummyContact);
  
  if (parsed) {
    console.log(`SUBJECT: ${parsed.subject}`);
    console.log(`BODY:\\n${parsed.body}`);
    
    if (parsed.body.includes('You are an expert B2B sales copywriter')) {
      console.log('\\n❌ WARNING: The prompt leaked into the body!');
    } else {
      console.log('\\n✅ SUCCESS: The output is clean and does not contain the prompt.');
    }
  } else {
    console.log('\\n❌ ERROR: Parsing failed.');
  }
}

runTest();
