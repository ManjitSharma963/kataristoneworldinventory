export const CLIENT_ACCOUNT_CHANNEL_OPTIONS = [
  { value: 'NON_GST', label: 'Non-GST account' },
  { value: 'GST', label: 'GST account' },
];

export function accountChannelLabel(raw) {
  const v = String(raw || 'NON_GST').toUpperCase().replace(/-/g, '_');
  return v === 'GST' ? 'GST' : 'Non-GST';
}

export function normalizeAccountChannel(raw) {
  const v = String(raw || 'NON_GST').toUpperCase().replace(/-/g, '_');
  return v === 'GST' ? 'GST' : 'NON_GST';
}
