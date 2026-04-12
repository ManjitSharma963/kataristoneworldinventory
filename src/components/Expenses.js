import React, { useState, useEffect, useMemo, useCallback } from 'react';
// Note: localStorage functions are no longer used - all data comes from API
// Keeping imports for potential future use or reference, but not actively used
import { getExpenses, addExpense, updateExpense, deleteExpense, getEmployees, addEmployee, updateEmployee, deleteEmployee } from '../utils/storage';
import { 
  fetchExpenses as apiFetchExpenses, 
  createExpense as apiCreateExpense, 
  updateExpense as apiUpdateExpense, 
  deleteExpense as apiDeleteExpense,
  fetchEmployees as apiFetchEmployees,
  fetchEmployeePayrollSummary,
  fetchEmployeePayrollLedger,
  recordEmployeeAdvance,
  settleEmployeeSalaryMonth,
  createEmployee as apiCreateEmployee,
  updateEmployee as apiUpdateEmployee,
  deleteEmployee as apiDeleteEmployee,
  fetchClientPurchases,
  createClientPurchase,
  updateClientPurchase,
  deleteClientPurchase,
  addClientPayment,
  fetchAllPayments,
  getDailyBudget as apiGetDailyBudget,
  getDailyBudgetByDate as apiGetDailyBudgetByDate,
  getDailyBudgetCalculatedSummary as apiGetDailyBudgetCalculatedSummary,
  getDailyBudgetEvents as apiGetDailyBudgetEvents,
  recordLoanReceipt as apiRecordLoanReceipt,
  fetchLoanLenders as apiFetchLoanLenders,
  fetchLoanLenderLedger as apiFetchLoanLenderLedger,
  createDailyBudget as apiCreateDailyBudget,
  updateDailyBudget as apiUpdateDailyBudget,
  deleteDailyBudget as apiDeleteDailyBudget,
  fetchSuppliers as apiFetchSuppliers
} from '../utils/api';
import { useForm } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import { expenseSchema, employeeSchema, salaryPaymentSchema, advancePaymentSchema, clientPurchaseSchema, clientPaymentSchema } from '../utils/validation';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import Loading from './Loading';
import ConfirmationModal from './ConfirmationModal';
import './Expenses.css';

/** Payment-channel bucket shown in budget history “Source” column. */
const BUDGET_SOURCE_CASH_UPI = 'Cash + UPI';
const BUDGET_SOURCE_BANK = 'Bank + card + cheque';

/**
 * Channel for a daily_budget_events row. Today all persisted events are in-hand (cash/UPI).
 * Reserve BANK_* (or similar) for a future split if those ever post here.
 */
function budgetHistorySourceChannel(entry) {
  const raw = entry?.eventType ?? entry?.event_type ?? '';
  const code = String(raw).trim().toUpperCase();
  if (code.startsWith('BANK_')) return BUDGET_SOURCE_BANK;
  return BUDGET_SOURCE_CASH_UPI;
}

/** What happened (detail); channel is shown separately as Source. */
function formatBudgetHistoryDetail(entry) {
  const raw = entry?.eventType ?? entry?.event_type ?? '';
  const code = String(raw).trim().toUpperCase();
  const labels = {
    IN_HAND_COLLECTION: 'Bill collection',
    LOAN_RECEIVED: 'Loan received',
    EXPENSE_DEBIT: 'Expense paid',
    EXPENSE_CREDIT: 'Expense reversal / credit',
    BUDGET_SET: 'Daily budget set',
    BUDGET_CLEARED: 'Daily budget cleared',
    BUDGET_UPDATE: 'Budget update',
    ROLL_OVER: 'New day — carry forward balance',
    IN_HAND_COLLECTION_ADJUSTMENT: 'Adjustment (bill / payment edit)',
    IN_HAND_INCREASE: 'In-hand increase',
    IN_HAND_DECREASE: 'In-hand decrease'
  };
  if (code && labels[code]) return labels[code];
  if (code) return `Other (${code.replace(/_/g, ' ')})`;
  return '—';
}

const Expenses = ({ hideHeader = false, hideStats = false, showAddButtonInHeader = false, showForm: externalShowForm = null, onFormClose = null, onFormOpen = null, onExpenseUpdate = null }) => {
  const [expenses, setExpenses] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [payrollSummaryByEmpId, setPayrollSummaryByEmpId] = useState({});
  const [internalShowForm, setInternalShowForm] = useState(false);
  
  // Use external showForm if provided, otherwise use internal state
  const showForm = externalShowForm !== null ? externalShowForm : internalShowForm;
  
  const handleAddClick = () => {
    if (externalShowForm !== null && onFormOpen) {
      // External control - open the form
      onFormOpen();
    } else {
      setInternalShowForm(true);
    }
    const today = getLocalDateString();
    // Reset form data when opening
    setFormData({
      date: today,
      category: '',
      description: '',
      amount: '',
      paymentMethod: 'cash',
      employeeId: ''
    });
    // Sync react-hook-form so submitted date is today (form uses register, not formData)
    setExpenseValue('date', today);
    setExpenseValue('employeeId', '');
    setExpenseValue('lenderId', '');
    setShowCustomCategoryInput(false);
    setCustomCategoryDraft('');
    setEditingExpense(null);
  };
  
  // Update internal state when external state changes
  useEffect(() => {
    if (externalShowForm !== null) {
      // External control - don't use internal state
    }
  }, [externalShowForm]);
  const [editingExpense, setEditingExpense] = useState(null);
  const [filterType, setFilterType] = useState('all'); // all, daily
  const [activeTab, setActiveTab] = useState('all'); // all | loan | employee | client
  const [showSalaryForm, setShowSalaryForm] = useState(false);
  const [showPaySalaryForm, setShowPaySalaryForm] = useState(false);
  const [showPayAdvanceForm, setShowPayAdvanceForm] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [clientPayments, setClientPayments] = useState([]);
  const [allPayments, setAllPayments] = useState([]); // All payments from API
  const [showClientPurchaseForm, setShowClientPurchaseForm] = useState(false);
  const [showClientPaymentForm, setShowClientPaymentForm] = useState(false);
  const [selectedClientPurchase, setSelectedClientPurchase] = useState(null);
  const [clientFilter, setClientFilter] = useState(''); // Filter by client name
  const [showPaymentsTable, setShowPaymentsTable] = useState(false); // Toggle between purchases and payments view
  const [searchQuery, setSearchQuery] = useState('');
  const [dateFilter, setDateFilter] = useState({ start: '', end: '' });
  // Start with 0 so we always show database value after fetch; never show stale localStorage first
  const [budgetInHand, setBudgetInHand] = useState(0);
  /** Card "Daily available balance": GET /budget/daily/summary (server-computed for the date range). */
  const [todayFromEvents, setTodayFromEvents] = useState({ expense: 0, remaining: 0 });
  /**
   * Channel debit/credit totals from GET …/calculated-summary (full picture: expenses + bills + loans + client/advance).
   * null field ⇒ fall back to summing today’s expense list only for that slice.
   */
  const [channelBudgetSummary, setChannelBudgetSummary] = useState({
    bankCredits: null,
    bankDebits: null,
    cashUpiDebits: null,
    bankOpeningCarried: null,
    bankBalanceWithOpening: null,
  });
  const [currentPage, setCurrentPage] = useState(1);
  // Default to sorting by date (newest first) for all tabs
  const [sortConfig, setSortConfig] = useState({ key: 'date', direction: 'desc' });
  const [expandedExpenses, setExpandedExpenses] = useState(new Set());
  const [expandedEmployees, setExpandedEmployees] = useState(new Set());
  const [toast, setToast] = useState(null);
  const [confirmModal, setConfirmModal] = useState({ isOpen: false, onConfirm: null, title: '', message: '' });
  const [showDailyBudgetModal, setShowDailyBudgetModal] = useState(false);
  const [dailyBudgetModalValue, setDailyBudgetModalValue] = useState('');
  const [hasDailyBudgetFromApi, setHasDailyBudgetFromApi] = useState(false);
  const [savingBudget, setSavingBudget] = useState(false);
  const [budgetHistory, setBudgetHistory] = useState([]);
  const [loadingBudgetHistory, setLoadingBudgetHistory] = useState(false);
  const [budgetHistoryDateRange, setBudgetHistoryDateRange] = useState({ from: '', to: '' });
  const [budgetHistoryTypeFilter, setBudgetHistoryTypeFilter] = useState('ALL');
  const [editingBudgetEntryId, setEditingBudgetEntryId] = useState(null);
  const [editingBudgetAmount, setEditingBudgetAmount] = useState('');
  const [loanReceiptAmount, setLoanReceiptAmount] = useState('');
  /** '' = unspecified, '__new__' = type new name, else lender id string */
  const [loanReceiptLenderSelect, setLoanReceiptLenderSelect] = useState('');
  const [loanReceiptNewLenderName, setLoanReceiptNewLenderName] = useState('');
  const [loanReceiptPaymentMode, setLoanReceiptPaymentMode] = useState('cash'); // cash | upi | bank_transfer | cheque
  const [submittingLoanReceipt, setSubmittingLoanReceipt] = useState(false);
  const [loanLenders, setLoanLenders] = useState([]);
  const [loadingLoanLenders, setLoadingLoanLenders] = useState(false);
  const [loanHistoryModal, setLoanHistoryModal] = useState({
    open: false,
    lender: null,
    rows: [],
    loading: false,
  });
  const [showEmployeeLedgerModal, setShowEmployeeLedgerModal] = useState(false);
  const [selectedLedgerEmployee, setSelectedLedgerEmployee] = useState(null);
  const [employeeLedgerRows, setEmployeeLedgerRows] = useState([]);
  const [employeeLedgerLoading, setEmployeeLedgerLoading] = useState(false);
  const [employeeLedgerRange, setEmployeeLedgerRange] = useState(() => {
    const to = new Date();
    const from = new Date();
    from.setMonth(from.getMonth() - 6);
    const toStr = `${to.getFullYear()}-${String(to.getMonth() + 1).padStart(2, '0')}-${String(to.getDate()).padStart(2, '0')}`;
    const fromStr = `${from.getFullYear()}-${String(from.getMonth() + 1).padStart(2, '0')}-${String(from.getDate()).padStart(2, '0')}`;
    return { from: fromStr, to: toStr };
  });
  const itemsPerPage = 10;

  // Use local date (not UTC) so "today" is correct in all timezones (e.g. India)
  const getLocalDateString = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  const getLocalMonthString = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  };
  const currentMonth = getLocalMonthString();
  // Convert Date (from yup) or string to local YYYY-MM-DD so API always gets correct date (not UTC ISO)
  const toLocalDateString = (date) => {
    if (date == null) return getLocalDateString();
    const d = date instanceof Date ? date : new Date(date);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  // Toast notification helper
  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  // Confirmation modal helper
  const showConfirm = (title, message, onConfirm) => {
    setConfirmModal({
      isOpen: true,
      title,
      message,
      onConfirm: () => {
        setConfirmModal({ isOpen: false, onConfirm: null, title: '', message: '' });
        onConfirm();
      }
    });
  };

  const toggleExpense = (expenseId) => {
    setExpandedExpenses(prev => {
      const newSet = new Set(prev);
      if (newSet.has(expenseId)) {
        newSet.delete(expenseId);
      } else {
        newSet.add(expenseId);
      }
      return newSet;
    });
  };

  // Parse amount from API response (handles DB row amount, budgetAmount, nested shapes, etc.)
  const getBudgetAmountFromResponse = (res) => {
    if (res == null || typeof res !== 'object') return 0;
    const raw =
      res.budgetAmount ??
      res.amount ??
      res.dailyBudget ??
      res.value ??
      res.data?.budgetAmount ??
      res.data?.amount ??
      res.data?.dailyBudget ??
      res.data?.value ??
      res.budget?.amount ??
      res.dailyBudget?.amount ??
      res.dailyBudget?.budgetAmount;
    const num = Number(raw);
    return Number.isFinite(num) ? Math.max(0, num) : 0;
  };

  const unwrapApiPayload = (x) => {
    if (x != null && typeof x === 'object' && x.data != null && typeof x.data === 'object' && !Array.isArray(x.data)) {
      return x.data;
    }
    return x;
  };

  /** One backend call: cap (modal), remaining + today's spent (same basis as Reports / Daily Closing). */
  const loadBudgetState = async () => {
    const todayStr = getLocalDateString();
    try {
      const raw = await apiGetDailyBudgetCalculatedSummary({ from: todayStr, to: todayStr });
      const s = unwrapApiPayload(raw);
      const cap = Number(s?.budgetAmount ?? s?.budget_amount);
      const spent = Number(s?.spentAmount ?? s?.spent_amount);
      const rem = Number(s?.remainingAmount ?? s?.remaining_amount);
      setBudgetInHand(Number.isFinite(cap) ? Math.max(0, cap) : 0);
      setHasDailyBudgetFromApi(true);
      setTodayFromEvents({
        remaining: Number.isFinite(rem) ? rem : 0,
        expense: Number.isFinite(spent) ? Math.max(0, spent) : 0,
      });
      const bcPrimary = Number(s?.bankCreditsInRange ?? s?.bank_credits_in_range);
      const bcFallback = Number(s?.loanReceiptsBankChequeInRange ?? s?.loan_receipts_bank_cheque_in_range);
      const bankCreditsVal = Number.isFinite(bcPrimary) ? bcPrimary : bcFallback;
      const bd = Number(s?.bankDebitsInRange ?? s?.bank_debits_in_range);
      const cud = Number(s?.cashUpiDebitsInRange ?? s?.cash_upi_debits_in_range);
      const bankOpen = Number(s?.bankOpeningBalanceCarriedForward ?? s?.bank_opening_balance_carried_forward);
      const bankWithOpen = Number(s?.bankBalanceIncludingOpening ?? s?.bank_balance_including_opening);
      setChannelBudgetSummary({
        bankCredits: Number.isFinite(bankCreditsVal) ? Math.max(0, bankCreditsVal) : null,
        bankDebits: Number.isFinite(bd) ? Math.max(0, bd) : null,
        cashUpiDebits: Number.isFinite(cud) ? Math.max(0, cud) : null,
        bankOpeningCarried: Number.isFinite(bankOpen) ? bankOpen : null,
        bankBalanceWithOpening: Number.isFinite(bankWithOpen) ? bankWithOpen : null,
      });
      try {
        localStorage.setItem('expenses_budget_in_hand', String(Number.isFinite(cap) ? Math.max(0, cap) : 0));
      } catch (_) {}
    } catch (e) {
      try {
        const resRaw = await apiGetDailyBudgetByDate(todayStr);
        const res = unwrapApiPayload(resRaw);
        const amount = getBudgetAmountFromResponse(res);
        const remFallback = Number(res?.remainingAmount ?? res?.remaining_amount);
        setBudgetInHand(amount);
        setHasDailyBudgetFromApi(true);
        setTodayFromEvents({
          remaining: Number.isFinite(remFallback) ? remFallback : 0,
          expense: Number.isFinite(Number(res?.spentAmount ?? res?.spent_amount))
            ? Math.max(0, Number(res.spentAmount ?? res.spent_amount))
            : 0,
        });
        setChannelBudgetSummary({
          bankCredits: null,
          bankDebits: null,
          cashUpiDebits: null,
          bankOpeningCarried: null,
          bankBalanceWithOpening: null,
        });
        try {
          localStorage.setItem('expenses_budget_in_hand', String(amount));
        } catch (_) {}
      } catch (e2) {
        try {
          const resRaw = await apiGetDailyBudget();
          const res = unwrapApiPayload(resRaw);
          const amount = getBudgetAmountFromResponse(res);
          const remF = Number(res?.remainingAmount ?? res?.remaining_amount);
          setBudgetInHand(amount);
          setHasDailyBudgetFromApi(true);
          setTodayFromEvents({
            remaining: Number.isFinite(remF) ? remF : 0,
            expense: Number.isFinite(Number(res?.spentAmount ?? res?.spent_amount))
              ? Math.max(0, Number(res.spentAmount ?? res.spent_amount))
              : 0,
          });
          setChannelBudgetSummary({
            bankCredits: null,
            bankDebits: null,
            cashUpiDebits: null,
            bankOpeningCarried: null,
            bankBalanceWithOpening: null,
          });
          try {
            localStorage.setItem('expenses_budget_in_hand', String(amount));
          } catch (_) {}
        } catch (e3) {
          try {
            const saved = localStorage.getItem('expenses_budget_in_hand');
            const val = saved !== null && saved !== '' ? Math.max(0, parseFloat(saved) || 0) : 0;
            setBudgetInHand(val);
          } catch (err) {
            setBudgetInHand(0);
          }
          setHasDailyBudgetFromApi(false);
          setTodayFromEvents({ expense: 0, remaining: 0 });
          setChannelBudgetSummary({
            bankCredits: null,
            bankDebits: null,
            cashUpiDebits: null,
            bankOpeningCarried: null,
            bankBalanceWithOpening: null,
          });
        }
      }
    }
  };

  // Automatically fetch daily budget when user opens the Expenses tab (component mounts)
  useEffect(() => {
    loadBudgetState();
  }, []);

  const loadLoanLenders = async () => {
    setLoadingLoanLenders(true);
    try {
      const list = await apiFetchLoanLenders();
      setLoanLenders(Array.isArray(list) ? list : []);
    } catch (e) {
      console.error('loadLoanLenders', e);
      setLoanLenders([]);
      showToast(e?.message || 'Could not load lenders. Check login and try again.', 'error');
    } finally {
      setLoadingLoanLenders(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'loan') {
      loadLoanLenders();
    }
  }, [activeTab]);

  useEffect(() => {
    if (showForm) {
      loadLoanLenders();
    }
  }, [showForm]);

  const handleRecordLoanReceipt = async (e) => {
    e.preventDefault();
    const amt = parseFloat(String(loanReceiptAmount).replace(/,/g, ''), 10);
    if (!Number.isFinite(amt) || amt <= 0) {
      showToast('Enter a valid loan amount.', 'error');
      return;
    }
    const sel = String(loanReceiptLenderSelect || '').trim();
    if (sel === '__new__') {
      const nm = String(loanReceiptNewLenderName || '').trim();
      if (!nm) {
        showToast('Enter the new lender name, or pick an existing lender.', 'error');
        return;
      }
    }
    setSubmittingLoanReceipt(true);
    try {
      const payload = { amount: amt };
      if (loanReceiptPaymentMode) {
        payload.paymentMode = String(loanReceiptPaymentMode).trim();
      }
      if (sel === '__new__') {
        payload.lenderName = String(loanReceiptNewLenderName || '').trim();
      } else if (sel !== '' && /^\d+$/.test(sel)) {
        payload.lenderId = parseInt(sel, 10);
      }
      await apiRecordLoanReceipt(payload);
      let toastName = '';
      if (sel === '__new__') {
        toastName = String(loanReceiptNewLenderName || '').trim();
      } else if (sel !== '' && /^\d+$/.test(sel)) {
        const row = loanLenders.find((x) => String(x.id) === sel);
        toastName = row ? (row.displayName ?? row.display_name ?? '') : '';
      }
      setLoanReceiptAmount('');
      setLoanReceiptLenderSelect('');
      setLoanReceiptNewLenderName('');
      setLoanReceiptPaymentMode('cash');
      await loadBudgetState();
      await loadLoanLenders();
      showToast(
        toastName
          ? `Loan recorded (${toastName}).`
          : 'Loan recorded.'
      );
    } catch (err) {
      console.error('recordLoanReceipt', err);
      showToast(err?.message || 'Failed to record loan.', 'error');
    } finally {
      setSubmittingLoanReceipt(false);
    }
  };

  const openLoanLenderHistory = async (lender) => {
    if (!lender?.id) return;
    setLoanHistoryModal({ open: true, lender, rows: [], loading: true });
    try {
      const rows = await apiFetchLoanLenderLedger(lender.id);
      setLoanHistoryModal((m) => ({
        ...m,
        rows: Array.isArray(rows) ? rows : [],
        loading: false,
      }));
    } catch (err) {
      console.error('lender ledger', err);
      setLoanHistoryModal((m) => ({ ...m, rows: [], loading: false }));
      showToast(err?.message || 'Failed to load history.', 'error');
    }
  };

  const closeLoanHistoryModal = () => {
    setLoanHistoryModal({ open: false, lender: null, rows: [], loading: false });
  };

  const loadBudgetHistory = async () => {
    setLoadingBudgetHistory(true);
    try {
      const list = await apiGetDailyBudgetEvents({ limit: 50 });
      const arr = Array.isArray(list) ? list : [];
      // Backend already returns newest-first (createdAt DESC).
      setBudgetHistory(arr.slice(0, 20));
    } catch (_) {
      setBudgetHistory([]);
    } finally {
      setLoadingBudgetHistory(false);
    }
  };

  useEffect(() => {
    if (showDailyBudgetModal) loadBudgetHistory();
  }, [showDailyBudgetModal]);

  const budgetTxTypeFromRow = (opening, closing) => (
    Number.isFinite(opening) && Number.isFinite(closing) && closing >= opening ? 'CREDIT' : 'DEBIT'
  );

  const budgetHistoryRows = useMemo(() => {
    return (budgetHistory || []).map((entry, idx) => {
      const opening = Number(
        entry.openingBalance ??
        entry.amount ??
        entry.budgetAmount ??
        0
      );
      const closing = Number(
        entry.closingBalance ??
        entry.remainingBudget ??
        entry.remaining_budget ??
        0
      );
      const txType = budgetTxTypeFromRow(opening, closing);
      const txAmount = Number.isFinite(opening) && Number.isFinite(closing) ? Math.abs(closing - opening) : 0;
      const dateStr = entry.date ?? entry.createdAt ?? entry.updatedAt ?? entry.created_at ?? entry.updated_at ?? '';
      const displayDate = dateStr ? (String(dateStr).length >= 10 ? String(dateStr).slice(0, 10) : String(dateStr)) : '—';
      const sourceChannel = budgetHistorySourceChannel(entry);
      const detailLabel = formatBudgetHistoryDetail(entry);
      return { entry, idx, opening, closing, txType, txAmount, displayDate, sourceChannel, detailLabel };
    });
  }, [budgetHistory]);

  const filteredBudgetHistoryRows = useMemo(() => {
    const from = budgetHistoryDateRange.from || '';
    const to = budgetHistoryDateRange.to || '';
    return budgetHistoryRows.filter((row) => {
      if (budgetHistoryTypeFilter !== 'ALL' && row.txType !== budgetHistoryTypeFilter) return false;
      if (row.displayDate === '—') return false;
      if (from && row.displayDate < from) return false;
      if (to && row.displayDate > to) return false;
      return true;
    });
  }, [budgetHistoryRows, budgetHistoryTypeFilter, budgetHistoryDateRange]);

  const downloadBudgetHistoryPdf = () => {
    const rows = filteredBudgetHistoryRows;
    if (!rows.length) {
      showToast('No budget history rows to download for selected filters.', 'error');
      return;
    }
    const doc = new jsPDF({ unit: 'pt', format: 'a4' });
    doc.setFontSize(14);
    doc.text('Budget History', 40, 36);
    doc.setFontSize(10);
    const fromText = budgetHistoryDateRange.from || 'Any';
    const toText = budgetHistoryDateRange.to || 'Any';
    const typeText = budgetHistoryTypeFilter || 'ALL';
    doc.text(`Filters: From ${fromText} | To ${toText} | Type ${typeText}`, 40, 54);
    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    doc.text(`This table: ${BUDGET_SOURCE_CASH_UPI} only.`, 40, 66);
    doc.text(`${BUDGET_SOURCE_BANK}: see Amount in bank on Expenses.`, 40, 76);
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(10);
    autoTable(doc, {
      startY: 86,
      head: [['Date', 'Source', 'Details', 'Opening balance', 'Type', 'Transaction amount', 'Remaining amount']],
      body: rows.map((r) => [
        r.displayDate,
        r.sourceChannel,
        r.detailLabel,
        (Number.isFinite(r.opening) ? r.opening : 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
        r.txType,
        (Number.isFinite(r.txAmount) ? r.txAmount : 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
        (Number.isFinite(r.closing) ? r.closing : 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      ]),
      styles: { fontSize: 9, cellPadding: 5 },
      headStyles: { fillColor: [79, 70, 229] },
    });
    const today = getLocalDateString();
    doc.save(`budget-history-${today}.pdf`);
  };

  const saveDailyBudgetToApi = async (amount) => {
    const num = Number.isFinite(amount) ? Math.max(0, amount) : 0;
    if (num > 0) {
      if (hasDailyBudgetFromApi) {
        await apiUpdateDailyBudget(num);
      } else {
        await apiCreateDailyBudget(num);
      }
      setBudgetInHand(num);
      setHasDailyBudgetFromApi(true);
    } else {
      await apiDeleteDailyBudget();
      setBudgetInHand(0);
      setHasDailyBudgetFromApi(false);
    }
  };

  useEffect(() => {
    try {
      if (budgetInHand !== '' && budgetInHand !== null && !isNaN(parseFloat(budgetInHand))) {
        localStorage.setItem('expenses_budget_in_hand', String(budgetInHand));
      }
    } catch (e) {
      // ignore
    }
  }, [budgetInHand]);

  const toggleEmployee = (employeeId) => {
    setExpandedEmployees(prev => {
      const newSet = new Set(prev);
      if (newSet.has(employeeId)) {
        newSet.delete(employeeId);
      } else {
        newSet.add(employeeId);
      }
      return newSet;
    });
  };

  // React Hook Form for expense form
  const { 
    register: registerExpense, 
    handleSubmit: handleExpenseSubmit, 
    reset: resetExpense, 
    setValue: setExpenseValue,
    watch: watchExpense,
    formState: { errors: expenseErrors } 
  } = useForm({
    resolver: yupResolver(expenseSchema),
    defaultValues: {
      date: getLocalDateString(),
      category: '',
      description: '',
      amount: '',
      paymentMethod: 'cash',
      employeeId: '',
      lenderId: '',
    }
  });

  // Keep formData for backward compatibility with existing code
  const [formData, setFormData] = useState({
    date: getLocalDateString(),
    category: '',
    description: '',
    amount: '',
    paymentMethod: 'cash',
    employeeId: ''
  });

  const [salaryFormData, setSalaryFormData] = useState({
    employeeName: '',
    salaryAmount: '',
    joiningDate: getLocalDateString()
  });

  const [paySalaryFormData, setPaySalaryFormData] = useState({
    month: getLocalMonthString(), // YYYY-MM format
    date: getLocalDateString(),
    paymentMethod: 'cash',
    amount: ''
  });

  const [payAdvanceFormData, setPayAdvanceFormData] = useState({
    employeeId: '',
    amount: '',
    date: getLocalDateString()
  });
  const selectedExpenseCategory = String(watchExpense('category') || '').toLowerCase();
  const watchedLenderId = watchExpense('lenderId');
  const watchedExpenseAmount = watchExpense('amount');

  /** Negative outstanding = repaid more than borrowed (credit / overpaid). */
  const formatLenderOutstandingLabel = (out) => {
    const n = Number(out) || 0;
    const abs = Math.abs(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (n < -0.005) return `₹${abs} credit (overpaid)`;
    if (n > 0.005) return `₹${abs} left to repay`;
    return '₹0.00 (settled)';
  };

  const loanRepayLenderSummary = useMemo(() => {
    if (!watchedLenderId) return null;
    const l = loanLenders.find((x) => String(x.id) === String(watchedLenderId));
    if (!l) return null;
    const borrowed = Number(l.totalBorrowed ?? l.total_borrowed ?? 0) || 0;
    const repaid = Number(l.totalRepaid ?? l.total_repaid ?? 0) || 0;
    const outstanding = Number(l.outstanding ?? 0) || 0;
    return {
      name: l.displayName ?? l.display_name ?? `Lender #${l.id}`,
      borrowed,
      repaid,
      outstanding,
    };
  }, [watchedLenderId, loanLenders]);

  const loanRepayOverpayHint = useMemo(() => {
    if (selectedExpenseCategory !== 'loan_repayment' || !loanRepayLenderSummary) return null;
    const amt = parseFloat(String(watchedExpenseAmount || '').replace(/,/g, ''), 10);
    if (!Number.isFinite(amt) || amt <= 0) return null;
    const out = loanRepayLenderSummary.outstanding;
    if (out < -0.005) {
      return {
        kind: 'credit',
        message: `This lender already shows a credit (you overpaid by ₹${Math.abs(out).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}). This payment will increase that credit.`,
      };
    }
    if (amt > out + 0.005) {
      const extra = amt - out;
      return {
        kind: 'overpay',
        message: `₹${amt.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} is more than remaining ₹${out.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}. Extra ₹${extra.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} will show as lender credit after save.`,
      };
    }
    return null;
  }, [selectedExpenseCategory, loanRepayLenderSummary, watchedExpenseAmount]);

  const loanLendersTotals = useMemo(() => {
    let totalBorrowed = 0;
    let totalRepaid = 0;
    let totalOutstanding = 0;
    let totalOverpay = 0;
    for (const l of loanLenders) {
      totalBorrowed += Number(l.totalBorrowed ?? l.total_borrowed ?? 0) || 0;
      totalRepaid += Number(l.totalRepaid ?? l.total_repaid ?? 0) || 0;
      const out = Number(l.outstanding ?? 0) || 0;
      totalOutstanding += out;
      if (out < -0.005) totalOverpay += Math.abs(out);
    }
    return {
      count: loanLenders.length,
      totalBorrowed,
      totalRepaid,
      totalOutstanding,
      totalOverpay,
    };
  }, [loanLenders]);

  const formatLoanInr = (n) =>
    `₹${(Number(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  // Allow adding custom category names from the UI.
  // Backend accepts any string for `category` (it is saved as-is).
  const predefinedExpenseCategories = [
    'water',
    'electricity',
    'petrol',
    'grocery',
    'rent',
    'maintenance',
    'transport',
    'loan_repayment',
    'employee',
    'other',
  ];
  const [showCustomCategoryInput, setShowCustomCategoryInput] = useState(false);
  const [customCategoryDraft, setCustomCategoryDraft] = useState('');

  const toTitleCase = (s) => String(s || '')
    .trim()
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (m) => m.toUpperCase());

  const formatExpenseCategoryLabel = (cat) => {
    const c = String(cat || '').trim().toLowerCase();
    if (c === 'loan_repayment' || c === 'loan_repay') return 'Loan Repay';
    if (!cat) return '';
    return String(cat).charAt(0).toUpperCase() + String(cat).slice(1);
  };

  // Build dropdown options from existing saved expenses so custom categories remain reusable.
  const customCategoryOptions = useMemo(() => {
    const map = new Map(); // normalized -> raw category
    (Array.isArray(expenses) ? expenses : []).forEach((ex) => {
      const c = String(ex?.category || '').trim();
      if (!c) return;
      const normalized = c.toLowerCase();
      if (predefinedExpenseCategories.includes(normalized)) return;
      if (!map.has(normalized)) map.set(normalized, c);
    });
    return Array.from(map.values()).sort((a, b) => String(a).localeCompare(String(b)));
  }, [expenses]);

  const [clientPurchaseFormData, setClientPurchaseFormData] = useState({
    purchaseDescription: '',
    totalAmount: '',
    purchaseDate: getLocalDateString(),
    notes: ''
  });
  /** Suppliers master (GET /suppliers) for client purchase picker. */
  const [suppliersList, setSuppliersList] = useState([]);
  const [loadingSuppliersForPurchase, setLoadingSuppliersForPurchase] = useState(false);
  /** '' | `s:{id}` | `p:{encodedName}` | '__new__' */
  const [clientPurchaseSupplierSelect, setClientPurchaseSupplierSelect] = useState('');
  const [clientPurchaseNewSupplierName, setClientPurchaseNewSupplierName] = useState('');
  const [clientPurchaseSupplierSearchQuery, setClientPurchaseSupplierSearchQuery] = useState('');

  const [clientPaymentFormData, setClientPaymentFormData] = useState({
    purchaseId: '',
    amount: '',
    date: getLocalDateString(),
    paymentMethod: 'cash',
    notes: ''
  });
  const [submittingPayment, setSubmittingPayment] = useState(false);

  const [loadingEmployees, setLoadingEmployees] = useState(false);
  const [loadingExpenses, setLoadingExpenses] = useState(false);
  const [apiError, setApiError] = useState(false);

  useEffect(() => {
    loadExpenses();
    loadEmployees();
    loadPayrollSummary();
    loadClientPayments();
    loadAllPayments();
  }, []);

  const loadClientPayments = async () => {
    try {
      // Try to fetch from API first
      const purchases = await fetchClientPurchases();
      if (purchases && Array.isArray(purchases)) {
        // Fetch all payments and merge them into purchases to ensure paid amounts are accurate
        try {
          const allPayments = await fetchAllPayments();
          if (allPayments && Array.isArray(allPayments)) {
            // Group payments by purchaseId/clientPurchaseId
            const paymentsByPurchase = {};
            allPayments.forEach(payment => {
              const purchaseId = String(payment.clientPurchaseId || payment.purchaseId);
              if (purchaseId) {
                if (!paymentsByPurchase[purchaseId]) {
                  paymentsByPurchase[purchaseId] = [];
                }
                paymentsByPurchase[purchaseId].push(payment);
              }
            });
            
            // Merge payments into purchases
            const purchasesWithPayments = purchases.map(purchase => {
              const purchaseId = String(purchase.id);
              const payments = paymentsByPurchase[purchaseId] || purchase.payments || [];
              return {
                ...purchase,
                payments: payments
              };
            });
            
            setClientPayments(purchasesWithPayments);
            // Also save to localStorage as backup
            localStorage.setItem('clientPayments', JSON.stringify(purchasesWithPayments));
          } else {
            // If payments API fails, use purchases as-is
            setClientPayments(purchases);
            localStorage.setItem('clientPayments', JSON.stringify(purchases));
          }
        } catch (paymentsError) {
          console.error('Error fetching payments to merge:', paymentsError);
          // Use purchases without payments if payments API fails
          setClientPayments(purchases);
          localStorage.setItem('clientPayments', JSON.stringify(purchases));
        }
        
        // Reload all payments to enrich them with purchase details (for All Payments view)
        await loadAllPayments();
      } else {
        // If API returns invalid data, try localStorage
        const stored = localStorage.getItem('clientPayments');
        if (stored) {
          const parsed = JSON.parse(stored);
          setClientPayments(Array.isArray(parsed) ? parsed : []);
        } else {
          setClientPayments([]);
        }
      }
    } catch (error) {
      console.error('Error loading client payments from API:', error);
      // Fallback to localStorage if API fails
      try {
        const stored = localStorage.getItem('clientPayments');
        if (stored) {
          const parsed = JSON.parse(stored);
          setClientPayments(Array.isArray(parsed) ? parsed : []);
        } else {
          setClientPayments([]);
        }
      } catch (localError) {
        console.error('Error loading client payments from localStorage:', localError);
        setClientPayments([]);
      }
    }
  };

  const saveClientPayments = (payments) => {
    try {
      // Update state immediately for UI responsiveness
      setClientPayments(payments);
      // Save to localStorage as backup
      localStorage.setItem('clientPayments', JSON.stringify(payments));
    } catch (error) {
      console.error('Error saving client payments to localStorage:', error);
    }
  };

  const loadSuppliersForClientPurchase = useCallback(async () => {
    setLoadingSuppliersForPurchase(true);
    try {
      const raw = await apiFetchSuppliers();
      const arr = Array.isArray(raw) ? raw : (raw?.data && Array.isArray(raw.data) ? raw.data : []);
      setSuppliersList(arr);
    } catch (e) {
      console.error('loadSuppliersForClientPurchase', e);
      setSuppliersList([]);
    } finally {
      setLoadingSuppliersForPurchase(false);
    }
  }, []);

  useEffect(() => {
    if (!showClientPurchaseForm) return;
    setClientPurchaseSupplierSelect('');
    setClientPurchaseNewSupplierName('');
    setClientPurchaseSupplierSearchQuery('');
    loadSuppliersForClientPurchase();
  }, [showClientPurchaseForm, loadSuppliersForClientPurchase]);

  const clientPurchaseSupplierRows = useMemo(() => {
    return (suppliersList || [])
      .map((s) => ({
        id: Number(s.id),
        name: String(s.name ?? s.displayName ?? '').trim(),
      }))
      .filter((s) => s.name && Number.isFinite(s.id));
  }, [suppliersList]);

  const clientPurchasePriorNames = useMemo(() => {
    const supplierLower = new Set(clientPurchaseSupplierRows.map((r) => r.name.toLowerCase()));
    const seen = new Set();
    const out = [];
    for (const p of clientPayments || []) {
      const n = String(p?.clientName ?? '').trim();
      if (!n) continue;
      const low = n.toLowerCase();
      if (supplierLower.has(low)) continue;
      if (seen.has(low)) continue;
      seen.add(low);
      out.push(n);
    }
    return out.sort((a, b) => a.localeCompare(b));
  }, [clientPayments, clientPurchaseSupplierRows]);

  const clientPurchasePickFiltered = useMemo(() => {
    const q = clientPurchaseSupplierSearchQuery.trim().toLowerCase();
    const sup = clientPurchaseSupplierRows.filter(
      (s) => !q || s.name.toLowerCase().includes(q)
    );
    const pri = clientPurchasePriorNames.filter(
      (n) => !q || n.toLowerCase().includes(q)
    );
    return { suppliers: sup, prior: pri };
  }, [clientPurchaseSupplierRows, clientPurchasePriorNames, clientPurchaseSupplierSearchQuery]);

  const resolveClientPurchaseClientName = useCallback(() => {
    const v = String(clientPurchaseSupplierSelect || '').trim();
    if (v === '__new__') return String(clientPurchaseNewSupplierName || '').trim();
    if (v.startsWith('s:')) {
      const id = parseInt(v.slice(2), 10);
      if (!Number.isFinite(id)) return '';
      const s = suppliersList.find((x) => Number(x.id) === id);
      return s ? String(s.name ?? '').trim() : '';
    }
    if (v.startsWith('p:')) {
      try {
        return decodeURIComponent(v.slice(2)).trim();
      } catch {
        return '';
      }
    }
    return '';
  }, [clientPurchaseSupplierSelect, clientPurchaseNewSupplierName, suppliersList]);

  // Load all payments from API endpoint
  const loadAllPayments = async () => {
    try {
      // Fetch all payments from dedicated API endpoint: GET /api/client-purchases/payments
      const payments = await fetchAllPayments();
      if (payments && Array.isArray(payments)) {
        // API Response: { id, clientPurchaseId, clientId, amount, date, paymentMethod, notes, createdAt, updatedAt }
        // Enrich payments with purchase details (clientName, purchaseDescription) from clientPayments
        const enrichedPayments = payments.map(payment => {
          // Find the purchase this payment belongs to using clientPurchaseId
          const purchase = clientPayments.find(p => 
            String(p.id) === String(payment.clientPurchaseId) || 
            String(p.id) === String(payment.purchaseId)
          );
          
          return {
            ...payment,
            // Keep all API fields: id, clientPurchaseId, clientId, amount, date, paymentMethod, notes, createdAt, updatedAt
            // Add enriched fields from purchase if available
            clientName: purchase?.clientName || payment.clientId || '-',
            purchaseDescription: purchase?.purchaseDescription || '-',
            purchaseId: payment.clientPurchaseId || payment.purchaseId // Support both field names
          };
        });
        setAllPayments(enrichedPayments);
        console.log('All payments loaded from API:', enrichedPayments.length, 'payments');
      } else {
        setAllPayments([]);
      }
    } catch (error) {
      console.error('Error loading all payments from API:', error);
      // Fallback: extract payments from purchases if API fails
      const allPaymentsFromPurchases = [];
      clientPayments.forEach(purchase => {
        if (purchase?.payments && Array.isArray(purchase.payments)) {
          purchase.payments.forEach(payment => {
            allPaymentsFromPurchases.push({
              ...payment,
              purchaseId: purchase.id,
              clientPurchaseId: purchase.id,
              clientName: purchase.clientName,
              purchaseDescription: purchase.purchaseDescription
            });
          });
        }
      });
      setAllPayments(allPaymentsFromPurchases);
      showToast('Using fallback data. API endpoint unavailable.', 'error');
    }
  };

  const loadEmployees = async () => {
    try {
      setLoadingEmployees(true);
      setApiError(false);
      const employeesData = await apiFetchEmployees();
      setEmployees(employeesData || []);
    } catch (error) {
      console.error('Error loading employees from API:', error);
      setApiError(true);
      // Don't use localStorage fallback - only use API data
      setEmployees([]);
    } finally {
      setLoadingEmployees(false);
    }
  };

  const loadPayrollSummary = async () => {
    try {
      const rows = await fetchEmployeePayrollSummary(currentMonth);
      const map = {};
      (Array.isArray(rows) ? rows : []).forEach((r) => {
        if (r && r.employeeId != null) map[String(r.employeeId)] = r;
      });
      setPayrollSummaryByEmpId(map);
    } catch (error) {
      console.error('Error loading payroll summary:', error);
      setPayrollSummaryByEmpId({});
    }
  };

  // Payroll-ledger truth: advance balance carries to next month.
  const getAdvancePayments = (employeeId) => {
    const r = payrollSummaryByEmpId[String(employeeId)];
    return Number(r?.advanceBalanceEnd ?? 0) || 0;
  };

  // Net salary pending for the month (can be negative = over-advance vs this month's salary; next month adjusts via advance balance).
  const getPendingPayments = (employeeId, employeeSalary) => {
    const r = payrollSummaryByEmpId[String(employeeId)];
    if (r && r.salaryRemaining != null && !Number.isNaN(Number(r.salaryRemaining))) {
      return Number(r.salaryRemaining);
    }
    const totalSalary = Number(parseFloat(employeeSalary) || 0) || 0;
    return totalSalary;
  };

  const getCurrentMonthSalaryStatus = (employeeId) => {
    const r = payrollSummaryByEmpId[String(employeeId)];
    if (!r) return 'Pending';
    const s = String(r.status || '').toUpperCase();
    if (s === 'PAID') return 'Paid';
    if (s === 'OVER_ADVANCE') return 'Over advance';
    return 'Pending';
  };

  const getSalaryStatusBadgeClass = (employeeId) => {
    const r = payrollSummaryByEmpId[String(employeeId)];
    if (!r) return 'status-pending';
    const s = String(r.status || '').toUpperCase();
    if (s === 'PAID') return 'status-paid';
    if (s === 'OVER_ADVANCE') return 'status-over-advance';
    return 'status-pending';
  };

  const getLedgerEventLabel = (eventType) => {
    const t = String(eventType || '').toUpperCase();
    if (t === 'ADVANCE_GIVEN') return 'Advance Given';
    if (t === 'ADVANCE_APPLIED') return 'Advance Applied';
    if (t === 'SALARY_CASH_PAID') return 'Salary Paid';
    return t || '-';
  };

  const computeLedgerView = (rows) => {
    let advanceGiven = 0;
    let advanceApplied = 0;
    let salaryPaid = 0;
    let runningAdvanceBalance = 0;

    const sorted = [...(Array.isArray(rows) ? rows : [])].sort((a, b) => {
      const ad = String(a?.eventDate || '');
      const bd = String(b?.eventDate || '');
      if (ad !== bd) return ad.localeCompare(bd);
      return Number(a?.id || 0) - Number(b?.id || 0);
    });

    const lines = sorted.map((row) => {
      const type = String(row?.eventType || '').toUpperCase();
      const amount = Number(row?.amount || 0) || 0;

      if (type === 'ADVANCE_GIVEN') {
        advanceGiven += amount;
        runningAdvanceBalance += amount;
      } else if (type === 'ADVANCE_APPLIED') {
        advanceApplied += amount;
        runningAdvanceBalance -= amount;
      } else if (type === 'SALARY_CASH_PAID') {
        salaryPaid += amount;
      }

      return {
        ...row,
        _amount: amount,
        _runningAdvanceBalance: runningAdvanceBalance
      };
    });

    return {
      lines,
      advanceGiven,
      advanceApplied,
      salaryPaid,
      netAdvanceBalance: runningAdvanceBalance
    };
  };

  const countMonthsInRangeInclusive = (from, to) => {
    if (!from || !to) return 0;
    const [fy, fm] = String(from).split('-').map(Number);
    const [ty, tm] = String(to).split('-').map(Number);
    if (!fy || !fm || !ty || !tm) return 0;
    const start = fy * 12 + (fm - 1);
    const end = ty * 12 + (tm - 1);
    if (end < start) return 0;
    return end - start + 1;
  };

  // Handle Pay Salary button click
  const handlePaySalaryClick = (employee) => {
    setSelectedEmployee(employee);
    
    // Same as table: use payroll summary (salary remaining after advance offset + ledger cash/advance applied).
    const pendingAmount = Number(getPendingPayments(employee.id, employee.salaryAmount) || 0) || 0;
    const amountToPay = pendingAmount > 0 ? pendingAmount : 0;
    
    setPaySalaryFormData({
      month: getLocalMonthString(),
      date: getLocalDateString(),
      paymentMethod: 'cash',
      amount: amountToPay.toFixed(2)
    });
    setShowPaySalaryForm(true);
  };

  const loadEmployeeLedger = async (employeeId, range = employeeLedgerRange) => {
    if (!employeeId) return;
    setEmployeeLedgerLoading(true);
    try {
      const rows = await fetchEmployeePayrollLedger(employeeId, {
        from: range?.from,
        to: range?.to
      });
      setEmployeeLedgerRows(Array.isArray(rows) ? rows : []);
    } catch (error) {
      console.error('Error loading employee ledger:', error);
      setEmployeeLedgerRows([]);
      showToast('Failed to load employee ledger history.', 'error');
    } finally {
      setEmployeeLedgerLoading(false);
    }
  };

  const openEmployeeLedger = async (employee) => {
    setSelectedLedgerEmployee(employee || null);
    setShowEmployeeLedgerModal(true);
    await loadEmployeeLedger(employee?.id, employeeLedgerRange);
  };

  // Handle Pay Salary form submission
  const handlePaySalarySubmit = async (e) => {
    e.preventDefault();
    if (!selectedEmployee) return;

    const salaryAmount = parseFloat(paySalaryFormData.amount) || 0;

    try {
      await settleEmployeeSalaryMonth(selectedEmployee.id, {
        month: paySalaryFormData.month,
        date: paySalaryFormData.date,
        paymentMode: paySalaryFormData.paymentMethod,
        cashPaidAmount: salaryAmount,
        notes: `Salary settlement for ${selectedEmployee.employeeName}`
      });
      await loadExpenses();
      await loadPayrollSummary();
      // Notify parent component (Dashboard) to refresh expenses for chart
      if (onExpenseUpdate) {
        onExpenseUpdate();
      }
      setShowPaySalaryForm(false);
      setSelectedEmployee(null);
      setPaySalaryFormData({
        month: getLocalMonthString(),
        date: getLocalDateString(),
        paymentMethod: 'cash',
        amount: ''
      });
    } catch (error) {
      console.error('Error saving salary payment to API:', error);
      showToast('Failed to save salary payment. Please check your connection and try again.', 'error');
      // Don't use localStorage fallback - only use API
    }
  };

  // Handle Pay Advance form submission
  // Matches CURL: curl -X POST http://localhost:8080/api/expenses -H "Content-Type: application/json" -H "Accept: application/json" -d '{...}'
  const handlePayAdvanceSubmit = async (e) => {
    e.preventDefault();
    if (!payAdvanceFormData.employeeId) return;

    const selectedEmp = employees.find(emp => emp.id == payAdvanceFormData.employeeId);
    if (!selectedEmp) return;

    try {
      await recordEmployeeAdvance(selectedEmp.id, {
        amount: parseFloat(payAdvanceFormData.amount) || 0,
        date: payAdvanceFormData.date,
        paymentMode: 'cash',
        notes: `Employee advance for ${selectedEmp.employeeName}`
      });
      await loadExpenses();
      await loadPayrollSummary();
      // Notify parent component (Dashboard) to refresh expenses for chart
      if (onExpenseUpdate) {
        onExpenseUpdate();
      }
      setShowPayAdvanceForm(false);
      setPayAdvanceFormData({
        employeeId: '',
        amount: '',
        date: getLocalDateString()
      });
    } catch (error) {
      console.error('Error saving advance payment to API:', error);
      showToast('Failed to save advance payment. Please check your connection and try again.', 'error');
      // Don't use localStorage fallback - only use API
    }
  };

  const loadExpenses = async () => {
    try {
      setLoadingExpenses(true);
      setApiError(false);
      const allExpenses = await apiFetchExpenses();
      setExpenses(allExpenses || []);
    } catch (error) {
      console.error('Error loading expenses from API:', error);
      setApiError(true);
      // Don't use localStorage fallback - only use API data
      setExpenses([]);
    } finally {
      setLoadingExpenses(false);
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const [submittingExpense, setSubmittingExpense] = useState(false);

  const onSubmitExpense = async (data) => {
    const selectedEmp = employees.find(emp => String(emp.id) === String(data.employeeId || ''));
    const isEmployeeCategory = String(data.category || '').trim().toLowerCase() === 'employee';
    const catLower = String(data.category || '').trim().toLowerCase();
    const isLoanRepayment = catLower === 'loan_repayment' || catLower === 'loan_repay';
    if (isEmployeeCategory && !selectedEmp) {
      showToast('Please select employee for employee expense.', 'error');
      return;
    }
    if (isLoanRepayment && !String(data.lenderId || '').trim()) {
      showToast('Select lender for loan repayment.', 'error');
      return;
    }
    const repayAmt = parseFloat(String(data.amount ?? '').replace(/,/g, ''), 10);
    if (isLoanRepayment && Number.isFinite(repayAmt) && repayAmt > 0 && String(data.lenderId || '').trim()) {
      const lid = parseInt(String(data.lenderId).trim(), 10);
      const lenderRow = loanLenders.find((x) => String(x.id) === String(lid));
      if (lenderRow) {
        const out = Number(lenderRow.outstanding ?? 0) || 0;
        if (out >= -0.005 && repayAmt > out + 0.005) {
          const fmt = (n) =>
            Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
          const extra = repayAmt - out;
          const ok = window.confirm(
            `This payment is ₹${fmt(repayAmt)} but only ₹${fmt(out)} is left on the loan. ` +
              `The extra ₹${fmt(extra)} will be stored as lender credit (negative outstanding). ` +
              `You can offset it later by recording more borrowing from the same lender. Continue?`
          );
          if (!ok) return;
        }
      }
    }
    const expenseData = {
      type: isEmployeeCategory ? 'advance' : 'daily',
      date: toLocalDateString(data.date),
      category: data.category,
      description: data.description || '',
      amount: parseFloat(data.amount) || 0,
      paymentMethod: data.paymentMethod,
      ...(isEmployeeCategory ? {
        employeeId: selectedEmp?.id,
        employeeName: selectedEmp?.employeeName,
        settled: false,
        description: data.description || `Employee expense advance for ${selectedEmp?.employeeName || ''}`.trim()
      } : {}),
      ...(isLoanRepayment && String(data.lenderId || '').trim()
        ? { lenderId: parseInt(String(data.lenderId).trim(), 10) }
        : {}),
    };

    try {
      setSubmittingExpense(true);
      if (editingExpense) {
        await apiUpdateExpense(editingExpense.id, expenseData);
      } else {
        if (isEmployeeCategory) {
          await recordEmployeeAdvance(selectedEmp.id, {
            amount: parseFloat(data.amount) || 0,
            date: toLocalDateString(data.date),
            paymentMode: data.paymentMethod,
            notes: expenseData.description
          });
        } else {
          await apiCreateExpense(expenseData);
        }
      }
      resetForm();
      resetExpense();
      await loadExpenses();
      await loadBudgetState();
      await loadLoanLenders();
      await loadPayrollSummary();
      // Notify parent component (Dashboard) to refresh expenses for chart
      if (onExpenseUpdate) {
        onExpenseUpdate();
      }
    } catch (error) {
      console.error('Error saving expense to API:', error);
      const msg =
        error && typeof error.message === 'string' && error.message.trim() !== ''
          ? error.message.trim()
          : 'Failed to save expense. Please try again.';
      showToast(msg, 'error');
      // Don't use localStorage fallback - only use API
    } finally {
      setSubmittingExpense(false);
    }
  };

  // Keep handleSubmit for backward compatibility
  const handleSubmit = (e) => {
    e.preventDefault();
    handleExpenseSubmit(onSubmitExpense)(e);
  };

  const handleEdit = (expense) => {
    setEditingExpense(expense);
    const editData = {
      date: expense.date || getLocalDateString(),
      category: expense.category || '',
      description: expense.description || '',
      amount: expense.amount?.toString() || '',
      paymentMethod: expense.paymentMethod || 'cash',
      employeeId: expense.employeeId ? String(expense.employeeId) : '',
      lenderId: expense.lenderId != null && expense.lenderId !== '' ? String(expense.lenderId) : '',
    };
    setFormData(editData);
    // Update react-hook-form values
    Object.keys(editData).forEach(key => {
      setExpenseValue(key, editData[key]);
    });

    // If category is not one of the predefined options, treat it as a custom category.
    const existingCategory = String(expense.category || '').trim();
    const normalized = existingCategory.toLowerCase();
    const isPredefined = predefinedExpenseCategories.includes(normalized);
    setShowCustomCategoryInput(existingCategory !== '' && !isPredefined);
    setCustomCategoryDraft(existingCategory);

    if (externalShowForm !== null) {
      // External control - open form
      if (onFormOpen) {
        onFormOpen();
      }
    } else {
      setInternalShowForm(true);
    }
  };

  const handleDelete = async (id) => {
    showConfirm(
      'Delete Expense',
      'Are you sure you want to delete this expense? This action cannot be undone.',
      async () => {
        try {
          await apiDeleteExpense(id);
          await loadExpenses();
          await loadBudgetState();
          await loadLoanLenders();
          showToast('Expense deleted successfully!', 'success');
          // Notify parent component (Dashboard) to refresh expenses for chart
          if (onExpenseUpdate) {
            onExpenseUpdate();
          }
        } catch (error) {
          console.error('Error deleting expense from API:', error);
          showToast('Failed to delete expense. Please check your connection and try again.', 'error');
          // Don't use localStorage fallback - only use API
        }
      }
    );
  };

  const resetForm = () => {
    const today = getLocalDateString();
    const defaults = {
      date: today,
      category: '',
      description: '',
      amount: '',
      paymentMethod: 'cash',
      employeeId: '',
      lenderId: '',
    };
    setFormData(defaults);
    // Reset react-hook-form so date and other fields stay in sync (submitted value = today)
    resetExpense(defaults);
    setShowCustomCategoryInput(false);
    setCustomCategoryDraft('');
    if (externalShowForm !== null && onFormClose) {
      onFormClose();
    } else {
      setInternalShowForm(false);
    }
    setEditingExpense(null);
  };

  // Filter expenses based on active tab
  let filteredExpenses = expenses.filter(expense => {
    // Tab filter
    if (activeTab === 'all') {
      // Show all expenses (no type filter needed)
    } else if (activeTab === 'employee' || activeTab === 'loan') {
      return false;
    }
    

    // Date range filter
    if (dateFilter.start || dateFilter.end) {
      const expenseDate = new Date(expense.date);
      if (dateFilter.start && expenseDate < new Date(dateFilter.start)) return false;
      if (dateFilter.end) {
        const endDate = new Date(dateFilter.end);
        endDate.setHours(23, 59, 59, 999);
        if (expenseDate > endDate) return false;
      }
    }

    // Search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      const searchableText = [
        expense.category,
        expense.description,
        expense.employeeName,
        expense.amount?.toString(),
        expense.paymentMethod
      ].join(' ').toLowerCase();
      return searchableText.includes(query);
    }

    return true;
  });

  // Sort expenses - always sort by date by default (newest first)
  // If user clicks another column, sort by that column instead
  filteredExpenses = [...filteredExpenses].sort((a, b) => {
    let aValue = a[sortConfig.key];
    let bValue = b[sortConfig.key];

    if (sortConfig.key === 'date') {
      // Parse dates properly - handle ISO format and other formats
      const aDate = aValue ? new Date(aValue) : new Date(0);
      const bDate = bValue ? new Date(bValue) : new Date(0);
      // Use timestamp for reliable comparison
      aValue = isNaN(aDate.getTime()) ? 0 : aDate.getTime();
      bValue = isNaN(bDate.getTime()) ? 0 : bDate.getTime();
    } else if (sortConfig.key === 'amount') {
      aValue = parseFloat(aValue) || 0;
      bValue = parseFloat(bValue) || 0;
    } else if (typeof aValue === 'string') {
      aValue = aValue.toLowerCase();
      bValue = bValue?.toLowerCase() || '';
    } else {
      // For other types (numbers, etc.), use as-is
      aValue = aValue ?? 0;
      bValue = bValue ?? 0;
    }

    if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
    if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
    return 0;
  });

  // Pagination
  const totalPages = Math.ceil(filteredExpenses.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedExpenses = filteredExpenses.slice(startIndex, endIndex);

  const handleSort = (key) => {
    // For date columns, default to descending (newest first)
    // For other columns, default to ascending
    const defaultDirection = key === 'date' ? 'desc' : 'asc';
    
    setSortConfig({
      key,
      direction: sortConfig.key === key && sortConfig.direction === 'asc' ? 'desc' : 
                 sortConfig.key === key && sortConfig.direction === 'desc' ? 'asc' : 
                 defaultDirection
    });
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-IN', { 
      day: 'numeric', 
      month: 'short', 
      year: 'numeric'
    });
  };

  const getTypeLabel = (type) => {
    return 'Daily Expense';
  };

  const getTypeIcon = (type) => {
    return '💰';
  };

  // Calculate total expenses
  const totalExpenses = filteredExpenses.reduce((sum, exp) => {
    return sum + (parseFloat(exp.amount) || 0);
  }, 0);
  
  const todayExpenses = expenses
    .filter(exp => {
      const expDate = new Date(exp.date).toDateString();
      const today = new Date().toDateString();
      return expDate === today;
    })
    .reduce((sum, exp) => {
      return sum + (parseFloat(exp.amount) || 0);
    }, 0);

  const todayExpenseSplit = useMemo(() => {
    const toNum = (v) => Number.parseFloat(v) || 0;
    const isToday = (d) => {
      if (!d) return false;
      return new Date(d).toDateString() === new Date().toDateString();
    };
    return expenses.reduce(
      (acc, exp) => {
        if (!isToday(exp?.date)) return acc;
        const amount = toNum(exp?.amount);
        const pm = String(exp?.paymentMethod ?? exp?.payment_method ?? '').trim().toLowerCase();
        if (pm === 'cash' || pm === 'upi') {
          acc.cashUpi += amount;
        } else if (
          pm === 'bank' ||
          pm === 'bank_transfer' ||
          pm === 'bank transfer' ||
          pm === 'card' ||
          pm === 'cheque' ||
          pm === 'check'
        ) {
          acc.bankCardCheque += amount;
        }
        return acc;
      },
      { cashUpi: 0, bankCardCheque: 0 }
    );
  }, [expenses]);

  // If showAddButtonInHeader is true, only render the button
  if (showAddButtonInHeader) {
    return (
      <button className="btn btn-primary" onClick={handleAddClick}>
        + Add Expense
      </button>
    );
  }

  return (
    <div className="expenses-container">
      {!hideHeader && (
        <div className="expenses-header">
          <h2>Daily Expenses Management</h2>
          <div className="expenses-header-actions">
            <button type="button" className="btn btn-secondary" onClick={() => { setDailyBudgetModalValue(budgetInHand === 0 ? '' : String(budgetInHand)); setShowDailyBudgetModal(true); }}>
              Add daily budget
            </button>
            <button className="btn btn-primary" onClick={handleAddClick}>
              + Add Expense
            </button>
          </div>
        </div>
      )}

      {!hideStats && (
        <div className="expenses-stats">
          <div className="stat-card">
            <div className="stat-icon">📊</div>
            <div className="stat-content">
              <h3>Total Expenses</h3>
              <p className="stat-value">₹{(Number(totalExpenses || 0) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
              <p className="stat-label">{filteredExpenses.length} record(s)</p>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon">📅</div>
            <div className="stat-content">
              <h3>Today's Expenses</h3>
              <p className="stat-value">₹{(Number(todayExpenses || 0) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
              <p className="stat-label">Today</p>
            </div>
          </div>
        </div>
      )}


      {/* Daily budget modal */}
      {showDailyBudgetModal && (
        <div className="modal-overlay" onClick={() => !savingBudget && setShowDailyBudgetModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '980px' }}>
            <div className="modal-header">
              <h3>{hasDailyBudgetFromApi ? 'Edit daily budget' : 'Add daily budget'}</h3>
              <button type="button" className="modal-close" onClick={() => !savingBudget && setShowDailyBudgetModal(false)}>×</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>Daily budget amount (₹)</label>
                <p style={{ margin: '4px 0 8px', fontSize: '13px', color: '#666' }}>
                  This is the budget cap stored for today (same field as Reports). Current remaining in hand:{' '}
                  <strong>₹{(Number(todayFromEvents.remaining) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
                </p>
                <input
                  type="number"
                  min="0"
                  step="100"
                  value={dailyBudgetModalValue}
                  onChange={(e) => setDailyBudgetModalValue(e.target.value)}
                  placeholder="e.g. 20000"
                  className="budget-in-hand-input"
                  style={{ width: '100%', padding: '8px 12px', marginTop: '4px' }}
                  disabled={savingBudget}
                />
              </div>
              <div className="form-actions" style={{ marginTop: '16px', display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              <button
                  type="button"
                  className="btn btn-primary"
                  disabled={savingBudget}
                  onClick={async () => {
                    const val = parseFloat(dailyBudgetModalValue);
                    const num = Number.isFinite(val) ? Math.max(0, val) : 0;
                  if (num === 0) {
                    const confirmed = window.confirm('Reset available balance to ₹0 for today?');
                    if (!confirmed) return;
                  }
                    setSavingBudget(true);
                    try {
                      await saveDailyBudgetToApi(num);
                      await loadBudgetState();
                      setShowDailyBudgetModal(false);
                      showToast(num > 0 ? `Daily budget set to ₹${num.toLocaleString('en-IN')}` : 'Daily budget cleared.');
                    } catch (err) {
                      console.error('Error saving daily budget:', err);
                      showToast(err?.message || 'Failed to save budget. Please try again.', 'error');
                    } finally {
                      setSavingBudget(false);
                    }
                  }}
                >
                  {savingBudget ? 'Saving...' : 'Save'}
                </button>
              </div>
              {/* Budget history */}
              <div className="budget-history-section" style={{ marginTop: '20px', borderTop: '1px solid #eee', paddingTop: '12px' }}>
                <div className="budget-history-header">
                  <h4 className="budget-history-title">Budget history</h4>
                  <button
                    type="button"
                    className="btn btn-secondary budget-history-download-btn"
                    onClick={downloadBudgetHistoryPdf}
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
                  <strong>{BUDGET_SOURCE_CASH_UPI}</strong> — rows in this table (in-hand ledger).{' '}
                  <strong>{BUDGET_SOURCE_BANK}</strong> — not listed here; use <strong>Amount in bank</strong> on this page.
                </p>
                {loadingBudgetHistory ? (
                  <p style={{ margin: 0, fontSize: '13px', color: '#888' }}>Loading...</p>
                ) : filteredBudgetHistoryRows.length === 0 ? (
                  <p style={{ margin: 0, fontSize: '13px', color: '#888' }}>No history yet.</p>
                ) : (
                  <div className="daily-budget-history-table-wrap" style={{ maxHeight: '280px', overflowY: 'auto' }}>
                    <table className="daily-budget-history-table">
                      <thead>
                        <tr>
                          <th style={{ width: '108px' }}>Date</th>
                          <th style={{ width: '128px' }}>Source</th>
                          <th style={{ minWidth: '160px' }}>Details</th>
                          <th style={{ width: '132px' }}>Opening balance</th>
                          <th style={{ width: '80px' }}>Type</th>
                          <th style={{ width: '124px' }}>Transaction amount</th>
                          <th style={{ width: '132px' }}>Remaining amount</th>
                        </tr>
                      </thead>
                      <tbody>
                    {filteredBudgetHistoryRows.map((row) => {
                      const { entry, idx, opening, closing, txType, txAmount, displayDate, sourceChannel, detailLabel } = row;
                      const location = entry.location || '';
                      const isToday = displayDate === getLocalDateString();
                      const rowKey = entry.id != null ? entry.id : `idx-${idx}`;
                      const isEditingThis = isToday && editingBudgetEntryId === rowKey;
                      const handleSaveInlineBudget = async () => {
                        const num = Math.max(0, parseFloat(editingBudgetAmount) || 0);
                        setSavingBudget(true);
                        try {
                          await saveDailyBudgetToApi(num);
                          setEditingBudgetEntryId(null);
                          setEditingBudgetAmount('');
                          await loadBudgetState();
                          await loadBudgetHistory();
                          showToast(num > 0 ? `Budget updated to ₹${num.toLocaleString('en-IN')}` : 'Budget cleared.');
                        } catch (err) {
                          console.error('Error updating budget:', err);
                          showToast(err?.message || 'Failed to update budget.', 'error');
                        } finally {
                          setSavingBudget(false);
                        }
                      };
                      return (
                        <tr key={entry.id ?? idx}>
                          <td style={{ color: '#666', fontSize: '13px', padding: '10px 10px' }}>{displayDate}</td>
                          <td
                            className={
                              sourceChannel === BUDGET_SOURCE_BANK
                                ? 'budget-history-source budget-history-source-bank'
                                : 'budget-history-source budget-history-source-cash'
                            }
                            style={{ fontSize: '12px', padding: '10px 8px', fontWeight: 700, lineHeight: 1.3 }}
                          >
                            {sourceChannel}
                          </td>
                          <td style={{ fontSize: '12px', padding: '10px 10px', color: '#334155', lineHeight: 1.35 }} title={entry.eventType || entry.event_type || ''}>
                            {detailLabel}
                          </td>
                          <td style={{ fontWeight: 600, fontSize: '13px', padding: '10px 10px' }}>
                            ₹{Number.isFinite(opening) ? opening.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00'}
                          </td>
                          <td style={{ fontWeight: 700, fontSize: '13px', padding: '10px 10px' }}>
                            <span className={txType === 'CREDIT' ? 'budget-tx-credit' : 'budget-tx-debit'}>
                              {txType}
                            </span>
                          </td>
                          <td style={{ fontWeight: 600, fontSize: '13px', padding: '10px 10px' }}>
                            ₹{Number.isFinite(txAmount) ? txAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00'}
                          </td>
                          <td style={{ fontWeight: 600, fontSize: '13px', padding: '10px 10px' }}>
                            {isToday && isEditingThis ? (
                              <input
                                type="number"
                                min="0"
                                step="100"
                                value={editingBudgetAmount}
                                onChange={(e) => setEditingBudgetAmount(e.target.value)}
                                onBlur={handleSaveInlineBudget}
                                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleSaveInlineBudget(); } }}
                                autoFocus
                                disabled={savingBudget}
                                style={{ width: '140px', padding: '6px 10px', fontSize: '13px', fontWeight: '600' }}
                              />
                            ) : (
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                                <span style={{ color: '#0f766e', fontWeight: 700 }}>
                                  ₹{Number.isFinite(closing) ? closing.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00'}
                                </span>
                                {isToday && (
                                  <button
                                    type="button"
                                    className="btn btn-secondary"
                                    onClick={() => { setEditingBudgetEntryId(rowKey); setEditingBudgetAmount(String(opening)); }}
                                    style={{ fontSize: '12px', padding: '4px 10px' }}
                                  >
                                    Edit
                                  </button>
                                )}
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Expense Form Modal */}
      {showForm && (
        <div className="modal-overlay" onClick={resetForm}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{editingExpense ? 'Edit Expense' : 'Add New Expense'}</h3>
              <button className="modal-close" onClick={resetForm}>×</button>
            </div>
            <div className="modal-body">
          <form onSubmit={handleExpenseSubmit(onSubmitExpense)}>
            <div className="form-row">
              <div className="form-group">
                <label>Date *</label>
                <input
                  type="date"
                  {...registerExpense('date')}
                />
                {expenseErrors.date && (
                  <span className="error-message">{expenseErrors.date.message}</span>
                )}
              </div>
              <div className="form-group">
                <label>Payment Method *</label>
                <select
                  {...registerExpense('paymentMethod')}
                >
                  <option value="cash">Cash</option>
                  <option value="bank">Bank Transfer</option>
                  <option value="upi">UPI</option>
                  <option value="card">Card</option>
                  <option value="other">Other</option>
                </select>
                {expenseErrors.paymentMethod && (
                  <span className="error-message">{expenseErrors.paymentMethod.message}</span>
                )}
              </div>
            </div>

            <div className="form-group">
              <label>Category *</label>
              <select
                {...registerExpense('category')}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === '__add_new__') {
                    setShowCustomCategoryInput(true);
                    setCustomCategoryDraft('');
                    setExpenseValue('category', '', { shouldValidate: true, shouldDirty: true });
                    return;
                  }
                  const normalized = String(v || '').trim().toLowerCase();
                  const isPredefined = predefinedExpenseCategories.includes(normalized);
                  setShowCustomCategoryInput(!isPredefined && String(v || '').trim() !== '');
                  setCustomCategoryDraft(v);
                  setExpenseValue('category', v, { shouldValidate: true, shouldDirty: true });
                }}
              >
                <option value="">Select Category</option>
                <option value="water">Water Bill</option>
                <option value="electricity">Electricity Bill</option>
                <option value="petrol">Petrol</option>
                <option value="grocery">Grocery</option>
                <option value="rent">Rent</option>
                <option value="maintenance">Maintenance</option>
                <option value="transport">Transport</option>
                <option value="loan_repayment">Loan Repay</option>
                <option value="employee">Employee</option>
                <option value="other">Other</option>
                {customCategoryOptions.map((c) => (
                  <option key={String(c).trim().toLowerCase()} value={c}>
                    {toTitleCase(c)}
                  </option>
                ))}
                {(() => {
                  const current = String(watchExpense('category') || '').trim();
                  if (!current) return null;
                  const normalized = current.toLowerCase();
                  if (predefinedExpenseCategories.includes(normalized)) return null;
                  // Avoid duplicating an already-displayed custom option.
                  if (customCategoryOptions.some((x) => String(x).trim().toLowerCase() === normalized)) return null;
                  return <option value={current}>{toTitleCase(current)}</option>;
                })()}
                <option value="__add_new__">Add new category...</option>
              </select>
              {expenseErrors.category && (
                <span className="error-message">{expenseErrors.category.message}</span>
              )}
            </div>
            {showCustomCategoryInput && (
              <div className="form-group">
                <label>New Category Name *</label>
                <input
                  type="text"
                  value={customCategoryDraft}
                  onChange={(e) => {
                    const v = e.target.value;
                    setCustomCategoryDraft(v);
                    setExpenseValue('category', v, { shouldValidate: true, shouldDirty: true });
                  }}
                  placeholder="e.g. Snacks, Stationery, Laundry..."
                />
              </div>
            )}
            {selectedExpenseCategory === 'employee' && (
              <div className="form-group">
                <label>Employee *</label>
                <select {...registerExpense('employeeId')}>
                  <option value="">Select Employee</option>
                  {employees.map((employee) => (
                    <option key={employee.id} value={employee.id}>
                      {employee.employeeName}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {selectedExpenseCategory === 'loan_repayment' && (
              <div className="form-group">
                <label>Lender *</label>
                <select {...registerExpense('lenderId')}>
                  <option value="">Select lender</option>
                  {loanLenders.map((l) => {
                    const nm = l.displayName || l.display_name || `Lender #${l.id}`;
                    const out = Number(l.outstanding ?? 0) || 0;
                    return (
                      <option key={l.id} value={l.id}>
                        {nm} ({formatLenderOutstandingLabel(out)})
                      </option>
                    );
                  })}
                </select>
                {loanLenders.length === 0 && (
                  <p style={{ margin: '6px 0 0', fontSize: '12px', color: '#64748b' }}>
                    No lenders yet — use the <strong>Borrowed cash</strong> tab to record money you borrowed first.
                  </p>
                )}
                {loanRepayLenderSummary && (
                  <div
                    style={{
                      marginTop: '12px',
                      padding: '12px 14px',
                      borderRadius: '8px',
                      background: loanRepayLenderSummary.outstanding < -0.005 ? '#eff6ff' : '#f0fdfa',
                      border:
                        loanRepayLenderSummary.outstanding < -0.005 ? '1px solid #bfdbfe' : '1px solid #99f6e4',
                      fontSize: '13px',
                      lineHeight: 1.5,
                      color: loanRepayLenderSummary.outstanding < -0.005 ? '#1e3a5f' : '#134e4a',
                    }}
                  >
                    <div style={{ fontWeight: 700, marginBottom: '6px' }}>{loanRepayLenderSummary.name}</div>
                    <div style={{ display: 'grid', gap: '4px' }}>
                      <span>
                        {loanRepayLenderSummary.outstanding < -0.005 ? (
                          <>
                            <strong>Credit (overpaid):</strong> ₹
                            {Math.abs(loanRepayLenderSummary.outstanding).toLocaleString('en-IN', {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}{' '}
                            <span style={{ fontSize: '12px', fontWeight: 500 }}>
                              — you can record more borrowing later to use this balance.
                            </span>
                          </>
                        ) : (
                          <>
                            <strong>Remaining to repay:</strong> ₹
                            {loanRepayLenderSummary.outstanding.toLocaleString('en-IN', {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}
                          </>
                        )}
                      </span>
                      <span style={{ fontSize: '12px', color: '#0f766e' }}>
                        Total borrowed: ₹
                        {loanRepayLenderSummary.borrowed.toLocaleString('en-IN', {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}{' '}
                        · Already repaid: ₹
                        {loanRepayLenderSummary.repaid.toLocaleString('en-IN', {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}
            <div className="form-group">
              <label>Description</label>
              <input
                type="text"
                {...registerExpense('description')}
                placeholder="Brief description of the expense"
              />
              {expenseErrors.description && (
                <span className="error-message">{expenseErrors.description.message}</span>
              )}
            </div>
            <div className="form-group">
              <label>Amount (₹) *</label>
              <input
                type="number"
                {...registerExpense('amount')}
                placeholder="Enter amount"
                min="0"
                step="0.01"
              />
              {expenseErrors.amount && (
                <span className="error-message">{expenseErrors.amount.message}</span>
              )}
              {selectedExpenseCategory === 'loan_repayment' && loanRepayOverpayHint && (
                <p
                  style={{
                    margin: '8px 0 0',
                    fontSize: '12px',
                    lineHeight: 1.45,
                    color: loanRepayOverpayHint.kind === 'overpay' ? '#b45309' : '#1d4ed8',
                  }}
                >
                  {loanRepayOverpayHint.message}
                </p>
              )}
            </div>

              <div className="form-actions">
                <button type="submit" className="btn btn-primary" disabled={submittingExpense}>
                  {submittingExpense ? (
                    <>
                      <span className="button-loading"></span>
                      {editingExpense ? 'Updating...' : 'Adding...'}
                    </>
                  ) : (
                    editingExpense ? 'Update Expense' : 'Add Expense'
                  )}
                </button>
                <button type="button" className="btn btn-secondary" onClick={resetForm} disabled={submittingExpense}>
                  Cancel
                </button>
              </div>
            </form>
            </div>
          </div>
        </div>
      )}

      {/* Tab Navigation */}
      <div className="expenses-tab-navigation">
        <button
          className={`expense-tab ${activeTab === 'all' ? 'active' : ''}`}
          onClick={() => {
            setActiveTab('all');
            setCurrentPage(1);
          }}
        >
          Daily Expenses
        </button>
        <button
          className={`expense-tab ${activeTab === 'loan' ? 'active' : ''}`}
          onClick={() => {
            setActiveTab('loan');
            setCurrentPage(1);
          }}
        >
          Borrowed cash
        </button>
        <button
          className={`expense-tab ${activeTab === 'employee' ? 'active' : ''}`}
          onClick={() => {
            setActiveTab('employee');
            setCurrentPage(1);
          }}
        >
          Employee Payroll
        </button>
        <button
          className={`expense-tab ${activeTab === 'client' ? 'active' : ''}`}
          onClick={() => {
            setActiveTab('client');
            setCurrentPage(1);
          }}
        >
          Client Transactions
        </button>
      </div>

      {/* All Expenses Tab Content */}
      {activeTab === 'all' && (
        <div>
          {/* Budget in hand card – daily / date-wise */}
          <div className="budget-in-hand-card">
            <div className="budget-in-hand-header">
              <span className="budget-in-hand-title" title="Cash + UPI available after expenses">
                💰 Daily available balance
              </span>
            </div>
            {(() => {
              const left = Number(todayFromEvents.remaining || 0) || 0;
              const splitCashUpi = Number(todayExpenseSplit.cashUpi || 0) || 0;
              const splitBank = Number(todayExpenseSplit.bankCardCheque || 0) || 0;
              const cashUpiDebits =
                channelBudgetSummary.cashUpiDebits != null
                  ? channelBudgetSummary.cashUpiDebits
                  : splitCashUpi;
              const bankDebits =
                channelBudgetSummary.bankDebits != null ? channelBudgetSummary.bankDebits : splitBank;
              const bankCredits =
                channelBudgetSummary.bankCredits != null ? channelBudgetSummary.bankCredits : 0;
              /** Today's net bank movement (credits − debits). Full balance adds opening carried from prior days when API sends it. */
              const bankNetToday = bankCredits - bankDebits;
              const amountInBankToday =
                channelBudgetSummary.bankBalanceWithOpening != null &&
                Number.isFinite(channelBudgetSummary.bankBalanceWithOpening)
                  ? channelBudgetSummary.bankBalanceWithOpening
                  : bankNetToday;
              const bankOpening =
                channelBudgetSummary.bankOpeningCarried != null &&
                Number.isFinite(channelBudgetSummary.bankOpeningCarried)
                  ? channelBudgetSummary.bankOpeningCarried
                  : null;
              const cards = [
                {
                  label: 'Expenses in Cash + UPI (today)',
                  value: cashUpiDebits,
                  color: '#dc2626',
                  title:
                    'Cash/UPI paid out today: expenses plus supplier bill payments recorded as cash or UPI (from server when available).',
                },
                {
                  label: 'Expenses in Bank + Cheque + Card (today)',
                  value: bankDebits,
                  color: '#dc2626',
                  title:
                    'Bank/cheque/card (and similar) paid out today: all expense rows plus bill payments in the financial ledger.',
                },
                {
                  label: 'Amount in bank (today)',
                  value: Math.max(0, amountInBankToday),
                  color: '#1d4ed8',
                  title:
                    bankOpening != null
                      ? `Opening carried forward (bank channel): ₹${bankOpening.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}. Plus today's credits minus today's debits (same rules as the red bank expenses card). Not your real bank statement.`
                      : 'Bank-channel credits today minus debits today. After the first overnight rollover, opening from prior days is added automatically (like cash + UPI in hand). Not your real bank statement.',
                },
                {
                  label: left >= 0 ? 'Available cash in hand' : 'Over budget by',
                  value: left >= 0 ? left : Math.abs(left),
                  color: left >= 0 ? '#059669' : '#dc2626',
                },
              ];
              return (
                <div
                  className="budget-in-hand-stats"
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))',
                    gap: '10px',
                  }}
                >
                  {cards.map((c) => (
                    <div
                      key={c.label}
                      className="budget-stat"
                      style={{
                        background: '#ffffff',
                        border: '1px solid #e2e8f0',
                        borderRadius: '10px',
                        padding: '10px 12px',
                      }}
                    >
                      <span className="budget-stat-label" title={c.title}>{c.label}</span>
                      <span className="budget-stat-value" style={{ color: c.color }}>
                        ₹{c.value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>

          {/* Budget and Add Expense buttons */}
          <div className="expenses-actions">
            <button type="button" className="btn btn-secondary" onClick={() => { setDailyBudgetModalValue(budgetInHand === 0 ? '' : String(budgetInHand)); setShowDailyBudgetModal(true); }}>
              Budget
            </button>
            <button className="btn btn-primary" onClick={handleAddClick}>
              + Add Expense
            </button>
          </div>

          {/* Filters and Search */}
          <div className="expenses-filters-row">
        <div className="search-wrapper">
          <span className="search-icon">🔍</span>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setCurrentPage(1);
            }}
            placeholder="Search expenses..."
            className="search-input"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                setCurrentPage(1);
              }}
              className="search-clear-btn"
            >
              ×
            </button>
          )}
        </div>

        <div className="date-range-filter">
          <input
            type="date"
            value={dateFilter.start}
            onChange={(e) => {
              setDateFilter({ ...dateFilter, start: e.target.value });
              setCurrentPage(1);
            }}
            className="date-input"
            placeholder="Start Date"
          />
          <span className="date-separator">to</span>
          <input
            type="date"
            value={dateFilter.end}
            onChange={(e) => {
              setDateFilter({ ...dateFilter, end: e.target.value });
              setCurrentPage(1);
            }}
            className="date-input"
            placeholder="End Date"
          />
          {(dateFilter.start || dateFilter.end) && (
            <button
              type="button"
              onClick={() => {
                setDateFilter({ start: '', end: '' });
                setCurrentPage(1);
              }}
              className="btn-filter-clear"
            >
              Clear
            </button>
          )}
        </div>
      </div>
        </div>
      )}

      {/* Borrowed cash (loan / market) — own tab */}
      {activeTab === 'loan' && (
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
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={loanReceiptAmount}
                    onChange={(e) => setLoanReceiptAmount(e.target.value)}
                    placeholder="0.00"
                    disabled={submittingLoanReceipt}
                  />
                </div>
                <div className="form-group" style={{ marginBottom: 0, minWidth: '170px' }}>
                  <label style={{ fontSize: '13px' }}>Payment mode</label>
                  <select
                    value={loanReceiptPaymentMode}
                    onChange={(e) => setLoanReceiptPaymentMode(e.target.value)}
                    disabled={submittingLoanReceipt}
                  >
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
                      if (e.target.value !== '__new__') {
                        setLoanReceiptNewLenderName('');
                      }
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
                  <input
                    type="text"
                    value={loanReceiptNewLenderName}
                    onChange={(e) => setLoanReceiptNewLenderName(e.target.value)}
                    placeholder="e.g. Name or financier"
                    disabled={submittingLoanReceipt}
                  />
                </div>
              )}
            </div>
          </form>

          <div style={{ marginTop: '20px' }}>
            <h3 style={{ margin: '0 0 10px', fontSize: '16px', fontWeight: 600, color: '#334155' }}>Lenders</h3>
            <p style={{ margin: '0 0 12px', fontSize: '13px', color: '#64748b' }}>
              Click a row to see all borrowings and repayments for that lender.
            </p>
            {!loadingLoanLenders && loanLenders.length > 0 && (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(132px, 1fr))',
                  gap: '10px',
                  marginBottom: '16px',
                  maxWidth: '900px',
                }}
              >
                {[
                  { label: 'Total lenders', value: String(loanLendersTotals.count), accent: '#334155' },
                  { label: 'Total borrowed', value: formatLoanInr(loanLendersTotals.totalBorrowed), accent: '#1d4ed8' },
                  { label: 'Total repaid', value: formatLoanInr(loanLendersTotals.totalRepaid), accent: '#0f766e' },
                  { label: 'Overpay', value: formatLoanInr(loanLendersTotals.totalOverpay), accent: '#1d4ed8' },
                  loanLendersTotals.totalOutstanding < -0.005
                    ? {
                        label: 'Net lender credit',
                        value: `₹${Math.abs(loanLendersTotals.totalOutstanding).toLocaleString('en-IN', {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}`,
                        accent: '#1d4ed8',
                      }
                    : {
                        label: 'Total outstanding',
                        value: formatLoanInr(loanLendersTotals.totalOutstanding),
                        accent: '#b45309',
                      },
                ].map((c) => (
                  <div
                    key={c.label}
                    style={{
                      padding: '12px 14px',
                      background: '#fff',
                      border: '1px solid #e2e8f0',
                      borderRadius: '10px',
                      boxShadow: '0 1px 2px rgba(15, 23, 42, 0.04)',
                    }}
                  >
                    <div style={{ fontSize: '11px', fontWeight: 600, color: '#64748b', letterSpacing: '0.02em', marginBottom: '6px' }}>
                      {c.label}
                    </div>
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
                  Loans recorded only as budget credits before this feature will not appear here until you add them again.
                </p>
              </div>
            ) : (
              <div className="sales-table-wrapper" style={{ maxWidth: '900px' }}>
                <table className="data-table expenses-table">
                  <thead>
                    <tr>
                      <th>Lender</th>
                      <th>Total borrowed</th>
                      <th>Total repaid</th>
                      <th>Outstanding</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loanLenders.map((l) => {
                      const name = l.displayName ?? l.display_name ?? `Lender #${l.id}`;
                      const borrowed = Number(l.totalBorrowed ?? l.total_borrowed ?? 0) || 0;
                      const repaid = Number(l.totalRepaid ?? l.total_repaid ?? 0) || 0;
                      const out = Number(l.outstanding ?? 0) || 0;
                      return (
                        <tr
                          key={l.id}
                          style={{ cursor: 'pointer' }}
                          onClick={() => openLoanLenderHistory(l)}
                          title="View full history"
                        >
                          <td style={{ fontWeight: 600 }}>{name}</td>
                          <td>₹{borrowed.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                          <td>₹{repaid.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                          <td
                            style={{
                              fontWeight: 600,
                              color: out > 0.005 ? '#b45309' : out < -0.005 ? '#1d4ed8' : '#0f766e',
                            }}
                          >
                            {out < -0.005 ? (
                              <>
                                Credit ₹
                                {Math.abs(out).toLocaleString('en-IN', {
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 2,
                                })}
                              </>
                            ) : (
                              <>
                                ₹
                                {out.toLocaleString('en-IN', {
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 2,
                                })}
                              </>
                            )}
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
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                setActiveTab('all');
                setCurrentPage(1);
                handleAddClick();
              }}
            >
              Record a repayment → Add Expense
            </button>
          </div>

          {loanHistoryModal.open && loanHistoryModal.lender && (
            <div className="modal-overlay" onClick={closeLoanHistoryModal} role="presentation">
              <div
                className="modal-content"
                onClick={(e) => e.stopPropagation()}
                style={{ maxWidth: 'min(740px, 90vw)', width: '90vw' }}
              >
                <div className="modal-header">
                  <h3>
                    {loanHistoryModal.lender.displayName
                      || loanHistoryModal.lender.display_name
                      || `Lender #${loanHistoryModal.lender.id}`}{' '}
                    — history
                  </h3>
                  <button type="button" className="modal-close" onClick={closeLoanHistoryModal} aria-label="Close">
                    ×
                  </button>
                </div>
                <div className="modal-body">
                  {loanHistoryModal.loading ? (
                    <Loading message="Loading transactions…" />
                  ) : loanHistoryModal.rows.length === 0 ? (
                    <p style={{ margin: 0, fontSize: '14px', color: '#64748b' }}>No transactions yet.</p>
                  ) : (
                    <div
                      className="sales-table-wrapper"
                      style={{ maxHeight: '360px', overflowY: 'auto', overflowX: 'auto', width: '100%' }}
                    >
                      <table
                        className="data-table expenses-table"
                        style={{ width: '100%', tableLayout: 'fixed' }}
                      >
                        <thead>
                          <tr>
                            <th style={{ width: '16%', paddingLeft: '10px', paddingRight: '14px' }}>Date</th>
                            <th style={{ width: '14%', paddingLeft: '10px', paddingRight: '14px' }}>Type</th>
                            <th style={{ width: '20%', paddingLeft: '10px', paddingRight: '14px' }}>Amount</th>
                            <th style={{ width: '16%', paddingLeft: '10px', paddingRight: '14px' }}>Overpay</th>
                            <th style={{ width: '34%', paddingLeft: '10px', paddingRight: '10px' }}>Notes</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(() => {
                            const toTs = (row) => {
                              const raw = row?.createdAt || row?.created_at || row?.entryDate || row?.entry_date;
                              if (!raw) return 0;
                              const t = new Date(raw).getTime();
                              return Number.isFinite(t) ? t : 0;
                            };
                            const chronological = [...loanHistoryModal.rows].sort((a, b) => {
                              const ta = toTs(a);
                              const tb = toTs(b);
                              if (ta !== tb) return ta - tb;
                              return (Number(a?.id) || 0) - (Number(b?.id) || 0);
                            });
                            let outstanding = 0;
                            const overpayById = new Map();
                            chronological.forEach((row) => {
                              const typ = String(row.entryType || row.entry_type || '').toUpperCase();
                              const amt = Number(row.amount ?? 0) || 0;
                              if (typ === 'RECEIPT') outstanding += amt;
                              if (typ === 'REPAYMENT') outstanding -= amt;
                              overpayById.set(row.id, outstanding < -0.005 ? Math.abs(outstanding) : 0);
                            });

                            return loanHistoryModal.rows.map((row) => {
                            const typ = String(row.entryType || row.entry_type || '').toUpperCase();
                            const label = typ === 'RECEIPT' ? 'Borrowed' : typ === 'REPAYMENT' ? 'Repaid' : typ || '—';
                            const dt = row.entryDate || row.entry_date;
                            const dateStr = dt
                              ? (String(dt).length >= 10 ? String(dt).slice(0, 10) : String(dt))
                              : '—';
                            const amt = Number(row.amount ?? 0) || 0;
                            const overpay = Number(overpayById.get(row.id) || 0);
                            return (
                              <tr key={row.id}>
                                <td style={{ paddingLeft: '10px', paddingRight: '14px' }}>{dateStr}</td>
                                <td style={{ paddingLeft: '10px', paddingRight: '14px' }}>
                                  <span
                                    style={{
                                      fontWeight: 600,
                                      color: typ === 'RECEIPT' ? '#0f766e' : typ === 'REPAYMENT' ? '#b91c1c' : '#334155',
                                    }}
                                  >
                                    {label}
                                  </span>
                                </td>
                                <td style={{ paddingLeft: '10px', paddingRight: '14px' }}>
                                  ₹{amt.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </td>
                                <td
                                  style={{
                                    paddingLeft: '10px',
                                    paddingRight: '14px',
                                    color: overpay > 0 ? '#1d4ed8' : '#64748b',
                                    fontWeight: overpay > 0 ? 600 : 400,
                                  }}
                                >
                                  {overpay > 0
                                    ? `₹${overpay.toLocaleString('en-IN', {
                                        minimumFractionDigits: 2,
                                        maximumFractionDigits: 2,
                                      })}`
                                    : '—'}
                                </td>
                                <td
                                  style={{
                                    fontSize: '12px',
                                    color: '#64748b',
                                    wordBreak: 'break-word',
                                    verticalAlign: 'top',
                                    paddingLeft: '10px',
                                    paddingRight: '10px',
                                  }}
                                >
                                  {row.notes || '—'}
                                </td>
                              </tr>
                            );
                            });
                          })()}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Pay Advance Form Modal */}
      {showPayAdvanceForm && (
        <div className="modal-overlay" onClick={() => {
          setShowPayAdvanceForm(false);
          setPayAdvanceFormData({
            employeeId: '',
            amount: '',
            date: getLocalDateString()
          });
        }}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Pay Advance</h3>
              <button className="modal-close" onClick={() => {
                setShowPayAdvanceForm(false);
                setPayAdvanceFormData({
                  employeeId: '',
                  amount: '',
                  date: getLocalDateString()
                });
              }}>×</button>
            </div>
            <div className="modal-body">
              <form onSubmit={handlePayAdvanceSubmit}>
                <div className="form-group">
                  <label>Employee Name *</label>
                  <select
                    name="employeeId"
                    value={payAdvanceFormData.employeeId}
                    onChange={(e) => setPayAdvanceFormData({ ...payAdvanceFormData, employeeId: e.target.value })}
                    required
                  >
                    <option value="">Select Employee</option>
                    {employees.map((employee) => (
                      <option key={employee.id} value={employee.id}>
                        {employee.employeeName}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Advance Amount (₹) *</label>
                    <input
                      type="number"
                      name="amount"
                      value={payAdvanceFormData.amount}
                      onChange={(e) => setPayAdvanceFormData({ ...payAdvanceFormData, amount: e.target.value })}
                      min="0"
                      step="0.01"
                      placeholder="Enter advance amount"
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>Date *</label>
                    <input
                      type="date"
                      name="date"
                      value={payAdvanceFormData.date}
                      onChange={(e) => setPayAdvanceFormData({ ...payAdvanceFormData, date: e.target.value })}
                      required
                    />
                  </div>
                </div>
                <div className="form-actions">
                  <button type="submit" className="btn btn-primary">
                    Pay Advance
                  </button>
                  <button type="button" className="btn btn-secondary" onClick={() => {
                    setShowPayAdvanceForm(false);
                    setPayAdvanceFormData({
                      employeeId: '',
                      amount: '',
                      date: getLocalDateString()
                    });
                  }}>
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Pay Salary Form Modal */}
      {showPaySalaryForm && selectedEmployee && (
        <div className="modal-overlay" onClick={() => {
          setShowPaySalaryForm(false);
          setSelectedEmployee(null);
          setPaySalaryFormData({
            month: getLocalMonthString(),
            date: getLocalDateString(),
            paymentMethod: 'cash',
            amount: ''
          });
        }}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Pay Salary - {selectedEmployee.employeeName}</h3>
              <button className="modal-close" onClick={() => {
                setShowPaySalaryForm(false);
                setSelectedEmployee(null);
                setPaySalaryFormData({
                  month: getLocalMonthString(),
                  date: getLocalDateString(),
                  paymentMethod: 'cash',
                  amount: ''
                });
              }}>×</button>
            </div>
            <div className="modal-body">
              <form onSubmit={handlePaySalarySubmit}>
                <div className="form-group">
                  <label>Employee Name</label>
                  <input
                    type="text"
                    value={selectedEmployee.employeeName}
                    disabled
                    style={{ background: '#f5f5f5', cursor: 'not-allowed' }}
                  />
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Amount to Pay (₹) *</label>
                    <input
                      type="number"
                      name="amount"
                      value={paySalaryFormData.amount}
                      onChange={(e) => setPaySalaryFormData({ ...paySalaryFormData, amount: e.target.value })}
                      min="0"
                      step="0.01"
                      placeholder="Pending amount after advance deduction"
                      required
                    />
                    {selectedEmployee && (
                      <div style={{ marginTop: '8px', fontSize: '12px', color: '#666' }}>
                        <div>Total Salary: ₹{(Number(parseFloat(selectedEmployee?.salaryAmount || 0) || 0) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                        <div>Advance Taken: ₹{(Number(getAdvancePayments(selectedEmployee?.id) || 0) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                        <div style={{ fontWeight: '600', color: '#28a745', marginTop: '4px' }}>
                          Pending Amount: ₹{(Number(getPendingPayments(selectedEmployee?.id, selectedEmployee?.salaryAmount) || 0) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="form-group">
                    <label>Month *</label>
                    <input
                      type="month"
                      name="month"
                      value={paySalaryFormData.month}
                      onChange={(e) => setPaySalaryFormData({ ...paySalaryFormData, month: e.target.value })}
                      required
                    />
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Payment Date *</label>
                    <input
                      type="date"
                      name="date"
                      value={paySalaryFormData.date}
                      onChange={(e) => setPaySalaryFormData({ ...paySalaryFormData, date: e.target.value })}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>Payment Method *</label>
                    <select
                      name="paymentMethod"
                      value={paySalaryFormData.paymentMethod}
                      onChange={(e) => setPaySalaryFormData({ ...paySalaryFormData, paymentMethod: e.target.value })}
                      required
                    >
                      <option value="cash">Cash</option>
                      <option value="bank">Bank Transfer</option>
                      <option value="upi">UPI</option>
                      <option value="cheque">Cheque</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                </div>
                <div className="form-actions">
                  <button type="submit" className="btn btn-primary">
                    Pay Salary
                  </button>
                  <button type="button" className="btn btn-secondary" onClick={() => {
                    setShowPaySalaryForm(false);
                    setSelectedEmployee(null);
                    setPaySalaryFormData({
                      month: getLocalMonthString(),
                      date: getLocalDateString(),
                      paymentMethod: 'cash',
                      amount: ''
                    });
                  }}>
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Employee Ledger Modal */}
      {showEmployeeLedgerModal && selectedLedgerEmployee && (
        <div className="modal-overlay" onClick={() => setShowEmployeeLedgerModal(false)}>
          <div className="modal-content employee-ledger-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Employee Ledger - {selectedLedgerEmployee.employeeName}</h3>
              <button className="modal-close" onClick={() => setShowEmployeeLedgerModal(false)}>×</button>
            </div>
            <div className="modal-body">
              <div className="form-row">
                <div className="form-group">
                  <label>From</label>
                  <input
                    type="date"
                    value={employeeLedgerRange.from}
                    onChange={(e) => setEmployeeLedgerRange((prev) => ({ ...prev, from: e.target.value }))}
                  />
                </div>
                <div className="form-group">
                  <label>To</label>
                  <input
                    type="date"
                    value={employeeLedgerRange.to}
                    onChange={(e) => setEmployeeLedgerRange((prev) => ({ ...prev, to: e.target.value }))}
                  />
                </div>
                <div className="form-group ledger-filter-actions">
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => loadEmployeeLedger(selectedLedgerEmployee.id, employeeLedgerRange)}
                    disabled={employeeLedgerLoading}
                  >
                    {employeeLedgerLoading ? 'Loading...' : 'Load Ledger'}
                  </button>
                </div>
              </div>

              {(() => {
                const ledger = computeLedgerView(employeeLedgerRows);
                const summary = payrollSummaryByEmpId[String(selectedLedgerEmployee.id)] || null;
                const pending = Number(summary?.salaryRemaining ?? 0) || 0;
                const currentMonthPending = Math.max(0, pending);
                const currentMonthOverpaid = Math.max(0, -pending);
                const monthlySalary = Number(parseFloat(selectedLedgerEmployee?.salaryAmount || 0) || 0) || 0;
                const rangeMonths = countMonthsInRangeInclusive(employeeLedgerRange.from, employeeLedgerRange.to);
                const salaryDeservedInRange = monthlySalary * rangeMonths;
                const salaryCoveredInRange = (Number(ledger.advanceApplied) || 0) + (Number(ledger.salaryPaid) || 0);
                return (
                  <>
                    <div className="employee-ledger-kpis">
                      <div className="employee-ledger-kpi-card">
                        <h3>Total Taken (Advance)</h3>
                        <p className="kpi-value">₹{ledger.advanceGiven.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                      </div>
                      <div className="employee-ledger-kpi-card">
                        <h3>Salary Deserved (Range)</h3>
                        <p className="kpi-value">₹{salaryDeservedInRange.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                        <p className="kpi-hint">{rangeMonths} month(s) × ₹{monthlySalary.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                      </div>
                      <div className="employee-ledger-kpi-card">
                        <h3>Covered In Range</h3>
                        <p className="kpi-value">₹{salaryCoveredInRange.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                        <p className="kpi-hint">Advance applied + salary paid</p>
                      </div>
                      <div className="employee-ledger-kpi-card">
                        <h3>Left (Current Month)</h3>
                        <p className="kpi-value kpi-danger">₹{currentMonthPending.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                      </div>
                      <div className="employee-ledger-kpi-card">
                        <h3>Overpaid / Extra Advance</h3>
                        <p className="kpi-value kpi-warn">₹{currentMonthOverpaid.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                        <p className="kpi-hint">Carries to next month</p>
                      </div>
                      <div className="employee-ledger-kpi-card">
                        <h3>Advance Balance</h3>
                        <p className="kpi-value">₹{ledger.netAdvanceBalance.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                        <p className="kpi-hint">Given - applied</p>
                      </div>
                    </div>

                    {employeeLedgerLoading ? (
                      <Loading message="Loading employee ledger..." />
                    ) : ledger.lines.length === 0 ? (
                      <div className="empty-state-wrapper">
                        <span className="empty-icon">📒</span>
                        <p className="empty-state">No ledger entries found for selected range.</p>
                      </div>
                    ) : (
                      <div className="sales-table-wrapper employee-ledger-table-wrap">
                        <table className="data-table expenses-table">
                          <thead>
                            <tr>
                              <th>Date</th>
                              <th>Month</th>
                              <th>Type</th>
                              <th>Paid Via</th>
                              <th>Amount</th>
                              <th>Running Advance Balance</th>
                              <th>Notes</th>
                            </tr>
                          </thead>
                          <tbody>
                            {ledger.lines.map((row) => (
                              <tr key={row.id}>
                                <td>{row.eventDate ? new Date(row.eventDate).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '-'}</td>
                                <td>{row.month || '-'}</td>
                                <td>{getLedgerEventLabel(row.eventType)}</td>
                                <td>{row.paymentMode ? String(row.paymentMode).replace('_', ' ') : '-'}</td>
                                <td>₹{(Number(row._amount) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                <td>₹{(Number(row._runningAdvanceBalance) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                <td>{row.notes || '-'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* Add Employee Form Modal */}
      {showSalaryForm && (
        <div className="modal-overlay" onClick={() => {
          setShowSalaryForm(false);
          setSalaryFormData({
            employeeName: '',
            salaryAmount: '',
            joiningDate: getLocalDateString(),
            otherInformation: ''
          });
        }}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Add Employee</h3>
              <button className="modal-close" onClick={() => {
                setShowSalaryForm(false);
                setSalaryFormData({
                  employeeName: '',
                  salaryAmount: '',
                  joiningDate: getLocalDateString()
                });
              }}>×</button>
            </div>
            <div className="modal-body">
              <form onSubmit={async (e) => {
                e.preventDefault();
                const employeeData = {
                  employeeName: salaryFormData.employeeName,
                  salaryAmount: parseFloat(salaryFormData.salaryAmount) || 0,
                  joiningDate: salaryFormData.joiningDate
                };
                try {
                  await apiCreateEmployee(employeeData);
                  await loadEmployees();
                  setShowSalaryForm(false);
                  setSalaryFormData({
                    employeeName: '',
                    salaryAmount: '',
                    joiningDate: getLocalDateString()
                  });
                } catch (error) {
                  console.error('Error saving employee to API:', error);
                  showToast('Failed to save employee. Please check your connection and try again.', 'error');
                  // Don't use localStorage fallback - only use API
                }
              }}>
                <div className="form-group">
                  <label>Employee Name *</label>
                  <input
                    type="text"
                    name="employeeName"
                    value={salaryFormData.employeeName}
                    onChange={(e) => setSalaryFormData({ ...salaryFormData, employeeName: e.target.value })}
                    placeholder="Enter employee name"
                    required
                  />
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Salary Amount (₹) *</label>
                    <input
                      type="number"
                      name="salaryAmount"
                      value={salaryFormData.salaryAmount}
                      onChange={(e) => setSalaryFormData({ ...salaryFormData, salaryAmount: e.target.value })}
                      min="0"
                      step="0.01"
                      placeholder="Enter salary amount"
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>Joining Date *</label>
                    <input
                      type="date"
                      name="joiningDate"
                      value={salaryFormData.joiningDate}
                      onChange={(e) => setSalaryFormData({ ...salaryFormData, joiningDate: e.target.value })}
                      required
                    />
                  </div>
                </div>
                <div className="form-actions">
                  <button type="submit" className="btn btn-primary">
                    Add Employee
                  </button>
                  <button type="button" className="btn btn-secondary" onClick={() => {
                    setShowSalaryForm(false);
                    setSalaryFormData({
                      employeeName: '',
                      salaryAmount: '',
                      joiningDate: getLocalDateString(),
                      otherInformation: ''
                    });
                  }}>
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Employee Tab Content */}
      {activeTab === 'employee' && (
        <div className="expenses-tab-content">
          <div className="salaries-actions">
            <button className="btn btn-primary" onClick={() => setShowSalaryForm(true)}>
              + Add Employee
            </button>
            {/* Only show Pay Advance button if there are employees */}
            {employees.length > 0 && (
              <button className="btn btn-secondary" onClick={() => {
                setShowPayAdvanceForm(true);
                setPayAdvanceFormData({
                  employeeId: '',
                  amount: '',
                  date: getLocalDateString()
                });
              }}>
                💰 Pay Advance
              </button>
            )}
          </div>
          <div className="salaries-content">
            {loadingEmployees ? (
              <Loading message="Loading employees..." />
            ) : employees.length > 0 ? (
              <div className="expenses-table-container">
                {/* Desktop Table View */}
                <div className="sales-table-wrapper employee-table-scroll-wrap">
                  <table className="data-table expenses-table employee-payroll-table">
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Amount</th>
                        <th className="employee-col-joining">Joining Date</th>
                        <th title="Advance balance in ledger (given minus applied). Carries to the next month.">Advance balance</th>
                        <th title="Net salary due this month. Negative if advance taken is more than this month’s salary; next month adjusts.">Pending</th>
                        <th>Salary Status</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {employees.map((employee) => {
                        const advancePayments = Number(getAdvancePayments(employee?.id) || 0) || 0;
                        const pendingPayments = Number(getPendingPayments(employee?.id, employee?.salaryAmount) || 0) || 0;
                        const salaryStatus = getCurrentMonthSalaryStatus(employee?.id);
                        const safeSalary = Number(parseFloat(employee?.salaryAmount || 0) || 0) || 0;
                        const safeAdvance = isNaN(advancePayments) ? 0 : advancePayments;
                        const safePending = isNaN(pendingPayments) ? 0 : pendingPayments;
                        return (
                        <tr key={employee?.id}>
                          <td className="date-cell">{employee?.employeeName || '-'}</td>
                          <td className="amount-cell total-col">
                            <span className="expense-amount">₹{safeSalary.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                          </td>
                          <td className="employee-joining-date-cell" style={{ fontSize: '12px' }}>{employee?.joiningDate ? new Date(employee.joiningDate).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '-'}</td>
                          <td className="amount-cell">
                            <span className="expense-amount" style={{ color: '#ffc107' }}>
                              ₹{safeAdvance.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                          </td>
                          <td className="amount-cell" title={safePending < 0 ? 'Over-advance: deducted from next month salary when you settle or as balance carries forward.' : undefined}>
                            <span className="expense-amount" style={{ color: safePending < 0 ? '#b45309' : '#dc3545' }}>
                              ₹{safePending.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                          </td>
                          <td className="employee-salary-status-cell">
                            <span className={`payment-badge employee-salary-status-badge ${getSalaryStatusBadgeClass(employee?.id)}`}>
                              {salaryStatus}
                            </span>
                          </td>
                          <td className="actions-cell employee-actions-cell">
                            <div className="employee-actions-inner">
                              <button
                                className="btn-icon btn-pay-salary"
                                onClick={() => handlePaySalaryClick(employee)}
                                title="Pay Salary"
                              >
                                💰
                              </button>
                              <button
                                className="btn-icon btn-edit"
                                onClick={() => openEmployeeLedger(employee)}
                                title="View Ledger"
                              >
                                📒
                              </button>
                              <button
                                className="btn-icon btn-edit"
                                onClick={() => {
                                  // TODO: Implement edit functionality
                                  console.log('Edit employee', employee);
                                }}
                                title="Edit"
                              >
                                ✏️
                              </button>
                              <button
                                className="btn-icon btn-delete"
                                onClick={() => {
                                  showConfirm(
                                    'Delete Employee',
                                    `Are you sure you want to delete "${employee.employeeName}"? This action cannot be undone.`,
                                    async () => {
                                      try {
                                        await apiDeleteEmployee(employee.id);
                                        await loadEmployees();
                                        showToast('Employee deleted successfully!', 'success');
                                      } catch (error) {
                                        console.error('Error deleting employee from API:', error);
                                        showToast('Failed to delete employee. Please check your connection and try again.', 'error');
                                        // Don't use localStorage fallback - only use API
                                      }
                                    }
                                  );
                                }}
                                title="Delete"
                              >
                                🗑️
                              </button>
                            </div>
                          </td>
                        </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Mobile Card View - Expandable */}
                <div className="mobile-employees-cards">
                  {employees.map((employee) => {
                    const advancePayments = Number(getAdvancePayments(employee?.id) || 0) || 0;
                    const pendingPayments = Number(getPendingPayments(employee?.id, employee?.salaryAmount) || 0) || 0;
                    const salaryStatus = getCurrentMonthSalaryStatus(employee?.id);
                    const isExpanded = expandedEmployees.has(employee?.id);
                    const safeAdvance = isNaN(advancePayments) ? 0 : advancePayments;
                    const safePending = isNaN(pendingPayments) ? 0 : pendingPayments;
                    const safeSalary = Number(parseFloat(employee?.salaryAmount || 0) || 0) || 0;
                    return (
                      <div key={employee?.id} className={`employee-card ${isExpanded ? 'expanded' : ''}`}>
                        <div className="employee-card-header" onClick={() => toggleEmployee(employee?.id)}>
                          <button className="expand-toggle-btn">
                            {isExpanded ? '▲' : '▼'}
                          </button>
                          <div className="employee-card-title-section">
                            <div className="employee-card-main-info">
                              <span className="employee-card-name">{employee?.employeeName || '-'}</span>
                              <span className={`payment-badge ${getSalaryStatusBadgeClass(employee?.id)}`}>
                                {salaryStatus}
                              </span>
                            </div>
                            <span className="employee-card-amount">₹{safeSalary.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                          </div>
                        </div>
                        {isExpanded && (
                          <div className="employee-card-body">
                            <div className="employee-card-row">
                              <span className="employee-card-label">Joining Date:</span>
                              <span className="employee-card-value">
                                {employee?.joiningDate ? new Date(employee.joiningDate).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '-'}
                              </span>
                            </div>
                            <div className="employee-card-row">
                              <span className="employee-card-label">Advance balance:</span>
                              <span className="employee-card-value" style={{ color: '#ffc107', fontWeight: '700' }}>
                                ₹{safeAdvance.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </span>
                            </div>
                            <div className="employee-card-row">
                              <span className="employee-card-label">Pending Payment:</span>
                              <span className="employee-card-value" style={{ color: safePending < 0 ? '#b45309' : '#dc3545', fontWeight: '700' }}>
                                ₹{safePending.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </span>
                            </div>
                            <div className="employee-card-actions">
                              <button
                                className="btn-icon btn-pay-salary"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handlePaySalaryClick(employee);
                                }}
                                title="Pay Salary"
                              >
                                💰
                              </button>
                              <button
                                className="btn-icon btn-edit"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openEmployeeLedger(employee);
                                }}
                                title="View Ledger"
                              >
                                📒
                              </button>
                              <button
                                className="btn-icon btn-edit"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  console.log('Edit employee', employee);
                                }}
                                title="Edit"
                              >
                                ✏️
                              </button>
                              <button
                                className="btn-icon btn-delete"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  showConfirm(
                                    'Delete Employee',
                                    `Are you sure you want to delete "${employee.employeeName}"? This action cannot be undone.`,
                                    async () => {
                                      try {
                                        await apiDeleteEmployee(employee.id);
                                        await loadEmployees();
                                        showToast('Employee deleted successfully!', 'success');
                                      } catch (error) {
                                        console.error('Error deleting employee from API:', error);
                                        showToast('Failed to delete employee. Please check your connection and try again.', 'error');
                                        // Don't use localStorage fallback - only use API
                                      }
                                    }
                                  );
                                }}
                                title="Delete"
                              >
                                🗑️
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="empty-state-wrapper">
                <span className="empty-icon">👤</span>
                <p className="empty-state">No employees added yet</p>
                <p className="empty-subtitle">Click "Add Employee" to add your first employee</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Client Payment Tab Content */}
      {activeTab === 'client' && (
        <div className="expenses-tab-content">
          <div className="salaries-actions" style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
            <button className="btn btn-primary" onClick={() => setShowClientPurchaseForm(true)}>
              + Add Client Purchase
            </button>
            {clientPayments.length > 0 && (
              <button className="btn btn-secondary" onClick={() => {
                setShowClientPaymentForm(true);
                setClientPaymentFormData({
                  purchaseId: '',
                  amount: '',
                  date: getLocalDateString(),
                  paymentMethod: 'cash',
                  notes: ''
                });
              }}>
                💰 Make Payment
              </button>
            )}
            {clientPayments.length > 0 && (
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginLeft: 'auto' }}>
                <button 
                  className={`btn ${!showPaymentsTable ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={async () => {
                    setShowPaymentsTable(false);
                    // Reload purchases data when switching to purchases view
                    await loadClientPayments();
                  }}
                  style={{ fontSize: '13px', padding: '8px 16px' }}
                >
                  📦 Purchases
                </button>
                <button 
                  className={`btn ${showPaymentsTable ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={async () => {
                    setShowPaymentsTable(true);
                    // Load all payments from dedicated API endpoint
                    await loadAllPayments();
                  }}
                  style={{ fontSize: '13px', padding: '8px 16px' }}
                >
                  💰 All Payments
                </button>
              </div>
            )}
          </div>
          
          {/* Client Filter */}
          {clientPayments.length > 0 && (
            <div style={{ marginTop: '15px', marginBottom: '15px', display: 'flex', gap: '10px', alignItems: 'center' }}>
              <input
                type="text"
                placeholder="🔍 Filter by client name..."
                value={clientFilter}
                onChange={(e) => setClientFilter(e.target.value)}
                style={{
                  padding: '10px 14px',
                  border: 'none',
                  borderRadius: '12px',
                  fontSize: '14px',
                  width: '300px',
                  background: '#e0e5ec',
                  boxShadow: 'inset 3px 3px 6px rgba(163, 177, 198, 0.6), inset -3px -3px 6px rgba(255, 255, 255, 0.5)'
                }}
              />
              {clientFilter && (
                <button
                  onClick={() => setClientFilter('')}
                  style={{
                    padding: '10px 20px',
                    background: '#e0e5ec',
                    border: 'none',
                    borderRadius: '12px',
                    cursor: 'pointer',
                    fontSize: '13px',
                    fontWeight: '600'
                  }}
                >
                  Clear
                </button>
              )}
            </div>
          )}

          {/* Client Purchase Form Modal */}
          {showClientPurchaseForm && (
            <div className="modal-overlay" onClick={() => {
              setShowClientPurchaseForm(false);
              setClientPurchaseFormData({
                purchaseDescription: '',
                totalAmount: '',
                purchaseDate: getLocalDateString(),
                notes: ''
              });
              setClientPurchaseSupplierSelect('');
              setClientPurchaseNewSupplierName('');
              setClientPurchaseSupplierSearchQuery('');
            }}>
              <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                  <h3>Add Client Purchase</h3>
                  <button className="modal-close" onClick={() => {
                    setShowClientPurchaseForm(false);
                    setClientPurchaseFormData({
                      purchaseDescription: '',
                      totalAmount: '',
                      purchaseDate: getLocalDateString(),
                      notes: ''
                    });
                    setClientPurchaseSupplierSelect('');
                    setClientPurchaseNewSupplierName('');
                    setClientPurchaseSupplierSearchQuery('');
                  }}>×</button>
                </div>
                <div className="modal-body">
                  <form onSubmit={async (e) => {
                    e.preventDefault();
                    const resolvedClientName = resolveClientPurchaseClientName();
                    if (!resolvedClientName) {
                      showToast('Select a supplier or client from the list, or choose "Add new supplier / client…" and enter the name.', 'error');
                      return;
                    }
                    try {
                      // Prepare purchase data for API
                      const purchaseData = {
                        clientName: resolvedClientName,
                        purchaseDescription: clientPurchaseFormData.purchaseDescription,
                        totalAmount: parseFloat(clientPurchaseFormData.totalAmount) || 0,
                        purchaseDate: clientPurchaseFormData.purchaseDate,
                        notes: clientPurchaseFormData.notes || ''
                      };

                      // Create purchase via API
                      const newPurchase = await createClientPurchase(purchaseData);
                      
                      // Update local state
                      const updated = [...clientPayments, newPurchase];
                      saveClientPayments(updated);
                      
                      showToast(`Client purchase added successfully!`, 'success');
                      
                      setShowClientPurchaseForm(false);
                      setClientPurchaseFormData({
                        purchaseDescription: '',
                        totalAmount: '',
                        purchaseDate: getLocalDateString(),
                        notes: ''
                      });
                      setClientPurchaseSupplierSelect('');
                      setClientPurchaseNewSupplierName('');
                      setClientPurchaseSupplierSearchQuery('');
                    } catch (error) {
                      console.error('Error creating client purchase:', error);
                      // Fallback to localStorage if API fails
                      const newPurchase = {
                        id: Date.now().toString(),
                        clientName: resolvedClientName,
                        purchaseDescription: clientPurchaseFormData.purchaseDescription,
                        totalAmount: parseFloat(clientPurchaseFormData.totalAmount) || 0,
                        purchaseDate: clientPurchaseFormData.purchaseDate,
                        notes: clientPurchaseFormData.notes || '',
                        payments: [],
                        createdAt: new Date().toISOString()
                      };
                      const updated = [...clientPayments, newPurchase];
                      saveClientPayments(updated);
                      showToast(`Purchase saved locally (API unavailable). ${error.message}`, 'error');
                      
                      setShowClientPurchaseForm(false);
                      setClientPurchaseFormData({
                        purchaseDescription: '',
                        totalAmount: '',
                        purchaseDate: getLocalDateString(),
                        notes: ''
                      });
                      setClientPurchaseSupplierSelect('');
                      setClientPurchaseNewSupplierName('');
                      setClientPurchaseSupplierSearchQuery('');
                    }
                  }}>
                    <div className="form-group">
                      <label>Supplier / Client *</label>
                      <input
                        type="search"
                        placeholder="Search suppliers or clients…"
                        value={clientPurchaseSupplierSearchQuery}
                        onChange={(e) => setClientPurchaseSupplierSearchQuery(e.target.value)}
                        autoComplete="off"
                        disabled={loadingSuppliersForPurchase}
                        style={{ marginBottom: '8px', width: '100%' }}
                      />
                      <select
                        value={clientPurchaseSupplierSelect}
                        onChange={(e) => {
                          setClientPurchaseSupplierSelect(e.target.value);
                          if (e.target.value !== '__new__') setClientPurchaseNewSupplierName('');
                        }}
                        disabled={loadingSuppliersForPurchase}
                        style={{ width: '100%' }}
                      >
                        <option value="">Select supplier or client…</option>
                        {clientPurchasePickFiltered.suppliers.length > 0 && (
                          <optgroup label="Suppliers (master list)">
                            {clientPurchasePickFiltered.suppliers.map((s) => (
                              <option key={`s-${s.id}`} value={`s:${s.id}`}>{s.name}</option>
                            ))}
                          </optgroup>
                        )}
                        {clientPurchasePickFiltered.prior.length > 0 && (
                          <optgroup label="From previous purchases">
                            {clientPurchasePickFiltered.prior.map((n) => (
                              <option key={`p-${encodeURIComponent(n)}`} value={`p:${encodeURIComponent(n)}`}>{n}</option>
                            ))}
                          </optgroup>
                        )}
                        <option value="__new__">＋ Add new supplier / client…</option>
                      </select>
                      {loadingSuppliersForPurchase && (
                        <p style={{ marginTop: '8px', fontSize: '12px', color: '#64748b' }}>Loading suppliers…</p>
                      )}
                      {clientPurchaseSupplierSelect === '__new__' && (
                        <div style={{ marginTop: '12px' }}>
                          <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: 600 }}>New name *</label>
                          <input
                            type="text"
                            value={clientPurchaseNewSupplierName}
                            onChange={(e) => setClientPurchaseNewSupplierName(e.target.value)}
                            placeholder="Enter supplier or client name"
                          />
                        </div>
                      )}
                      <p style={{ marginTop: '10px', fontSize: '12px', color: '#64748b', lineHeight: 1.45 }}>
                        Suggestions include firms from your supplier master list and names from past client purchases.
                        A new name is stored on this purchase; to add a firm to the master supplier list, use inventory (admin).
                      </p>
                    </div>
                    <div className="form-group">
                      <label>Purchase Description *</label>
                      <input
                        type="text"
                        value={clientPurchaseFormData.purchaseDescription}
                        onChange={(e) => setClientPurchaseFormData({ ...clientPurchaseFormData, purchaseDescription: e.target.value })}
                        placeholder="What did you buy from client?"
                        required
                      />
                    </div>
                    <div className="form-row">
                      <div className="form-group">
                        <label>Total Amount (₹) *</label>
                        <input
                          type="number"
                          value={clientPurchaseFormData.totalAmount}
                          onChange={(e) => setClientPurchaseFormData({ ...clientPurchaseFormData, totalAmount: e.target.value })}
                          min="0"
                          step="0.01"
                          placeholder="Total amount to pay"
                          required
                        />
                      </div>
                      <div className="form-group">
                        <label>Purchase Date *</label>
                        <input
                          type="date"
                          value={clientPurchaseFormData.purchaseDate}
                          onChange={(e) => setClientPurchaseFormData({ ...clientPurchaseFormData, purchaseDate: e.target.value })}
                          required
                        />
                      </div>
                    </div>
                    <div className="form-group">
                      <label>Notes</label>
                      <textarea
                        value={clientPurchaseFormData.notes}
                        onChange={(e) => setClientPurchaseFormData({ ...clientPurchaseFormData, notes: e.target.value })}
                        placeholder="Additional notes (optional)"
                        rows="3"
                      />
                    </div>
                    <div className="form-actions">
                      <button type="submit" className="btn btn-primary">
                        Add Purchase
                      </button>
                      <button type="button" className="btn btn-secondary" onClick={() => {
                        setShowClientPurchaseForm(false);
                        setClientPurchaseFormData({
                          purchaseDescription: '',
                          totalAmount: '',
                          purchaseDate: getLocalDateString(),
                          notes: ''
                        });
                        setClientPurchaseSupplierSelect('');
                        setClientPurchaseNewSupplierName('');
                        setClientPurchaseSupplierSearchQuery('');
                      }}>
                        Cancel
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            </div>
          )}

          {/* Client Payment Form Modal */}
          {showClientPaymentForm && (
            <div className="modal-overlay" onClick={() => {
              setShowClientPaymentForm(false);
              setSelectedClientPurchase(null);
              setClientPaymentFormData({
                purchaseId: '',
                amount: '',
                date: getLocalDateString(),
                paymentMethod: 'cash',
                notes: ''
              });
            }}>
              <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                  <h3>Make Payment to Client</h3>
                  <button className="modal-close" onClick={() => {
                    setShowClientPaymentForm(false);
                    setSelectedClientPurchase(null);
                    setClientPaymentFormData({
                      purchaseId: '',
                      amount: '',
                      date: getLocalDateString(),
                      paymentMethod: 'cash',
                      notes: ''
                    });
                  }}>×</button>
                </div>
                <div className="modal-body">
                  <form onSubmit={async (e) => {
                    e.preventDefault();
                    
                    // Prevent double submission
                    if (submittingPayment) {
                      console.log('Payment already being submitted...');
                      return;
                    }
                    
                    console.log('Form submitted!', clientPaymentFormData);
                    console.log('Available purchases:', clientPayments);
                    
                    // Use selectedClientPurchase if available (more reliable)
                    let purchase = selectedClientPurchase;
                    
                    // If not available, try to find by ID (handle string/number mismatch)
                    if (!purchase && clientPaymentFormData.purchaseId) {
                      purchase = clientPayments.find(p => {
                        // Compare as strings to handle type mismatch
                        return String(p?.id) === String(clientPaymentFormData.purchaseId);
                      });
                    }
                    
                    if (!purchase) {
                      console.error('Purchase not found:', {
                        purchaseId: clientPaymentFormData.purchaseId,
                        selectedPurchase: selectedClientPurchase,
                        availablePurchases: clientPayments.map(p => ({ id: p.id, type: typeof p.id, clientName: p.clientName }))
                      });
                      showToast('Purchase not found. Please select a purchase from the dropdown.', 'error');
                      setSubmittingPayment(false);
                      return;
                    }
                    
                    console.log('Purchase found:', purchase);
                    
                    setSubmittingPayment(true);
                    
                    const payments = purchase?.payments || [];
                    const paidAmount = Number((Array.isArray(payments) ? payments.reduce((sum, p) => sum + (parseFloat(p?.amount) || 0), 0) : 0) || 0) || 0;
                    const totalAmount = Number(parseFloat(purchase?.totalAmount || 0) || 0) || 0;
                    const pendingAmount = Number((totalAmount - paidAmount) || 0) || 0;
                    const paymentAmount = Number(parseFloat(clientPaymentFormData?.amount || 0) || 0) || 0;
                    const safePending = isNaN(pendingAmount) ? 0 : pendingAmount;
                    const safePayment = isNaN(paymentAmount) ? 0 : paymentAmount;
                    
                    if (safePayment <= 0) {
                      showToast('Please enter a valid payment amount', 'error');
                      console.error('Invalid payment amount:', safePayment);
                      setSubmittingPayment(false);
                      return;
                    }
                    
                    if (safePayment > safePending) {
                      showToast(`Payment amount (₹${safePayment.toLocaleString('en-IN')}) exceeds pending amount (₹${safePending.toLocaleString('en-IN')})`, 'error');
                      console.error('Payment exceeds pending:', { safePayment, safePending });
                      setSubmittingPayment(false);
                      return;
                    }
                    
                    console.log('Validation passed. Proceeding with payment...');
                    
                    try {
                      // Simple API call to track payment transaction
                      // Ensure data format matches API requirements
                      const paymentData = {
                        clientId: purchase.clientId || purchase.clientName,
                        amount: Number(paymentAmount), // Ensure it's a number, not string
                        date: clientPaymentFormData.date, // Already in YYYY-MM-DD format from date input
                        paymentMethod: clientPaymentFormData.paymentMethod.toLowerCase(), // Ensure lowercase
                        notes: clientPaymentFormData.notes || ''
                      };
                      
                      console.log('Adding payment to API:', {
                        endpoint: `/client-purchases/${purchase.id}/payments`,
                        purchaseId: purchase.id,
                        paymentData
                      });
                      
                      // Add payment via simple API endpoint
                      const response = await addClientPayment(purchase.id, paymentData);
                      console.log('Payment added successfully:', response);
                      
                      // Reload purchases to get updated data
                      console.log('Reloading purchases to update pending amounts...');
                      await loadClientPayments();
                      
                      // Also fetch all payments and merge them into purchases to ensure paid amount is updated
                      try {
                        const allPayments = await fetchAllPayments();
                        if (allPayments && Array.isArray(allPayments)) {
                          // Group payments by purchaseId/clientPurchaseId
                          const paymentsByPurchase = {};
                          allPayments.forEach(payment => {
                            const purchaseId = payment.clientPurchaseId || payment.purchaseId;
                            if (purchaseId) {
                              if (!paymentsByPurchase[purchaseId]) {
                                paymentsByPurchase[purchaseId] = [];
                              }
                              paymentsByPurchase[purchaseId].push(payment);
                            }
                          });
                          
                          // Update clientPayments state with merged payments
                          setClientPayments(prevPurchases => {
                            return prevPurchases.map(p => {
                              const purchaseId = String(p.id);
                              const payments = paymentsByPurchase[purchaseId] || p.payments || [];
                              return {
                                ...p,
                                payments: payments
                              };
                            });
                          });
                          
                          console.log('Payments merged with purchases. Updated paid amounts should now be visible.');
                        }
                      } catch (error) {
                        console.error('Error fetching payments to merge:', error);
                        // Continue anyway - purchases were already reloaded
                      }
                      
                      // Verify the update
                      const updatedPurchases = await fetchClientPurchases();
                      const updatedPurchase = updatedPurchases?.find(p => String(p.id) === String(purchase.id));
                      if (updatedPurchase) {
                        // Try to get payments for this purchase from allPayments
                        try {
                          const allPayments = await fetchAllPayments();
                          const purchasePayments = allPayments?.filter(p => 
                            String(p.clientPurchaseId || p.purchaseId) === String(purchase.id)
                          ) || [];
                          const updatedPaidAmount = purchasePayments.reduce((sum, p) => sum + (parseFloat(p?.amount) || 0), 0);
                          const updatedPendingAmount = (updatedPurchase.totalAmount || 0) - updatedPaidAmount;
                          console.log('Updated amounts:', {
                            totalAmount: updatedPurchase.totalAmount,
                            paidAmount: updatedPaidAmount,
                            pendingAmount: updatedPendingAmount,
                            paymentCount: purchasePayments.length
                          });
                        } catch (err) {
                          console.error('Error verifying payment amounts:', err);
                        }
                      }
                      
                      // Backend POST .../payments already mirrors this outflow to expenses via
                      // ClientTransactionService (one expense). Do not call createExpense here — it double-counts.
                      await loadExpenses();
                      await loadBudgetState();
                      if (onExpenseUpdate) onExpenseUpdate();
                      showToast(`Payment of ₹${paymentAmount.toLocaleString('en-IN')} recorded.`, 'success');
                      
                      // Only close modal on success
                      setShowClientPaymentForm(false);
                      setSelectedClientPurchase(null);
                      setClientPaymentFormData({
                        purchaseId: '',
                        amount: '',
                        date: getLocalDateString(),
                        paymentMethod: 'cash',
                        notes: ''
                      });
                    } catch (error) {
                      console.error('Error adding client payment:', error);
                      showToast(`Failed to record payment: ${error.message}`, 'error');
                      // Don't close modal on error - let user try again
                    } finally {
                      setSubmittingPayment(false);
                    }
                  }}>
                    <div className="form-group">
                      <label>Select Purchase *</label>
                      <select
                        value={clientPaymentFormData.purchaseId}
                        onChange={(e) => {
                          const selectedId = e.target.value;
                          // Find purchase by comparing as strings to handle type mismatch
                          const purchase = clientPayments.find(p => String(p.id) === String(selectedId));
                          console.log('Purchase selected:', { selectedId, purchase, allPurchases: clientPayments });
                          setSelectedClientPurchase(purchase);
                          setClientPaymentFormData({ ...clientPaymentFormData, purchaseId: selectedId });
                        }}
                        required
                      >
                        <option value="">Select Purchase</option>
                        {clientPayments.map((purchase) => {
                          const payments = purchase?.payments || [];
                          const paidAmount = Number((Array.isArray(payments) ? payments.reduce((sum, p) => sum + (parseFloat(p?.amount) || 0), 0) : 0) || 0) || 0;
                          const totalAmount = Number(parseFloat(purchase?.totalAmount || 0) || 0) || 0;
                          const pendingAmount = Number((totalAmount - paidAmount) || 0) || 0;
                          const safePending = isNaN(pendingAmount) ? 0 : pendingAmount;
                          if (safePending <= 0) return null;
                          return (
                            <option key={purchase?.id} value={purchase?.id}>
                              {purchase?.clientName || '-'} - {purchase?.purchaseDescription || '-'} (Pending: ₹{safePending.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})
                            </option>
                          );
                        })}
                      </select>
                    </div>
                    {selectedClientPurchase && (
                      <div className="form-group" style={{ background: '#f8f9fa', padding: '10px', borderRadius: '8px', marginBottom: '15px' }}>
                        <strong>Total Amount:</strong> ₹{(Number(parseFloat(selectedClientPurchase?.totalAmount || 0) || 0) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}<br />
                        <strong>Paid Amount:</strong> ₹{(Number(selectedClientPurchase?.payments?.reduce((sum, p) => sum + (parseFloat(p?.amount) || 0), 0) || 0) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}<br />
                        <strong>Pending Amount:</strong> ₹{(Number((selectedClientPurchase?.totalAmount || 0) - (selectedClientPurchase?.payments?.reduce((sum, p) => sum + (parseFloat(p?.amount) || 0), 0) || 0) || 0) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </div>
                    )}
                    <div className="form-row">
                      <div className="form-group">
                        <label>Payment Amount (₹) *</label>
                        <input
                          type="number"
                          value={clientPaymentFormData.amount}
                          onChange={(e) => setClientPaymentFormData({ ...clientPaymentFormData, amount: e.target.value })}
                          min="0"
                          step="0.01"
                          placeholder="Enter payment amount"
                          required
                        />
                      </div>
                      <div className="form-group">
                        <label>Payment Date *</label>
                        <input
                          type="date"
                          value={clientPaymentFormData.date}
                          onChange={(e) => setClientPaymentFormData({ ...clientPaymentFormData, date: e.target.value })}
                          required
                        />
                      </div>
                    </div>
                    <div className="form-group">
                      <label>Payment Method *</label>
                      <select
                        value={clientPaymentFormData.paymentMethod}
                        onChange={(e) => setClientPaymentFormData({ ...clientPaymentFormData, paymentMethod: e.target.value })}
                        required
                      >
                        <option value="cash">Cash</option>
                        <option value="bank">Bank Transfer</option>
                        <option value="upi">UPI</option>
                        <option value="cheque">Cheque</option>
                        <option value="other">Other</option>
                      </select>
                    </div>
                    <div className="form-group">
                      <label>Notes</label>
                      <textarea
                        value={clientPaymentFormData.notes}
                        onChange={(e) => setClientPaymentFormData({ ...clientPaymentFormData, notes: e.target.value })}
                        placeholder="Payment notes (optional)"
                        rows="2"
                      />
                    </div>
                    <div className="form-actions">
                      <button type="submit" className="btn btn-primary" disabled={submittingPayment}>
                        {submittingPayment ? (
                          <>
                            <span className="button-loading"></span>
                            Processing...
                          </>
                        ) : (
                          'Make Payment'
                        )}
                      </button>
                      <button type="button" className="btn btn-secondary" onClick={() => {
                        setShowClientPaymentForm(false);
                        setSelectedClientPurchase(null);
                        setClientPaymentFormData({
                          purchaseId: '',
                          amount: '',
                          date: getLocalDateString(),
                          paymentMethod: 'cash',
                          notes: ''
                        });
                      }}>
                        Cancel
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            </div>
          )}

          <div className="salaries-content">
            {clientPayments.length > 0 ? (
              <>
                {/* Purchases Table View */}
                {!showPaymentsTable && (
                  <div className="expenses-table-container client-purchases-table-wrap">
                    <div className="sales-table-wrapper client-purchases-scroll-wrap">
                      <table className="data-table expenses-table client-purchases-table">
                        <thead>
                          <tr>
                            <th>Client Name</th>
                            <th>Description</th>
                            <th>Purchase Date</th>
                            <th>Total Amount</th>
                            <th>Paid Amount</th>
                            <th>Pending Amount</th>
                            <th>Status</th>
                            <th>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {clientPayments
                            .filter(purchase => 
                              !clientFilter || 
                              purchase?.clientName?.toLowerCase().includes(clientFilter.toLowerCase())
                            )
                            .map((purchase) => {
                        const payments = purchase?.payments || [];
                        const paidAmount = Number((Array.isArray(payments) ? payments.reduce((sum, p) => sum + (parseFloat(p?.amount) || 0), 0) : 0) || 0) || 0;
                        const totalAmount = Number(parseFloat(purchase?.totalAmount || 0) || 0) || 0;
                        const pendingAmount = Number((totalAmount - paidAmount) || 0) || 0;
                        const isFullyPaid = pendingAmount <= 0;
                        const safePaid = isNaN(paidAmount) ? 0 : paidAmount;
                        const safeTotal = isNaN(totalAmount) ? 0 : totalAmount;
                        const safePending = isNaN(pendingAmount) ? 0 : pendingAmount;
                        return (
                          <tr key={purchase?.id}>
                            <td className="date-cell client-purchase-client-cell">{purchase?.clientName || '-'}</td>
                            <td className="client-purchase-desc-cell">
                              <span className="client-purchase-desc-inner">{purchase?.purchaseDescription || '-'}</span>
                            </td>
                            <td style={{ fontSize: '12px' }}>
                              {purchase?.purchaseDate ? new Date(purchase.purchaseDate).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '-'}
                            </td>
                            <td className="amount-cell total-col">
                              <span className="expense-amount">₹{safeTotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                            </td>
                            <td className="amount-cell">
                              <span className="expense-amount" style={{ color: '#28a745' }}>₹{safePaid.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                            </td>
                            <td className="amount-cell">
                              <span className="expense-amount" style={{ color: safePending > 0 ? '#dc3545' : '#28a745' }}>
                                ₹{safePending.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </span>
                            </td>
                            <td className="client-purchase-status-cell">
                              <span className="client-purchase-status-badge" style={{
                                padding: '4px 8px',
                                borderRadius: '4px',
                                fontSize: '12px',
                                fontWeight: '600',
                                background: isFullyPaid ? '#d4edda' : '#fff3cd',
                                color: isFullyPaid ? '#155724' : '#856404'
                              }}>
                                {isFullyPaid ? 'Paid' : 'Pending'}
                              </span>
                            </td>
                            <td className="client-purchase-actions-cell">
                              <div className="action-buttons client-purchase-action-buttons">
                                <button
                                  className="action-btn"
                                  onClick={() => {
                                    setSelectedClientPurchase(purchase);
                                    setClientPaymentFormData({
                                      purchaseId: purchase.id,
                                      amount: pendingAmount > 0 ? pendingAmount.toString() : '',
                                      date: getLocalDateString(),
                                      paymentMethod: 'cash',
                                      notes: ''
                                    });
                                    setShowClientPaymentForm(true);
                                  }}
                                  title="Make Payment"
                                  disabled={isFullyPaid}
                                >
                                  💰
                                </button>
                                <button
                                  className="action-btn"
                                  onClick={() => {
                                    showConfirm(
                                      'Delete Purchase',
                                      `Are you sure you want to delete this purchase and all its payments? This action cannot be undone.`,
                                      async () => {
                                        try {
                                          // Delete from API
                                          await deleteClientPurchase(purchase.id);
                                          
                                          // Update local state
                                          const updated = clientPayments.filter(p => p.id !== purchase.id);
                                          saveClientPayments(updated);
                                          
                                          showToast('Client purchase deleted successfully!', 'success');
                                        } catch (error) {
                                          console.error('Error deleting client purchase:', error);
                                          // Fallback to localStorage if API fails
                                          const updated = clientPayments.filter(p => p.id !== purchase.id);
                                          saveClientPayments(updated);
                                          showToast(`Purchase deleted locally (API unavailable). ${error.message}`, 'error');
                                        }
                                      }
                                    );
                                  }}
                                  title="Delete"
                                >
                                  🗑️
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                            })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* All Payments Table View */}
                {showPaymentsTable && (() => {
                  // Use payments from API (allPayments state) - fetched from GET /api/client-purchases/payments
                  // Filter by client name if filter is set
                  const filteredPayments = clientFilter
                    ? allPayments.filter(p => 
                        (p?.clientName?.toLowerCase().includes(clientFilter.toLowerCase()) ||
                         p?.clientId?.toLowerCase().includes(clientFilter.toLowerCase()))
                      )
                    : allPayments;

                  // Sort by date (newest first)
                  filteredPayments.sort((a, b) => {
                    const dateA = new Date(a.date || a.createdAt || 0).getTime();
                    const dateB = new Date(b.date || b.createdAt || 0).getTime();
                    return dateB - dateA;
                  });

                  return (
                    <div className="expenses-table-container">
                      <div className="sales-table-wrapper">
                        <table className="data-table expenses-table">
                          <thead>
                            <tr>
                              <th>Payment Date</th>
                              <th>Client Name</th>
                              <th>Payment Amount</th>
                              <th>Payment Method</th>
                              <th>Notes</th>
                            </tr>
                          </thead>
                          <tbody>
                            {filteredPayments.length > 0 ? (
                              filteredPayments.map((payment, index) => {
                                const paymentAmount = Number(parseFloat(payment?.amount || 0) || 0) || 0;
                                const safeAmount = isNaN(paymentAmount) ? 0 : paymentAmount;
                                return (
                                  <tr key={payment?.id || index}>
                                    <td className="date-cell">
                                      {payment?.date 
                                        ? new Date(payment.date).toLocaleDateString('en-IN', { 
                                            day: '2-digit', 
                                            month: '2-digit', 
                                            year: 'numeric' 
                                          })
                                        : payment?.createdAt
                                        ? new Date(payment.createdAt).toLocaleDateString('en-IN', { 
                                            day: '2-digit', 
                                            month: '2-digit', 
                                            year: 'numeric' 
                                          })
                                        : '-'}
                                    </td>
                                    <td className="date-cell" style={{ fontWeight: '600' }}>
                                      {payment?.clientName || payment?.clientId || '-'}
                                    </td>
                                    <td className="amount-cell total-col">
                                      <span className="expense-amount" style={{ color: '#28a745', fontWeight: '700' }}>
                                        ₹{safeAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                      </span>
                                    </td>
                                    <td>
                                      <span style={{
                                        padding: '4px 8px',
                                        borderRadius: '4px',
                                        fontSize: '11px',
                                        fontWeight: '600',
                                        textTransform: 'capitalize',
                                        background: '#e0e5ec',
                                        color: '#333'
                                      }}>
                                        {payment?.paymentMethod || 'cash'}
                                      </span>
                                    </td>
                                    <td style={{ fontSize: '12px', color: '#666' }}>
                                      {payment?.notes || '-'}
                                    </td>
                                  </tr>
                                );
                              })
                            ) : (
                              <tr>
                                <td colSpan="6" style={{ textAlign: 'center', padding: '40px' }}>
                                  <span className="empty-icon">💰</span>
                                  <p className="empty-state">No payments found</p>
                                  {clientFilter && (
                                    <p className="empty-subtitle">Try a different client name</p>
                                  )}
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  );
                })()}
              </>
            ) : (
              <div className="empty-state-wrapper">
                <span className="empty-icon">💼</span>
                <p className="empty-state">No client purchases added yet</p>
                <p className="empty-subtitle">Click "Add Client Purchase" to record your first purchase</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Expenses Table */}
      {activeTab === 'all' && (
      <div className="expenses-table-container">
        {loadingExpenses ? (
          <Loading message="Loading expenses..." />
        ) : filteredExpenses.length > 0 ? (
          <>
            {/* Desktop Table View */}
            <div className="sales-table-wrapper">
              <table className="data-table expenses-table expenses-main-list-table">
                <thead>
                  <tr>
                    <th className="sortable" onClick={() => handleSort('date')}>
                      Date
                      {sortConfig.key === 'date' && (
                        <span className="sort-icon">{sortConfig.direction === 'asc' ? ' ↑' : ' ↓'}</span>
                      )}
                    </th>
                    <th className="sortable" onClick={() => handleSort('type')}>
                      Type
                      {sortConfig.key === 'type' && (
                        <span className="sort-icon">{sortConfig.direction === 'asc' ? ' ↑' : ' ↓'}</span>
                      )}
                    </th>
                    <th>Details</th>
                    <th className="sortable" onClick={() => handleSort('amount')}>
                      Amount
                      {sortConfig.key === 'amount' && (
                        <span className="sort-icon">{sortConfig.direction === 'asc' ? ' ↑' : ' ↓'}</span>
                      )}
                    </th>
                    <th>Payment Method</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedExpenses.map((expense) => (
                    <tr key={expense.id}>
                      <td className="date-cell">{formatDate(expense.date)}</td>
                      <td>
                        <span className={`expense-type-badge type-${expense.type}`}>
                          {getTypeIcon(expense.type)} {getTypeLabel(expense.type)}
                        </span>
                      </td>
                      <td className="expense-details-cell">
                        <div className="expense-details-inner">
                          <strong>{formatExpenseCategoryLabel(expense.category)}</strong>
                          {expense.description && (
                            <div className="expense-desc expense-desc--wrapped">{expense.description}</div>
                          )}
                        </div>
                      </td>
                      <td className="amount-cell total-col">
                        <span className="expense-amount">₹{(Number(parseFloat(expense?.amount || 0) || 0) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                      </td>
                      <td>
                        <span className="payment-badge">{expense.paymentMethod}</span>
                      </td>
                      <td className="actions-cell">
                        <button
                          className="btn-icon btn-edit"
                          onClick={() => handleEdit(expense)}
                          title="Edit"
                        >
                          ✏️
                        </button>
                        <button
                          className="btn-icon btn-delete"
                          onClick={() => handleDelete(expense.id)}
                          title="Delete"
                        >
                          🗑️
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Card View - Expandable */}
            <div className="mobile-expenses-cards">
              {paginatedExpenses.map((expense) => {
                const isExpanded = expandedExpenses.has(expense.id);
                return (
                  <div key={expense.id} className={`expense-card ${isExpanded ? 'expanded' : ''}`}>
                    <div className="expense-card-header" onClick={() => toggleExpense(expense.id)}>
                      <button className="expand-toggle-btn">
                        {isExpanded ? '▲' : '▼'}
                      </button>
                      <div className="expense-card-title-section">
                        <div className="expense-card-main-info">
                          <span className="expense-card-category">{formatExpenseCategoryLabel(expense.category)}</span>
                          <span className="expense-card-amount">₹{(Number(parseFloat(expense?.amount || 0) || 0) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                        </div>
                        <span className={`expense-type-badge type-${expense.type}`}>
                          {getTypeIcon(expense.type)} {getTypeLabel(expense.type)}
                        </span>
                      </div>
                    </div>
                    {isExpanded && (
                      <div className="expense-card-body">
                        <div className="expense-card-row">
                          <span className="expense-card-label">Date:</span>
                          <span className="expense-card-value">{formatDate(expense.date)}</span>
                        </div>
                        {expense.description && (
                          <div className="expense-card-row expense-card-row--description">
                            <span className="expense-card-label">Description:</span>
                            <span className="expense-card-value expense-card-value--wrap">{expense.description}</span>
                          </div>
                        )}
                        <div className="expense-card-row">
                          <span className="expense-card-label">Payment Method:</span>
                          <span className="payment-badge">{expense.paymentMethod}</span>
                        </div>
                        <div className="expense-card-actions">
                          <button
                            className="btn-icon btn-edit"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleEdit(expense);
                            }}
                            title="Edit"
                          >
                            ✏️
                          </button>
                          <button
                            className="btn-icon btn-delete"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDelete(expense.id);
                            }}
                            title="Delete"
                          >
                            🗑️
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            {/* Pagination */}
            {totalPages > 1 && (
              <div className="pagination-wrapper">
                <div className="pagination-info">
                  Showing {startIndex + 1} - {Math.min(endIndex, filteredExpenses.length)} of {filteredExpenses.length} expenses
                </div>
                <div className="pagination-controls">
                  <button
                    className="pagination-btn"
                    onClick={() => setCurrentPage(currentPage - 1)}
                    disabled={currentPage === 1}
                  >
                    ← Previous
                  </button>
                  <div className="pagination-numbers">
                    {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => {
                      if (
                        page === 1 ||
                        page === totalPages ||
                        (page >= currentPage - 1 && page <= currentPage + 1)
                      ) {
                        return (
                          <button
                            key={page}
                            className={`pagination-number ${currentPage === page ? 'active' : ''}`}
                            onClick={() => setCurrentPage(page)}
                          >
                            {page}
                          </button>
                        );
                      } else if (page === currentPage - 2 || page === currentPage + 2) {
                        return <span key={page} className="pagination-ellipsis">...</span>;
                      }
                      return null;
                    })}
                  </div>
                  <button
                    className="pagination-btn"
                    onClick={() => setCurrentPage(currentPage + 1)}
                    disabled={currentPage === totalPages}
                  >
                    Next →
                  </button>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="empty-state-wrapper">
            <span className="empty-icon">📝</span>
            <p className="empty-state">No expenses recorded yet</p>
            <p className="empty-subtitle">Click "Add Expense" to record your first expense</p>
          </div>
        )}
      </div>
      )}

      {/* Toast Notification */}
      {toast && (
        <div className={`toast toast-${toast.type}`}>
          <span className="toast-message">{toast.message}</span>
          <button className="toast-close" onClick={() => setToast(null)}>×</button>
        </div>
      )}

      {/* Confirmation Modal */}
      <ConfirmationModal
        isOpen={confirmModal.isOpen}
        onClose={() => setConfirmModal({ isOpen: false, onConfirm: null, title: '', message: '' })}
        onConfirm={confirmModal.onConfirm || (() => {})}
        title={confirmModal.title}
        message={confirmModal.message}
        type="danger"
      />
    </div>
  );
};

export default Expenses;

