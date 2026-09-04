import { parsePhoneNumberFromString } from 'libphonenumber-js/min';

/**
 * Normalize phone numbers to valid USA/Canada E.164.
 * Accepts common formats like:
 * - (858) 221-4057
 * - 858-221-4057
 * - 1-858-221-4057
 * - +1 858 221 4057
 *
 * Returns:
 * - +1XXXXXXXXXX for valid USA or Canada numbers
 * - empty string for other countries or invalid numbers
 */
export function normalizeNorthAmericanPhone(raw) {
  if (!raw) return '';

  const trimmed = String(raw).trim();
  const digits = trimmed.replace(/\D/g, '');
  const candidate = trimmed.startsWith('+')
    ? trimmed
    : digits.length === 10
      ? `+1${digits}`
      : digits.length === 11 && digits.startsWith('1')
        ? `+${digits}`
        : '';
  if (!candidate) return '';

  const phone = parsePhoneNumberFromString(candidate);
  if (!phone?.isValid() || !['US', 'CA'].includes(phone.country || '')) return '';

  return phone.number;
}

// Kept for older imports while the calling module moves to USA + Canada.
export function normalizeUSPhone(raw) {
  return normalizeNorthAmericanPhone(raw);
}

export function isUSPhone(raw) {
  return Boolean(normalizeNorthAmericanPhone(raw));
}
