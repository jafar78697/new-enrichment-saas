import { env } from '../../config/env.js';

// In-memory fallback for development / when Redis is not available
const memoryStore = new Map();

let redisClient = null;

/**
 * Initialize Redis connection.
 * Falls back to in-memory storage if Redis is unavailable.
 */
async function initRedis() {
  if (redisClient) return redisClient;

  try {
    const { default: Redis } = await import('ioredis');
    redisClient = new Redis(env.REDIS_URL, {
      maxRetriesPerRequest: 2,
      retryStrategy(times) {
        if (times > 3) return null; // Stop retrying
        return Math.min(times * 200, 1000);
      },
      lazyConnect: true,
    });

    await redisClient.connect();
    console.log('[voice-agent:session] Redis connected');
    return redisClient;
  } catch (err) {
    console.warn('[voice-agent:session] Redis unavailable, using in-memory store:', err.message);
    redisClient = null;
    return null;
  }
}

/**
 * Session data structure.
 * @typedef {Object} CallSession
 * @property {string} callSid - Twilio Call SID
 * @property {string} streamSid - Twilio Stream SID
 * @property {string} direction - 'inbound' | 'outbound'
 * @property {string} from - Caller phone number
 * @property {string} to - Called phone number
 * @property {string} state - Current pipeline state (listening/thinking/speaking/idle)
 * @property {Array} conversation - Full conversation history [{role, content, timestamp}]
 * @property {Object} metadata - Custom metadata (agentId, tenantId, etc.)
 * @property {number} turnCount - Number of conversation turns
 * @property {number} interruptions - Number of barge-in interruptions
 * @property {string} startedAt - ISO timestamp
 * @property {number} totalSilenceMs - Total silence duration
 */

const TTL_SECONDS = 60 * 60; // 1 hour TTL for session data

/**
 * Create a new session for a call.
 */
export async function createSession(callSid, initialData = {}) {
  const session = {
    callSid,
    streamSid: initialData.streamSid || '',
    direction: initialData.direction || 'outbound',
    from: initialData.from || '',
    to: initialData.to || '',
    state: 'idle',
    conversation: [],
    metadata: initialData.metadata || {},
    turnCount: 0,
    interruptions: 0,
    startedAt: new Date().toISOString(),
    totalSilenceMs: 0,
  };

  const key = `voice:session:${callSid}`;
  const data = JSON.stringify(session);

  if (redisClient) {
    await redisClient.setex(key, TTL_SECONDS, data);
  } else {
    memoryStore.set(key, session);
  }

  console.log(`[voice-agent:session] Created session for ${callSid}`);
  return session;
}

/**
 * Get an existing session.
 */
export async function getSession(callSid) {
  const key = `voice:session:${callSid}`;

  if (redisClient) {
    const data = await redisClient.get(key);
    if (data) return JSON.parse(data);
    return null;
  }

  return memoryStore.get(key) || null;
}

/**
 * Update a session field(s).
 */
export async function updateSession(callSid, updates) {
  const session = await getSession(callSid);
  if (!session) return null;

  const updated = { ...session, ...updates };
  const key = `voice:session:${callSid}`;
  const data = JSON.stringify(updated);

  if (redisClient) {
    await redisClient.setex(key, TTL_SECONDS, data);
  } else {
    memoryStore.set(key, updated);
  }

  return updated;
}

/**
 * Add a message to the conversation history.
 */
export async function addConversationTurn(callSid, role, content, extra = {}) {
  const session = await getSession(callSid);
  if (!session) return null;

  session.conversation.push({
    role,
    content,
    ...extra,
    timestamp: new Date().toISOString(),
  });

  session.turnCount = session.conversation.length;

  return updateSession(callSid, session);
}

/**
 * Get conversation messages formatted for Vertex AI.
 * Returns last N turns to keep within token limits.
 */
export async function getAIConversation(callSid, maxTurns = 20) {
  const session = await getSession(callSid);
  if (!session) return [];

  // Take last maxTurns entries and map to AI format
  const recentTurns = session.conversation.slice(-maxTurns * 2); // *2 because each turn has 2 entries (user + assistant)

  return recentTurns.map((turn) => {
    const msg = {
      role: turn.role === 'model' || turn.role === 'assistant' ? 'assistant' : turn.role,
      content: turn.content || '',
    };
    if (turn.tool_calls) msg.tool_calls = turn.tool_calls;
    if (turn.tool_call_id) msg.tool_call_id = turn.tool_call_id;
    if (turn.name) msg.name = turn.name;
    return msg;
  });
}

/**
 * Set the pipeline state.
 */
export async function setState(callSid, state) {
  return updateSession(callSid, { state });
}

/**
 * Increment interruption count.
 */
export async function incrementInterruptions(callSid) {
  const session = await getSession(callSid);
  if (!session) return;
  session.interruptions = (session.interruptions || 0) + 1;
  return updateSession(callSid, { interruptions: session.interruptions });
}

/**
 * Track silence duration.
 */
export async function addSilenceDuration(callSid, ms) {
  const session = await getSession(callSid);
  if (!session) return;
  session.totalSilenceMs = (session.totalSilenceMs || 0) + ms;
  return updateSession(callSid, { totalSilenceMs: session.totalSilenceMs });
}

/**
 * Delete a session (called when call ends).
 */
export async function deleteSession(callSid) {
  const key = `voice:session:${callSid}`;

  if (redisClient) {
    await redisClient.del(key);
  } else {
    memoryStore.delete(key);
  }

  console.log(`[voice-agent:session] Deleted session for ${callSid}`);
}

/**
 * Get all active sessions.
 */
export async function getActiveSessions() {
  if (redisClient) {
    const keys = await redisClient.keys('voice:session:*');
    if (keys.length === 0) return [];

    const pipeline = redisClient.pipeline();
    keys.forEach((key) => pipeline.get(key));
    const results = await pipeline.exec();

    return results
      .filter(([err]) => !err)
      .map(([, data]) => {
        try { return JSON.parse(data); } catch { return null; }
      })
      .filter(Boolean);
  }

  return Array.from(memoryStore.values());
}

// Initialize Redis lazily
initRedis();

export {
  initRedis,
};
