const PAYMENT_MODE_LABELS = {
  UPI: 'UPI',
  CASH: 'CASH',
  BANK_TRANSFER: 'BANK TRANSFER',
  CHEQUE: 'CHEQUE',
  NETBANKING: 'BANK TRANSFER',
  CREDIT: 'CREDIT',
};

export const formatPaymentModeLabel = (mode) => {
  if (!mode) return '—';
  const key = String(mode).toUpperCase().replace(/\s+/g, '_');
  return PAYMENT_MODE_LABELS[key] || mode;
};

export const splitPaymentSummaryLines = (raw) => {
  const s = String(raw || '').trim();
  if (!s || s === '-' || s === '—') return [];
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

export const normalizeSearchText = (value) =>
  String(value ?? '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
