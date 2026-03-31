import React, { useState, useEffect, useCallback } from 'react';
import { fetchMobileDashboard } from '../utils/api';
import './MobileTodayDashboard.css';

function formatInr(value) {
  if (value === undefined || value === null || Number.isNaN(Number(value))) {
    return '—';
  }
  return Number(value).toLocaleString('en-IN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

/**
 * Compact ledger snapshot for mobile / PWA (uses JWT via fetchMobileDashboard).
 */
export default function MobileTodayDashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const json = await fetchMobileDashboard({});
      setData(json);
    } catch (e) {
      setData(null);
      setError(e?.message || 'Could not load dashboard');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading && !data) {
    return (
      <div className="mobile-today-dashboard">
        <div className="mobile-today-loading">Loading…</div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="mobile-today-dashboard">
        <p className="mobile-today-error">{error}</p>
        <button type="button" className="mobile-today-retry" onClick={load}>
          Retry
        </button>
      </div>
    );
  }

  const modes = data?.paymentModes && typeof data.paymentModes === 'object' ? data.paymentModes : {};

  return (
    <div className="mobile-today-dashboard">
      <header className="mobile-today-header">
        <h1 className="mobile-today-title">Today</h1>
        <p className="mobile-today-date">{data?.date || '—'}</p>
        <button type="button" className="mobile-today-refresh" onClick={load} disabled={loading}>
          {loading ? '…' : 'Refresh'}
        </button>
      </header>

      <section className="mobile-today-cards">
        <div className="mobile-today-card">
          <span className="mobile-today-label">Sales (credits)</span>
          <span className="mobile-today-value">₹{formatInr(data?.totalSales)}</span>
        </div>
        <div className="mobile-today-card">
          <span className="mobile-today-label">Expense (debits)</span>
          <span className="mobile-today-value">₹{formatInr(data?.totalExpense)}</span>
        </div>
        <div className="mobile-today-card mobile-today-card--net">
          <span className="mobile-today-label">Net</span>
          <span className="mobile-today-value">₹{formatInr(data?.netBalance)}</span>
        </div>
      </section>

      <section className="mobile-today-modes">
        <h2 className="mobile-today-subtitle">Payment modes (credits)</h2>
        {Object.keys(modes).length === 0 ? (
          <p className="mobile-today-empty">No credit entries for this day.</p>
        ) : (
          <ul className="mobile-today-mode-list">
            {Object.entries(modes).map(([mode, amount]) => (
              <li key={mode} className="mobile-today-mode-row">
                <span className="mobile-today-mode-name">{mode}</span>
                <span className="mobile-today-mode-amt">₹{formatInr(amount)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
