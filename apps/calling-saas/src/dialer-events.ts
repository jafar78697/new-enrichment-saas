export const OPEN_DIALER_EVENT = 'jento:open-dialer';
export const RELOAD_CONTACTS_EVENT = 'jento:reload-contacts';

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

export function reloadContacts() {
  window.dispatchEvent(new CustomEvent(RELOAD_CONTACTS_EVENT));
}
