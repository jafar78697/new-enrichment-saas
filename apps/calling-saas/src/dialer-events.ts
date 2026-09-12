export const OPEN_DIALER_EVENT = 'jento:open-dialer';

export interface DialerTarget {
  phone: string;
  contactId?: number | string | null;
  contactName?: string;
  contactCompany?: string | null;
  autoStart?: boolean;
}

export function openDialer(target: DialerTarget) {
  window.dispatchEvent(new CustomEvent<DialerTarget>(OPEN_DIALER_EVENT, { detail: target }));
}
