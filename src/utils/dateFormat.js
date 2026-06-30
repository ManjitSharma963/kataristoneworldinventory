/** Local calendar date as yyyy-mm-dd (no UTC shift). */
export function localISODate(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function isoToDate(iso) {
  if (!iso) return null;
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

export function dateToIso(value) {
  if (!value) return '';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return localISODate(d);
}

/** Parse datetime-local style value yyyy-mm-ddTHH:mm */
export function localIsoToDate(isoLocal) {
  if (!isoLocal) return null;
  const [datePart, timePart = '00:00'] = String(isoLocal).slice(0, 16).split('T');
  const [y, m, d] = datePart.split('-').map(Number);
  const [hh, mm] = timePart.split(':').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d, hh || 0, mm || 0);
}

export function dateTimeToLocalIso(value) {
  if (!value) return '';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const h = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${y}-${mo}-${day}T${h}:${mi}`;
}

/** Display yyyy-mm-dd as dd/mm/yy */
export function formatDdMmYy(iso) {
  if (!iso) return '';
  const s = String(iso).slice(0, 10);
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return s;
  return `${m[3]}/${m[2]}/${m[1].slice(-2)}`;
}

/** Display yyyy-mm-dd as dd/mm/yyyy */
export function formatDdMmYyyy(iso) {
  if (!iso) return '';
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return '';
  return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`;
}
