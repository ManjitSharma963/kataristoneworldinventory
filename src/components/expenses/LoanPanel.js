import React from 'react';

const LoanPanel = ({
  handleRecordLoanReceipt,
  loanReceiptAmount,
  setLoanReceiptAmount,
  loanReceiptPaymentMode,
  setLoanReceiptPaymentMode,
  loanReceiptLenderSelect,
  setLoanReceiptLenderSelect,
  loanReceiptNewLenderName,
  setLoanReceiptNewLenderName,
  submittingLoanReceipt,
  loanLenders,
  formatLenderOutstandingLabel,
  loadingLoanLenders,
  loanLendersTotals,
  formatLoanInr,
  openLoanLenderHistory,
  setActiveTab,
  setCurrentPage,
  handleAddClick
}) => {
  return (
    <div className="expenses-tab-content">
      <form
        className="loan-receipt-panel"
        onSubmit={handleRecordLoanReceipt}
        style={{
          padding: '16px 18px',
          borderRadius: '8px',
          border: '1px solid #e2e8f0',
          background: '#f8fafc',
          maxWidth: '800px',
        }}
      >
        <div style={{ fontWeight: 600, fontSize: '15px', marginBottom: '8px', color: '#334155' }}>
          Record money borrowed from a lender
        </div>
        <p style={{ margin: '0 0 14px', fontSize: '13px', color: '#64748b', lineHeight: 1.5 }}>
          Choose an existing lender to add more borrowing to their running total (outstanding increases by this amount).
          Or use <strong>+ Add new lender</strong> for a first-time source. <strong>Cash</strong> and <strong>UPI</strong> increase daily in-hand balance; <strong>bank transfer</strong> and <strong>cheque</strong> only update lender totals. To repay, use{' '}
          <strong>Daily Expenses</strong> → <strong>Add Expense</strong> → <strong>Loan Repay</strong>.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'flex-end' }}>
            <div className="form-group" style={{ marginBottom: 0, minWidth: '140px' }}>
              <label style={{ fontSize: '13px' }}>Amount (₹) *</label>
              <input type="number" min="0" step="0.01" value={loanReceiptAmount} onChange={(e) => setLoanReceiptAmount(e.target.value)} placeholder="0.00" disabled={submittingLoanReceipt} />
            </div>
            <div className="form-group" style={{ marginBottom: 0, minWidth: '170px' }}>
              <label style={{ fontSize: '13px' }}>Payment mode</label>
              <select value={loanReceiptPaymentMode} onChange={(e) => setLoanReceiptPaymentMode(e.target.value)} disabled={submittingLoanReceipt}>
                <option value="cash">Cash (in hand)</option>
                <option value="upi">UPI (in hand)</option>
                <option value="bank_transfer">Bank transfer (not in hand)</option>
                <option value="cheque">Cheque (not in hand)</option>
              </select>
            </div>
            <div className="form-group" style={{ marginBottom: 0, flex: '1 1 240px' }}>
              <label style={{ fontSize: '13px' }}>Lender</label>
              <select
                value={loanReceiptLenderSelect}
                onChange={(e) => {
                  setLoanReceiptLenderSelect(e.target.value);
                  if (e.target.value !== '__new__') setLoanReceiptNewLenderName('');
                }}
                disabled={submittingLoanReceipt}
              >
                <option value="">Unspecified (no named lender)</option>
                {loanLenders.map((l) => {
                  const nm = l.displayName ?? l.display_name ?? `Lender #${l.id}`;
                  const out = Number(l.outstanding ?? 0) || 0;
                  return (
                    <option key={l.id} value={String(l.id)}>
                      {nm} ({formatLenderOutstandingLabel(out)})
                    </option>
                  );
                })}
                <option value="__new__">+ Add new lender…</option>
              </select>
            </div>
            <button type="submit" className="btn btn-primary" disabled={submittingLoanReceipt}>
              {submittingLoanReceipt ? 'Saving…' : 'Record loan received'}
            </button>
          </div>
          {loanReceiptLenderSelect === '__new__' && (
            <div className="form-group" style={{ marginBottom: 0, maxWidth: '420px' }}>
              <label style={{ fontSize: '13px' }}>New lender name *</label>
              <input type="text" value={loanReceiptNewLenderName} onChange={(e) => setLoanReceiptNewLenderName(e.target.value)} placeholder="e.g. Name or financier" disabled={submittingLoanReceipt} />
            </div>
          )}
        </div>
      </form>

      <div style={{ marginTop: '20px' }}>
        <h3 style={{ margin: '0 0 10px', fontSize: '16px', fontWeight: 600, color: '#334155' }}>Lenders</h3>
        <p style={{ margin: '0 0 12px', fontSize: '13px', color: '#64748b' }}>Click a row to see all borrowings and repayments for that lender.</p>
        {!loadingLoanLenders && loanLenders.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(132px, 1fr))', gap: '10px', marginBottom: '16px', maxWidth: '900px' }}>
            {[
              { label: 'Total lenders', value: String(loanLendersTotals.count), accent: '#334155' },
              { label: 'Total borrowed', value: formatLoanInr(loanLendersTotals.totalBorrowed), accent: '#1d4ed8' },
              { label: 'Total repaid', value: formatLoanInr(loanLendersTotals.totalRepaid), accent: '#0f766e' },
              { label: 'Overpay', value: formatLoanInr(loanLendersTotals.totalOverpay), accent: '#1d4ed8' },
            ].map((c) => (
              <div key={c.label} style={{ padding: '12px 14px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '10px', boxShadow: '0 1px 2px rgba(15, 23, 42, 0.04)' }}>
                <div style={{ fontSize: '11px', fontWeight: 600, color: '#64748b', letterSpacing: '0.02em', marginBottom: '6px' }}>{c.label}</div>
                <div style={{ fontSize: '15px', fontWeight: 700, color: c.accent, lineHeight: 1.25 }}>{c.value}</div>
              </div>
            ))}
          </div>
        )}
        {loadingLoanLenders ? (
          <p style={{ fontSize: '13px', color: '#888' }}>Loading lenders…</p>
        ) : loanLenders.length === 0 ? (
          <div className="empty-state-wrapper" style={{ padding: '20px' }}>
            <span className="empty-icon">🏦</span>
            <p className="empty-state" style={{ marginBottom: '4px' }}>No lenders for this location</p>
            <p className="empty-subtitle" style={{ fontSize: '13px', lineHeight: 1.45 }}>
              Lenders are created when you use <strong>Record loan received</strong> above (they are not read from other tables).
            </p>
          </div>
        ) : (
          <div className="sales-table-wrapper" style={{ maxWidth: '900px' }}>
            <table className="data-table expenses-table">
              <thead>
                <tr><th>Lender</th><th>Total borrowed</th><th>Total repaid</th><th>Outstanding</th></tr>
              </thead>
              <tbody>
                {loanLenders.map((l) => {
                  const name = l.displayName ?? l.display_name ?? `Lender #${l.id}`;
                  const borrowed = Number(l.totalBorrowed ?? l.total_borrowed ?? 0) || 0;
                  const repaid = Number(l.totalRepaid ?? l.total_repaid ?? 0) || 0;
                  const out = Number(l.outstanding ?? 0) || 0;
                  return (
                    <tr key={l.id} style={{ cursor: 'pointer' }} onClick={() => openLoanLenderHistory(l)} title="View full history">
                      <td style={{ fontWeight: 600 }}>{name}</td>
                      <td>₹{borrowed.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                      <td>₹{repaid.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                      <td style={{ fontWeight: 600, color: out > 0.005 ? '#b45309' : out < -0.005 ? '#1d4ed8' : '#0f766e' }}>
                        {out < -0.005 ? `Credit ₹${Math.abs(out).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : `₹${out.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div style={{ marginTop: '16px' }}>
        <button type="button" className="btn btn-secondary" onClick={() => { setActiveTab('all'); setCurrentPage(1); handleAddClick(); }}>
          Record a repayment → Add Expense
        </button>
      </div>
    </div>
  );
};

export default LoanPanel;

