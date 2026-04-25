import React from 'react';

const BudgetHistorySection = ({
  loadingBudgetHistory,
  filteredBudgetHistoryRows,
  budgetHistoryDateRange,
  setBudgetHistoryDateRange,
  budgetHistoryTypeFilter,
  setBudgetHistoryTypeFilter,
  onDownloadPdf,
  bankSourceLabel
}) => {
  return (
    <div className="budget-history-section" style={{ marginTop: '20px', borderTop: '1px solid #eee', paddingTop: '12px' }}>
      <div className="budget-history-header">
        <h4 className="budget-history-title">Transaction history</h4>
        <button
          type="button"
          className="btn btn-secondary budget-history-download-btn"
          onClick={onDownloadPdf}
          disabled={loadingBudgetHistory || filteredBudgetHistoryRows.length === 0}
        >
          Download PDF
        </button>
      </div>
      <div className="budget-history-filters">
        <div className="budget-history-filter-item">
          <label className="budget-history-filter-label">From</label>
          <input
            type="date"
            value={budgetHistoryDateRange.from}
            onChange={(e) => setBudgetHistoryDateRange((p) => ({ ...p, from: e.target.value }))}
            className="budget-history-filter-control"
          />
        </div>
        <div className="budget-history-filter-item">
          <label className="budget-history-filter-label">To</label>
          <input
            type="date"
            value={budgetHistoryDateRange.to}
            onChange={(e) => setBudgetHistoryDateRange((p) => ({ ...p, to: e.target.value }))}
            className="budget-history-filter-control"
          />
        </div>
        <div className="budget-history-filter-item budget-history-filter-item-wide">
          <label className="budget-history-filter-label">Transaction type</label>
          <select
            value={budgetHistoryTypeFilter}
            onChange={(e) => setBudgetHistoryTypeFilter(e.target.value)}
            className="budget-history-filter-control"
          >
            <option value="ALL">All</option>
            <option value="CREDIT">Credit</option>
            <option value="DEBIT">Debit</option>
          </select>
        </div>
        <button
          type="button"
          className="btn btn-secondary budget-history-clear-btn"
          onClick={() => { setBudgetHistoryDateRange({ from: '', to: '' }); setBudgetHistoryTypeFilter('ALL'); }}
        >
          Clear
        </button>
      </div>
      <p className="budget-history-scope-hint" style={{ margin: '8px 0 10px', fontSize: '12px', color: '#64748b', lineHeight: 1.45 }}>
        Rows from <strong>unified_financial_ledger</strong> (dual-written from bills, expenses, loans, payroll, client payments). Filter by date
        range above; leave dates empty to load the latest window from the server.
      </p>
      {loadingBudgetHistory ? (
        <p style={{ margin: 0, fontSize: '13px', color: '#888' }}>Loading...</p>
      ) : filteredBudgetHistoryRows.length === 0 ? (
        <p style={{ margin: 0, fontSize: '13px', color: '#888' }}>No ledger rows for this filter.</p>
      ) : (
        <div className="daily-budget-history-table-wrap" style={{ maxHeight: '280px', overflowY: 'auto' }}>
          <table className="daily-budget-history-table">
            <thead>
              <tr>
                <th style={{ width: '100px' }}>Date</th>
                <th style={{ width: '120px' }}>Channel</th>
                <th style={{ width: '100px' }}>Source</th>
                <th style={{ width: '80px' }}>Mode</th>
                <th style={{ width: '72px' }}>Type</th>
                <th style={{ width: '100px' }}>Amount</th>
                <th style={{ minWidth: '140px' }}>Details</th>
              </tr>
            </thead>
            <tbody>
              {filteredBudgetHistoryRows.map((row) => {
                const { entry, idx, txType, txAmount, displayDate, sourceChannel, detailLabel, paymentMode, source } = row;
                return (
                  <tr key={entry.id ?? idx}>
                    <td style={{ color: '#666', fontSize: '13px', padding: '10px 10px' }}>{displayDate}</td>
                    <td
                      className={
                        sourceChannel === bankSourceLabel
                          ? 'budget-history-source budget-history-source-bank'
                          : 'budget-history-source budget-history-source-cash'
                      }
                      style={{ fontSize: '12px', padding: '10px 8px', fontWeight: 700, lineHeight: 1.3 }}
                    >
                      {sourceChannel}
                    </td>
                    <td style={{ fontSize: '12px', padding: '10px 8px', color: '#334155' }}>{source || '—'}</td>
                    <td style={{ fontSize: '12px', padding: '10px 8px' }}>{paymentMode || '—'}</td>
                    <td style={{ fontWeight: 700, fontSize: '13px', padding: '10px 10px' }}>
                      <span className={txType === 'CREDIT' ? 'budget-tx-credit' : 'budget-tx-debit'}>{txType}</span>
                    </td>
                    <td style={{ fontWeight: 600, fontSize: '13px', padding: '10px 10px' }}>
                      ₹{Number.isFinite(txAmount) ? txAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00'}
                    </td>
                    <td style={{ fontSize: '12px', padding: '10px 10px', color: '#334155', lineHeight: 1.35 }} title={detailLabel}>
                      {detailLabel}
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

export default BudgetHistorySection;

