/**
 * Multi-Tenant Resolver
 *
 * Resolves tenant context for voice agent operations.
 * Each tenant can have:
 * - Own AI agent config (prompt, voice, tools)
 * - Own Twilio phone numbers
 * - Own knowledge base
 * - Own API keys (ElevenLabs, Google)
 *
 * Tenant resolution priority:
 * 1. API key / JWT token (from management API calls)
 * 2. Twilio phone number (inbound calls)
 * 3. Voice agent ID parameter (outbound calls)
 */

import { env } from '../config/env.js';

// Cache tenant configs (5 min TTL)
const tenantCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Resolve tenant from request context.
 * @param {Object} req - Express request
 * @returns {Object} Tenant config
 */
export function resolveTenant(req) {
  // 1. Try JWT token
  if (req.user && req.user.tenantId) {
    return getTenantConfig(req.user.tenantId);
  }

  // 2. Try Twilio phone number (for inbound calls)
  const toNumber = req.body?.To;
  if (toNumber) {
    const tenant = getTenantByPhoneNumber(toNumber);
    if (tenant) return tenant;
  }

  // 3. Try voice agent ID parameter
  const agentId = req.body?.voiceAgentId || req.query?.voiceAgentId;
  if (agentId) {
    return getTenantConfig(`agent:${agentId}`);
  }

  // Default tenant
  return getDefaultTenant();
}

/**
 * Get tenant configuration by ID.
 */
function getTenantConfig(tenantId) {
  const cached = tenantCache.get(tenantId);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.config;
  }

  // In production, fetch from database
  const config = {
    tenantId,
    voiceAgentId: 'default',
    systemPrompt: null, // Use default
    voiceId: env.ELEVENLABS_VOICE_ID,
    tools: ['google_calendar', 'crm_lookup'],
    knowledgeBaseId: null,
    maxConversationTurns: 50,
    silenceTimeoutMs: 3000,
  };

  tenantCache.set(tenantId, { config, timestamp: Date.now() });
  return config;
}

/**
 * Find tenant by Twilio phone number.
 */
function getTenantByPhoneNumber(phoneNumber) {
  // In production, query database for tenant by phone number
  return getDefaultTenant();
}

/**
 * Default tenant configuration.
 */
function getDefaultTenant() {
  return {
    tenantId: 'default',
    voiceAgentId: 'default',
    systemPrompt: null,
    voiceId: env.ELEVENLABS_VOICE_ID,
    tools: ['google_calendar', 'crm_lookup'],
    knowledgeBaseId: null,
    maxConversationTurns: 50,
    silenceTimeoutMs: 3000,
  };
}

/**
 * Express middleware to attach tenant context.
 */
export function tenantMiddleware(req, res, next) {
  try {
    req.tenant = resolveTenant(req);
    next();
  } catch (err) {
    console.error('[voice-agent:tenant] Resolution error:', err.message);
    req.tenant = getDefaultTenant();
    next();
  }
}

export default {
  resolveTenant,
  tenantMiddleware,
  getDefaultTenant,
};
