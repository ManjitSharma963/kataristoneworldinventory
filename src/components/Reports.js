import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  fetchDailyClosingReport,
  fetchSalesChargesSummary,
  downloadBillPDF,
  getLedgerTransactions,
  getDailyBudgetCalculatedSummary,
  getBalanceSummary,
} from '../utils/api';
import Loading from './Loading';
import './Reports.css';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

function localISODate(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const money = (n) =>
  `₹${(Number(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const unwrapEntity = (value) =>
  value && typeof value === 'object' && value.data && typeof value.data === 'object'
    ? value.data
    : value;

const unwrapList = (value) =>
  Array.isArray(value) ? value : Array.isArray(value?.data) ? value.data : [];

function formatDayLabel(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatShortDate(iso) {
  if (!iso) return '—';
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function formatExpenseMode(pm) {
  const raw = String(pm ?? '').trim();
  if (!raw) return '—';
  const u = raw.toUpperCase().replace(/\s+/g, '_');
  const labels = {
    CASH: 'Cash',
    UPI: 'UPI',
    BANK: 'Bank',
    BANK_TRANSFER: 'Bank',
    CARD: 'Card',
    CHEQUE: 'Cheque',
    CHECK: 'Cheque',
    OTHER: 'Other',
  };
  return labels[u] || raw.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function parseReportError(err) {
  if (!err) return 'Failed to load report.';
  if (typeof err === 'string') return err;
  return err.message || 'Failed to load report.';
}

const DATE_PRESETS = [
  { id: 'today', label: 'Today', getRange: () => ({ from: localISODate(), to: localISODate() }) },
  {
    id: 'yesterday',
    label: 'Yesterday',
    getRange: () => {
      const d = new Date();
      d.setDate(d.getDate() - 1);
      const iso = localISODate(d);
      return { from: iso, to: iso };
    },
  },
  {
    id: 'last7',
    label: 'Last 7 days',
    getRange: () => {
      const to = localISODate();
      const d = new Date();
      d.setDate(d.getDate() - 6);
      return { from: localISODate(d), to };
    },
  },
  {
    id: 'month',
    label: 'This month',
    getRange: () => {
      const d = new Date();
      const from = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
      return { from, to: localISODate() };
    },
  },
];

const CHART_COLORS = {
  cash: '#2563eb',
  upi: '#059669',
  bank: '#7c3aed',
  cheque: '#ea580c',
  other: '#94a3b8',
  labour: '#ef4444',
  otherExp: '#f97316',
  advance: '#8b5cf6',
  misc: '#ec4899',
  dailyExpense: '#f97316',
  loanRepay: '#0ea5e9',
  clientPayment: '#6366f1',
  salaryPay: '#059669',
  salaryAdvance: '#8b5cf6',
  expenseOther: '#94a3b8',
};

/** Bucket a closing-report expense line for the Expenses Overview donut. */
function classifyExpenseForChart(ex) {
  const type = String(ex?.expenseType ?? '').trim().toLowerCase();
  const cat = String(ex?.category ?? '').trim().toLowerCase();
  const desc = String(ex?.description ?? '').trim().toLowerCase();

  if (type === 'client_payment' || cat === 'client_supplier' || cat === 'client' || cat === 'client_out') {
    return 'Client Payment';
  }
  if (
    cat === 'loan_repayment' ||
    cat === 'loan_repay' ||
    cat === 'loan' ||
    cat === 'market_loan' ||
    desc.includes('loan repay')
  ) {
    return 'Loan Repay';
  }
  if (type === 'salary' || cat === 'salary') {
    return 'Employee Salary';
  }
  if (type === 'advance' && (cat === 'employee' || cat.includes('employee'))) {
    return 'Employee Advance';
  }
  if (type === 'daily' || cat === 'daily' || type === '' || type === 'expense') {
    return 'Daily Expenses';
  }
  return 'Other';
}

const EXPENSE_CHART_BUCKET_COLORS = {
  'Daily Expenses': CHART_COLORS.dailyExpense,
  'Loan Repay': CHART_COLORS.loanRepay,
  'Client Payment': CHART_COLORS.clientPayment,
  'Employee Salary': CHART_COLORS.salaryPay,
  'Employee Advance': CHART_COLORS.salaryAdvance,
  Other: CHART_COLORS.expenseOther,
};

function MetricCard({ icon, tone, label, value, hint }) {
  return (
    <article className="reports-metric">
      <div className={`reports-metric__icon reports-metric__icon--${tone}`} aria-hidden>
        <i className={icon} />
      </div>
      <div>
        <span className="reports-metric__label">{label}</span>
        <span className="reports-metric__value">{value}</span>
        {hint ? <span className="reports-metric__hint">{hint}</span> : null}
      </div>
    </article>
  );
}

function DonutPanel({ title, centerLabel, centerValue, data, emptyMessage }) {
  const total = data.reduce((s, d) => s + (Number(d.value) || 0), 0);
  const hasData = total > 0;
  const legendItems = data.map((d) => ({
    ...d,
    pct: total > 0 ? (Number(d.value) / total) * 100 : 0,
  }));

  return (
    <section className="reports-card reports-donut-panel">
      <h3 className="reports-card__title">{title}</h3>
      <div className="reports-donut-layout">
        <div className="reports-donut-chart">
          <div className="reports-donut-viz">
        {hasData ? (
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius="52%"
                outerRadius="78%"
                paddingAngle={2}
                stroke="#fff"
                strokeWidth={2}
              >
                {data.map((entry) => (
                  <Cell key={entry.name} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip formatter={(v) => money(v)} />
            </PieChart>
          </ResponsiveContainer>
        ) : (
          <div className="reports-donut-ring" aria-hidden />
        )}
        <div className="reports-donut-center">
          <span className="reports-donut-center__label">{centerLabel}</span>
          <span className="reports-donut-center__value">{centerValue}</span>
        </div>
          </div>
          {!hasData ? <p className="reports-donut-empty-note">{emptyMessage}</p> : null}
        </div>
        {hasData ? (
          <ul className="reports-donut-legend" aria-label={`${title} breakdown`}>
            {legendItems.map((item) => (
              <li key={item.name} className="reports-donut-legend__row">
                <span className="reports-donut-legend__left">
                  <span className="reports-donut-legend__dot" style={{ background: item.color }} />
                  <span className="reports-donut-legend__name">{item.name}</span>
                </span>
                <span className="reports-donut-legend__val">
                  {money(item.value)}
                  <span className="reports-donut-legend__pct">{item.pct.toFixed(0)}%</span>
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </section>
  );
}

function BudgetPanel({
  isRange,
  displayedCashUpiCollected,
  salesCollectionsCashUpi,
  loanReceiptsCashUpi,
  openingBudget,
  ledgerDebitSplit,
  salesReturnsCashUpi,
  finalBudgetInHand,
  bankBalance,
}) {
  const bankRail =
    ledgerDebitSplit.bankTransfer +
    ledgerDebitSplit.card +
    ledgerDebitSplit.cheque +
    ledgerDebitSplit.other;

  return (
    <section className="reports-card reports-budget-panel">
      <div className="reports-budget__header">
        <i className="pi pi-wallet reports-budget__icon" aria-hidden />
        <h3 className="reports-card__title">Budget in Hand Summary</h3>
      </div>
      <div className="reports-budget__body">
      <div className="reports-budget__row">
        <span>Sales collections (cash + UPI) {isRange ? '(period)' : '(today)'}</span>
        <strong className="reports-positive">{money(salesCollectionsCashUpi)}</strong>
      </div>
      {loanReceiptsCashUpi > 0 ? (
        <div className="reports-budget__row">
          <span>Loan received (cash + UPI) {isRange ? '(period)' : '(today)'}</span>
          <strong className="reports-positive">{money(loanReceiptsCashUpi)}</strong>
        </div>
      ) : null}
      <div className="reports-budget__row">
        <span>Total cash + UPI inflows (ledger) {isRange ? '(period)' : '(today)'}</span>
        <strong className="reports-positive">{money(displayedCashUpiCollected)}</strong>
      </div>
      <div className="reports-budget__row">
        <span>Total Opening Budget {isRange ? '(period start)' : '(today)'}</span>
        <strong className="reports-positive">{money(openingBudget)}</strong>
      </div>
      <div className="reports-budget__row">
        <span>Sales returns (cash + UPI) {isRange ? '(period)' : '(today)'}</span>
        <strong className="reports-negative">{money(salesReturnsCashUpi)}</strong>
      </div>
      <div className="reports-budget__row">
        <span>Expenses in Cash + UPI {isRange ? '(period)' : '(today)'}</span>
        <strong className="reports-negative">{money(ledgerDebitSplit.cashUpi)}</strong>
      </div>
      <div className="reports-budget__row">
        <span>Expenses in Bank + Card + Cheque {isRange ? '(period)' : '(today)'}</span>
        <strong className="reports-negative">{money(bankRail)}</strong>
      </div>
      {!isRange && bankBalance != null ? (
        <div className="reports-budget__row">
          <span>Bank balance (live)</span>
          <strong>{money(bankBalance)}</strong>
        </div>
      ) : null}
      <div
        className={`reports-budget__row reports-budget__row--final ${
          finalBudgetInHand < 0 ? 'is-negative' : ''
        }`}
      >
        <span>Final Budget in Hand</span>
        <strong>{money(finalBudgetInHand)}</strong>
      </div>
      </div>
    </section>
  );
}

function TableEmpty({ message }) {
  return (
    <td colSpan={99} className="reports-empty">
      <i className="pi pi-file" aria-hidden />
      {message}
    </td>
  );
}

const ROWS_PER_PAGE = 10;

function TablePagination({ page, totalPages, onPageChange }) {
  if (totalPages <= 1) return null;
  return (
    <div className="reports-table-pagination">
      <button
        type="button"
        disabled={page === 0}
        onClick={() => onPageChange(page - 1)}
        className="reports-table-pagination__btn"
      >
        <i className="pi pi-chevron-left" />
      </button>
      <span className="reports-table-pagination__info">
        {page + 1} / {totalPages}
      </span>
      <button
        type="button"
        disabled={page >= totalPages - 1}
        onClick={() => onPageChange(page + 1)}
        className="reports-table-pagination__btn"
      >
        <i className="pi pi-chevron-right" />
      </button>
    </div>
  );
}

const Reports = () => {
  const today = localISODate();
  const [dateFrom, setDateFrom] = useState(today);
  const [dateTo, setDateTo] = useState(today);
  const [findOnDate, setFindOnDate] = useState('');
  const [loadedFrom, setLoadedFrom] = useState(today);
  const [loadedTo, setLoadedTo] = useState(today);

  const [closingData, setClosingData] = useState(null);
  const [salesChargesSummary, setSalesChargesSummary] = useState({
    totalSqftSold: 0,
    totalLabourCharge: 0,
    totalOtherExpensesCharge: 0,
  });
  const [ledgerTransactions, setLedgerTransactions] = useState([]);
  const [budgetSummary, setBudgetSummary] = useState(null);
  const [ledgerBalanceSummary, setLedgerBalanceSummary] = useState(null);

  const [closingLoading, setClosingLoading] = useState(false);
  const [closingError, setClosingError] = useState('');
  const [pdfLoading, setPdfLoading] = useState(false);
  const [billsPage, setBillsPage] = useState(0);
  const [expensesPage, setExpensesPage] = useState(0);

  const isRange = loadedFrom !== loadedTo;
  const datesPendingSearch = dateFrom !== loadedFrom || dateTo !== loadedTo;

  const loadDailyClosing = useCallback(async (from, to) => {
    setClosingLoading(true);
    setClosingError('');
    try {
      const singleDay = from === to;
      const [reportRes, chargesRes, ledgerRes, budgetRes, balanceRes] = await Promise.all([
        fetchDailyClosingReport({ date: from, dateTo: to }),
        fetchSalesChargesSummary({ date: from, dateTo: to }),
        getLedgerTransactions({ from, to, limit: 500 }),
        singleDay ? getDailyBudgetCalculatedSummary({ from, to }) : Promise.resolve(null),
        singleDay ? getBalanceSummary() : Promise.resolve(null),
      ]);

      const report = unwrapEntity(reportRes);
      setClosingData(report);
      setBillsPage(0);
      setExpensesPage(0);
      setSalesChargesSummary(
        unwrapEntity(chargesRes) || {
          totalSqftSold: 0,
          totalLabourCharge: 0,
          totalOtherExpensesCharge: 0,
        }
      );
      setLedgerTransactions(unwrapList(ledgerRes));
      setBudgetSummary(singleDay ? unwrapEntity(budgetRes) : null);
      setLedgerBalanceSummary(singleDay ? unwrapEntity(balanceRes) : null);
      setLoadedFrom(from);
      setLoadedTo(to);
    } catch (e) {
      console.error(e);
      setClosingError(parseReportError(e));
      setClosingData(null);
    } finally {
      setClosingLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDailyClosing(today, today);
  }, [loadDailyClosing, today]);

  useEffect(() => {
    const onLedgerRefresh = () => {
      loadDailyClosing(loadedFrom, loadedTo);
    };
    window.addEventListener('kataria-ledger-refresh', onLedgerRefresh);
    return () => window.removeEventListener('kataria-ledger-refresh', onLedgerRefresh);
  }, [loadDailyClosing, loadedFrom, loadedTo]);

  const paySummary = closingData?.paymentSummary || {};
  const loanByMode = closingData?.loanReceiptsByMode || closingData?.loan_receipts_by_mode || {};
  const cashCollected = Number(paySummary.CASH) || 0;
  const upiCollected = Number(paySummary.UPI) || 0;
  const bankCollected = Number(paySummary.BANK_TRANSFER) || 0;
  const chequeCollected = Number(paySummary.CHEQUE) || 0;
  const otherCollected = Number(paySummary.OTHER) || 0;
  const loanCash = Number(loanByMode.CASH) || 0;
  const loanUpi = Number(loanByMode.UPI) || 0;
  const loanBank = Number(loanByMode.BANK_TRANSFER) || 0;
  const loanCheque = Number(loanByMode.CHEQUE) || 0;
  const loanOther = Number(loanByMode.OTHER) || 0;
  const salesCollectionsCashUpi = cashCollected + upiCollected;
  const loanReceiptsCashUpi = loanCash + loanUpi;
  const totalLoanReceipts = loanCash + loanUpi + loanBank + loanCheque + loanOther;
  const totalInflowDisplay =
    (Number(closingData?.totalCollected) || 0) + loanReceiptsCashUpi;

  const isLedgerInflow = (e) => {
    const t = String(e?.txnType ?? e?.txn_type ?? '').toUpperCase();
    return t === 'CREDIT' || t === 'IN';
  };

  const isLedgerOutflow = (e) => {
    const t = String(e?.txnType ?? e?.txn_type ?? '').toUpperCase();
    return t === 'DEBIT' || t === 'OUT';
  };

  const isSalesReturnLedgerRow = (e) => {
    const src = String(e?.source ?? e?.category ?? '').toUpperCase();
    return src === 'BILL_REVERSAL' || src === 'BILL_RETURN' || src.includes('BILL_PAYMENT_REVERSAL');
  };

  const cashUpiFromLedger = useMemo(() => {
    return (ledgerTransactions || []).reduce((sum, e) => {
      if (!isLedgerInflow(e)) return sum;
      const sub = String(e?.subCategory ?? e?.sub_category ?? '').toUpperCase();
      // Wallet applied to a bill posts as UPI rail but is liability release, not new cash.
      if (sub === 'ADVANCE_APPLICATION') return sum;
      const pm = String(e?.paymentMode ?? e?.payment_mode ?? '').toUpperCase();
      if (pm !== 'CASH' && pm !== 'UPI') return sum;
      const amt = Number(e?.amount);
      return Number.isFinite(amt) && amt > 0 ? sum + amt : sum;
    }, 0);
  }, [ledgerTransactions]);

  const displayedCashUpiCollected =
    cashUpiFromLedger > 0 ? cashUpiFromLedger : cashCollected + upiCollected;

  const salesReturnsCashUpi = useMemo(() => {
    const fromReport = Number(
      closingData?.salesReturns ?? closingData?.sales_returns ?? closingData?.billRefundsCashUpi
    );
    if (Number.isFinite(fromReport) && fromReport > 0) return fromReport;
    return (ledgerTransactions || []).reduce((sum, e) => {
      if (!isLedgerOutflow(e) || !isSalesReturnLedgerRow(e)) return sum;
      const pm = String(e?.paymentMode ?? e?.payment_mode ?? '').toUpperCase();
      if (pm !== 'CASH' && pm !== 'UPI') return sum;
      return sum + (Number(e?.amount) || 0);
    }, 0);
  }, [closingData, ledgerTransactions]);

  const ledgerDebitSplit = useMemo(() => {
    return (ledgerTransactions || []).reduce(
      (acc, e) => {
        if (!isLedgerOutflow(e) || isSalesReturnLedgerRow(e)) return acc;
        const amt = Number(e?.amount) || 0;
        const pm = String(e?.paymentMode ?? e?.payment_mode ?? '').toUpperCase();
        if (pm === 'CASH' || pm === 'UPI') acc.cashUpi += amt;
        else if (pm === 'BANK_TRANSFER' || pm === 'BANK') acc.bankTransfer += amt;
        else if (pm === 'CARD') acc.card += amt;
        else if (pm === 'CHEQUE' || pm === 'CHECK') acc.cheque += amt;
        else acc.other += amt;
        return acc;
      },
      { cashUpi: 0, bankTransfer: 0, card: 0, cheque: 0, other: 0 }
    );
  }, [ledgerTransactions]);

  const openingBudget = useMemo(() => {
    const fromBudget = Number(budgetSummary?.openingBalanceForDay);
    if (Number.isFinite(fromBudget)) return fromBudget;
    const fromFlow = Number(closingData?.cashFlow?.opening);
    if (Number.isFinite(fromFlow)) return fromFlow;
    return 0;
  }, [budgetSummary, closingData]);

  const finalBudgetInHand = useMemo(() => {
    return (
      openingBudget +
      displayedCashUpiCollected -
      salesReturnsCashUpi -
      ledgerDebitSplit.cashUpi
    );
  }, [openingBudget, displayedCashUpiCollected, salesReturnsCashUpi, ledgerDebitSplit.cashUpi]);

  const bankBalance = useMemo(() => {
    if (!ledgerBalanceSummary) return null;
    const v = Number(
      ledgerBalanceSummary.bank ?? ledgerBalanceSummary.bank_balance ?? ledgerBalanceSummary.bankBalance
    );
    return Number.isFinite(v) ? v : null;
  }, [ledgerBalanceSummary]);

  const advanceAvailable = useMemo(() => {
    if (!closingData) return 0;
    const explicit = closingData.totalAdvanceAvailable;
    if (explicit != null) return Number(explicit) || 0;
    return (
      (Number(closingData.totalAdvanceDeposits) || 0) -
      (Number(closingData.totalAdvanceAppliedOnBills) || 0)
    );
  }, [closingData]);

  const collectionsChartData = useMemo(() => {
    return [
      { name: 'Cash', value: cashCollected + loanCash, color: CHART_COLORS.cash },
      { name: 'UPI', value: upiCollected + loanUpi, color: CHART_COLORS.upi },
      { name: 'Bank Transfer', value: bankCollected, color: CHART_COLORS.bank },
      { name: 'Cheque', value: chequeCollected, color: CHART_COLORS.cheque },
      { name: 'Other', value: otherCollected, color: CHART_COLORS.other },
    ];
  }, [
    cashCollected,
    upiCollected,
    loanCash,
    loanUpi,
    bankCollected,
    chequeCollected,
    otherCollected,
  ]);

  const expensesChartData = useMemo(() => {
    const lines = closingData?.expenseLines ?? [];
    const buckets = {
      'Daily Expenses': 0,
      'Loan Repay': 0,
      'Client Payment': 0,
      'Employee Salary': 0,
      'Employee Advance': 0,
      Other: 0,
    };
    for (const ex of lines) {
      const label = classifyExpenseForChart(ex);
      buckets[label] = (buckets[label] || 0) + (Number(ex.amount) || 0);
    }
    const order = [
      'Daily Expenses',
      'Loan Repay',
      'Client Payment',
      'Employee Salary',
      'Employee Advance',
      'Other',
    ];
    return order
      .filter((name) => (buckets[name] || 0) > 0)
      .map((name) => ({
        name,
        value: buckets[name],
        color: EXPENSE_CHART_BUCKET_COLORS[name] || CHART_COLORS.expenseOther,
      }));
  }, [closingData?.expenseLines]);

  const billsRows = closingData?.bills ?? closingData?.billLines ?? [];
  const expenseLines = closingData?.expenseLines ?? [];

  const periodLabel = useMemo(() => {
    if (!loadedFrom || !loadedTo) return '';
    if (loadedFrom === loadedTo) return formatDayLabel(loadedFrom);
    return `${formatDayLabel(loadedFrom)} – ${formatDayLabel(loadedTo)}`;
  }, [loadedFrom, loadedTo]);

  const billsTitle = isRange ? 'Bills in this period' : "Today's Bills";
  const expensesTitle = isRange ? 'Expenses in this period' : "Today's Expenses";

  const applyPreset = (preset) => {
    const { from, to } = preset.getRange();
    setDateFrom(from);
    setDateTo(to);
    loadDailyClosing(from, to);
  };

  const handleSearch = () => loadDailyClosing(dateFrom, dateTo);

  const handleClear = () => {
    const t = localISODate();
    setDateFrom(t);
    setDateTo(t);
    setFindOnDate('');
    loadDailyClosing(t, t);
  };

  const handleFindOnDate = (iso) => {
    setFindOnDate(iso);
    if (!iso) return;
    setDateFrom(iso);
    setDateTo(iso);
    loadDailyClosing(iso, iso);
  };

  const handleBillPdf = async (row) => {
    try {
      await downloadBillPDF(row.billId, row.billType);
    } catch (e) {
      window.alert(parseReportError(e));
    }
  };

  const handleDownloadPdf = async () => {
    if (!closingData) return;
    setPdfLoading(true);
    try {
      const doc = new jsPDF({ unit: 'pt', format: 'a4' });
      const pageW = doc.internal.pageSize.getWidth();
      const margin = 36;
      const contentW = pageW - margin * 2;
      const teal = [0, 77, 77];
      const tealLight = [230, 247, 247];
      const white = [255, 255, 255];
      const rs = (n) => `Rs. ${(Number(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      let y = 0;

      // ── Header banner ──
      doc.setFillColor(...teal);
      doc.rect(0, 0, pageW, 70, 'F');
      doc.setTextColor(...white);
      doc.setFontSize(18);
      doc.setFont(undefined, 'bold');
      doc.text('DAILY CLOSING REPORT', margin + 10, 30);
      doc.setFontSize(10);
      doc.setFont(undefined, 'normal');
      doc.text(`Period:  ${periodLabel}`, margin + 10, 50);

      // Budget badge (right side)
      const budgetText = rs(finalBudgetInHand);
      doc.setFontSize(8);
      doc.setFont(undefined, 'bold');
      doc.text('FINAL BUDGET IN HAND', pageW - margin - 10, 22, { align: 'right' });
      doc.setFontSize(16);
      doc.text(budgetText, pageW - margin - 10, 48, { align: 'right' });

      doc.setTextColor(0, 0, 0);
      y = 85;

      // ── SUMMARY section ──
      doc.setFontSize(11);
      doc.setFont(undefined, 'bold');
      doc.text('SUMMARY', margin, y);
      y += 14;

      const kpiCards = [
        { label: 'TOTAL BILLS', value: String(closingData.totalBills ?? 0) },
        { label: 'TOTAL SALES', value: rs(closingData.totalSales) },
        { label: 'TOTAL PAID', value: rs(closingData.totalPaidOnBills) },
        { label: 'TOTAL DUE', value: rs(closingData.totalDueOnBills) },
        { label: 'TOTAL COLLECTED', value: rs(closingData.totalCollected) },
        { label: 'TOTAL EXPENSES', value: rs(closingData.totalExpenses) },
        { label: 'OPENING BALANCE', value: rs(openingBudget) },
        { label: 'LOAN TAKEN', value: rs(totalLoanReceipts) },
        { label: 'SALES RETURNS', value: rs(salesReturnsCashUpi) },
        { label: 'CASH + UPI IN HAND', value: rs(finalBudgetInHand) },
        { label: 'IN BANK', value: bankBalance != null ? rs(bankBalance) : rs(bankCollected) },
      ];
      const cardCols = 3;
      const cardGap = 8;
      const cardW = (contentW - cardGap * (cardCols - 1)) / cardCols;
      const cardH = 42;
      kpiCards.forEach((card, i) => {
        const col = i % cardCols;
        const row = Math.floor(i / cardCols);
        const cx = margin + col * (cardW + cardGap);
        const cy = y + row * (cardH + cardGap);
        doc.setFillColor(...tealLight);
        doc.roundedRect(cx, cy, cardW, cardH, 4, 4, 'F');
        doc.setFontSize(7);
        doc.setFont(undefined, 'bold');
        doc.setTextColor(80, 80, 80);
        doc.text(card.label, cx + cardW / 2, cy + 14, { align: 'center' });
        doc.setFontSize(12);
        doc.setTextColor(0, 0, 0);
        doc.setFont(undefined, 'bold');
        doc.text(card.value, cx + cardW / 2, cy + 32, { align: 'center' });
      });
      const kpiRows = Math.ceil(kpiCards.length / cardCols);
      y += kpiRows * (cardH + cardGap) + 12;

      // ── BILLS SUMMARY ──
      doc.setFontSize(11);
      doc.setFont(undefined, 'bold');
      doc.setTextColor(0, 0, 0);
      doc.text('BILLS SUMMARY', margin, y);
      y += 8;

      if (billsRows.length > 0) {
        autoTable(doc, {
          startY: y,
          head: [['Date', 'Bill', 'Type', 'Total', 'Paid', 'Due', 'Status']],
          body: billsRows.map((r) => [
            formatShortDate(r.billDate),
            r.billNumber,
            r.billType,
            (r.returnedAmount ?? 0) > 0.005
              ? `${rs(r.totalAmount)} -> ${rs(r.effectiveTotal ?? r.totalAmount)}`
              : rs(r.totalAmount),
            rs(r.paidAmount),
            (r.refundDue ?? 0) > 0.005
              ? `Refund ${rs(r.refundDue)}`
              : rs(r.dueAmount),
            r.status,
          ]),
          headStyles: {
            fillColor: teal,
            textColor: white,
            fontStyle: 'bold',
            fontSize: 8,
            halign: 'left',
          },
          bodyStyles: { fontSize: 8 },
          alternateRowStyles: { fillColor: [248, 250, 252] },
          styles: { cellPadding: 5, lineColor: [226, 232, 240], lineWidth: 0.5 },
          margin: { left: margin, right: margin },
          columnStyles: {
            3: { halign: 'right' },
            4: { halign: 'right' },
            5: { halign: 'right' },
            6: { halign: 'center', fontStyle: 'bold' },
          },
        });
        y = doc.lastAutoTable.finalY + 18;
      } else {
        doc.setFontSize(9);
        doc.setFont(undefined, 'normal');
        doc.setTextColor(100, 100, 100);
        doc.text('No bills in this period.', margin, y + 12);
        y += 28;
      }

      // ── EXPENSES SUMMARY ──
      doc.setFontSize(11);
      doc.setFont(undefined, 'bold');
      doc.setTextColor(0, 0, 0);
      doc.text('EXPENSES SUMMARY', margin, y);
      y += 8;

      if (expenseLines.length > 0) {
        autoTable(doc, {
          startY: y,
          head: [['#', 'Type / Category', 'Amount', 'Mode', 'Notes']],
          body: expenseLines.map((ex) => [
            ex.id,
            [ex.expenseType, ex.category].filter(Boolean).join(' - '),
            rs(ex.amount),
            formatExpenseMode(ex.paymentMethod),
            ex.description || '\u2014',
          ]),
          headStyles: {
            fillColor: teal,
            textColor: white,
            fontStyle: 'bold',
            fontSize: 8,
            halign: 'left',
          },
          bodyStyles: { fontSize: 8 },
          alternateRowStyles: { fillColor: [248, 250, 252] },
          styles: { cellPadding: 5, lineColor: [226, 232, 240], lineWidth: 0.5 },
          margin: { left: margin, right: margin },
          columnStyles: {
            0: { cellWidth: 30, halign: 'center' },
            2: { halign: 'right' },
          },
        });
        y = doc.lastAutoTable.finalY + 18;
      } else {
        doc.setFontSize(9);
        doc.setFont(undefined, 'normal');
        doc.setTextColor(100, 100, 100);
        doc.text('No expenses in this period.', margin, y + 12);
        y += 28;
      }

      y += 4;

      // ── Footer ──
      const pageH = doc.internal.pageSize.getHeight();
      const totalPages = doc.internal.getNumberOfPages();
      doc.setPage(totalPages);
      const lastPageY = totalPages > 1 ? 40 : y;
      const footerY = Math.max(lastPageY + 10, pageH - 55);
      doc.setDrawColor(...teal);
      doc.setLineWidth(0.5);
      doc.line(margin, footerY, pageW - margin, footerY);
      doc.setFillColor(...tealLight);
      doc.roundedRect(margin, footerY + 4, contentW, 42, 4, 4, 'F');

      doc.setFontSize(7);
      doc.setFont(undefined, 'bold');
      doc.setTextColor(...teal);
      doc.text('REPORT OVERVIEW', margin + 10, footerY + 16);
      doc.setFont(undefined, 'normal');
      doc.setFontSize(6.5);
      doc.setTextColor(80, 80, 80);
      doc.text(
        'This report provides a summary of the financial activity including bills, payments,',
        margin + 10, footerY + 26
      );
      doc.text('collections, expenses and the final budget in hand.', margin + 10, footerY + 34);

      doc.setFontSize(8);
      doc.setFont(undefined, 'normal');
      doc.setTextColor(60, 60, 60);
      doc.text('Prepared By', pageW - margin - 10, footerY + 18, { align: 'right' });
      doc.setFont(undefined, 'bold');
      doc.text(`Date:  ${periodLabel}`, pageW - margin - 10, footerY + 32, { align: 'right' });

      doc.save(`daily-closing-${loadedFrom}${loadedTo !== loadedFrom ? `_to_${loadedTo}` : ''}.pdf`);
    } catch (e) {
      console.error(e);
      window.alert('Could not generate PDF.');
    } finally {
      setPdfLoading(false);
    }
  };

  if (closingLoading && !closingData) {
    return (
      <div className="reports-page">
        <Loading message="Loading report…" />
      </div>
    );
  }

  return (
    <div className="reports-page">
      <header className="reports-page__header">
        <div className="reports-page__title-row">
          <div>
            <h1 className="reports-page__title">Daily Closing Report</h1>
            <p className="reports-page__subtitle">
              Track your daily financial summary and closing report.
            </p>
          </div>
          <i
            className="pi pi-info-circle reports-page__info"
            title="Bill totals use bill date; collections use payment date."
            aria-hidden
          />
        </div>
        <button
          type="button"
          className="reports-page__btn-pdf"
          onClick={handleDownloadPdf}
          disabled={!closingData || closingLoading || pdfLoading}
        >
          <i className="pi pi-download" aria-hidden />
          <span>{pdfLoading ? 'Generating…' : 'Download PDF'}</span>
        </button>
      </header>

      <section className="reports-filters" aria-label="Report filters">
        <div className="reports-presets reports-presets--hidden">
          {DATE_PRESETS.map((p) => {
            const r = p.getRange();
            const active = dateFrom === r.from && dateTo === r.to && !datesPendingSearch;
            return (
              <button
                key={p.id}
                type="button"
                className={`reports-preset-btn${active ? ' is-active' : ''}`}
                disabled={closingLoading}
                onClick={() => applyPreset(p)}
              >
                {p.label}
              </button>
            );
          })}
        </div>
        <div className="reports-filters__row">
          <div className="reports-filters__field">
            <label htmlFor="report-from">From (Bill Date &amp; Period Start)</label>
            <input
              id="report-from"
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
            />
          </div>
          <div className="reports-filters__field">
            <label htmlFor="report-to">To (Inclusive)</label>
            <input id="report-to" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </div>
          <div className="reports-filters__field">
            <label htmlFor="report-find">Find on Date</label>
            <input
              id="report-find"
              type="date"
              value={findOnDate}
              onChange={(e) => handleFindOnDate(e.target.value)}
            />
          </div>
          <div className="reports-filters__actions">
            <button type="button" className="reports-filters__btn-clear" onClick={handleClear}>
              Clear
            </button>
            <button
              type="button"
              className="reports-filters__btn-search"
              onClick={handleSearch}
              disabled={closingLoading}
            >
              {closingLoading ? 'Loading…' : 'Search'}
            </button>
          </div>
        </div>
      </section>

      {closingError && (
        <div className="reports-banner reports-banner--error" role="alert">
          {closingError}
        </div>
      )}
      {datesPendingSearch && !closingError && (
        <div className="reports-banner reports-banner--info" role="status">
          Dates changed — click <strong>Search</strong> to refresh the report.
        </div>
      )}
      {closingLoading && closingData && (
        <div className="reports-banner reports-banner--info" role="status">
          Updating report…
        </div>
      )}
      {closingData?.warnings?.length > 0 && (
        <div className="reports-banner reports-banner--warn" role="status">
          <ul>
            {closingData.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      {closingData && (
        <>
          <div className="reports-period-badge reports-period-badge--hidden" role="status">
            <span>{periodLabel}</span>
            {isRange ? <span>Date range</span> : null}
          </div>

          <div className="reports-metrics" aria-label="Key metrics">
            <MetricCard
              icon="pi pi-file"
              tone="bills"
              label="Total Bills"
              value={closingData.totalBills ?? 0}
              hint={`Invoices with bill date in the selected ${isRange ? 'range' : 'day'}`}
            />
            <MetricCard
              icon="pi pi-chart-bar"
              tone="sales"
              label="Gross Sales"
              value={money(closingData.grossSales ?? closingData.totalSales)}
              hint="All bills on bill date (includes later cancelled)"
            />
            <MetricCard
              icon="pi pi-undo"
              tone="due"
              label="Sales Returns"
              value={money(closingData.salesReturns ?? closingData.billRefundsCashUpi ?? 0)}
              hint="Return value on bill date (not expenses)"
            />
            <MetricCard
              icon="pi pi-plus-circle"
              tone="paid"
              label="Supplementary Sales"
              value={money(closingData.supplementarySales ?? 0)}
              hint="Exchange / adjustment bills linked to parent invoices"
            />
            <MetricCard
              icon="pi pi-times-circle"
              tone="due"
              label="Cancelled (bill date)"
              value={money(closingData.cancelledSales ?? 0)}
              hint="Bills on this date marked cancelled"
            />
            <MetricCard
              icon="pi pi-check-circle"
              tone="paid"
              label="Net Sales"
              value={money(closingData.netSales ?? closingData.totalSales)}
              hint="Gross sales − returns + supplementary sales"
            />
            <MetricCard
              icon="pi pi-wallet"
              tone="paid"
              label="Total Paid"
              value={money(closingData.totalPaidOnBills)}
              hint="Allocated on those bills (split payments)"
            />
            <MetricCard
              icon="pi pi-clock"
              tone="due"
              label="Total Due"
              value={money(closingData.totalDueOnBills)}
              hint="Still unpaid on those bills"
            />
            <MetricCard
              icon="pi pi-briefcase"
              tone="opening"
              label="Opening Balance"
              value={money(openingBudget)}
              hint={`Cash + UPI balance at start of ${isRange ? 'period' : 'day'}`}
            />
            <MetricCard
              icon="pi pi-arrow-down-left"
              tone="loan"
              label={`Loan Taken ${isRange ? '(Period)' : 'Today'}`}
              value={money(totalLoanReceipts)}
              hint="Money received as loan (all modes)"
            />
          </div>

          <div className="reports-middle">
            <DonutPanel
              title="Collections & Payments"
              centerLabel="Total Inflow"
              centerValue={money(totalInflowDisplay)}
              data={collectionsChartData}
              emptyMessage="No collections in this period"
            />
            <DonutPanel
              title="Expenses Overview"
              centerLabel="Total Expenses"
              centerValue={money(closingData.totalExpenses)}
              data={expensesChartData}
              emptyMessage="No expenses in this period"
            />
            <BudgetPanel
              isRange={isRange}
              displayedCashUpiCollected={displayedCashUpiCollected}
              salesCollectionsCashUpi={salesCollectionsCashUpi}
              loanReceiptsCashUpi={loanReceiptsCashUpi}
              openingBudget={openingBudget}
              ledgerDebitSplit={ledgerDebitSplit}
              salesReturnsCashUpi={salesReturnsCashUpi}
              finalBudgetInHand={finalBudgetInHand}
              bankBalance={bankBalance}
            />
          </div>

          <div className="reports-bottom-grid">
            <section className="reports-card reports-table-section reports-col-bills">
            <h3 className="reports-card__title">
              {billsTitle}
              {billsRows.length > 0 && (
                <span className="reports-card__count">{billsRows.length}</span>
              )}
            </h3>
            <div className="reports-table-scroll reports-table-scroll--fixed">
              <table className="reports-table daily-bills-table">
                <thead>
                  <tr>
                    <th>Bill Date</th>
                    <th>Bill No.</th>
                    <th>Type</th>
                    <th className="num">Total</th>
                    <th className="num">Paid</th>
                    <th className="num">Due</th>
                    <th className="num">Cash</th>
                    <th className="num">UPI</th>
                    <th className="num">Bank</th>
                    <th className="num">Other</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {billsRows.length === 0 ? (
                    <tr>
                      <TableEmpty message="No bills in this period." />
                    </tr>
                  ) : (
                    billsRows
                      .slice(billsPage * ROWS_PER_PAGE, (billsPage + 1) * ROWS_PER_PAGE)
                      .map((row) => (
                      <tr key={`${row.billType}-${row.billId}`}>
                        <td>{formatShortDate(row.billDate)}</td>
                        <td>
                          <button
                            type="button"
                            className="reports-bill-link"
                            onClick={() => handleBillPdf(row)}
                            title="Download bill PDF"
                          >
                            {row.billNumber}
                          </button>
                        </td>
                        <td>{row.billType}</td>
                        <td className="num">
                          {(row.returnedAmount ?? 0) > 0.005 ? (
                            <span style={{ lineHeight: 1.35 }}>
                              <span style={{ textDecoration: 'line-through', color: '#94a3b8', fontSize: '0.85em' }}>
                                {money(row.totalAmount)}
                              </span>
                              <br />
                              <span style={{ fontWeight: 600 }}>{money(row.effectiveTotal ?? row.totalAmount)}</span>
                            </span>
                          ) : money(row.totalAmount)}
                        </td>
                        <td className="num">{money(row.paidAmount)}</td>
                        <td className="num">
                          {(row.refundDue ?? 0) > 0.005 ? (
                            <span style={{ color: '#dc2626', fontWeight: 600, fontSize: '0.9em' }}>
                              Refund {money(row.refundDue)}
                            </span>
                          ) : money(row.dueAmount)}
                        </td>
                        <td className="num">{money(row.cashAmount)}</td>
                        <td className="num">{money(row.upiAmount)}</td>
                        <td className="num">{money(row.bankTransferAmount)}</td>
                        <td className="num">{money(row.otherAmount)}</td>
                        <td>
                          <span
                            className={`reports-status reports-status--${(row.status || 'due').toLowerCase()}`}
                          >
                            {row.status}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <TablePagination
              page={billsPage}
              totalPages={Math.ceil(billsRows.length / ROWS_PER_PAGE)}
              onPageChange={setBillsPage}
            />
          </section>

            <section className="reports-card reports-table-section reports-col-expenses">
              <h3 className="reports-card__title">
                {expensesTitle}
                {expenseLines.length > 0 && (
                  <span className="reports-card__count">{expenseLines.length}</span>
                )}
              </h3>
              <div className="reports-table-scroll reports-table-scroll--fixed">
                <table className="reports-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Type / Category</th>
                      <th className="num">Amount</th>
                      <th>Mode</th>
                      <th>Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {expenseLines.length === 0 ? (
                      <tr>
                        <TableEmpty message="No expenses in this period." />
                      </tr>
                    ) : (
                      expenseLines
                        .slice(expensesPage * ROWS_PER_PAGE, (expensesPage + 1) * ROWS_PER_PAGE)
                        .map((ex) => (
                        <tr key={ex.id}>
                          <td>{ex.id}</td>
                          <td>{[ex.expenseType, ex.category].filter(Boolean).join(' · ') || '—'}</td>
                          <td className="num">{money(ex.amount)}</td>
                          <td>{formatExpenseMode(ex.paymentMethod)}</td>
                          <td className="reports-notes-cell" title={ex.description || ''}>
                            {ex.description || '—'}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                  {expenseLines.length > 0 ? (
                    <tfoot>
                      <tr>
                        <td colSpan={2}>Total Expenses</td>
                        <td className="num">{money(closingData.totalExpenses)}</td>
                        <td colSpan={2} />
                      </tr>
                    </tfoot>
                  ) : null}
                </table>
              </div>
              <TablePagination
                page={expensesPage}
                totalPages={Math.ceil(expenseLines.length / ROWS_PER_PAGE)}
                onPageChange={setExpensesPage}
              />
            </section>

            <div className="reports-sidebar-col">
            <aside className="reports-card reports-highlights">
              <h3 className="reports-card__title">Day Highlights</h3>
              <ul className="reports-highlights__list">
                <li>
                  <span>
                    <i className="pi pi-briefcase" aria-hidden /> Opening Balance
                  </span>
                  <strong className="reports-positive">{money(openingBudget)}</strong>
                </li>
                <li>
                  <span>
                    <i className="pi pi-arrow-down-left" aria-hidden /> Loan Taken {isRange ? '(Period)' : 'Today'}
                  </span>
                  <strong className={totalLoanReceipts > 0 ? 'reports-positive' : ''}>
                    {money(totalLoanReceipts)}
                  </strong>
                </li>
                <li>
                  <span>
                    <i className="pi pi-chart-line" aria-hidden /> Sold SQFT
                  </span>
                  <strong>
                    {(Number(salesChargesSummary.totalSqftSold) || 0).toLocaleString('en-IN', {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </strong>
                </li>
                <li>
                  <span>
                    <i className="pi pi-money-bill" aria-hidden /> Advance Available
                  </span>
                  <strong>{money(advanceAvailable)}</strong>
                </li>
                <li>
                  <span>
                    <i className="pi pi-users" aria-hidden /> Labour Charge Collected
                  </span>
                  <strong>{money(salesChargesSummary.totalLabourCharge)}</strong>
                </li>
                <li>
                  <span>
                    <i className="pi pi-box" aria-hidden /> Other Expense Charge
                  </span>
                  <strong>{money(salesChargesSummary.totalOtherExpensesCharge)}</strong>
                </li>
              </ul>
            </aside>

            <section className="reports-card reports-paymodes-card">
              <h3 className="reports-card__title">Payment Mode Summary</h3>
              <div className="reports-paymodes" aria-label="Payment mode summary">
            <div className="reports-paymode reports-paymode--cash">
              <span>Cash</span>
              <strong>{money(cashCollected + loanCash)}</strong>
            </div>
            <div className="reports-paymode reports-paymode--upi">
              <span>UPI</span>
              <strong>{money(upiCollected + loanUpi)}</strong>
            </div>
            <div className="reports-paymode reports-paymode--bank">
              <span>Bank</span>
              <strong>{money(bankCollected)}</strong>
            </div>
            <div className="reports-paymode reports-paymode--cheque">
              <span>Cheque</span>
              <strong>{money(chequeCollected)}</strong>
            </div>
            <div className="reports-paymode reports-paymode--other">
              <span>Other</span>
              <strong>{money(otherCollected)}</strong>
            </div>
              </div>
            </section>
            </div>
          </div>
        </>
      )}

      {!closingData && !closingError && !closingLoading && (
        <p className="reports-chart-empty">No report data.</p>
      )}

      <footer className="reports-footer-bar">
        All amounts are in INR (₹) · Report generated for {periodLabel || formatDayLabel(today)}
      </footer>
    </div>
  );
};

export default Reports;




