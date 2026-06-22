/**
 * DeepSeek API (OpenAI Compatible) Streaming Service
 *
 * Integrates with DeepSeek API for ultra-fast, low-latency AI responses.
 * Uses the OpenAI SDK since DeepSeek is fully OpenAI API compatible.
 */

import OpenAI from 'openai';
import { env } from '../../config/env.js';

// Initialize the OpenAI client pointing to DeepSeek
const openai = new OpenAI({
  baseURL: 'https://api.deepseek.com',
  apiKey: env.DEEPSEEK_API_KEY || 'dummy_key_to_prevent_crash_before_env_is_set',
});

// DeepSeek chat model
const DEEPSEEK_MODEL = 'deepseek-chat';

/**
 * Call DeepSeek with streaming responses.
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
export async function streamLLMResponse({
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

  // Format messages for OpenAI/DeepSeek
  const formattedMessages = [];
  
  if (systemPrompt) {
    formattedMessages.push({ role: 'system', content: systemPrompt });
  }

  // Ensure role matches expected types (user, assistant, system, tool)
  for (const msg of messages) {
    if (msg.role === 'tool') {
      formattedMessages.push({
        role: 'tool',
        content: msg.content || '',
        tool_call_id: msg.tool_call_id || 'dummy_id',
      });
    } else if (msg.tool_calls) {
      formattedMessages.push({
        role: 'assistant',
        content: msg.content || '',
        tool_calls: msg.tool_calls,
      });
    } else {
      formattedMessages.push({
        role: msg.role === 'model' || msg.role === 'assistant' ? 'assistant' : 'user',
        content: msg.content,
      });
    }
  }

  // Format tools for OpenAI/DeepSeek
  const formattedTools = tools.length > 0
    ? tools.map((t) => ({
        type: 'function',
        function: {
          name: t.name,
          description: t.description,
          parameters: t.parameters || { type: 'object', properties: {} },
        },
      }))
    : undefined;

  let stream;
  try {
    if (!env.DEEPSEEK_API_KEY) {
      throw new Error('DEEPSEEK_API_KEY is missing in .env file. Please add it to use the DeepSeek API.');
    }

    stream = await openai.chat.completions.create({
      model: DEEPSEEK_MODEL,
      messages: formattedMessages,
      tools: formattedTools,
      temperature: 0.7,
      max_tokens: 256,
      stream: true,
      stream_options: { include_usage: true }
    });

    let fullResponse = '';
    let toolCallName = '';
    let toolCallArgs = '';
    
    // Process the stream
    for await (const chunk of stream) {
      if (aborted) break;

      // Handle tool calls
      if (chunk.choices[0]?.delta?.tool_calls) {
        const tc = chunk.choices[0].delta.tool_calls[0];
        if (tc && tc.function) {
          if (tc.function.name) toolCallName = tc.function.name;
          if (tc.function.arguments) toolCallArgs += tc.function.arguments;
        }
      }

      // Handle text content
      const textChunk = chunk.choices[0]?.delta?.content || '';
      if (textChunk) {
        fullResponse += textChunk;
        if (onChunk) {
          onChunk({
            text: textChunk,
            fullText: fullResponse,
          });
        }
      }

      // Handle usage tracking
      if (chunk.usage) {
        totalInputTokens += chunk.usage.prompt_tokens || 0;
        totalOutputTokens += chunk.usage.completion_tokens || 0;
      }
    }

    if (toolCallName && onToolCall) {
      let args = {};
      try {
        args = JSON.parse(toolCallArgs || '{}');
      } catch (e) {
        console.error('[voice-agent:deepseek] Failed to parse tool arguments:', toolCallArgs);
      }
      onToolCall({ name: toolCallName, args });
      // If a tool was called, we skip onComplete here because the orchestrator will handle the tool
      // and typically start a new stream for the AI's final response.
    } else if (onComplete) {
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
        if (stream && stream.controller) {
          stream.controller.abort();
        }
      },
    };
  } catch (err) {
    console.error('[voice-agent:deepseek] Streaming error:', err.message);
    if (onError) {
      onError(err);
    }
    throw err;
  }
}

/**
 * Non-streaming version for post-call analysis (summary, sentiment, etc.)
 */
export async function generateCompletion({
  systemPrompt,
  userPrompt,
  temperature = 0.3,
  maxTokens = 1024,
}) {
  const messages = [];
  if (systemPrompt) {
    messages.push({ role: 'system', content: systemPrompt });
  }
  messages.push({ role: 'user', content: userPrompt });

  try {
    const response = await openai.chat.completions.create({
      model: DEEPSEEK_MODEL,
      messages,
      temperature,
      max_tokens: maxTokens,
    });

    return {
      text: response.choices[0]?.message?.content || '',
      inputTokens: response.usage?.prompt_tokens || 0,
      outputTokens: response.usage?.completion_tokens || 0,
    };
  } catch (err) {
    console.error('[voice-agent:deepseek] Generate error:', err.message);
    throw err;
  }
}

export { DEEPSEEK_MODEL as GEMINI_MODEL }; // Export alias to minimize changes elsewhere
