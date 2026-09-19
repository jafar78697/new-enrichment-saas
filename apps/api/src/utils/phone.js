/**
 * Shared phone-number normalizer.
 * Cleans any phone number format into E.164.
 * Handles: (844) 823-3132, 585-425-7224, 877.287.8634,
 *          18633735086, (844) 2421885, 408 426 6740,
 *          +1 (203) 204-7415, (844) 823 – 3132 (em-dash), etc.
 *
 * Usage:
 *   import { cleanPhoneNumber } from '../../utils/phone.js';
 */
export function cleanPhoneNumber(raw) {
  if (!raw) return '';

  const digits = String(raw).replace(/\D/g, '');

  if (digits.startsWith('00')) return `+${digits.substring(2)}`;

  if (String(raw).trim().startsWith('+')) return `+${digits}`;

  // US-only. Never infer a foreign country code.
  if (/^[2-9]\d{9}$/.test(digits)) {
    return '+1' + digits;
  }
  if (/^1[2-9]\d{9}$/.test(digits)) {
    return '+' + digits;
  }

  // Preserve malformed numbers only so validation can reject them clearly.
  if (digits.length > 0) {
    return '+' + digits;
  }

  return '';
}
