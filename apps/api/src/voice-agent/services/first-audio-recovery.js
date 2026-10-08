const AUDIO_DEADLINE_MS = 20000;
const THINK_GRACE_MS = 8000;
const MAX_RECOVERY_ATTEMPTS = 2;

export function clearFirstAudioRecovery(context) {
  if (context.firstReplyTimer) clearTimeout(context.firstReplyTimer);
  if (context.firstAudioTimer) clearTimeout(context.firstAudioTimer);
  context.firstReplyTimer = null;
  context.firstAudioTimer = null;
  context.firstAudioDeadlineDeferred = false;
}

export function markFirstAudioForwarded(context) {
  if (context.closing || context.aiAudioGated) return;
  context.firstReplySeen = true;
  context.agentHasSpoken = true;
  clearFirstAudioRecovery(context);
}

function canRecover(context) {
  return !context.closing && !context.firstReplySeen && !context.detectionLocked
    && !context.aiAudioGated && context.humanConfirmed;
}

export function scheduleFirstReply(context) {
  if (context.firstReplyTimer) clearTimeout(context.firstReplyTimer);
  context.firstReplyTimer = null;
  if (!canRecover(context) || !context.openingText || context.firstReplyAttempts >= MAX_RECOVERY_ATTEMPTS) return;
  context.firstReplyTimer = setTimeout(() => {
    context.firstReplyTimer = null;
    if (!canRecover(context)) return;
    if (context.prospectSpeaking || (context.agentResponsePending && Date.now() - (context.lastAgentActivityAt || 0) < THINK_GRACE_MS)) {
      scheduleFirstReply(context);
      return;
    }
    if (context.deepgramWs?.readyState !== 1 || context.signalWireWs?.readyState !== 1) return;
    context.firstReplyAttempts += 1;
    // Never force a greeting over ongoing customer or agent speech.
    try {
      context.deepgramWs.send(JSON.stringify({ type: 'InjectAgentMessage', message: context.openingText, behavior: 'default' }));
      context.agentResponsePending = true;
      context.lastAgentActivityAt = Date.now();
      console.log('[deepgram-bridge] First-reply recovery requested:', { callSid: context.callSid, attempt: context.firstReplyAttempts });
    } catch (error) {
      console.error('[deepgram-bridge] First-reply recovery send failed:', error.message);
    }
    scheduleFirstReply(context);
  }, 1200);
}

export function armFirstAudioDeadline(context) {
  // Repeated "hello" must not restart the deadline indefinitely.
  if (!canRecover(context)) return;
  if (context.firstAudioTimer) {
    if (!context.firstAudioDeadlineDeferred || context.prospectSpeaking) return;
    clearTimeout(context.firstAudioTimer);
  }
  context.firstAudioDeadlineDeferred = false;
  context.firstAudioTimer = setTimeout(function check() {
    context.firstAudioTimer = null;
    if (!canRecover(context)) return;
    // Speech events affect recovery only, not audio gain or packet playback.
    // A long human utterance must be allowed to finish.
    if (context.prospectSpeaking) {
      context.firstAudioDeadlineDeferred = true;
      context.firstAudioTimer = setTimeout(check, 2000);
      return;
    }
    if (context.firstAudioDeadlineDeferred) {
      context.firstAudioDeadlineDeferred = false;
      context.firstAudioTimer = setTimeout(check, AUDIO_DEADLINE_MS);
      return;
    }
    context.closing = true;
    clearFirstAudioRecovery(context);
    Promise.resolve().then(() => context.endSilentCall?.()).then(terminated => {
      if (terminated === false) {
        // An unsuccessful provider hangup must not permanently mute a live call.
        context.closing = false;
        armFirstAudioDeadline(context);
      }
    }).catch(error => {
      context.closing = false;
      armFirstAudioDeadline(context);
      console.error('[deepgram-bridge] First-audio timeout cleanup failed:', error.message);
    });
  }, AUDIO_DEADLINE_MS);
}
