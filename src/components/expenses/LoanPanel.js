import React, { useEffect, useMemo, useState } from 'react';
import DdMmYyCalendar from '../DdMmYyCalendar';
import { formatDdMmYy } from '../../utils/dateFormat';

const INR = (n) => `₹${(Number(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * Columns shown in the Transaction History table. Each row is rendered only
 * when `visibleColumns[key]` is true. Defaults are tuned to fit a normal
 * desktop width without needing horizontal scroll; users can toggle columns
 * on/off via the toolbar above the table or by clicking the × on a header,
 * and the preference is persisted in localStorage.
 */
const LOAN_TXN_COLUMNS = [
  { key: 'datetime', label: 'Date & Time', defaultVisible: true },
  { key: 'type', label: 'Type', defaultVisible: true },
  { key: 'person', label: 'Person', defaultVisible: true },
  { key: 'amount', label: 'Amount (₹)', defaultVisible: true },
  { key: 'paymentMode', label: 'Payment Mode', defaultVisible: true },
  { key: 'giveTake', label: 'Give / Take', defaultVisible: false },
  { key: 'notes', label: 'Notes', defaultVisible: true },
  { key: 'status', label: 'Status', defaultVisible: false },
  { key: 'actions', label: 'Actions', defaultVisible: true },
];
const LOAN_TXN_COLUMNS_KEY = 'loanLedger.visibleColumns.v1';
const LOAN_EDIT_WINDOW_DAYS = 7;

function formatLoanDisplayDate(dateStr) {
  return formatDdMmYy(dateStr) || '—';
}

function isWithinLoanEditWindow(dateStr) {
  if (!dateStr) return false;
  const s = String(dateStr).slice(0, 10);
  const [y, mo, d] = s.split('-').map(Number);
  if (!y || !mo || !d) return false;
  const entry = new Date(y, mo - 1, d);
  const cutoff = new Date();
  cutoff.setHours(0, 0, 0, 0);
  cutoff.setDate(cutoff.getDate() - LOAN_EDIT_WINDOW_DAYS);
  entry.setHours(0, 0, 0, 0);
  return entry >= cutoff;
}

function normalizePaymentModeForSelect(raw) {
  const v = String(raw || 'cash').trim().toLowerCase();
  if (v === 'bank' || v === 'bank_transfer') return 'bank_transfer';
  if (v === 'upi') return 'upi';
  return 'cash';
}

const LoanPanel = ({
  handleCreateLoanTransaction,
  handleEditLoanTransaction,
  handleDeleteLoanTransaction,
  loanNotesWithoutMode,
  parseLoanModeFromNotes,
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
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingRow, setEditingRow] = useState(null);
  const [editForm, setEditForm] = useState({ amount: '', paymentMode: 'cash', entryDate: '', notes: '' });
  const [submittingEdit, setSubmittingEdit] = useState(false);
  const [deletingRowId, setDeletingRowId] = useState(null);
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
  const [showColumnsMenu, setShowColumnsMenu] = useState(false);
  const [visibleColumns, setVisibleColumns] = useState(() => {
    const fallback = LOAN_TXN_COLUMNS.reduce(
      (acc, c) => ({ ...acc, [c.key]: c.defaultVisible }),
      {}
    );
    if (typeof window === 'undefined') return fallback;
    try {
      const raw = window.localStorage.getItem(LOAN_TXN_COLUMNS_KEY);
      if (!raw) return fallback;
      const saved = JSON.parse(raw);
      if (!saved || typeof saved !== 'object') return fallback;
      return LOAN_TXN_COLUMNS.reduce(
        (acc, c) => ({
          ...acc,
          [c.key]: typeof saved[c.key] === 'boolean' ? saved[c.key] : c.defaultVisible,
        }),
        {}
      );
    } catch {
      return fallback;
    }
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(LOAN_TXN_COLUMNS_KEY, JSON.stringify(visibleColumns));
    } catch {
      /* localStorage may be unavailable (private mode, quota); ignore. */
    }
  }, [visibleColumns]);

  const isColVisible = (key) => visibleColumns[key] !== false;
  const visibleColumnCount = LOAN_TXN_COLUMNS.filter((c) => isColVisible(c.key)).length;

  const toggleColumn = (key) => {
    setVisibleColumns((prev) => {
      const next = { ...prev, [key]: !isColVisible(key) ? true : false };
      // Always keep at least one column visible so the table isn't empty.
      const stillVisible = LOAN_TXN_COLUMNS.some((c) => next[c.key] !== false);
      return stillVisible ? next : prev;
    });
  };

  const resetColumns = () => {
    setVisibleColumns(
      LOAN_TXN_COLUMNS.reduce((acc, c) => ({ ...acc, [c.key]: c.defaultVisible }), {})
    );
  };

  const lenderRows = useMemo(
    () => (Array.isArray(loanLenders) ? loanLenders : []),
    [loanLenders]
  );
  const borrowerRows = useMemo(
    () => (Array.isArray(loanBorrowers) ? loanBorrowers : []),
    [loanBorrowers]
  );
  const rows = useMemo(
    () => (Array.isArray(loanTransactions) ? loanTransactions : []),
    [loanTransactions]
  );

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

  const openEditModal = (row) => {
    if (!isWithinLoanEditWindow(row?.date)) return;
    const notesFn = loanNotesWithoutMode || ((n) => String(n || ''));
    const modeFn = parseLoanModeFromNotes || (() => 'cash');
    setEditingRow(row);
    setEditForm({
      amount: String(row.amount ?? ''),
      paymentMode: normalizePaymentModeForSelect(row.paymentMode || modeFn(row.notes)),
      entryDate: row.date ? String(row.date).slice(0, 10) : '',
      notes: notesFn(row.notes),
    });
    setShowEditModal(true);
  };

  const closeEditModal = () => {
    if (submittingEdit) return;
    setShowEditModal(false);
    setEditingRow(null);
  };

  const submitEdit = async (e) => {
    e.preventDefault();
    if (!editingRow || submittingEdit) return;
    const amount = parseFloat(String(editForm.amount || '').replace(/,/g, ''));
    if (!Number.isFinite(amount) || amount <= 0) return;
    setSubmittingEdit(true);
    try {
      await handleEditLoanTransaction(editingRow, {
        amount,
        paymentMode: editForm.paymentMode,
        notes: editForm.notes,
        entryDate: editForm.entryDate,
      });
      setShowEditModal(false);
      setEditingRow(null);
    } catch (_) {
      /* toast handled in parent */
    } finally {
      setSubmittingEdit(false);
    }
  };

  const confirmDeleteRow = async (row) => {
    if (!isWithinLoanEditWindow(row?.date) || deletingRowId) return;
    const ok = window.confirm(
      `Delete this ${row.typeLabel || 'loan'} transaction for ${row.person || 'this person'} (${INR(row.amount)})?`
    );
    if (!ok) return;
    setDeletingRowId(row.id);
    try {
      await handleDeleteLoanTransaction(row);
    } catch (_) {
      /* toast handled in parent */
    } finally {
      setDeletingRowId(null);
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
      <div className="loan-ledger-panel">
        <div className="loan-ledger-panel__header">
          <div>
            <h3 className="loan-ledger-panel__title">Loan Ledger</h3>
            <p className="loan-ledger-panel__subtitle">
              Overview updates from current filters (date, type, payment mode, search).
            </p>
          </div>
          <div className="loan-ledger-panel__actions">
            <button type="button" className="secondary-button" onClick={exportCsv}>Export</button>
            <button type="button" className="primary-button" onClick={() => setShowAddModal(true)}>
              + Give / Take
            </button>
          </div>
        </div>

        <div className="loan-ledger-overview-grid">
          <div className="loan-ledger-card">
            <div className="loan-ledger-card__title">Give / Take Overview</div>
            <div className="loan-ledger-donut-layout">
              <div
                className="loan-ledger-donut"
                style={{
                  background: `conic-gradient(#dc2626 0 ${pGive}%, #2563eb ${pGive}% ${pGive + pTake}%, #dce2eb ${pGive + pTake}% 100%)`,
                }}
              >
                <div className="loan-ledger-donut__center">
                  <span className="loan-ledger-donut__center-label">Net</span>
                  <strong>{INR(Math.abs(simpleNet)).replace('.00', '')}</strong>
                </div>
              </div>
              <div className="loan-ledger-legend">
                <div className="loan-ledger-legend__item">● Total Give: {INR(giveTotal)}</div>
                <div className="loan-ledger-legend__item">● Total Take: {INR(takeTotal)}</div>
                <div className="loan-ledger-legend__item">
                  ● Net: {simpleNet >= 0 ? 'Give' : 'Take'} {INR(Math.abs(simpleNet))}
                </div>
              </div>
            </div>
          </div>
          <div className="loan-ledger-card">
            <div className="loan-ledger-card__title">Give / Take Summary</div>
            <div className="loan-ledger-summary-grid">
              <div className="loan-ledger-stat">
                <div className="loan-ledger-stat__label">Give (money out)</div>
                <div className="loan-ledger-stat__value loan-ledger-stat__value--give">
                  {INR(giveTotal).replace('.00', '')}
                </div>
              </div>
              <div className="loan-ledger-stat">
                <div className="loan-ledger-stat__label">Take (money in)</div>
                <div className="loan-ledger-stat__value loan-ledger-stat__value--take">
                  {INR(takeTotal).replace('.00', '')}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="loan-ledger-filters">
          <div className="loan-ledger-filters-row">
            <DdMmYyCalendar className="loan-ledger-filter-input" inputClassName="loan-ledger-filter-input" value={fromDate} onChange={setFromDate} />
            <DdMmYyCalendar className="loan-ledger-filter-input" inputClassName="loan-ledger-filter-input" value={toDate} onChange={setToDate} minDate={fromDate || undefined} />
            <select className="loan-ledger-filter-input" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
              <option value="ALL">Give &amp; Take</option>
              <option value="GIVE">I gave (money out)</option>
              <option value="TAKE">I took (money in)</option>
            </select>
          </div>
          <div className="loan-ledger-filters-row">
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
          <button type="button" className="secondary-button loan-ledger-reset-btn" onClick={() => { setFromDate(''); setToDate(''); setTypeFilter('ALL'); setPayFilter('ALL'); setStatusFilter('ALL'); setSearch(''); }}>
            Reset
          </button>
          </div>
        </div>

        <div className="loan-ledger-history-header">
          <div className="loan-ledger-history-header__title">Transaction History</div>
          <div className="loan-ledger-history-header__meta">
            <span className="loan-ledger-history-header__count">
              Showing {visibleColumnCount} of {LOAN_TXN_COLUMNS.length} columns
            </span>
            <button
              type="button"
              className="secondary-button secondary-button--sm"
              onClick={() => setShowColumnsMenu((v) => !v)}
              title="Show or hide table columns"
            >
              ⚙ Columns
            </button>
            {showColumnsMenu && (
              <div className="loan-ledger-columns-menu">
                <div className="loan-ledger-columns-menu__head">
                  <span>Toggle columns</span>
                  <button type="button" className="loan-ledger-columns-menu__reset" onClick={resetColumns}>
                    Reset
                  </button>
                </div>
                {LOAN_TXN_COLUMNS.map((c) => (
                  <label key={c.key} className="loan-ledger-columns-menu__item">
                    <input
                      type="checkbox"
                      checked={isColVisible(c.key)}
                      onChange={() => toggleColumn(c.key)}
                    />
                    {c.label}
                  </label>
                ))}
                <div className="loan-ledger-columns-menu__footer">
                  <button
                    type="button"
                    className="secondary-button secondary-button--sm secondary-button--block"
                    onClick={() => setShowColumnsMenu(false)}
                  >
                    Done
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
        <div className="sales-table-wrapper">
          <table
            className="data-table expenses-table loan-txn-table"
            style={{ fontSize: 12, width: '100%', tableLayout: 'auto' }}
          >
            <thead>
              <tr>
                {LOAN_TXN_COLUMNS.filter((c) => isColVisible(c.key)).map((c) => (
                  <th key={c.key} style={{ position: 'relative', whiteSpace: 'nowrap' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      {c.label}
                      <button
                        type="button"
                        onClick={() => toggleColumn(c.key)}
                        title={`Hide ${c.label} column`}
                        aria-label={`Hide ${c.label} column`}
                        disabled={visibleColumnCount <= 1}
                        style={{
                          border: 'none',
                          background: 'transparent',
                          color: '#94a3b8',
                          cursor: visibleColumnCount <= 1 ? 'not-allowed' : 'pointer',
                          fontSize: 11,
                          lineHeight: 1,
                          padding: 0,
                          opacity: visibleColumnCount <= 1 ? 0.3 : 0.8,
                        }}
                      >
                        ×
                      </button>
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(loadingLoanLenders || loadingLoanBorrowers || loadingLoanTransactions) ? (
                <tr>
                  <td colSpan={visibleColumnCount} style={{ textAlign: 'center' }}>Loading...</td>
                </tr>
              ) : filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={visibleColumnCount} style={{ textAlign: 'center', color: '#64748b' }}>
                    No loan transactions.
                  </td>
                </tr>
              ) : filteredRows.map((r) => (
                <tr key={r.id}>
                  {isColVisible('datetime') && (
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {formatLoanDisplayDate(r.date)}
                    </td>
                  )}
                  {isColVisible('type') && (
                    <td>
                      <span style={{ fontWeight: 600, color: r.color }}>{r.typeLabel}</span>
                    </td>
                  )}
                  {isColVisible('person') && <td>{r.person || '—'}</td>}
                  {isColVisible('amount') && (
                    <td style={{ color: r.color, fontWeight: 700, whiteSpace: 'nowrap' }}>
                      {INR(r.amount)}
                    </td>
                  )}
                  {isColVisible('paymentMode') && (
                    <td>{String(r.paymentMode || '—').replaceAll('_', ' ')}</td>
                  )}
                  {isColVisible('giveTake') && <td>{r.giveTake === 'GIVE' ? 'Give' : 'Take'}</td>}
                  {isColVisible('notes') && (
                    <td
                      style={{
                        whiteSpace: 'normal',
                        wordBreak: 'break-word',
                        maxWidth: 280,
                        minWidth: 160,
                      }}
                    >
                      {r.notes || '—'}
                    </td>
                  )}
                  {isColVisible('status') && (
                    <td><span className="pill-status status-open">Active</span></td>
                  )}
                  {isColVisible('actions') && (
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {isWithinLoanEditWindow(r.date) ? (
                        <span style={{ display: 'inline-flex', gap: 6 }}>
                          <button
                            type="button"
                            className="secondary-button"
                            style={{ padding: '2px 8px', fontSize: 11 }}
                            onClick={() => openEditModal(r)}
                            title="Edit (within last 7 days)"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className="secondary-button"
                            style={{ padding: '2px 8px', fontSize: 11, color: '#dc2626' }}
                            disabled={deletingRowId === r.id}
                            onClick={() => confirmDeleteRow(r)}
                            title="Delete (within last 7 days)"
                          >
                            {deletingRowId === r.id ? '…' : 'Delete'}
                          </button>
                        </span>
                      ) : (
                        <span style={{ color: '#94a3b8', fontSize: 11 }}>—</span>
                      )}
                    </td>
                  )}
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
                    <DdMmYyCalendar showTime value={quickEntry.dateTime} onChange={(v) => handleQuickEntryChange('dateTime', v)} />
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
                  <button type="button" className="secondary-button" onClick={() => { setShowAddModal(false); resetQuickEntry(); }}>Cancel</button>
                  <button type="submit" className="primary-button" disabled={submittingQuickEntry}>
                    {submittingQuickEntry ? 'Saving...' : 'Save Transaction'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
      {showEditModal && editingRow && (
        <div className="modal-overlay" onClick={closeEditModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 'min(520px, 92vw)' }}>
            <div className="modal-header">
              <h3>Edit loan transaction</h3>
              <button type="button" className="modal-close" onClick={closeEditModal} aria-label="Close">×</button>
            </div>
            <div className="modal-body">
              <p style={{ margin: '0 0 12px', fontSize: 12, color: '#64748b' }}>
                {editingRow.typeLabel} · {editingRow.person}
                {' · '}
                Only transactions from the last {LOAN_EDIT_WINDOW_DAYS} days can be changed.
              </p>
              <form onSubmit={submitEdit}>
                <div className="form-row">
                  <div className="form-group">
                    <label>Amount (₹) *</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      required
                      value={editForm.amount}
                      onChange={(e) => setEditForm((p) => ({ ...p, amount: e.target.value }))}
                      disabled={submittingEdit}
                    />
                  </div>
                  <div className="form-group">
                    <label>Date</label>
                    <DdMmYyCalendar
                      value={editForm.entryDate}
                      onChange={(v) => setEditForm((p) => ({ ...p, entryDate: v }))}
                      disabled={submittingEdit}
                    />
                  </div>
                </div>
                <div className="form-group">
                  <label>Payment mode</label>
                  <select
                    value={editForm.paymentMode}
                    onChange={(e) => setEditForm((p) => ({ ...p, paymentMode: e.target.value }))}
                    disabled={submittingEdit}
                  >
                    <option value="cash">Cash</option>
                    <option value="upi">UPI</option>
                    <option value="bank_transfer">Bank</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Notes</label>
                  <textarea
                    rows={2}
                    value={editForm.notes}
                    onChange={(e) => setEditForm((p) => ({ ...p, notes: e.target.value }))}
                    disabled={submittingEdit}
                  />
                </div>
                <div className="form-actions" style={{ marginTop: 10, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  <button type="button" className="secondary-button" onClick={closeEditModal} disabled={submittingEdit}>Cancel</button>
                  <button type="submit" className="primary-button" disabled={submittingEdit}>
                    {submittingEdit ? 'Saving...' : 'Save changes'}
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

