/**
 * Normalize a Kenyan-style phone number to the +254XXXXXXXXX format.
 * Examples:
 *   0712345678   -> +254712345678
 *   712345678    -> +254712345678
 *   254712345678 -> +254712345678
 *   +254712345678 -> +254712345678
 * Falls back to a lightly-cleaned version (digits + leading +) for
 * numbers that don't match the Kenyan pattern, so the system still
 * works for other countries without crashing.
 */
function normalizePhone(raw) {
  if (!raw) return raw;
  const trimmed = String(raw).trim();
  const digits = trimmed.replace(/[^\d+]/g, '');

  if (/^0\d{9}$/.test(digits)) {
    return `+254${digits.slice(1)}`;
  }
  if (/^\d{9}$/.test(digits)) {
    return `+254${digits}`;
  }
  if (/^254\d{9}$/.test(digits)) {
    return `+${digits}`;
  }
  if (/^\+254\d{9}$/.test(digits)) {
    return digits;
  }
  // Already has a + and looks like a full international number
  if (/^\+\d{7,15}$/.test(digits)) {
    return digits;
  }
  return digits;
}

module.exports = { normalizePhone };
