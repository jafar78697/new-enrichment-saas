/**
 * Supervisor AI — Live Call Monitoring
 *
 * Monitors active voice AI calls in real-time for:
 * - Negative sentiment detection
 * - Customer frustration signals
 * - Long silences
 * - Repeated objections
 *
 * When an alert is triggered:
 * 1. Emits Socket.io event for real-time dashboard notification
 * 2. Creates alert record in database
 * 3. Optionally allows human agent to barge-in
 */

import { getActiveSessions } from '../session/session-store.js';
import { getPipelineStats } from '../../orchestrator/call-pipeline.js';

// Alert thresholds
const THRESHOLDS = {
  negativeSentimentScore: -0.3,
  silenceSeconds: 15,
  objectionCount: 3,
  consecutiveNoResponse: 2,
};

// Track alerts per call to avoid spam
const alertCooldowns = new Map();
const ALERT_COOLDOWN_MS = 30000; // 30 seconds between alerts per call

/**
 * Start the supervisor monitoring loop.
 * Runs every 5 seconds to check active calls.
 */
export function startSupervisor() {
  console.log('[voice-agent:supervisor] Starting supervisor monitor...');

  setInterval(async () => {
    try {
      const sessions = await getActiveSessions();

      for (const session of sessions) {
        if (session.state === 'ended') continue;
        await monitorSession(session);
      }
    } catch (err) {
      console.error('[voice-agent:supervisor] Monitor error:', err.message);
    }
  }, 5000);

  console.log('[voice-agent:supervisor] Supervisor monitor active (5s interval)');
}

/**
 * Monitor a single session for alert conditions.
 */
async function monitorSession(session) {
  const { callSid, conversation, state, totalSilenceMs, interruptions } = session;

  // Check cooldown
  const lastAlert = alertCooldowns.get(callSid);
  if (lastAlert && Date.now() - lastAlert < ALERT_COOLDOWN_MS) return;

  // Analyze last N messages for sentiment
  const recentMessages = conversation.slice(-4);
  if (recentMessages.length > 0) {
    const sentimentIssues = analyzeSentimentIssues(recentMessages);

    if (sentimentIssues.hasNegativeSentiment) {
      triggerAlert(callSid, 'negative_sentiment', 'high', {
        recentMessages: recentMessages.map((m) => m.content),
        state,
      });
      alertCooldowns.set(callSid, Date.now());
      return;
    }
  }

  // Check for long silence
  if (totalSilenceMs > THRESHOLDS.silenceSeconds * 1000) {
    triggerAlert(callSid, 'long_silence', 'medium', {
      silenceDuration: totalSilenceMs,
      state,
    });
    alertCooldowns.set(callSid, Date.now());
  }

  // Check for excessive interruptions
  if (interruptions > 5) {
    triggerAlert(callSid, 'repeated_objections', 'low', {
      interruptionCount: interruptions,
      state,
    });
    alertCooldowns.set(callSid, Date.now());
  }
}

/**
 * Simple sentiment analysis on recent messages.
 * In production, use Vertex AI for accurate analysis.
 */
function analyzeSentimentIssues(messages) {
  const negativeWords = [
    'angry', 'frustrated', 'upset', 'annoying', 'waste of time',
    'stop calling', 'don\'t call', 'remove me', 'not interested',
    'leave me alone', 'spam', 'scam', 'hang up',
  ];

  const customerMessages = messages
    .filter((m) => m.role === 'user')
    .map((m) => m.content.toLowerCase());

  let negativeCount = 0;
  for (const msg of customerMessages) {
    for (const word of negativeWords) {
      if (msg.includes(word)) {
        negativeCount++;
        break;
      }
    }
  }

  return {
    hasNegativeSentiment: negativeCount >= 1,
    negativeCount,
  };
}

/**
 * Trigger a supervisor alert.
 */
async function triggerAlert(callSid, alertType, severity, details) {
  console.log(`[voice-agent:supervisor] ALERT [${severity}] ${alertType} for ${callSid}`);

  // Emit Socket.io event for real-time dashboard
  try {
    const { emitToAgent } = await import('../../calls-module/services/socket.service.js');
    emitToAgent('system', 'voice.supervisor.alert', {
      callSid,
      alertType,
      severity,
      details,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.warn('[voice-agent:supervisor] Socket emit failed:', err.message);
  }

  // In production, save to voice_supervisor_alerts table
  // and potentially trigger Slack/email notifications
}

/**
 * Get all active calls being monitored.
 */
export function getMonitoredCalls() {
  return getPipelineStats();
}

export default {
  startSupervisor,
  getMonitoredCalls,
};
