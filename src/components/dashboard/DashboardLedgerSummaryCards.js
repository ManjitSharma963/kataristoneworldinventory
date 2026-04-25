import React from 'react';

const formatMoney = (value) =>
  `₹${Number(value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const DashboardLedgerSummaryCards = ({ ledgerSummary }) => {
  return (
    <div
      className="dashboard-ledger-summary"
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(168px, 1fr))',
        gap: '12px',
        marginBottom: '16px',
      }}
    >
      <div className="stat-card" style={{ margin: 0, padding: '12px 14px' }}>
        <div className="stat-content">
          <h3 style={{ fontSize: '13px', margin: '0 0 4px', color: '#64748b' }}>Ledger: cash + UPI (net)</h3>
          <p className="stat-value" style={{ fontSize: '1.15rem', margin: 0 }}>
            {formatMoney(ledgerSummary?.inHand)}
          </p>
        </div>
      </div>
      <div className="stat-card" style={{ margin: 0, padding: '12px 14px' }}>
        <div className="stat-content">
          <h3 style={{ fontSize: '13px', margin: '0 0 4px', color: '#64748b' }}>Ledger: bank + card + cheque (net)</h3>
          <p className="stat-value" style={{ fontSize: '1.15rem', margin: 0 }}>
            {formatMoney(ledgerSummary?.bank)}
          </p>
        </div>
      </div>
      <div className="stat-card primary" style={{ margin: 0, padding: '12px 14px' }}>
        <div className="stat-content">
          <h3 style={{ fontSize: '13px', margin: '0 0 4px', color: '#64748b' }}>Ledger: total</h3>
          <p className="stat-value" style={{ fontSize: '1.15rem', margin: 0 }}>
            {formatMoney(ledgerSummary?.total)}
          </p>
        </div>
      </div>
    </div>
  );
};

export default DashboardLedgerSummaryCards;

