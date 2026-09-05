import type { CallingStatusResponse } from '../services/crmApi';

export interface CallingBlocker {
  message: string;
  action: 'refresh' | 'agent' | 'leads' | 'settings';
}

export function getCallingBlocker(
  status: CallingStatusResponse | null,
  selectedAgentId: string,
  outboundEnabled?: boolean,
): CallingBlocker | null {
  if (!status) return { message: 'Calling status abhi load nahi hua.', action: 'refresh' };
  if (status.isRunning) return null;
  if (!selectedAgentId) return { message: 'Koi active outbound agent select nahi hai.', action: 'agent' };
  if (outboundEnabled === false) return { message: 'Outbound calling server policy se paused hai.', action: 'refresh' };
  if (status.queueCount < 1) return { message: 'Calling queue khali hai. Koi callable lead assign nahi hui.', action: 'leads' };
  const { settings, usageToday } = status;
  if (!status.withinCallingWindow) return {
    message: `Calling hours: ${settings.callingWindowStartHour}:00-${settings.callingWindowEndHour}:00 (${settings.callingTimezone}). Abhi window band hai.`,
    action: 'settings',
  };
  if (usageToday.attempts >= settings.maxCallsPerDay) return { message: `Aaj ki ${settings.maxCallsPerDay} calls ki limit poori ho gayi.`, action: 'settings' };
  if (usageToday.seconds >= settings.maxMinutesPerDay * 60) return { message: 'Aaj ki calling minutes limit poori ho gayi.', action: 'settings' };
  if (usageToday.costUsd >= settings.maxCostUsdPerDay) return { message: 'Aaj ka estimated AI budget poora ho gaya.', action: 'settings' };
  return null;
}
