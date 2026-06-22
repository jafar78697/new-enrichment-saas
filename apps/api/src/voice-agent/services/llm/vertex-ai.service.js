/**
 * Google Vertex AI (Gemini) Streaming Service
 *
 * Integrates with Vertex AI Gemini 1.5 Flash for real-time AI responses.
 * Uses streaming API to minimize latency — text chunks are yielded
 * as soon as they're generated rather than waiting for the full response.
 *
 * Features:
 * - Streaming chat completions with Gemini
 * - Function calling / tool calling support
 * - Conversation history management
 * - System prompt injection
 * - Token counting for cost tracking
 */

import { env } from '../../config/env.js';
// Vertex AI client — we use the REST API directly for maximum control
// over streaming and function calling

// Vertex AI endpoint for Gemini 1.5 Flash
const VERTEX_API_BASE = `https://${env.VERTEX_AI_LOCATION}-aiplatform.googleapis.com/v1`;
const GEMINI_MODEL = 'gemini-1.5-flash';

let accessToken = null;
let tokenExpiry = 0;

/**
 * Get a Google Cloud access token using the service account credentials.
 */
async function getAccessToken() {
  if (accessToken && Date.now() < tokenExpiry) {
    return accessToken;
  }

  try {
    const { GoogleAuth } = await import('google-auth-library');
    const auth = new GoogleAuth({
      scopes: ['https://www.googleapis.com/auth/cloud-platform'],
    });
    const client = await auth.getClient();
    const tokenResponse = await client.getAccessToken();
    accessToken = tokenResponse.token;
    tokenExpiry = Date.now() + 50 * 60 * 1000; // 50 minutes (tokens last 60 min)
    return accessToken;
  } catch (err) {
    console.error('[voice-agent:vertex] Failed to get access token:', err.message);
    throw err;
  }
}

/**
 * Call Vertex AI Gemini with streaming responses.
 *
 * @param {Object} options
 * @param {Array} options.messages - Conversation history (role/content pairs)
 * @param {string} options.systemPrompt - System instruction for the AI
 * @param {Array} [options.tools] - Function definitions for tool calling
 * @param {Function} options.onChunk - Called with each text chunk as it arrives
 * @param {Function} options.onToolCall - Called when AI requests a function call
 * @param {Function} options.onComplete - Called when streaming is complete
 * @param {Function} options.onError - Called on error
 * @returns {Object} Controller with abort() method
 */
export async function streamGeminiResponse({
  messages,
  systemPrompt,
  tools = [],
  onChunk,
  onToolCall,
  onComplete,
  onError,
}) {
  let aborted = false;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;

  // Build the request payload
  const contents = messages.map((msg) => ({
    role: msg.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: msg.content }],
  }));

  // Build system instruction
  const systemInstruction = systemPrompt
    ? { parts: [{ text: systemPrompt }] }
    : undefined;

  // Build tool declarations
  const toolDeclarations = tools.length > 0
    ? [{ functionDeclarations: tools.map((t) => ({
        name: t.name,
        description: t.description,
        parameters: t.parameters || {},
      })) }]
    : undefined;

  const requestBody = {
    contents,
    systemInstruction,
    tools: toolDeclarations,
    generationConfig: {
      temperature: 0.7,
      topP: 0.95,
      topK: 40,
      maxOutputTokens: 256,
      candidateCount: 1,
      stopSequences: [],
    },
    safetySettings: [
      { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
      { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
      { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
    ],
  };

  try {
    const token = await getAccessToken();
    const url = `${VERTEX_API_BASE}/projects/${env.VERTEX_AI_PROJECT}/locations/${env.VERTEX_AI_LOCATION}/publishers/google/models/${GEMINI_MODEL}:streamGenerateContent?alt=sse`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Vertex AI error (${response.status}): ${errorText}`);
    }
    console.log('[voice-agent:vertex] Fetch successful, starting stream reader...');

    // Read the SSE (Server-Sent Events) stream
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let fullResponse = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (aborted) {
        reader.cancel();
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // Keep incomplete line in buffer

      for (const line of lines) {
        if (!line.trim() || !line.startsWith('data: ')) continue;

        const jsonStr = line.slice(6); // Remove "data: " prefix
        if (jsonStr === '[DONE]') continue;

        try {
          const data = JSON.parse(jsonStr);

          if (data.candidates && data.candidates.length > 0) {
            const candidate = data.candidates[0];

            // Check for function calls first
            if (candidate.content?.parts) {
              for (const part of candidate.content.parts) {
                if (part.functionCall) {
                  if (onToolCall) {
                    onToolCall({
                      name: part.functionCall.name,
                      args: part.functionCall.args || {},
                    });
                  }
                }
                if (part.text) {
                  fullResponse += part.text;
                  if (onChunk) {
                    onChunk({
                      text: part.text,
                      fullText: fullResponse,
                    });
                  }
                }
              }
            }

            // Track token usage
            if (data.usageMetadata) {
              totalInputTokens += data.usageMetadata.promptTokenCount || 0;
              totalOutputTokens += data.usageMetadata.candidatesTokenCount || 0;
            }
          }
        } catch (parseErr) {
          // Ignore malformed SSE data
        }
      }
    }

    // Finalize
    if (onComplete) {
      onComplete({
        fullText: fullResponse,
        inputTokens: totalInputTokens,
        outputTokens: totalOutputTokens,
      });
    }

    return {
      text: fullResponse,
      inputTokens: totalInputTokens,
      outputTokens: totalOutputTokens,
      abort() {
        aborted = true;
      },
    };
  } catch (err) {
    console.error('[voice-agent:vertex] Streaming error:', err.message);
    if (onError) {
      onError(err);
    }
    throw err;
  }
}

/**
 * Non-streaming version for post-call analysis (summary, sentiment, etc.)
 * Uses a separate model invocation without streaming.
 */
export async function generateCompletion({
  systemPrompt,
  userPrompt,
  temperature = 0.3,
  maxTokens = 1024,
}) {
  const contents = [
    { role: 'user', parts: [{ text: userPrompt }] },
  ];

  const requestBody = {
    contents,
    systemInstruction: systemPrompt ? { parts: [{ text: systemPrompt }] } : undefined,
    generationConfig: {
      temperature,
      topP: 0.95,
      maxOutputTokens: maxTokens,
      candidateCount: 1,
    },
  };

  try {
    const token = await getAccessToken();
    const url = `${VERTEX_API_BASE}/projects/${env.VERTEX_AI_PROJECT}/locations/${env.VERTEX_AI_LOCATION}/publishers/google/models/${GEMINI_MODEL}:generateContent`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Vertex AI error (${response.status}): ${errorText}`);
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

    return {
      text,
      inputTokens: data.usageMetadata?.promptTokenCount || 0,
      outputTokens: data.usageMetadata?.candidatesTokenCount || 0,
    };
  } catch (err) {
    console.error('[voice-agent:vertex] Generate error:', err.message);
    throw err;
  }
}

export { getAccessToken, GEMINI_MODEL };
