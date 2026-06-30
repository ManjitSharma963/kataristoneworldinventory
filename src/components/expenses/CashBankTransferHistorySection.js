import React from 'react';
import DdMmYyCalendar from '../DdMmYyCalendar';
import { formatDdMmYy } from '../../utils/dateFormat';

const DIRECTION_LABELS = {
  CASH_TO_BANK: 'Cash/UPI → Bank',
  BANK_TO_CASH: 'Bank → Cash/UPI',
};

const CashBankTransferHistorySection = ({
  embedded = false,
  loading,
  rows,
  dateRange,
  setDateRange,
  directionFilter,
  setDirectionFilter,
}) => {
  return (
    <div
      className={`budget-history-section${embedded ? ' transfer-history-embedded' : ''}`}
      style={embedded ? undefined : { marginTop: '20px', borderTop: '1px solid #eee', paddingTop: '12px' }}
    >
      {!embedded && <h4 className="budget-history-title" style={{ margin: '0 0 10px' }}>Transfer history</h4>}
      <div className="budget-history-filters">
        <div className="budget-history-filter-item">
          <label className="budget-history-filter-label">From</label>
          <DdMmYyCalendar
            value={dateRange.from}
            onChange={(v) => setDateRange((p) => ({ ...p, from: v }))}
            className="budget-history-filter-control"
            inputClassName="budget-history-filter-control"
          />
        </div>
        <div className="budget-history-filter-item">
          <label className="budget-history-filter-label">To</label>
          <DdMmYyCalendar
            value={dateRange.to}
            onChange={(v) => setDateRange((p) => ({ ...p, to: v }))}
            className="budget-history-filter-control"
            inputClassName="budget-history-filter-control"
            minDate={dateRange.from || undefined}
          />
        </div>
        <div className="budget-history-filter-item budget-history-filter-item-wide">
          <label className="budget-history-filter-label">Direction</label>
          <select
            value={directionFilter}
            onChange={(e) => setDirectionFilter(e.target.value)}
            className="budget-history-filter-control"
          >
            <option value="ALL">All</option>
            <option value="CASH_TO_BANK">Cash/UPI → Bank</option>
            <option value="BANK_TO_CASH">Bank → Cash/UPI</option>
          </select>
        </div>
        <button
          type="button"
          className="secondary-button budget-history-clear-btn"
          onClick={() => {
            setDateRange({ from: '', to: '' });
            setDirectionFilter('ALL');
          }}
        >
          Clear
        </button>
      </div>
      {loading ? (
        <p style={{ margin: '10px 0 0', fontSize: '13px', color: '#888' }}>Loading...</p>
      ) : rows.length === 0 ? (
        <p style={{ margin: '10px 0 0', fontSize: '13px', color: '#888' }}>No transfers yet.</p>
      ) : (
        <div className="daily-budget-history-table-wrap" style={{ maxHeight: '240px', overflowY: 'auto', marginTop: '10px' }}>
          <table className="daily-budget-history-table">
            <thead>
              <tr>
                <th style={{ width: '100px' }}>Date</th>
                <th style={{ width: '160px' }}>Direction</th>
                <th style={{ width: '110px' }}>Amount</th>
                <th style={{ minWidth: '140px' }}>Notes</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const dir = String(row.direction ?? '').toUpperCase();
                const label = DIRECTION_LABELS[dir] || dir || '—';
                const amt = Number(row.amount) || 0;
                const notes = row.notes && String(row.notes).trim() ? String(row.notes) : '—';
                const key = row.transferGroupId || `${row.date}-${dir}-${amt}`;
                return (
                  <tr key={key}>
                    <td style={{ color: '#666', fontSize: '13px', padding: '10px 10px' }}>
                      {formatDdMmYy(row.date)}
                    </td>
                    <td style={{ fontSize: '12px', padding: '10px 8px', fontWeight: 600, color: dir === 'CASH_TO_BANK' ? '#1d4ed8' : '#059669' }}>
                      {label}
                    </td>
                    <td style={{ fontWeight: 600, fontSize: '13px', padding: '10px 10px' }}>
                      ₹{amt.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td style={{ fontSize: '12px', padding: '10px 10px', color: '#334155', lineHeight: 1.35 }} title={notes}>
                      {notes}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default CashBankTransferHistorySection;
