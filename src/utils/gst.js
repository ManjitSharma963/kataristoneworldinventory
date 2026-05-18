/**
 * Indian GST helpers.
 *
 * For Indian GST, the same total tax rate (typically 5/12/18/28) is split
 * differently depending on whether the supply is intra-state or inter-state:
 *
 *   - Intra-state (customer's state == seller's state)
 *       → CGST (rate/2) + SGST (rate/2)
 *   - Inter-state (customer's state != seller's state)
 *       → IGST (rate)
 *
 * The seller's state is configured here as a single constant so it can be
 * adjusted without touching the rest of the UI. If you operate from multiple
 * states later, replace this with a config / API call.
 */

/** Configure the seller's home state here (used to decide CGST+SGST vs IGST). */
export const SELLER_STATE = 'Rajasthan';

/** Normalize a state name for comparison: lowercase, trimmed, single-spaced. */
export function normalizeStateName(value) {
  if (value == null) return '';
  return String(value)
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** True when the candidate state matches the seller state (intra-state supply). */
export function isSameStateAsSeller(candidate, sellerState = SELLER_STATE) {
  const a = normalizeStateName(candidate);
  const b = normalizeStateName(sellerState);
  if (!a || !b) return false;
  return a === b;
}

/**
 * Best-effort extraction of a state name from a free-form Indian address
 * string. Falls back to an empty string when nothing recognisable is found.
 *
 * Examples that parse correctly:
 *   "Plot 12, Sector 5, Jaipur, Rajasthan - 302001"   → "Rajasthan"
 *   "221B Baker Street, Mumbai, Maharashtra 400001"   → "Maharashtra"
 *   "Sector 18, Noida, Uttar Pradesh, 201301"         → "Uttar Pradesh"
 */
export function extractStateFromAddress(address) {
  if (!address) return '';
  const known = INDIAN_STATES_AND_UT;
  const text = String(address);
  for (const state of known) {
    const re = new RegExp(`\\b${state.replace(/\s+/g, '\\s+')}\\b`, 'i');
    if (re.test(text)) return state;
  }
  return '';
}

/**
 * Resolve the state to use for the intra/inter-state decision.
 * Precedence: explicit deliveryState → state parsed from deliveryAddress
 * → explicit customerState → state parsed from customerAddress.
 */
export function resolveDeliveryState({
  deliveryState,
  deliveryAddress,
  customerState,
  customerAddress,
} = {}) {
  if (deliveryState && String(deliveryState).trim()) return String(deliveryState).trim();
  const fromDelivery = extractStateFromAddress(deliveryAddress);
  if (fromDelivery) return fromDelivery;
  if (customerState && String(customerState).trim()) return String(customerState).trim();
  const fromCustomer = extractStateFromAddress(customerAddress);
  if (fromCustomer) return fromCustomer;
  return '';
}

/**
 * Compute the CGST/SGST/IGST split for a GST bill.
 *
 * @param {object} args
 * @param {number} args.taxAmount   - The total tax already calculated (rate% of subtotal).
 * @param {number} args.taxRatePct  - The total tax rate as a percentage (e.g. 18 for 18%).
 * @param {string} [args.deliveryState] - Customer's delivery state name.
 * @param {string} [args.sellerState]   - Override the seller's state (defaults to SELLER_STATE).
 * @returns {{
 *   isInterState: boolean,
 *   isSameState: boolean,
 *   cgstAmount: number,
 *   sgstAmount: number,
 *   igstAmount: number,
 *   cgstRate: number,
 *   sgstRate: number,
 *   igstRate: number,
 *   resolvedState: string,
 *   sellerState: string,
 * }}
 */
export function computeGstSplit({
  taxAmount = 0,
  taxRatePct = 0,
  deliveryState = '',
  sellerState = SELLER_STATE,
} = {}) {
  const total = Number(taxAmount) || 0;
  const rate = Number(taxRatePct) || 0;
  const resolvedState = String(deliveryState || '').trim();
  // If we don't know the customer's state yet, fall back to intra-state
  // (CGST+SGST) so the bill still totals correctly. The UI can show a
  // warning prompting the user to fill in the state.
  const sameState = resolvedState ? isSameStateAsSeller(resolvedState, sellerState) : true;
  const isInterState = !sameState;
  const round2 = (n) => Math.round(n * 100) / 100;
  if (isInterState) {
    return {
      isInterState: true,
      isSameState: false,
      cgstAmount: 0,
      sgstAmount: 0,
      igstAmount: round2(total),
      cgstRate: 0,
      sgstRate: 0,
      igstRate: round2(rate),
      resolvedState,
      sellerState,
    };
  }
  const half = round2(total / 2);
  return {
    isInterState: false,
    isSameState: true,
    cgstAmount: half,
    sgstAmount: round2(total - half),
    igstAmount: 0,
    cgstRate: round2(rate / 2),
    sgstRate: round2(rate / 2),
    igstRate: 0,
    resolvedState,
    sellerState,
  };
}

/** Indian states & UTs (subset is fine; ordered roughly by frequency). */
export const INDIAN_STATES_AND_UT = [
  'Andhra Pradesh',
  'Arunachal Pradesh',
  'Assam',
  'Bihar',
  'Chhattisgarh',
  'Goa',
  'Gujarat',
  'Haryana',
  'Himachal Pradesh',
  'Jharkhand',
  'Karnataka',
  'Kerala',
  'Madhya Pradesh',
  'Maharashtra',
  'Manipur',
  'Meghalaya',
  'Mizoram',
  'Nagaland',
  'Odisha',
  'Punjab',
  'Rajasthan',
  'Sikkim',
  'Tamil Nadu',
  'Telangana',
  'Tripura',
  'Uttar Pradesh',
  'Uttarakhand',
  'West Bengal',
  'Andaman and Nicobar Islands',
  'Chandigarh',
  'Dadra and Nagar Haveli and Daman and Diu',
  'Delhi',
  'Jammu and Kashmir',
  'Ladakh',
  'Lakshadweep',
  'Puducherry',
];
