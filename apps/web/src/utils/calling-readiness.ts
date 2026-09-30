import type { CallingStatusResponse } from '../services/crmApi';

export interface CallingBlocker {
  message: string;
  action: 'refresh' | 'agent' | 'leads';
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
  if (status.queueCount < 1) return { message: 'Calling queue khali hai. Pehle leads ko Assigned Leads mein assign karein.', action: 'leads' };
  return null;
}
