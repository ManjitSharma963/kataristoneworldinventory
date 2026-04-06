import React, { useState, useEffect, useCallback } from 'react';
import { fetchAuditLedger } from '../utils/api';
import './AuditLedger.css';

function localISODate(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatMoney(n) {
  if (n === undefined || n === null || Number.isNaN(Number(n))) return '—';
  return `₹${Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDateTime(v) {
  if (v == null) return '—';
  if (typeof v === 'string') {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? v : d.toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' });
  }
  if (Array.isArray(v) && v.length >= 6) {
    const [y, mo, d, h, mi, s] = v;
    const dt = new Date(y, mo - 1, d, h, mi, Math.floor(s || 0));
    return dt.toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' });
  }
  return String(v);
}

export default function AuditLedger() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [date, setDate] = useState('');
  const [source, setSource] = useState('');
  const [userId, setUserId] = useState('');
  const [limit, setLimit] = useState('100');

  const loadMain = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await fetchAuditLedger({
        date: date || undefined,
        source: source.trim() || undefined,
        userId: userId.trim() || undefined,
        limit: limit.trim() || '100',
      });
      setRows(Array.isArray(data) ? data : []);
    } catch (e) {
      setRows([]);
      setError(e?.message || 'Failed to load audit log');
    } finally {
      setLoading(false);
    }
  }, [date, source, userId, limit]);

  useEffect(() => {
    loadMain();
  }, [loadMain]);

  return (
    <div className="audit-ledger-page">
      <header className="audit-ledger-header">
        <h1>Ledger audit</h1>
        <p className="audit-ledger-sub">Admin only — financial_ledger trail for your location.</p>
      </header>

      <section className="audit-ledger-filters">
        <div className="audit-filter-row">
          <label>
            Event date
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <label>
            Source type
            <input
              type="text"
              placeholder="e.g. BILL_PAYMENT"
              value={source}
              onChange={(e) => setSource(e.target.value)}
            />
          </label>
          <label>
            Created by (user id)
            <input type="text" inputMode="numeric" value={userId} onChange={(e) => setUserId(e.target.value)} />
          </label>
          <label>
            Limit
            <input type="number" min={1} max={500} value={limit} onChange={(e) => setLimit(e.target.value)} />
          </label>
          <button type="button" className="audit-btn-primary" onClick={loadMain} disabled={loading}>
            {loading ? 'Loading…' : 'Apply'}
          </button>
          <button
            type="button"
            className="audit-btn-secondary"
            onClick={() => {
              setDate('');
              setSource('');
              setUserId('');
              setLimit('100');
            }}
          >
            Clear filters
          </button>
          <button type="button" className="audit-btn-secondary" onClick={() => setDate(localISODate())}>
            Today
          </button>
        </div>
        {error ? <p className="audit-error">{error}</p> : null}
      </section>

      <div className="audit-table-wrap">
        <table className="audit-table">
          <thead>
            <tr>
              <th>Time</th>
              <th>Source</th>
              <th>Entry</th>
              <th>Amount</th>
              <th>Mode</th>
              <th>User</th>
              <th>Deleted</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && !loading ? (
              <tr>
                <td colSpan={7} className="audit-empty">
                  No rows
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id ?? `${row.sourceType}-${row.sourceId}-${row.createdAt}`}>
                  <td>{formatDateTime(row.createdAt)}</td>
                  <td>
                    <span className="audit-mono">{row.sourceType}</span>
                    <span className="audit-sub"> #{row.sourceId}</span>
                  </td>
                  <td>{row.entryType}</td>
                  <td>{formatMoney(row.amount)}</td>
                  <td>{row.paymentMode}</td>
                  <td>
                    {row.createdByName || '—'}
                    {row.createdBy != null ? <span className="audit-sub"> ({row.createdBy})</span> : null}
                  </td>
                  <td>{row.deleted ? 'Yes' : '—'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
