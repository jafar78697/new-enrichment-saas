/**
 * Tool Registry — Function Calling System
 *
 * Manages tool definitions and execution for Vertex AI function calling.
 * Tools enable the AI to perform real-world actions during calls:
 * - Google Calendar: check availability, book meetings
 * - CRM: lookup leads, update pipeline stages
 * - Webhook: custom integrations
 */

import { env } from '../../config/env.js';

// Registered tool handlers
const toolHandlers = new Map();

/**
 * Tool definition format for Vertex AI function calling.
 */

/**
 * Register a tool handler.
 * @param {string} name - Tool name
 * @param {Object} definition - Vertex AI function declaration
 * @param {Function} handler - async function(args, context) => result
 */
export function registerTool(name, definition, handler) {
  toolHandlers.set(name, { definition, handler });
  console.log(`[voice-agent:tools] Registered tool: ${name}`);
}

/**
 * Get all registered tool definitions for Vertex AI.
 * @returns {Array} Function declarations array
 */
export function getToolDefinitions() {
  return Array.from(toolHandlers.values()).map((t) => t.definition);
}

/**
 * Execute a tool call from the AI.
 * @param {string} name - Tool name
 * @param {Object} args - Tool arguments
 * @param {Object} context - Call context (callSid, tenantId, etc.)
 * @returns {Object} Tool execution result
 */
export async function executeTool(name, args, context = {}) {
  const tool = toolHandlers.get(name);
  if (!tool) {
    console.warn(`[voice-agent:tools] Unknown tool: ${name}`);
    return { error: `Tool '${name}' not found` };
  }

  try {
    console.log(`[voice-agent:tools] Executing ${name} with args:`, JSON.stringify(args));
    const result = await tool.handler(args, context);
    console.log(`[voice-agent:tools] ${name} result:`, JSON.stringify(result).slice(0, 200));
    return result;
  } catch (err) {
    console.error(`[voice-agent:tools] Error executing ${name}:`, err.message);
    return { error: err.message };
  }
}

/**
 * Check if a tool is available.
 */
export function hasTool(name) {
  return toolHandlers.has(name);
}

// ============================================================
// Built-in Tool Definitions
// ============================================================

/**
 * Google Calendar Tool — Book meetings
 */
registerTool('google_calendar', {
  name: 'google_calendar',
  description: 'Check calendar availability and book meetings. Use this when the user wants to schedule a call, demo, or appointment.',
  parameters: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['check_availability', 'book_meeting'],
        description: 'Whether to check availability or book a meeting',
      },
      date: {
        type: 'string',
        description: 'Date in YYYY-MM-DD format',
      },
      time: {
        type: 'string',
        description: 'Time in HH:MM format (24-hour)',
      },
      duration_minutes: {
        type: 'integer',
        description: 'Meeting duration in minutes',
        default: 30,
      },
      attendee_name: {
        type: 'string',
        description: 'Name of the person to book for',
      },
      attendee_email: {
        type: 'string',
        description: 'Email of the person to book for',
      },
      title: {
        type: 'string',
        description: 'Meeting title/description',
      },
    },
    required: ['action'],
  },
}, async (args, context) => {
  // In production, integrate with Google Calendar API
  // For now, return a mock response
  if (args.action === 'check_availability') {
    return {
      available: true,
      slots: [
        { date: args.date || '2026-06-19', time: '10:00', available: true },
        { date: args.date || '2026-06-19', time: '11:00', available: true },
        { date: args.date || '2026-06-19', time: '14:00', available: true },
        { date: args.date || '2026-06-19', time: '15:30', available: true },
        { date: args.date || '2026-06-19', time: '16:00', available: false },
      ],
    };
  }

  if (args.action === 'book_meeting') {
    const meeting = {
      booked: true,
      confirmation_id: `JENTO-${Date.now()}`,
      date: args.date || '2026-06-19',
      time: args.time || '10:00',
      duration_minutes: args.duration_minutes || 30,
      title: args.title || 'Jento AI Demo',
      attendee: args.attendee_name || 'Customer',
    };
    console.log(`[voice-agent:tools] Meeting booked: ${meeting.confirmation_id}`);
    return meeting;
  }

  return { error: 'Invalid action' };
});

/**
 * CRM Lookup Tool — Search and update leads
 */
registerTool('crm_lookup', {
  name: 'crm_lookup',
  description: 'Look up lead information in the CRM. Use this to find contact details, check lead status, or update pipeline stages.',
  parameters: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['search', 'get_status', 'update_stage'],
        description: 'What to do with the CRM',
      },
      search_term: {
        type: 'string',
        description: 'Name, phone number, or email to search for',
      },
      new_stage: {
        type: 'string',
        description: 'New pipeline stage (only for update_stage action)',
        enum: ['new_lead', 'contacted', 'qualified', 'meeting_booked', 'proposal_sent', 'closed_won', 'closed_lost'],
      },
      lead_id: {
        type: 'string',
        description: 'Lead ID (for updating)',
      },
    },
    required: ['action'],
  },
}, async (args, context) => {
  // In production, integrate with PostgreSQL contacts table
  const { search_term, action } = args;

  if (action === 'search') {
    // Mock search result
    return {
      found: !!search_term,
      leads: search_term ? [{
        id: '123',
        name: search_term,
        company: 'Acme Corp',
        stage: 'contacted',
        last_contact: new Date().toISOString(),
      }] : [],
    };
  }

  if (action === 'get_status') {
    return {
      lead_id: args.lead_id || '123',
      stage: 'contacted',
      score: 75,
      last_contact: new Date().toISOString(),
    };
  }

  if (action === 'update_stage') {
    return {
      updated: true,
      lead_id: args.lead_id || '123',
      previous_stage: 'contacted',
      new_stage: args.new_stage || 'qualified',
    };
  }

  return { error: 'Invalid action' };
});

/**
 * Webhook Tool — Custom integrations
 */
registerTool('webhook', {
  name: 'webhook',
  description: 'Trigger a webhook for custom integrations (Slack, email, etc.)',
  parameters: {
    type: 'object',
    properties: {
      event: {
        type: 'string',
        description: 'Event type to trigger',
        enum: ['send_email', 'slack_notification', 'create_task', 'update_spreadsheet'],
      },
      data: {
        type: 'object',
        description: 'Data to send with the webhook',
      },
    },
    required: ['event'],
  },
}, async (args, context) => {
  console.log(`[voice-agent:tools] Webhook triggered: ${args.event}`, args.data);
  return {
    triggered: true,
    event: args.event,
    timestamp: new Date().toISOString(),
  };
});

export default {
  registerTool,
  getToolDefinitions,
  executeTool,
  hasTool,
};
