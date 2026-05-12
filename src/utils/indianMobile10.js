/** Strip to digits only */
export function digitsOnly(raw) {
  return String(raw ?? '').replace(/\D/g, '');
}

export function isExactlyTenDigits(raw) {
  return digitsOnly(raw).length === 10;
}

/** Returns 10-digit string or empty if invalid */
export function normalizeTenDigitMobile(raw) {
  const d = digitsOnly(raw);
  return d.length === 10 ? d : '';
}
