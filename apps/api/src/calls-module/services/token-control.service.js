/**
 * Token Control Service
 * 
 * Centralized token management for all LLM API calls (DeepSeek, Vertex AI, etc.).
 * Prevents runaway token consumption by:
 *   1. Estimating input tokens before sending
 *   2. Truncating oversized prompts
 *   3. Setting hard max_tokens limits on responses
 *   4. Tracking cumulative usage with alerts
 * 
 * Usage:
 *   import { tokenControl } from './token-control.service.js';
 *   const result = tokenControl.processPrompt(myPrompt);
 */

// ─── Configuration ────────────────────────────────────────────────────
const CONFIG = {
  // Input limits (characters)
  MAX_INPUT_CHARS: 4000,        // Hard cap on prompt length
  MAX_RESEARCH_CHARS: 2000,     // Cap on research/notes data
  MAX_WEBSITE_CHARS: 2500,      // Cap on scraped website data
  
  // Output limits
  MAX_OUTPUT_TOKENS_DEEPSEEK: 1024,   // DeepSeek response cap
  MAX_OUTPUT_TOKENS_VERTEX: 256,      // Vertex AI response cap (voice)
  MAX_OUTPUT_TOKENS_ANALYSIS: 1024,   // Post-call analysis cap
  
  // Token estimation: chars per token (conservative = lower number = over-estimate)
  CHARS_PER_TOKEN: 3,           // ~3 chars ≈ 1 token (safe for English/mixed)
  
  // Alerting
  WARN_INPUT_TOKENS: 2000,      // Warn if input exceeds this
  WARN_DAILY_TOTAL: 1000000,    // Warn if daily total exceeds 1M tokens
  
  // Daily budget (0 = unlimited)
  DAILY_TOKEN_BUDGET: 0,        // Set via env: VOICE_DAILY_TOKEN_BUDGET
};

// ─── State ─────────────────────────────────────────────────────────────
let dailyTokenUsage = 0;
let dailyResetDate = new Date().toDateString();

function resetDailyIfNeeded() {
  const today = new Date().toDateString();
  if (today !== dailyResetDate) {
    console.log(`[TokenControl] Daily reset: ${dailyTokenUsage.toLocaleString()} tokens used yesterday`);
    dailyTokenUsage = 0;
    dailyResetDate = today;
  }
}

// ─── Core functions ────────────────────────────────────────────────────

/**
 * Estimate tokens for a given text.
 * Uses a conservative 3 chars/token ratio.
 * @param {string} text 
 * @returns {number} estimated token count
 */
export function estimateTokens(text) {
  if (!text) return 0;
  if (typeof text !== 'string') return 0;
  return Math.ceil(text.length / CONFIG.CHARS_PER_TOKEN);
}

/**
 * Truncate a prompt to stay within maxChars, preserving instructions.
 * Strategy: Keep header (instructions) and footer (format rules) intact,
 * truncate the middle (data/context) portion.
 * 
 * @param {string} text - The prompt to truncate
 * @param {number} maxChars - Maximum characters allowed
 * @returns {string} truncated prompt
 */
export function truncatePrompt(text, maxChars = CONFIG.MAX_INPUT_CHARS) {
  if (!text || text.length <= maxChars) return text;

  const headerSize = Math.floor(maxChars * 0.30);
  const footerSize = Math.floor(maxChars * 0.15);
  const middleBudget = maxChars - headerSize - footerSize;

  const header = text.slice(0, headerSize);
  const footer = text.slice(-footerSize);
  const middle = text.slice(headerSize, -footerSize);

  const truncatedMiddle = middle.length > middleBudget
    ? middle.slice(0, middleBudget) + '\n[...truncated for token efficiency...]\n'
    : middle;

  const result = header + truncatedMiddle + footer;
  
  if (process.env.NODE_ENV !== 'production') {
    console.log(
      `[TokenControl] Prompt truncated: ${text.length} → ${result.length} chars ` +
      `(est. ${estimateTokens(text)} → ${estimateTokens(result)} tokens)`
    );
  }
  
  return result;
}

/**
 * Process a prompt through token control pipeline.
 * Truncates if needed, logs token estimates, checks budget.
 * 
 * @param {string} prompt - Raw prompt text
 * @param {Object} options
 * @param {number} options.maxChars - Override max input chars
 * @param {string} options.label - Label for logging (e.g., campaign name)
 * @returns {{ prompt: string, estimatedTokens: number, truncated: boolean }}
 */
export function processPrompt(prompt, options = {}) {
  resetDailyIfNeeded();
  
  const maxChars = options.maxChars || CONFIG.MAX_INPUT_CHARS;
  const label = options.label || 'unknown';
  const originalLength = prompt?.length || 0;
  const wasTruncated = originalLength > maxChars;
  
  const processed = truncatePrompt(prompt, maxChars);
  const tokens = estimateTokens(processed);
  
  // Track cumulative usage
  dailyTokenUsage += tokens;
  
  // Production logging
  console.log(
    `[TokenControl] ${label}: ${originalLength}→${processed.length} chars, ` +
    `~${tokens} tokens, daily total: ${dailyTokenUsage.toLocaleString()}`
  );
  
  // Warnings
  if (tokens > CONFIG.WARN_INPUT_TOKENS) {
    console.warn(
      `[TokenControl] ⚠️ High token prompt (${label}): ~${tokens} tokens! ` +
      `Consider reducing niche_prompt size or website_data.`
    );
  }
  
  if (CONFIG.DAILY_TOKEN_BUDGET > 0 && dailyTokenUsage > CONFIG.DAILY_TOKEN_BUDGET * 0.8) {
    console.warn(
      `[TokenControl] ⚠️ Approaching daily budget: ${dailyTokenUsage.toLocaleString()} / ${CONFIG.DAILY_TOKEN_BUDGET.toLocaleString()} tokens`
    );
  }
  
  return {
    prompt: processed,
    estimatedTokens: tokens,
    truncated: wasTruncated,
  };
}

/**
 * Track actual token usage from an API response.
 * @param {Object} usage - The usage object from API response
 * @param {string} label - Label for logging
 */
export function trackUsage(usage, label = 'api-call') {
  resetDailyIfNeeded();
  
  const total = (usage?.total_tokens || usage?.totalTokens || 0);
  const prompt = (usage?.prompt_tokens || usage?.promptTokens || 0);
  const completion = (usage?.completion_tokens || usage?.completionTokens || 0);
  
  dailyTokenUsage += total;
  
  console.log(
    `[TokenControl] ${label}: ${prompt} in + ${completion} out = ${total} tokens ` +
    `(daily: ${dailyTokenUsage.toLocaleString()})`
  );
  
  if (CONFIG.DAILY_TOKEN_BUDGET > 0 && dailyTokenUsage > CONFIG.DAILY_TOKEN_BUDGET) {
    console.error(
      `[TokenControl] 🔴 DAILY TOKEN BUDGET EXCEEDED! ` +
      `${dailyTokenUsage.toLocaleString()} / ${CONFIG.DAILY_TOKEN_BUDGET.toLocaleString()}`
    );
  }
  
  return { total, prompt, completion, dailyTotal: dailyTokenUsage };
}

/**
 * Get current token usage stats.
 */
export function getTokenStats() {
  resetDailyIfNeeded();
  return {
    dailyUsage: dailyTokenUsage,
    dailyBudget: CONFIG.DAILY_TOKEN_BUDGET,
    budgetPercent: CONFIG.DAILY_TOKEN_BUDGET > 0 
      ? Math.round((dailyTokenUsage / CONFIG.DAILY_TOKEN_BUDGET) * 100) 
      : 0,
    truncationConfig: {
      maxInputChars: CONFIG.MAX_INPUT_CHARS,
      maxOutputDeepSeek: CONFIG.MAX_OUTPUT_TOKENS_DEEPSEEK,
      maxOutputVertex: CONFIG.MAX_OUTPUT_TOKENS_VERTEX,
    },
  };
}

/**
 * Update configuration at runtime.
 */
export function updateConfig(updates) {
  Object.assign(CONFIG, updates);
  console.log('[TokenControl] Config updated:', CONFIG);
}

export const tokenControl = {
  estimateTokens,
  truncatePrompt,
  processPrompt,
  trackUsage,
  getTokenStats,
  updateConfig,
  config: CONFIG,
};

export default tokenControl;
