/**
 * Cart / bill addresses are stored as: "{line1}, {city}, {state} - {pincode}".
 * When that full string is pasted into line1 and the form also has city/state/pincode fields,
 * submit doubles the tail — parse on load and format once on save.
 */

const TAIL_RE = /,\s*([^,]+?),\s*([^,]+?)\s*-\s*(\d{6})\s*$/;

/**
 * Strip a trailing ", city, state - pincode" (once or twice) and return parts.
 * @param {string} raw
 * @returns {{ line1: string, city: string, state: string, pincode: string }}
 */
export function parseCompositeAddress(raw) {
  const empty = { line1: '', city: '', state: '', pincode: '' };
  if (raw == null || String(raw).trim() === '') {
    return empty;
  }
  let s = String(raw).trim().replace(/\s+/g, ' ');

  // Remove duplicated tail: "... , City, ST - 123456 , City, ST - 123456"
  for (let i = 0; i < 3; i++) {
    const tail = s.match(TAIL_RE);
    if (!tail) break;
    const before = s.slice(0, tail.index).trim();
    const tailAgain = before.match(TAIL_RE);
    if (
      tailAgain &&
      tailAgain[1].trim().toLowerCase() === tail[1].trim().toLowerCase() &&
      tailAgain[2].trim().toLowerCase() === tail[2].trim().toLowerCase() &&
      tailAgain[3] === tail[3]
    ) {
      s = before;
      continue;
    }
    break;
  }

  const tail = s.match(TAIL_RE);
  if (!tail) {
    return { line1: s, city: '', state: '', pincode: '' };
  }

  const pincode = tail[3];
  const state = tail[2].trim();
  const city = tail[1].trim();
  let line1 = s.slice(0, tail.index).trim();

  // If line1 still ends with the same tail (partial duplicate), peel once more
  const inner = line1.match(TAIL_RE);
  if (
    inner &&
    inner[1].trim().toLowerCase() === city.toLowerCase() &&
    inner[2].trim().toLowerCase() === state.toLowerCase() &&
    inner[3] === pincode
  ) {
    line1 = line1.slice(0, inner.index).trim();
  }

  return { line1, city, state, pincode };
}

/**
 * @param {{ line1?: string, city?: string, state?: string, pincode?: string }} parts
 */
export function formatCompositeAddress(parts) {
  const line1 = String(parts?.line1 ?? '').trim();
  const city = String(parts?.city ?? '').trim();
  const state = String(parts?.state ?? '').trim();
  const pin = String(parts?.pincode ?? '').replace(/\D/g, '').slice(0, 6);
  if (!line1 && !city && !state && !pin) return '';
  if (city && state && pin.length === 6) {
    return `${line1 || city}, ${city}, ${state} - ${pin}`;
  }
  if (line1) return line1;
  return [line1, city, state, pin].filter(Boolean).join(', ');
}

/**
 * Apply parsed address to form fields; prefer explicit customer master fields when set.
 */
export function mergeAddressFromSources({ storedAddress, city, state, pincode }) {
  const parsed = parseCompositeAddress(storedAddress);
  return {
    line1: parsed.line1 || String(storedAddress || '').trim(),
    city: String(city || '').trim() || parsed.city,
    state: String(state || '').trim() || parsed.state,
    pincode: String(pincode || '').replace(/\D/g, '').slice(0, 6) || parsed.pincode,
  };
}
