import OpenAI from 'openai';
import { env } from '../../config/env.js';

let client = null;

function getClient() {
  if (!env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is missing for post-call analysis.');
  }
  if (!client) client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  return client;
}

export async function generateCompletion({
  systemPrompt,
  userPrompt,
  temperature = 0.2,
  maxTokens = 512,
}) {
  const messages = [];
  if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
  messages.push({ role: 'user', content: userPrompt });

  const response = await getClient().chat.completions.create({
    model: env.OPENAI_ANALYSIS_MODEL,
    messages,
    temperature,
    max_tokens: maxTokens,
  });

  return {
    text: response.choices[0]?.message?.content || '',
    inputTokens: response.usage?.prompt_tokens || 0,
    outputTokens: response.usage?.completion_tokens || 0,
  };
}
