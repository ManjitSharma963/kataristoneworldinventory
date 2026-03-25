import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { fetchDailyClosingReport, downloadBillPDF } from '../utils/api';
import Loading from './Loading';
import './Reports.css';

/** Today in local timezone (avoids UTC off-by-one from toISOString). */
function localISODate(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const money = (n) =>
  `₹${(Number(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function formatDayLabel(iso) {
  if (!iso) return '';
  const d = new Date(iso + 'T12:00:00');
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
}

/** Normalize API date (ISO string or Jackson [y,m,d]) for display. */
function toIsoDateString(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'string') {
    return v.length >= 10 ? v.slice(0, 10) : v;
  }
  if (Array.isArray(v) && v.length >= 3) {
    const y = v[0];
    const m = v[1];
    const d = v[2];
    return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }
  return null;
}

function formatShortDate(iso) {
  const raw = toIsoDateString(iso);
  if (!raw) return '—';
  const d = new Date(raw + 'T12:00:00');
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function parseReportError(err) {
  const raw = err?.message || String(err);
  const dash = raw.indexOf('- ');
  const tail = dash >= 0 ? raw.slice(dash + 2).trim() : raw;
  try {
    const j = JSON.parse(tail);
    if (j.message) return j.message;
    if (j.error) return typeof j.error === 'string' ? j.error : JSON.stringify(j.error);
  } catch {
    const m = tail.match(/\{[\s\S]*\}/);
    if (m) {
      try {
        const j = JSON.parse(m[0]);
        if (j.message) return j.message;
        if (j.error) return String(j.error);
      } catch (_) {
        /* ignore */
      }
    }
  }
  if (/\b403\b/.test(raw)) {
    return 'You do not have permission to view this report.';
  }
  return tail || 'Could not load report.';
}

/** User-facing message + optional server reference for ops (matches API `requestId`). */
function parseReportErrorMeta(err) {
  const requestId = err?.requestId || err?.responseBody?.requestId;
  if (err?.rawMessage) {
    return { message: parseReportError({ message: err.rawMessage }), requestId };
  }
  const raw = err?.message || String(err);
  if (raw === 'Failed to fetch' || /NetworkError|Load failed|network/i.test(String(raw))) {
    return { message: 'Network error. Check your connection and try again.', requestId };
  }
  return { message: raw || 'Could not load report.', requestId };
}

/** Client-only paging for bill/expense tables; full payload is still loaded (server paging is a future option). */
function csvEscapeCell(val) {
  const t = val == null ? '' : String(val);
  if (/[",\n\r]/.test(t)) {
    return `"${t.replace(/"/g, '""')}"`;
  }
  return t;
}

/** UTF-8 BOM helps Excel open CSV with correct encoding. */
function buildDailyClosingCsv(data, from, to) {
  const rows = [];
  rows.push(['Daily Closing Report', from, to].map(csvEscapeCell).join(','));
  rows.push(['Location', data.location ?? ''].map(csvEscapeCell).join(','));
  rows.push(['Total bills', data.totalBills ?? 0].map(csvEscapeCell).join(','));
  rows.push(['Total sales', data.totalSales ?? 0].map(csvEscapeCell).join(','));
  rows.push(['Total paid on bills', data.totalPaidOnBills ?? 0].map(csvEscapeCell).join(','));
  rows.push(['Total due on bills', data.totalDueOnBills ?? 0].map(csvEscapeCell).join(','));
  rows.push(['Total collected', data.totalCollected ?? 0].map(csvEscapeCell).join(','));
  rows.push(['Total expenses', data.totalExpenses ?? 0].map(csvEscapeCell).join(','));
  rows.push(['Cash in hand', data.cashInHand ?? 0].map(csvEscapeCell).join(','));
  const ps = data.paymentSummary || {};
  rows.push(['Mode summary', 'Amount'].map(csvEscapeCell).join(','));
  Object.entries(ps).forEach(([k, v]) => {
    rows.push([k, v].map(csvEscapeCell).join(','));
  });
  rows.push('');
  rows.push(
    [
      'Bill date',
      'Bill #',
      'Type',
      'Total',
      'Paid',
      'Due',
      'Cash',
      'UPI',
      'Bank',
      'Other',
      'Status',
      'Overpaid'
    ]
      .map(csvEscapeCell)
      .join(',')
  );
  (data.bills || []).forEach((row) => {
    rows.push(
      [
        toIsoDateString(row.billDate) || '',
        row.billNumber,
        row.billType,
        row.totalAmount,
        row.paidAmount,
        row.dueAmount,
        row.cashAmount,
        row.upiAmount,
        row.bankTransferAmount,
        row.otherAmount,
        row.status,
        row.overpaidAmount ?? 0
      ]
        .map(csvEscapeCell)
        .join(',')
    );
  });
  rows.push('');
  rows.push(['Expense id', 'Type', 'Category', 'Amount'].map(csvEscapeCell).join(','));
  (data.expenseLines || []).forEach((ex) => {
    rows.push([ex.id, ex.expenseType, ex.category, ex.amount].map(csvEscapeCell).join(','));
  });
  return `\uFEFF${rows.join('\n')}`;
}

const PAGE_SIZE = 10;

function TablePagination({ page, pageCount, total, label, onPrev, onNext }) {
  if (total <= 0) return null;
  if (pageCount <= 1) return null;
  const from = (page - 1) * PAGE_SIZE + 1;
  const to = Math.min(page * PAGE_SIZE, total);
  return (
    <nav className="report-pagination" aria-label={label}>
      <button type="button" className="report-pagination-btn" disabled={page <= 1} onClick={onPrev}>
        Previous
      </button>
      <span className="report-pagination-meta">
        {from}–{to} of {total} · Page {page} / {pageCount}
      </span>
      <button type="button" className="report-pagination-btn" disabled={page >= pageCount} onClick={onNext}>
        Next
      </button>
    </nav>
  );
}

const Reports = () => {
  const defaultDay = useMemo(() => localISODate(), []);
  const [dateFrom, setDateFrom] = useState(defaultDay);
  const [dateTo, setDateTo] = useState(defaultDay);
  const [closingLoading, setClosingLoading] = useState(true);
  const [closingData, setClosingData] = useState(null);
  const [closingError, setClosingError] = useState('');
  const [closingErrorRequestId, setClosingErrorRequestId] = useState('');
  const [fetchedRange, setFetchedRange] = useState(null);
  const [expensesPage, setExpensesPage] = useState(1);
  const [billsPage, setBillsPage] = useState(1);

  const isRange = dateFrom !== dateTo;

  const loadDailyClosing = useCallback(async (from, to) => {
    setClosingError('');
    setClosingErrorRequestId('');
    setClosingLoading(true);
    try {
      const data = await fetchDailyClosingReport({
        date: from,
        dateTo: to,
        backfillLegacy: false
      });
      setClosingData(data);
      setClosingError('');
      setFetchedRange({ from, to });
    } catch (e) {
      console.error(e);
      const meta = parseReportErrorMeta(e);
      setClosingError(meta.message);
      setClosingErrorRequestId(meta.requestId || '');
    } finally {
      setClosingLoading(false);
    }
  }, []);

  const initialLoadDone = useRef(false);
  useEffect(() => {
    if (initialLoadDone.current) return;
    initialLoadDone.current = true;
    loadDailyClosing(dateFrom, dateTo);
  }, [loadDailyClosing, dateFrom, dateTo]);

  const datesPendingSearch =
    fetchedRange != null && (fetchedRange.from !== dateFrom || fetchedRange.to !== dateTo);

  useEffect(() => {
    setExpensesPage(1);
    setBillsPage(1);
  }, [closingData]);

  const expenseLines = closingData?.expenseLines ?? [];
  const billsRows = closingData?.bills ?? [];

  const expensePageCount = Math.max(1, Math.ceil(expenseLines.length / PAGE_SIZE));
  const billsPageCount = Math.max(1, Math.ceil(billsRows.length / PAGE_SIZE));

  const expensePageSafe = Math.min(Math.max(1, expensesPage), expensePageCount);
  const billsPageSafe = Math.min(Math.max(1, billsPage), billsPageCount);

  useEffect(() => {
    setExpensesPage((p) => Math.min(p, expensePageCount));
  }, [expensePageCount]);

  useEffect(() => {
    setBillsPage((p) => Math.min(p, billsPageCount));
  }, [billsPageCount]);

  const paginatedExpenses = useMemo(() => {
    const start = (expensePageSafe - 1) * PAGE_SIZE;
    return expenseLines.slice(start, start + PAGE_SIZE);
  }, [expenseLines, expensePageSafe]);

  const paginatedBills = useMemo(() => {
    const start = (billsPageSafe - 1) * PAGE_SIZE;
    return billsRows.slice(start, start + PAGE_SIZE);
  }, [billsRows, billsPageSafe]);

  const onChangeFrom = (e) => {
    const v = e.target.value;
    setDateFrom(v);
    setDateTo((prev) => (prev < v ? v : prev));
  };

  const onChangeTo = (e) => {
    const v = e.target.value;
    setDateTo(v);
    setDateFrom((prev) => (v < prev ? v : prev));
  };

  const handleClearDates = () => {
    const t = localISODate();
    setDateFrom(t);
    setDateTo(t);
  };

  const periodLabel = useMemo(() => {
    if (!dateFrom || !dateTo) return '';
    if (dateFrom === dateTo) return formatDayLabel(dateFrom);
    return `${formatDayLabel(dateFrom)} – ${formatDayLabel(dateTo)}`;
  }, [dateFrom, dateTo]);

  const paySummary = closingData?.paymentSummary || {};
  const otherCollected =
    (Number(paySummary.CHEQUE) || 0) + (Number(paySummary.OTHER) || 0);

  const billsHeading = isRange ? 'Bills in this period' : "Today's bills";
  const expensesHeading = isRange ? 'Expenses in this period' : "Today's expenses";

  const handleExportCsv = useCallback(() => {
    if (!closingData) return;
    const blob = new Blob([buildDailyClosingCsv(closingData, dateFrom, dateTo)], {
      type: 'text/csv;charset=utf-8;'
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `daily-closing_${dateFrom}_${dateTo}.csv`;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [closingData, dateFrom, dateTo]);

  const handleBillPdf = async (row) => {
    try {
      await downloadBillPDF(row.billId, row.billType);
    } catch (e) {
      console.error(e);
      window.alert(parseReportError(e));
    }
  };

  if (closingLoading && !closingData) {
    return (
      <div className="reports-container reports-layout reports-daily-only">
        <Loading message="Loading report…" />
      </div>
    );
  }

  return (
    <div className="reports-container reports-layout reports-daily-only">
      <header className="reports-top">
        <div>
          <h2 className="reports-title">Daily Closing Report</h2>
        </div>
        <div className="reports-header-actions">
          <button
            type="button"
            className="reports-btn-export"
            onClick={handleExportCsv}
            disabled={!closingData || closingLoading}
          >
            Export CSV
          </button>
          <button type="button" className="reports-btn-print" onClick={() => window.print()} disabled={!closingData}>
            Print
          </button>
        </div>
      </header>

      <section className="report-filters report-filters-bar" aria-label="Report period">
        <div className="report-filters-inner daily-closing-date-row daily-closing-daterange-row">
          <div className="form-group">
            <label htmlFor="closing-date-from">From (bill date &amp; period start)</label>
            <input id="closing-date-from" type="date" value={dateFrom} onChange={onChangeFrom} />
          </div>
          <div className="form-group">
            <label htmlFor="closing-date-to">To (inclusive)</label>
            <input id="closing-date-to" type="date" value={dateTo} onChange={onChangeTo} />
          </div>
          <div className="form-group daily-filter-actions">
            <label className="daily-filter-actions-label">Find on date</label>
            <div className="daily-filter-buttons">
              <button
                type="button"
                className="btn-clear-dates"
                onClick={handleClearDates}
                title="Reset From and To to today"
              >
                Clear
              </button>
              <button
                type="button"
                className="btn-primary-soft"
                onClick={() => loadDailyClosing(dateFrom, dateTo)}
                disabled={closingLoading}
              >
                {closingLoading ? 'Loading…' : 'Search'}
              </button>
            </div>
          </div>
        </div>
      </section>

      {closingError && (
        <div className="report-error-banner report-error-banner--with-actions" role="alert">
          <div className="report-error-banner-text">
            <p className="report-error-message">{closingError}</p>
            {closingErrorRequestId ? (
              <p className="report-error-ref">
                Reference for support: <code>{closingErrorRequestId}</code>
              </p>
            ) : null}
          </div>
          <button
            type="button"
            className="report-error-retry"
            onClick={() => loadDailyClosing(dateFrom, dateTo)}
            disabled={closingLoading}
          >
            Retry
          </button>
        </div>
      )}
      {datesPendingSearch && !closingError && (
        <div className="report-stale-dates-banner" role="status">
          Dates changed — click <strong>Search</strong> to load the report for the new range.
        </div>
      )}
      {closingLoading && closingData && (
        <div className="report-info-banner" role="status">
          Updating report…
        </div>
      )}
      {closingData && Array.isArray(closingData.warnings) && closingData.warnings.length > 0 && (
        <div className="report-warnings-banner" role="status">
          <ul className="report-warnings-list">
            {closingData.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      {closingData ? (
        <>
          <div className="daily-closing-header daily-closing-header-inline">
            <span className="daily-closing-date-badge" role="status">
              {periodLabel}
            </span>
            {isRange && <span className="daily-range-pill">Date range</span>}
            {closingData.location != null && String(closingData.location).trim() !== '' && (
              <span className="reports-location-chip" title="Data filtered by your account location">
                {String(closingData.location).trim()}
              </span>
            )}
          </div>

          <div className="daily-summary-grid">
            <div className="daily-summary-card">
              <span className="daily-summary-label">Total bills</span>
              <span className="daily-summary-value">{closingData.totalBills ?? 0}</span>
              <span className="daily-summary-hint">
                Invoices with bill date in the selected {isRange ? 'range' : 'day'}
              </span>
            </div>
            <div className="daily-summary-card">
              <span className="daily-summary-label">Total sales</span>
              <span className="daily-summary-value">{money(closingData.totalSales)}</span>
              <span className="daily-summary-hint">Sum of bill totals for those invoices</span>
            </div>
            <div className="daily-summary-card">
              <span className="daily-summary-label">Total paid</span>
              <span className="daily-summary-value">{money(closingData.totalPaidOnBills)}</span>
              <span className="daily-summary-hint">Allocated on those bills (split payments)</span>
            </div>
            <div className="daily-summary-card">
              <span className="daily-summary-label">Total due</span>
              <span className="daily-summary-value">{money(closingData.totalDueOnBills)}</span>
              <span className="daily-summary-hint">Still unpaid on those bills</span>
            </div>
          </div>

          <div className="daily-paymode-grid daily-paymode-grid--tight-top" aria-label="Collections by payment mode">
            <div className="daily-paymode cash">
              <span>Cash</span>
              <strong>{money(paySummary.CASH)}</strong>
            </div>
            <div className="daily-paymode upi">
              <span>UPI</span>
              <strong>{money(paySummary.UPI)}</strong>
            </div>
            <div className="daily-paymode bank">
              <span>Bank transfer</span>
              <strong>{money(paySummary.BANK_TRANSFER)}</strong>
            </div>
            <div className="daily-paymode other">
              <span>Other (cheque, etc.)</span>
              <strong>{money(otherCollected)}</strong>
            </div>
          </div>
          <p className="report-muted daily-microcopy daily-total-collected-line">
            <strong>Total collected</strong> (all modes, payment date in period): {money(closingData.totalCollected)}
            {closingData.collectionsReconciliationOk === false && (
              <span className="daily-recon-warn">
                {' '}
                · Modes vs total Δ {money(closingData.collectionsReconciliationDelta)}
              </span>
            )}
          </p>

          <h4 className="daily-subheading">{billsHeading}</h4>
          <p className="report-table-scroll-hint">Scroll sideways to see all columns.</p>
          <div className="daily-bills-table-block">
            <div
              className="report-table-wrap report-table-scroll-region"
              role="region"
              aria-label="Bills in period. Scroll horizontally if columns are cut off."
              tabIndex={0}
            >
              <table className="report-data-table daily-bills-table">
                <thead>
                  <tr>
                    <th>Bill date</th>
                    <th>Bill</th>
                    <th>Type</th>
                    <th>Total</th>
                    <th>Paid</th>
                    <th>Due</th>
                    <th>Cash</th>
                    <th>UPI</th>
                    <th>Bank</th>
                    <th>Other</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {billsRows.length === 0 ? (
                    <tr>
                      <td colSpan={11} className="report-muted">
                        No bills in this period.
                      </td>
                    </tr>
                  ) : (
                    paginatedBills.map((row) => (
                      <tr key={`${row.billType}-${row.billId}`}>
                        <td>{formatShortDate(row.billDate)}</td>
                        <td>
                          <button
                            type="button"
                            className="report-bill-link"
                            onClick={() => handleBillPdf(row)}
                            title="Download bill PDF"
                          >
                            {row.billNumber}
                          </button>
                        </td>
                        <td>
                          <span className="bill-type-pill">{row.billType}</span>
                        </td>
                        <td>{money(row.totalAmount)}</td>
                        <td>{money(row.paidAmount)}</td>
                        <td>{money(row.dueAmount)}</td>
                        <td>{money(row.cashAmount)}</td>
                        <td>{money(row.upiAmount)}</td>
                        <td>{money(row.bankTransferAmount)}</td>
                        <td>{money(row.otherAmount)}</td>
                        <td>
                          <span className="report-status-cell">
                            <span className={`status-pill status-${(row.status || '').toLowerCase()}`}>{row.status}</span>
                            {(row.overpaidAmount || 0) > 0.005 && (
                              <span className="report-overpaid-tag" title="Payments exceed bill total">
                                +{money(row.overpaidAmount)}
                              </span>
                            )}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <TablePagination
              page={billsPageSafe}
              pageCount={billsPageCount}
              total={billsRows.length}
              label="Bills pages"
              onPrev={() => setBillsPage((p) => Math.max(1, p - 1))}
              onNext={() => setBillsPage((p) => Math.min(billsPageCount, p + 1))}
            />
          </div>

          <div className="daily-bottom-grid">
            <div className="daily-expenses-panel">
              <h4 className="daily-subheading">{expensesHeading}</h4>
              <p className="report-table-scroll-hint">Scroll sideways to see all columns.</p>
              <div
                className={`report-table-wrap report-table-scroll-region daily-expenses-body-wrap${expenseLines.length > 0 ? ' daily-expenses-body-wrap--fill' : ''}`}
                role="region"
                aria-label="Expenses in period. Scroll horizontally if columns are cut off."
                tabIndex={0}
              >
                <table className="report-data-table daily-expenses-table">
                  <colgroup>
                    <col className="col-exp-id" />
                    <col className="col-exp-cat" />
                    <col className="col-exp-amt" />
                  </colgroup>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Type / category</th>
                      <th>Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {expenseLines.length === 0 ? (
                      <tr>
                        <td colSpan={3} className="report-muted">
                          No expenses in this period.
                        </td>
                      </tr>
                    ) : (
                      paginatedExpenses.map((ex) => (
                        <tr key={ex.id}>
                          <td>{ex.id}</td>
                          <td>{[ex.expenseType, ex.category].filter(Boolean).join(' · ')}</td>
                          <td>{money(ex.amount)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              <TablePagination
                page={expensePageSafe}
                pageCount={expensePageCount}
                total={expenseLines.length}
                label="Expense pages"
                onPrev={() => setExpensesPage((p) => Math.max(1, p - 1))}
                onNext={() => setExpensesPage((p) => Math.min(expensePageCount, p + 1))}
              />
              <div className="report-table-wrap daily-expenses-tfoot-wrap">
                <table className="report-data-table daily-expenses-table">
                  <colgroup>
                    <col className="col-exp-id" />
                    <col className="col-exp-cat" />
                    <col className="col-exp-amt" />
                  </colgroup>
                  <tfoot>
                    <tr className="report-row-strong">
                      <td colSpan={2}>Total expenses</td>
                      <td>{money(closingData.totalExpenses)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
            <div className="cash-summary-card">
              <h4>Cash summary</h4>
              <div className="report-row">
                <span>Cash collected {isRange ? 'in period' : '(today)'}</span>
                <span className="report-value positive">{money(paySummary.CASH)}</span>
              </div>
              <div className="report-row">
                <span>Total expenses {isRange ? 'in period' : '(today)'}</span>
                <span className="report-value negative">{money(closingData.totalExpenses)}</span>
              </div>
              <div
                className={`report-row report-row-strong cash-final ${(closingData.cashInHand || 0) < 0 ? 'negative' : 'positive'}`}
              >
                <span>Final cash in hand {isRange ? '(period)' : ''}</span>
                <span className="report-value">{money(closingData.cashInHand)}</span>
              </div>
              <p className="report-muted daily-microcopy">
                <strong>Cash collected</strong> in the selected {isRange ? 'range' : 'day'} minus{' '}
                <strong>expenses posted</strong> in the same {isRange ? 'range' : 'day'}. UPI/bank are not in this number.
              </p>
            </div>
          </div>

          <Explainer title="How to read this report">
            <li>
              <strong>Search</strong>: Changing dates does not reload automatically — click <strong>Search</strong> to fetch
              the report for the selected range.
            </li>
            <li>
              <strong>From / To</strong>: Set both to the same date for one day, or choose a range. Defaults to today for
              both.
            </li>
            <li>
              <strong>Total bills / Total sales</strong>: Invoices whose <strong>bill date</strong> falls in the selected
              period.
            </li>
            <li>
              <strong>Total paid / Total due</strong>: On those invoices — allocated vs outstanding (split &amp; partial
              payments).
            </li>
            <li>
              <strong>Collections</strong>: Sums from stored payment lines whose <strong>payment date</strong> is in the
              period (can differ from bill dates if you collect old dues later). <strong>Total collected</strong> is the sum
              of all payment modes.
            </li>
            <li>
              <strong>Bill table</strong>: Each invoice&apos;s bill date and paid split (Cash / UPI / Bank / Other).
            </li>
            <li>
              <strong>Final cash in hand</strong>: Cash collected in the period minus expenses in the period; reconcile with
              your cashbox.
            </li>
          </Explainer>
        </>
      ) : !closingError ? (
        <p className="report-muted">No data.</p>
      ) : null}
    </div>
  );
};

function Explainer({ title, children }) {
  return (
    <details className="report-explainer">
      <summary>{title}</summary>
      <ul className="report-explainer-list">{children}</ul>
    </details>
  );
}

export default Reports;
