import React, { useMemo, useState } from 'react';

const INR = (n) => `₹${(Number(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const LoanPanel = ({
  handleCreateLoanTransaction,
  loanLenders,
  loadingLoanLenders,
  loanLendersTotals,
  loanBorrowers,
  loadingLoanBorrowers,
  loanBorrowersTotals,
  loanTransactions,
  loadingLoanTransactions,
}) => {
  const localNow = new Date();
  localNow.setMinutes(localNow.getMinutes() - localNow.getTimezoneOffset());
  const [showAddModal, setShowAddModal] = useState(false);
  const [submittingQuickEntry, setSubmittingQuickEntry] = useState(false);
  const [quickEntry, setQuickEntry] = useState({
    dateTime: localNow.toISOString().slice(0, 16),
    direction: 'GIVE',
    personRef: '',
    personName: '',
    amount: '',
    paymentMode: 'cash',
    notes: '',
  });
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [payFilter, setPayFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [search, setSearch] = useState('');

  const lenderRows = Array.isArray(loanLenders) ? loanLenders : [];
  const borrowerRows = Array.isArray(loanBorrowers) ? loanBorrowers : [];
  const rows = Array.isArray(loanTransactions) ? loanTransactions : [];

  const rowMatchesSearch = (r, q) => {
    if (!q) return true;
    return `${r.person || ''} ${r.notes || ''} ${r.typeLabel || ''}`.toLowerCase().includes(q);
  };

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      const d = r.date ? String(r.date).slice(0, 10) : '';
      if (fromDate && d && d < fromDate) return false;
      if (toDate && d && d > toDate) return false;
      if (typeFilter !== 'ALL' && r.giveTake !== typeFilter) return false;
      const pm = String(r.paymentMode || '').toUpperCase();
      if (payFilter !== 'ALL' && !pm.includes(payFilter)) return false;
      if (statusFilter !== 'ALL' && String(r.status || 'ACTIVE').toUpperCase() !== statusFilter) return false;
      return rowMatchesSearch(r, q);
    });
  }, [rows, fromDate, toDate, typeFilter, payFilter, statusFilter, search]);

  const totals = useMemo(() => {
    let give = 0;
    let take = 0;
    for (const r of filteredRows) {
      const amt = Number(r.amount || 0) || 0;
      if (r.giveTake === 'GIVE') give += amt;
      else if (r.giveTake === 'TAKE') take += amt;
    }
    return { give, take };
  }, [filteredRows]);

  const totalPie = Math.max(1, totals.give + totals.take);
  const giveTotal = totals.give;
  const takeTotal = totals.take;
  const simpleNet = giveTotal - takeTotal;
  const pGive = (giveTotal / totalPie) * 100;
  const pTake = (takeTotal / totalPie) * 100;

  const personOptions = useMemo(() => {
    const opts = [];
    for (const l of lenderRows) {
      const nm = (l.displayName || l.display_name || l.personName || l.name || `Person #${l.id}`).trim();
      opts.push({ key: `l:${l.id}`, label: `${nm} — you borrowed from them` });
    }
    for (const b of borrowerRows) {
      const nm = (b.displayName || b.display_name || b.personName || b.name || `Person #${b.id}`).trim();
      opts.push({ key: `b:${b.id}`, label: `${nm} — you lent to them` });
    }
    opts.sort((a, b) => a.label.localeCompare(b.label));
    return opts;
  }, [lenderRows, borrowerRows]);

  const handleQuickEntryChange = (field, value) => {
    setQuickEntry((prev) => ({ ...prev, [field]: value }));
  };

  const resetQuickEntry = () => {
    const dt = new Date();
    dt.setMinutes(dt.getMinutes() - dt.getTimezoneOffset());
    setQuickEntry({
      dateTime: dt.toISOString().slice(0, 16),
      direction: 'GIVE',
      personRef: '',
      personName: '',
      amount: '',
      paymentMode: 'cash',
      notes: '',
    });
  };

  const submitQuickEntry = async (e) => {
    e.preventDefault();
    const amount = parseFloat(String(quickEntry.amount || '').replace(/,/g, ''));
    if (!Number.isFinite(amount) || amount <= 0 || submittingQuickEntry) return;
    setSubmittingQuickEntry(true);
    try {
      await handleCreateLoanTransaction({
        direction: quickEntry.direction,
        transactionType: quickEntry.direction,
        dateTime: quickEntry.dateTime || '',
        personRef: quickEntry.personRef || '',
        personName: quickEntry.personName || '',
        amount,
        paymentMode: quickEntry.paymentMode || 'cash',
        notes: quickEntry.notes || '',
      });
      setShowAddModal(false);
      resetQuickEntry();
    } finally {
      setSubmittingQuickEntry(false);
    }
  };

  const exportCsv = () => {
    const lines = [['Date', 'Type', 'Person', 'Amount', 'PaymentMode', 'GiveOrTake', 'Notes'].join(',')];
    for (const r of filteredRows) {
      const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
      lines.push([
        esc(r.date ? String(r.date).slice(0, 10) : ''),
        esc(r.typeLabel),
        esc(r.person),
        Number(r.amount || 0),
        esc(r.paymentMode),
        esc(r.giveTake === 'GIVE' ? 'Give' : 'Take'),
        esc(r.notes),
      ].join(','));
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'loan-ledger.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="expenses-tab-content">
      <div
        style={{
          border: '1px solid #d9e2ec',
          borderRadius: '12px',
          background: '#fff',
          padding: '12px',
          fontSize: '13px',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 20, color: '#1e293b' }}>Loan Ledger</h3>
            <p style={{ margin: '2px 0 0', color: '#64748b', fontSize: 12 }}>
              Overview updates from current filters (date, type, payment mode, search).
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn btn-secondary" onClick={exportCsv}>Export</button>
            <button type="button" className="btn btn-primary" onClick={() => setShowAddModal(true)}>
              + Give / Take
            </button>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(240px, 330px) 1fr', gap: 10, marginBottom: 10 }}>
          <div style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: 10 }}>
            <div style={{ fontWeight: 700, marginBottom: 6, fontSize: 14 }}>Give / Take Overview</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div
                style={{
                  width: 130, height: 130, borderRadius: '50%',
                  background: `conic-gradient(#dc2626 0 ${pGive}%, #2563eb ${pGive}% ${pGive + pTake}%, #e2e8f0 ${pGive + pTake}% 100%)`,
                  position: 'relative',
                }}
              >
                <div style={{ position: 'absolute', inset: 28, borderRadius: '50%', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', fontSize: 12 }}>
                  <span style={{ fontSize: 11 }}>Net</span>
                  <strong>{INR(Math.abs(simpleNet)).replace('.00', '')}</strong>
                </div>
              </div>
              <div style={{ fontSize: 12, color: '#475569' }}>
                <div style={{ marginBottom: 6 }}>● Total Give: {INR(giveTotal)}</div>
                <div style={{ marginBottom: 6 }}>● Total Take: {INR(takeTotal)}</div>
                <div style={{ marginBottom: 6 }}>
                  ● Net: {simpleNet >= 0 ? 'Give' : 'Take'} {INR(Math.abs(simpleNet))}
                </div>
              </div>
            </div>
          </div>
          <div style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: 10 }}>
            <div style={{ fontWeight: 700, marginBottom: 8, fontSize: 14 }}>Give / Take Summary</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(120px,1fr))', gap: 8 }}>
              {[
                ['Give (money out)', giveTotal, '#dc2626'],
                ['Take (money in)', takeTotal, '#2563eb'],
              ].map(([l, v, c]) => (
                <div key={l} style={{ border: '1px solid #eef2f7', borderRadius: 8, padding: 8, background: '#f8fafc' }}>
                  <div style={{ fontSize: 11, color: '#64748b' }}>{l}</div>
                  <div style={{ fontSize: 20, color: c, fontWeight: 700 }}>{INR(v).replace('.00', '')}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="loan-ledger-filters">
          <input className="loan-ledger-filter-input" type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
          <input className="loan-ledger-filter-input" type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
          <select className="loan-ledger-filter-input" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
            <option value="ALL">Give &amp; Take</option>
            <option value="GIVE">I gave (money out)</option>
            <option value="TAKE">I took (money in)</option>
          </select>
          <select className="loan-ledger-filter-input" value={payFilter} onChange={(e) => setPayFilter(e.target.value)}>
            <option value="ALL">All Payment Modes</option>
            <option value="CASH">Cash</option>
            <option value="UPI">UPI</option>
            <option value="BANK">Bank</option>
          </select>
          <select className="loan-ledger-filter-input" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="ALL">All Status</option>
            <option value="ACTIVE">Active</option>
          </select>
          <input className="loan-ledger-filter-input loan-ledger-search-input" type="text" placeholder="Search person..." value={search} onChange={(e) => setSearch(e.target.value)} />
          <button type="button" className="btn btn-secondary loan-ledger-reset-btn" onClick={() => { setFromDate(''); setToDate(''); setTypeFilter('ALL'); setPayFilter('ALL'); setStatusFilter('ALL'); setSearch(''); }}>
            Reset
          </button>
        </div>

        <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 8 }}>Transaction History</div>
        <div className="sales-table-wrapper">
          <table className="data-table expenses-table" style={{ fontSize: 12 }}>
            <thead>
              <tr>
                <th>Date & Time</th>
                <th>Type</th>
                <th>Person</th>
                <th>Amount (₹)</th>
                <th>Payment Mode</th>
                <th>Give / Take</th>
                <th>Notes</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {(loadingLoanLenders || loadingLoanBorrowers || loadingLoanTransactions) ? (
                <tr><td colSpan="8" style={{ textAlign: 'center' }}>Loading...</td></tr>
              ) : filteredRows.length === 0 ? (
                <tr><td colSpan="8" style={{ textAlign: 'center', color: '#64748b' }}>No loan transactions.</td></tr>
              ) : filteredRows.map((r) => (
                <tr key={r.id}>
                  <td>{r.date ? String(r.date).replace('T', ' ').slice(0, 16) : '—'}</td>
                  <td><span style={{ fontWeight: 600, color: r.color }}>{r.typeLabel}</span></td>
                  <td>{r.person || '—'}</td>
                  <td style={{ color: r.color, fontWeight: 700 }}>{INR(r.amount)}</td>
                  <td>{String(r.paymentMode || '—').replaceAll('_', ' ')}</td>
                  <td>{r.giveTake === 'GIVE' ? 'Give' : 'Take'}</td>
                  <td>{r.notes || '—'}</td>
                  <td><span className="pill-status status-open">Active</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {showAddModal && (
        <div className="modal-overlay" onClick={() => setShowAddModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 'min(720px, 92vw)' }}>
            <div className="modal-header">
              <h3>Record Give or Take</h3>
              <button type="button" className="modal-close" onClick={() => setShowAddModal(false)} aria-label="Close">×</button>
            </div>
            <div className="modal-body">
              <form onSubmit={submitQuickEntry}>
                <div className="form-row">
                  <div className="form-group">
                    <label>Date & Time</label>
                    <input type="datetime-local" value={quickEntry.dateTime} onChange={(e) => handleQuickEntryChange('dateTime', e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label>What happened? *</label>
                    <select value={quickEntry.direction} onChange={(e) => {
                      handleQuickEntryChange('direction', e.target.value);
                      handleQuickEntryChange('personRef', '');
                    }}>
                      <option value="GIVE">Give</option>
                      <option value="TAKE">Take</option>
                    </select>
                  </div>
                </div>
                <p style={{ margin: '0 0 8px', fontSize: 12, color: '#64748b' }}>
                  {quickEntry.direction === 'GIVE'
                    ? 'Use “you lent to them” when you hand them a loan; use “you borrowed from them” when you are repaying someone you borrowed from.'
                    : 'Use “you lent to them” when they repay you; use “you borrowed from them” when they lend you money.'}
                </p>
                <div className="form-row">
                  <div className="form-group">
                    <label>Person</label>
                    <select value={quickEntry.personRef} onChange={(e) => {
                      const v = e.target.value;
                      handleQuickEntryChange('personRef', v);
                      if (v !== '__new__') handleQuickEntryChange('personName', '');
                    }}>
                      <option value="">Pick saved person…</option>
                      <option value="__new__">+ Add new person</option>
                      {personOptions.map((opt) => (
                        <option key={opt.key} value={opt.key}>{opt.label}</option>
                      ))}
                    </select>
                    {quickEntry.personRef === '__new__' && (
                      <div style={{ marginTop: 8 }}>
                        <label>New person name *</label>
                        <input type="text" value={quickEntry.personName} onChange={(e) => handleQuickEntryChange('personName', e.target.value)} placeholder="e.g. Amit" required />
                      </div>
                    )}
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Amount (₹) *</label>
                    <input type="number" min="0" step="0.01" required value={quickEntry.amount} onChange={(e) => handleQuickEntryChange('amount', e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label>Payment Mode *</label>
                    <select value={quickEntry.paymentMode} onChange={(e) => handleQuickEntryChange('paymentMode', e.target.value)}>
                      <option value="cash">Cash</option>
                      <option value="upi">UPI</option>
                      <option value="bank_transfer">Bank</option>
                    </select>
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Notes (optional)</label>
                    <textarea rows={2} value={quickEntry.notes} onChange={(e) => handleQuickEntryChange('notes', e.target.value)} placeholder="Any reference notes" />
                  </div>
                </div>
                <div className="form-actions" style={{ marginTop: 10, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  <button type="button" className="btn btn-secondary" onClick={() => { setShowAddModal(false); resetQuickEntry(); }}>Cancel</button>
                  <button type="submit" className="btn btn-primary" disabled={submittingQuickEntry}>
                    {submittingQuickEntry ? 'Saving...' : 'Save Transaction'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LoanPanel;

