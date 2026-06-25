/**
 * Normalize phone numbers to strict US E.164.
 * Accepts common formats like:
 * - (858) 221-4057
 * - 858-221-4057
 * - 1-858-221-4057
 * - +1 858 221 4057
 *
 * Returns:
 * - +1XXXXXXXXXX for valid US numbers
 * - empty string for non-US or invalid numbers
 */
export function normalizeUSPhone(raw) {
  if (!raw) return '';

  const trimmed = String(raw).trim();
  const digits = trimmed.replace(/\D/g, '');

  if (digits.length === 10) {
    return `+1${digits}`;
  }

  if (digits.length === 11 && digits.startsWith('1')) {
    return `+${digits}`;
  }

  return '';
}

export function isUSPhone(raw) {
  return Boolean(normalizeUSPhone(raw));
}
