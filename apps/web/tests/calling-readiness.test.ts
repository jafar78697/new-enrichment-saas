import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getCallingBlocker } from '../src/utils/calling-readiness';
import type { CallingStatusResponse } from '../src/services/crmApi';

const status = {
  isRunning: false, queueCount: 1, withinCallingWindow: true,
  settings: { maxCallsPerDay: 5, maxMinutesPerDay: 10, maxCostUsdPerDay: 1, callingTimezone: 'America/New_York', callingWindowStartHour: 9, callingWindowEndHour: 17 },
  usageToday: { attempts: 0, seconds: 0, costUsd: 0 },
} as CallingStatusResponse;

test('empty queue gives an actionable reason instead of a dead button', () => {
  assert.equal(getCallingBlocker({ ...status, queueCount: 0 }, 'agent')?.action, 'leads');
});
test('ready queue can start without relaxing safety checks', () => {
  assert.equal(getCallingBlocker(status, 'agent', true), null);
});
test('saved timezone window blocks start', () => {
  const blocker = getCallingBlocker({ ...status, withinCallingWindow: false }, 'agent');
  assert.equal(blocker?.action, 'settings');
  assert.match(blocker!.message, /America\/New_York/);
});
test('missing status, agent and paused provider give distinct blockers', () => {
  assert.equal(getCallingBlocker(null, 'agent')?.action, 'refresh');
  assert.equal(getCallingBlocker(status, '')?.action, 'agent');
  assert.equal(getCallingBlocker(status, 'agent', false)?.action, 'refresh');
});
test('daily calls, minutes and estimated cost remain guarded', () => {
  for (const usageToday of [{ attempts: 5, seconds: 0, costUsd: 0 }, { attempts: 0, seconds: 600, costUsd: 0 }, { attempts: 0, seconds: 0, costUsd: 1 }]) {
    assert.equal(getCallingBlocker({ ...status, usageToday }, 'agent')?.action, 'settings');
  }
});
test('stop remains available even when all start prerequisites are blocked', () => {
  assert.equal(getCallingBlocker({ ...status, isRunning: true, queueCount: 0, withinCallingWindow: false }, '', false), null);
});
