const PAYMENT_MODE_LABELS = {
  UPI: 'UPI',
  CASH: 'CASH',
  BANK_TRANSFER: 'BANK TRANSFER',
  CHEQUE: 'CHEQUE',
  NETBANKING: 'BANK TRANSFER',
  CREDIT: 'CREDIT',
};

export const formatPaymentModeLabel = (mode) => {
  if (!mode) return '�';
  const key = String(mode).toUpperCase().replace(/\s+/g, '_');
  return PAYMENT_MODE_LABELS[key] || mode;
};

export const splitPaymentSummaryLines = (raw) => {
  const s = String(raw || '').trim();
  if (!s || s === '-' || s === '�') return [];
  const normalized = s.replace(/_/g, ' ').replace(/\s*\|\s*/g, ' | ');
  const parts = normalized
    .split('|')
    .flatMap((p) => String(p).split(','))
    .map((p) => p.trim())
    .filter(Boolean);
  const due = parts.filter((p) => /^DUE\b/i.test(p));
  const rest = parts.filter((p) => !/^DUE\b/i.test(p));
  return [...rest, ...due];
};

export const normalizePaymentModeKey = (mode) => {
  const m = String(mode || '').toUpperCase().replace(/\s+/g, '_').trim();
  if (m === 'NETBANKING' || m === 'NET_BANKING') return 'BANK_TRANSFER';
  return m;
};

export const getPaymentBand = (mode) => {
  const m = normalizePaymentModeKey(mode);
  if (m === 'UPI') return 'UPI';
  if (m === 'CASH') return 'CASH';
  if (m === 'BANK_TRANSFER') return 'BANK_TRANSFER';
  if (m === 'CHEQUE') return 'CHEQUE';
  return 'OTHER';
};

/** Payment lines on a sales row (list API or merged bill detail). */
export const billRowPayments = (row) => {
  if (!row || typeof row !== 'object') return [];
  if (Array.isArray(row.payments) && row.payments.length > 0) return row.payments;
  if (Array.isArray(row.originalSale?.payments) && row.originalSale.payments.length > 0) {
    return row.originalSale.payments;
  }
  return [];
};

/** True when the bill has at least one non-wallet payment in the filter band. */
export const billMatchesPaymentModeBand = (row, band) => {
  if (!band || band === 'ALL') return true;
  const payments = billRowPayments(row);
  for (const p of payments) {
    const mode = String(p?.paymentMode ?? p?.payment_mode ?? p?.paymentMethod ?? '').trim();
    if (!mode || mode.toUpperCase() === 'WALLET' || mode.toUpperCase() === 'ADVANCE') continue;
    if (getPaymentBand(mode) === band) return true;
  }
  if (payments.length === 0) {
    const summary = row?.paymentMode ?? row?.payment_mode ?? row?.paymentMethod ?? '';
    if (summary) return getPaymentBand(summary) === band;
  }
  return false;
};

export const billPaymentModeSearchText = (row) =>
  billRowPayments(row)
    .map((p) => formatPaymentModeLabel(p?.paymentMode ?? p?.payment_mode ?? p?.paymentMethod ?? ''))
    .filter((label) => label && label !== '\u2014' && label !== '-')
    .join(' ');

/** Stable id for a bill payment line (API uses paymentId; some payloads use id). */
export const resolveBillPaymentId = (payment) => {
  if (!payment || typeof payment !== 'object') return null;
  const raw = payment.paymentId ?? payment.id ?? payment.payment_id;
  if (raw == null || raw === '') return null;
  return raw;
};

export const paymentModeKeysEqual = (a, b) =>
  normalizePaymentModeKey(a) === normalizePaymentModeKey(b);

export const isWalletOrAdvancePayment = (payment) => {
  const mode = String(payment?.paymentMode ?? payment?.payment_mode ?? payment?.paymentMethod ?? '')
    .trim()
    .toUpperCase();
  const source = String(payment?.sourceType ?? payment?.source_type ?? '').trim().toUpperCase();
  return mode === 'WALLET' || mode === 'ADVANCE' || source === 'ADVANCE';
};

/** ISO date (YYYY-MM-DD) for bill payment API payloads. */
export const toBillPaymentIsoDate = (value) => {
  if (!value) return undefined;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, '0');
    const d = String(value.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  const s = String(value).trim();
  if (!s) return undefined;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const parsed = new Date(s);
  if (!Number.isNaN(parsed.getTime())) return toBillPaymentIsoDate(parsed);
  return undefined;
};

export const paymentMatchesChangeTarget = (payment, target) => {
  const a = resolveBillPaymentId(payment);
  const b = resolveBillPaymentId(target);
  return a != null && b != null && String(a) === String(b);
};

export const normalizeSearchText = (value) =>
  String(value ?? '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
