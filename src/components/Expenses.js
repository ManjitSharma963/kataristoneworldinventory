import React, { useState, useEffect, useMemo, useCallback } from 'react';
// Note: localStorage functions are no longer used - all data comes from API
// Keeping imports for potential future use or reference, but not actively used
import { getExpenses, addExpense, updateExpense, deleteExpense, getEmployees, addEmployee, updateEmployee, deleteEmployee } from '../utils/storage';
import {
  apiFetchExpenses,
  apiCreateExpense,
  apiUpdateExpense,
  apiDeleteExpense,
  apiFetchEmployees,
  fetchEmployeePayrollSummary,
  fetchEmployeePayrollLedger,
  recordEmployeeAdvance,
  settleEmployeeSalaryMonth,
  apiCreateEmployee,
  apiUpdateEmployee,
  apiDeleteEmployee,
  fetchClientPurchases,
  createClientPurchase,
  updateClientPurchase,
  deleteClientPurchase,
  addClientPayment,
  fetchAllPayments,
  fetchClientRunningLedger,
  fetchClientDueAlerts,
  apiGetDailyBudget,
  apiGetDailyBudgetByDate,
  apiGetBalanceSummary,
  apiGetLedgerTransactions,
  apiRecordLoanReceipt,
  apiFetchLoanLenders,
  apiFetchLoanLenderLedger,
  apiFetchLendBorrowers,
  apiFetchLendBorrowerLedger,
  apiRecordLoanGiven,
  apiRecordLoanGivenCollection,
  apiCreateDailyBudget,
  apiUpdateDailyBudget,
  apiDeleteDailyBudget,
  apiFetchSuppliers
} from '../api/expensesFacade';
import { useForm } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import { expenseSchema, employeeSchema, salaryPaymentSchema, advancePaymentSchema, clientPurchaseSchema, clientPaymentSchema } from '../utils/validation';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import Loading from './Loading';
import ConfirmationModal from './ConfirmationModal';
import { useExpensesData } from '../hooks/useExpensesData';
import { useExpensesForms } from '../hooks/useExpensesForms';
import ExpensesHeader from './expenses/ExpensesHeader';
import LoanPanel from './expenses/LoanPanel';
import BudgetHistorySection from './expenses/BudgetHistorySection';
import EmployeeLedgerModal from './expenses/EmployeeLedgerModal';
import './Expenses.css';

/** Payment-channel bucket shown in budget history “Source” column. */
const BUDGET_SOURCE_CASH_UPI = 'Cash + UPI';
const BUDGET_SOURCE_BANK = 'Bank + card + cheque';

/** Cash+UPI vs bank rails from unified ledger payment_mode. */
function ledgerPaymentChannel(paymentMode) {
  const m = String(paymentMode ?? '').trim().toUpperCase();
  if (m === 'CASH' || m === 'UPI') return BUDGET_SOURCE_CASH_UPI;
  return BUDGET_SOURCE_BANK;
}

/** How salary / advance was paid out — matches backend {@code BillPaymentMode} strings. */
const EMPLOYEE_PAYMENT_MODE_OPTIONS = [
  { value: 'CASH', label: 'Cash' },
  { value: 'UPI', label: 'UPI' },
  { value: 'BANK_TRANSFER', label: 'Bank transfer' },
  { value: 'CHEQUE', label: 'Cheque' },
  { value: 'OTHER', label: 'Other / card' },
];

function normalizeEmployeePaymentModeForApi(raw) {
  if (raw == null || raw === '') return 'CASH';
  const s = String(raw).trim();
  const u = s.toUpperCase().replace(/-/g, '_');
  const allowed = new Set(['CASH', 'UPI', 'BANK_TRANSFER', 'CHEQUE', 'OTHER']);
  if (allowed.has(u)) return u;
  const lower = s.toLowerCase();
  if (lower === 'cash') return 'CASH';
  if (lower === 'upi') return 'UPI';
  if (lower === 'bank' || lower === 'banktransfer' || lower === 'bank_transfer') return 'BANK_TRANSFER';
  if (lower === 'cheque' || lower === 'check') return 'CHEQUE';
  if (lower === 'other' || lower === 'card') return 'OTHER';
  return 'CASH';
}

/** Integer YYYYMMDD for stable newest-first sort without UTC parsing bugs on `YYYY-MM-DD`. */
function expenseCalendarDayKey(e) {
  const raw = e?.date;
  if (raw == null || raw === '') return 0;
  const s = String(raw).trim().slice(0, 10);
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) {
    const y = Number(m[1]);
    const mo = Number(m[2]);
    const d = Number(m[3]);
    if (Number.isFinite(y) && Number.isFinite(mo) && Number.isFinite(d)) {
      return y * 10000 + mo * 100 + d;
    }
  }
  const t = new Date(raw).getTime();
  if (Number.isNaN(t)) return 0;
  const dt = new Date(t);
  return dt.getFullYear() * 10000 + (dt.getMonth() + 1) * 100 + dt.getDate();
}

function expenseRecencyMs(e) {
  const ca = e?.createdAt ?? e?.created_at;
  if (ca) {
    const t = new Date(ca).getTime();
    if (!Number.isNaN(t)) return t;
  }
  return 0;
}

function expenseNumericId(e) {
  const id = e?.id;
  if (typeof id === 'number' && Number.isFinite(id)) return id;
  if (typeof id === 'string') {
    const t = id.trim();
    if (/^\d+$/.test(t)) return Number(t);
    const m = t.match(/(\d+)$/);
    if (m) return Number(m[1]);
  }
  return 0;
}

const Expenses = ({ hideHeader = false, hideStats = false, showAddButtonInHeader = false, showForm: externalShowForm = null, onFormClose = null, onFormOpen = null, onExpenseUpdate = null }) => {
  const {
    expenses,
    setExpenses,
    loadingExpenses,
    apiError,
    setApiError,
    clientLedgerFeedRows,
    loadExpenses
  } = useExpensesData({ apiFetchExpenses, apiGetLedgerTransactions });
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
  const [showEditEmployeeModal, setShowEditEmployeeModal] = useState(false);
  const [editEmployeeForm, setEditEmployeeForm] = useState({
    id: null,
    employeeName: '',
    salaryAmount: '',
    joiningDate: '',
  });
  const [savingEditEmployee, setSavingEditEmployee] = useState(false);
  const [showPaySalaryForm, setShowPaySalaryForm] = useState(false);
  const [showPayAdvanceForm, setShowPayAdvanceForm] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [clientPayments, setClientPayments] = useState([]);
  const [allPayments, setAllPayments] = useState([]); // All payments from API
  const [showClientPurchaseForm, setShowClientPurchaseForm] = useState(false);
  const [showClientPaymentForm, setShowClientPaymentForm] = useState(false);
  const [selectedClientPurchase, setSelectedClientPurchase] = useState(null);
  const [clientFilter, setClientFilter] = useState(''); // Filter by client name
  const [clientDueAlerts, setClientDueAlerts] = useState([]);
  const [showClientRunningLedgerModal, setShowClientRunningLedgerModal] = useState(false);
  const [clientRunningLedgerTitle, setClientRunningLedgerTitle] = useState('');
  const [clientRunningLedgerRows, setClientRunningLedgerRows] = useState([]);
  const [loadingClientRunningLedger, setLoadingClientRunningLedger] = useState(false);
  const [showPaymentsTable, setShowPaymentsTable] = useState(false); // Toggle between purchases and payments view
  const [searchQuery, setSearchQuery] = useState('');
  const [dateFilter, setDateFilter] = useState({ start: '', end: '' });
  // Start with 0 so we always show database value after fetch; never show stale localStorage first
  const [budgetInHand, setBudgetInHand] = useState(0);
  /** Optional daily cap amount; remaining/spent derived from transactions when set. */
  const [todayFromEvents, setTodayFromEvents] = useState({ expense: 0, remaining: 0 });
  /** GET /api/v1/balance/summary — net by payment rail from transactions. */
  const [ledgerBalances, setLedgerBalances] = useState({ inHand: 0, bank: 0, total: 0 });
  /** Today’s DEBIT totals by rail (same API); includes client/supplier bank payments, not only rows in the expense list. */
  const [ledgerTodayDebits, setLedgerTodayDebits] = useState({ cashUpi: 0, bank: 0 });
  /** CLIENT_OUT rows from unified ledger — merged into “Daily Expenses” table (those payments do not create expense rows). */
  const [currentPage, setCurrentPage] = useState(1);
  // Default to sorting by date (newest first) for all tabs
  const [sortConfig, setSortConfig] = useState({ key: 'date', direction: 'desc' });
  const [expandedExpenses, setExpandedExpenses] = useState(new Set());
  const [expandedEmployees, setExpandedEmployees] = useState(new Set());
  const [toast, setToast] = useState(null);
  const [confirmModal, setConfirmModal] = useState({ isOpen: false, onConfirm: null, title: '', message: '' });
  const [showDailyBudgetModal, setShowDailyBudgetModal] = useState(false);
  const [dailyBudgetModalValue, setDailyBudgetModalValue] = useState('');
  const [dailyBudgetFundingSource, setDailyBudgetFundingSource] = useState('CASH_UPI');
  const [hasDailyBudgetFromApi, setHasDailyBudgetFromApi] = useState(false);
  const [savingBudget, setSavingBudget] = useState(false);
  const [showUpdateBudgetPopup, setShowUpdateBudgetPopup] = useState(false);
  const [updateBudgetAmount, setUpdateBudgetAmount] = useState('');
  const [updateBudgetDirection, setUpdateBudgetDirection] = useState('INCREASE');
  const [updateBudgetMode, setUpdateBudgetMode] = useState('CASH_UPI');
  const [budgetHistory, setBudgetHistory] = useState([]);
  const [loadingBudgetHistory, setLoadingBudgetHistory] = useState(false);
  const [budgetHistoryDateRange, setBudgetHistoryDateRange] = useState({ from: '', to: '' });
  const [budgetHistoryTypeFilter, setBudgetHistoryTypeFilter] = useState('ALL');
  const [loanReceiptAmount, setLoanReceiptAmount] = useState('');
  /** '' = unspecified, '__new__' = type new name, else lender id string */
  const [loanReceiptLenderSelect, setLoanReceiptLenderSelect] = useState('');
  const [loanReceiptNewLenderName, setLoanReceiptNewLenderName] = useState('');
  const [loanReceiptPaymentMode, setLoanReceiptPaymentMode] = useState('cash'); // cash | upi | bank_transfer | cheque
  const [submittingLoanReceipt, setSubmittingLoanReceipt] = useState(false);
  const [loanLenders, setLoanLenders] = useState([]);
  const [loadingLoanLenders, setLoadingLoanLenders] = useState(false);
  const [loanGivenAmount, setLoanGivenAmount] = useState('');
  const [loanGivenPaymentMode, setLoanGivenPaymentMode] = useState('cash');
  const [loanGivenBorrowerSelect, setLoanGivenBorrowerSelect] = useState('');
  const [loanGivenNewBorrowerName, setLoanGivenNewBorrowerName] = useState('');
  const [submittingLoanGiven, setSubmittingLoanGiven] = useState(false);
  const [loanCollectionAmount, setLoanCollectionAmount] = useState('');
  const [loanCollectionPaymentMode, setLoanCollectionPaymentMode] = useState('cash');
  const [loanCollectionBorrowerSelect, setLoanCollectionBorrowerSelect] = useState('');
  const [loanCollectionNewBorrowerName, setLoanCollectionNewBorrowerName] = useState('');
  const [submittingLoanCollection, setSubmittingLoanCollection] = useState(false);
  const [loanBorrowers, setLoanBorrowers] = useState([]);
  const [loadingLoanBorrowers, setLoadingLoanBorrowers] = useState(false);
  const [loanTransactions, setLoanTransactions] = useState([]);
  const [loadingLoanTransactions, setLoadingLoanTransactions] = useState(false);
  const [loanHistoryModal, setLoanHistoryModal] = useState({
    open: false,
    lender: null,
    rows: [],
    loading: false,
  });
  const [borrowerHistoryModal, setBorrowerHistoryModal] = useState({
    open: false,
    borrower: null,
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

  /** Normalize API joining date for `<input type="date">` (handles ISO string, array, Date). */
  const joiningDateToInputValue = (joiningDate) => {
    if (joiningDate == null || joiningDate === '') return getLocalDateString();
    if (Array.isArray(joiningDate) && joiningDate.length >= 3) {
      const y = Number(joiningDate[0]);
      const mo = Number(joiningDate[1]);
      const d = Number(joiningDate[2]);
      if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return getLocalDateString();
      return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
    if (typeof joiningDate === 'string') {
      const t = joiningDate.trim();
      const m = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (m) return `${m[1]}-${m[2]}-${m[3]}`;
    }
    return toLocalDateString(joiningDate);
  };

  const openEditEmployeeModal = (employee) => {
    if (!employee?.id) return;
    const sal =
      employee.salaryAmount != null && employee.salaryAmount !== ''
        ? String(Number(employee.salaryAmount))
        : '';
    setEditEmployeeForm({
      id: employee.id,
      employeeName: String(employee.employeeName || '').trim(),
      salaryAmount: sal,
      joiningDate: joiningDateToInputValue(employee.joiningDate),
    });
    setShowEditEmployeeModal(true);
  };

  const closeEditEmployeeModal = () => {
    setShowEditEmployeeModal(false);
    setEditEmployeeForm({ id: null, employeeName: '', salaryAmount: '', joiningDate: '' });
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

  /** Ledger nets from transactions + optional daily cap for the modal. */
  const loadBudgetState = async () => {
    const todayStr = getLocalDateString();
    try {
      const balRaw = await apiGetBalanceSummary();
      const bal = unwrapApiPayload(balRaw);
      const inh = Number(bal?.inHand ?? bal?.in_hand);
      const bnk = Number(bal?.bank);
      const tot = Number(bal?.total);
      setLedgerBalances({
        inHand: Number.isFinite(inh) ? inh : 0,
        bank: Number.isFinite(bnk) ? bnk : 0,
        total: Number.isFinite(tot) ? tot : 0,
      });
      const tCu = Number(bal?.todayDebitCashUpi ?? bal?.today_debit_cash_upi);
      const tBk = Number(bal?.todayDebitBank ?? bal?.today_debit_bank);
      setLedgerTodayDebits({
        cashUpi: Number.isFinite(tCu) ? tCu : 0,
        bank: Number.isFinite(tBk) ? tBk : 0,
      });
    } catch (_) {
      setLedgerBalances({ inHand: 0, bank: 0, total: 0 });
      setLedgerTodayDebits({ cashUpi: 0, bank: 0 });
    }
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
      }
    }
  };

  // Automatically fetch daily budget when user opens the Expenses tab (component mounts)
  useEffect(() => {
    loadBudgetState();
  }, []);

  useEffect(() => {
    const onLedgerRefresh = () => {
      loadBudgetState();
    };
    window.addEventListener('kataria-ledger-refresh', onLedgerRefresh);
    return () => window.removeEventListener('kataria-ledger-refresh', onLedgerRefresh);
  }, []);

  const loadLoanLenders = async () => {
    setLoadingLoanLenders(true);
    try {
      const list = await apiFetchLoanLenders();
      const safeList = Array.isArray(list) ? list : [];
      setLoanLenders(safeList);
      return safeList;
    } catch (e) {
      console.error('loadLoanLenders', e);
      setLoanLenders([]);
      showToast(e?.message || 'Could not load lenders. Check login and try again.', 'error');
      return [];
    } finally {
      setLoadingLoanLenders(false);
    }
  };

  const loadLoanBorrowers = async () => {
    setLoadingLoanBorrowers(true);
    try {
      const list = await apiFetchLendBorrowers();
      const safeList = Array.isArray(list) ? list : [];
      setLoanBorrowers(safeList);
      return safeList;
    } catch (e) {
      console.error('loadLoanBorrowers', e);
      setLoanBorrowers([]);
      showToast(e?.message || 'Could not load borrowers. Check login and try again.', 'error');
      return [];
    } finally {
      setLoadingLoanBorrowers(false);
    }
  };

  const refreshLoanLedgerData = async () => {
    const [lenders, borrowers] = await Promise.all([
      apiFetchLoanLenders(),
      apiFetchLendBorrowers(),
    ]);
    const lenderList = Array.isArray(lenders) ? lenders : [];
    const borrowerList = Array.isArray(borrowers) ? borrowers : [];
    setLoanLenders(lenderList);
    setLoanBorrowers(borrowerList);
    await loadLoanTransactions(lenderList, borrowerList);
  };

  const loadLoanTransactions = async (lendersList, borrowersList) => {
    const lendersSrc = Array.isArray(lendersList) ? lendersList : loanLenders;
    const borrowersSrc = Array.isArray(borrowersList) ? borrowersList : loanBorrowers;
    setLoadingLoanTransactions(true);
    try {
      const lenderLedgers = await Promise.all(
        lendersSrc.map(async (l) => {
          const rows = await apiFetchLoanLenderLedger(l.id);
          const person = l.displayName ?? l.display_name ?? `Lender #${l.id}`;
          return (Array.isArray(rows) ? rows : []).map((r) => {
            const typ = String(r.entryType || r.entry_type || '').toUpperCase();
            const amt = Number(r.amount ?? 0) || 0;
            const flow = typ === 'RECEIPT' ? 'TAKEN_IN' : 'PAID_OUT';
            const giveTake = flow === 'PAID_OUT' ? 'GIVE' : 'TAKE';
            return {
              id: `l-${l.id}-${r.id}`,
              date: r.entryDate || r.entry_date || r.createdAt || r.created_at || '',
              person,
              personKey: String(person || '').trim().toLowerCase(),
              paymentMode: String(r.paymentMode || r.payment_mode || '').toUpperCase(),
              notes: r.notes || '',
              status: 'ACTIVE',
              flow,
              giveTake,
              directionLabel: typ === 'RECEIPT' ? 'Take' : 'Give',
              amount: amt,
              color: typ === 'RECEIPT' ? '#2563eb' : '#dc2626',
              description: null,
              typeLabel: typ === 'RECEIPT' ? 'Take' : 'Give',
            };
          });
        })
      );
      const borrowerLedgers = await Promise.all(
        borrowersSrc.map(async (b) => {
          const rows = await apiFetchLendBorrowerLedger(b.id);
          const person = b.displayName ?? b.display_name ?? `Borrower #${b.id}`;
          return (Array.isArray(rows) ? rows : []).map((r) => {
            const typ = String(r.entryType || r.entry_type || '').toUpperCase();
            const amt = Number(r.amount ?? 0) || 0;
            const flow = typ === 'DISBURSEMENT' ? 'GIVEN_OUT' : 'TAKEN_BACK';
            const giveTake = flow === 'GIVEN_OUT' ? 'GIVE' : 'TAKE';
            return {
              id: `b-${b.id}-${r.id}`,
              date: r.entryDate || r.entry_date || r.createdAt || r.created_at || '',
              person,
              personKey: String(person || '').trim().toLowerCase(),
              paymentMode: String(r.paymentMode || r.payment_mode || '').toUpperCase(),
              notes: r.notes || '',
              status: 'ACTIVE',
              flow,
              giveTake,
              directionLabel: typ === 'DISBURSEMENT' ? 'Give' : 'Take',
              amount: amt,
              color: typ === 'DISBURSEMENT' ? '#dc2626' : '#16a34a',
              description: null,
              typeLabel: typ === 'DISBURSEMENT' ? 'Give' : 'Take',
            };
          });
        })
      );
      const merged = [...lenderLedgers.flat(), ...borrowerLedgers.flat()]
        .sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());
      setLoanTransactions(merged);
    } catch (e) {
      console.error('loadLoanTransactions', e);
      setLoanTransactions([]);
    } finally {
      setLoadingLoanTransactions(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'loan') {
      (async () => {
        setLoadingLoanLenders(true);
        setLoadingLoanBorrowers(true);
        try {
          const [lenders, borrowers] = await Promise.all([
            apiFetchLoanLenders(),
            apiFetchLendBorrowers(),
          ]);
          const lenderList = Array.isArray(lenders) ? lenders : [];
          const borrowerList = Array.isArray(borrowers) ? borrowers : [];
          setLoanLenders(lenderList);
          setLoanBorrowers(borrowerList);
          await loadLoanTransactions(lenderList, borrowerList);
        } catch (e) {
          console.error('loan-tab-load', e);
        } finally {
          setLoadingLoanLenders(false);
          setLoadingLoanBorrowers(false);
        }
      })();
    }
  }, [activeTab]);

  useEffect(() => {
    if (activeTab === 'all' && loanTransactions.length === 0) {
      (async () => {
        try {
          await refreshLoanLedgerData();
        } catch (e) {
          console.error('all-tab-loan-load', e);
        }
      })();
    }
  }, [activeTab, loanTransactions.length]);

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
      await loadLoanTransactions();
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

  const handleRecordLoanGiven = async (e) => {
    e.preventDefault();
    const amt = parseFloat(String(loanGivenAmount).replace(/,/g, ''), 10);
    if (!Number.isFinite(amt) || amt <= 0) {
      showToast('Enter a valid amount for loan given.', 'error');
      return;
    }
    const sel = String(loanGivenBorrowerSelect || '').trim();
    if (sel === '__new__') {
      const nm = String(loanGivenNewBorrowerName || '').trim();
      if (!nm) {
        showToast('Enter the borrower name, or pick an existing borrower.', 'error');
        return;
      }
    }
    setSubmittingLoanGiven(true);
    try {
      const payload = { amount: amt, notes: 'Loan Given' };
      if (loanGivenPaymentMode) payload.paymentMode = String(loanGivenPaymentMode).trim();
      if (sel === '__new__') {
        payload.borrowerName = String(loanGivenNewBorrowerName || '').trim();
      } else if (sel !== '' && /^\d+$/.test(sel)) {
        payload.borrowerId = parseInt(sel, 10);
      }
      await apiRecordLoanGiven(payload);
      setLoanGivenAmount('');
      setLoanGivenBorrowerSelect('');
      setLoanGivenNewBorrowerName('');
      setLoanGivenPaymentMode('cash');
      await loadBudgetState();
      await loadLoanBorrowers();
      await loadLoanTransactions();
      showToast('Loan given recorded.');
    } catch (err) {
      console.error('recordLoanGiven', err);
      showToast(err?.message || 'Failed to record loan given.', 'error');
    } finally {
      setSubmittingLoanGiven(false);
    }
  };

  const handleRecordLoanCollection = async (e) => {
    e.preventDefault();
    const amt = parseFloat(String(loanCollectionAmount).replace(/,/g, ''), 10);
    if (!Number.isFinite(amt) || amt <= 0) {
      showToast('Enter a valid collection amount.', 'error');
      return;
    }
    const sel = String(loanCollectionBorrowerSelect || '').trim();
    if (sel === '__new__') {
      const nm = String(loanCollectionNewBorrowerName || '').trim();
      if (!nm) {
        showToast('Enter the borrower name, or pick an existing borrower.', 'error');
        return;
      }
    }
    setSubmittingLoanCollection(true);
    try {
      const payload = { amount: amt, notes: 'Loan Collection' };
      if (loanCollectionPaymentMode) payload.paymentMode = String(loanCollectionPaymentMode).trim();
      if (sel === '__new__') {
        payload.borrowerName = String(loanCollectionNewBorrowerName || '').trim();
      } else if (sel !== '' && /^\d+$/.test(sel)) {
        payload.borrowerId = parseInt(sel, 10);
      }
      await apiRecordLoanGivenCollection(payload);
      setLoanCollectionAmount('');
      setLoanCollectionBorrowerSelect('');
      setLoanCollectionNewBorrowerName('');
      setLoanCollectionPaymentMode('cash');
      await loadBudgetState();
      await loadLoanBorrowers();
      await loadLoanTransactions();
      showToast('Loan collection recorded.');
    } catch (err) {
      console.error('recordLoanCollection', err);
      showToast(err?.message || 'Failed to record collection.', 'error');
    } finally {
      setSubmittingLoanCollection(false);
    }
  };

  const parseLoanPersonRef = (ref) => {
    const s = String(ref || '').trim();
    if (!s.includes(':')) return null;
    const [k, idStr] = s.split(':');
    const id = parseInt(idStr, 10);
    if (!Number.isFinite(id)) return null;
    if (k === 'l') return { kind: 'lender', id };
    if (k === 'b') return { kind: 'borrower', id };
    return null;
  };

  const handleCreateLoanTransaction = async (payload) => {
    const amount = Number(payload?.amount || 0);
    if (!Number.isFinite(amount) || amount <= 0) {
      showToast('Enter a valid amount.', 'error');
      return;
    }
    const rawType = String(payload?.transactionType || payload?.direction || '').trim().toUpperCase();
    const paymentMode = String(payload?.paymentMode || 'cash').trim().toLowerCase();
    const personRef = parseLoanPersonRef(payload?.personRef);
    const personName = String(payload?.personName || '').trim();
    const notes = String(payload?.notes || '').trim();
    const date = String(payload?.dateTime || '').slice(0, 10) || toLocalDateString(new Date());
    const mergedNotes = notes;
    try {
      let type = rawType;
      if (type === 'GIVE' || type === 'TAKE') {
        /* simple mode — already correct */
      } else if (type === 'LOAN_GIVEN') type = 'GIVE';
      else if (type === 'LOAN_REPAID') type = 'GIVE';
      else if (type === 'LOAN_TAKEN' || type === 'LOAN_COLLECTED') type = 'TAKE';

      if (type === 'GIVE') {
        if (personRef?.kind === 'borrower') {
          const req = { amount, paymentMode, notes: mergedNotes || 'Loan given', borrowerId: personRef.id };
          await apiRecordLoanGiven(req);
        } else if (personRef?.kind === 'lender') {
          const req = {
            type: 'daily',
            date,
            category: 'loan_repayment',
            description: mergedNotes || 'Loan repayment',
            amount,
            paymentMethod: paymentMode,
            lenderId: personRef.id,
          };
          await apiCreateExpense(req);
        } else if (personName) {
          const req = { amount, paymentMode, notes: mergedNotes || 'Loan given', borrowerName: personName };
          await apiRecordLoanGiven(req);
        } else {
          showToast('Choose a person or enter a name.', 'error');
          return;
        }
      } else if (type === 'TAKE') {
        if (personRef?.kind === 'borrower') {
          const req = { amount, paymentMode, notes: mergedNotes || 'Collection', borrowerId: personRef.id };
          await apiRecordLoanGivenCollection(req);
        } else if (personRef?.kind === 'lender') {
          const req = { amount, paymentMode, notes: mergedNotes || 'Borrowed', lenderId: personRef.id };
          await apiRecordLoanReceipt(req);
        } else if (personName) {
          const req = { amount, paymentMode, notes: mergedNotes || 'Borrowed', lenderName: personName };
          await apiRecordLoanReceipt(req);
        } else {
          showToast('Choose a person or enter a name.', 'error');
          return;
        }
      } else {
        showToast('Choose Give or Take.', 'error');
        return;
      }
      await loadBudgetState();
      await refreshLoanLedgerData();
      await loadExpenses();
      showToast('Loan transaction recorded.');
    } catch (err) {
      console.error('handleCreateLoanTransaction', err);
      showToast(err?.message || 'Failed to record transaction.', 'error');
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

  const openLoanBorrowerHistory = async (borrower) => {
    if (!borrower?.id) return;
    setBorrowerHistoryModal({ open: true, borrower, rows: [], loading: true });
    try {
      const rows = await apiFetchLendBorrowerLedger(borrower.id);
      setBorrowerHistoryModal((m) => ({
        ...m,
        rows: Array.isArray(rows) ? rows : [],
        loading: false,
      }));
    } catch (err) {
      console.error('borrower ledger', err);
      setBorrowerHistoryModal((m) => ({ ...m, rows: [], loading: false }));
      showToast(err?.message || 'Failed to load borrower history.', 'error');
    }
  };

  const closeBorrowerHistoryModal = () => {
    setBorrowerHistoryModal({ open: false, borrower: null, rows: [], loading: false });
  };

  const loadBudgetHistory = async () => {
    setLoadingBudgetHistory(true);
    try {
      const from = budgetHistoryDateRange.from || undefined;
      const to = budgetHistoryDateRange.to || undefined;
      const raw = await apiGetLedgerTransactions({ from, to, limit: 500 });
      const list = Array.isArray(raw)
        ? raw
        : Array.isArray(raw?.data)
          ? raw.data
          : [];
      setBudgetHistory(list);
    } catch (_) {
      setBudgetHistory([]);
    } finally {
      setLoadingBudgetHistory(false);
    }
  };

  useEffect(() => {
    if (showDailyBudgetModal) loadBudgetHistory();
  }, [showDailyBudgetModal, budgetHistoryDateRange.from, budgetHistoryDateRange.to]);

  const budgetHistoryRows = useMemo(() => {
    return (budgetHistory || []).map((entry, idx) => {
      const dateRaw = entry.txnDate ?? entry.txn_date ?? '';
      const displayDate = dateRaw ? String(dateRaw).slice(0, 10) : '—';
      const txType = String(entry.txnType ?? entry.txn_type ?? '').toUpperCase() || '—';
      const txAmount = Number(entry.amount) || 0;
      const pm = String(entry.paymentMode ?? entry.payment_mode ?? '');
      const sourceChannel = ledgerPaymentChannel(pm);
      const source = String(entry.source ?? '');
      const detailLabel = entry.description && String(entry.description).trim() ? String(entry.description) : '—';
      return { entry, idx, displayDate, txType, txAmount, sourceChannel, detailLabel, paymentMode: pm, source };
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
      showToast('No ledger rows to download for selected filters.', 'error');
      return;
    }
    const doc = new jsPDF({ unit: 'pt', format: 'a4' });
    doc.setFontSize(14);
    doc.text('Transaction history (ledger)', 40, 36);
    doc.setFontSize(10);
    const fromText = budgetHistoryDateRange.from || 'Any';
    const toText = budgetHistoryDateRange.to || 'Any';
    const typeText = budgetHistoryTypeFilter || 'ALL';
    doc.text(`Filters: From ${fromText} | To ${toText} | Type ${typeText}`, 40, 54);
    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    doc.text('Source: transactions ledger (all payment rails).', 40, 66);
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(10);
    autoTable(doc, {
      startY: 78,
      head: [['Date', 'Channel', 'Source', 'Mode', 'Type', 'Amount', 'Details']],
      body: rows.map((r) => [
        r.displayDate,
        r.sourceChannel,
        r.source || '—',
        r.paymentMode || '—',
        r.txType,
        (Number.isFinite(r.txAmount) ? r.txAmount : 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
        r.detailLabel,
      ]),
      styles: { fontSize: 9, cellPadding: 5 },
      headStyles: { fillColor: [79, 70, 229] },
    });
    const today = getLocalDateString();
    doc.save(`ledger-transactions-${today}.pdf`);
  };

  const saveDailyBudgetToApi = async (amount, fundingSource = 'CASH_UPI') => {
    const num = Number.isFinite(amount) ? Math.max(0, amount) : 0;
    if (num > 0) {
      if (hasDailyBudgetFromApi) {
        await apiUpdateDailyBudget(num, fundingSource);
      } else {
        await apiCreateDailyBudget(num, fundingSource);
      }
      const nextInHand = fundingSource === 'CASH_UPI'
        ? (hasDailyBudgetFromApi ? Number(budgetInHand || 0) + num : num)
        : Number(budgetInHand || 0);
      setBudgetInHand(nextInHand);
      setHasDailyBudgetFromApi(true);
    } else {
      await apiDeleteDailyBudget();
      setBudgetInHand(0);
      setHasDailyBudgetFromApi(false);
    }
  };

  const handleSaveDailyBudget = async () => {
    const val = parseFloat(dailyBudgetModalValue);
    const num = Number.isFinite(val) ? Math.max(0, val) : 0;
    if (num === 0) {
      const confirmed = window.confirm('Reset available balance to ₹0 for today?');
      if (!confirmed) return;
    }
    setSavingBudget(true);
    try {
      const source = hasDailyBudgetFromApi && num > 0 ? dailyBudgetFundingSource : 'CASH_UPI';
      await saveDailyBudgetToApi(num, source);
      await loadBudgetState();
      setShowDailyBudgetModal(false);
      if (num > 0 && hasDailyBudgetFromApi) {
        showToast(
          source === 'BANK_TRANSFER'
            ? `Added ₹${num.toLocaleString('en-IN')} to bank balance.`
            : `Added ₹${num.toLocaleString('en-IN')} to current daily budget.`
        );
      } else {
        showToast(num > 0 ? `Daily budget set to ₹${num.toLocaleString('en-IN')}` : 'Daily budget cleared.');
      }
    } catch (err) {
      console.error('Error saving daily budget:', err);
      showToast(err?.message || 'Failed to save budget. Please try again.', 'error');
    } finally {
      setSavingBudget(false);
    }
  };

  const openUpdateBudgetPopup = () => {
    setUpdateBudgetAmount('');
    setUpdateBudgetDirection('INCREASE');
    setUpdateBudgetMode('CASH_UPI');
    setShowUpdateBudgetPopup(true);
  };

  const closeUpdateBudgetPopup = () => {
    if (savingBudget) return;
    setShowUpdateBudgetPopup(false);
  };

  const handleApplyBudgetUpdate = async () => {
    const val = parseFloat(updateBudgetAmount);
    const amount = Number.isFinite(val) ? Math.max(0, val) : 0;
    if (amount <= 0) {
      showToast('Please enter a valid amount greater than 0.', 'error');
      return;
    }
    setSavingBudget(true);
    try {
      await apiUpdateDailyBudget(amount, updateBudgetMode, updateBudgetDirection);
      await loadBudgetState();
      setShowUpdateBudgetPopup(false);
      const verb = updateBudgetDirection === 'DECREASE' ? 'decreased' : 'increased';
      const rail = updateBudgetMode === 'BANK_TRANSFER' ? 'bank' : 'cash/UPI';
      showToast(`Budget ${verb} by ₹${amount.toLocaleString('en-IN')} on ${rail}.`);
    } catch (err) {
      console.error('Error updating budget:', err);
      showToast(err?.message || 'Failed to update budget. Please try again.', 'error');
    } finally {
      setSavingBudget(false);
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

  const {
    formData,
    setFormData,
    salaryFormData,
    setSalaryFormData,
    paySalaryFormData,
    setPaySalaryFormData,
    payAdvanceFormData,
    setPayAdvanceFormData,
    clientPurchaseFormData,
    setClientPurchaseFormData,
    clientPaymentFormData,
    setClientPaymentFormData,
    showCustomCategoryInput,
    setShowCustomCategoryInput,
    customCategoryDraft,
    setCustomCategoryDraft
  } = useExpensesForms({ getLocalDateString, getLocalMonthString });
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

  const loanBorrowersTotals = useMemo(() => {
    let totalLent = 0;
    let totalCollected = 0;
    let totalOutstanding = 0;
    for (const b of loanBorrowers) {
      totalLent += Number(b.totalLent ?? b.total_lent ?? 0) || 0;
      totalCollected += Number(b.totalCollected ?? b.total_collected ?? 0) || 0;
      totalOutstanding += Number(b.outstanding ?? 0) || 0;
    }
    return {
      count: loanBorrowers.length,
      totalLent,
      totalCollected,
      totalOutstanding,
    };
  }, [loanBorrowers]);

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

  const toTitleCase = (s) => String(s || '')
    .trim()
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (m) => m.toUpperCase());

  const formatExpenseCategoryLabel = (cat) => {
    const c = String(cat || '').trim().toLowerCase();
    if (c === 'loan_repayment' || c === 'loan_repay') return 'Loan Repay';
    if (c === 'client_purchase_payment') return 'Client payment';
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

  /** Suppliers master (GET /suppliers) for client purchase picker. */
  const [suppliersList, setSuppliersList] = useState([]);
  const [loadingSuppliersForPurchase, setLoadingSuppliersForPurchase] = useState(false);
  /** '' | `s:{id}` | `p:{encodedName}` | '__new__' */
  const [clientPurchaseSupplierSelect, setClientPurchaseSupplierSelect] = useState('');
  const [clientPurchaseNewSupplierName, setClientPurchaseNewSupplierName] = useState('');
  const [clientPurchaseSupplierSearchQuery, setClientPurchaseSupplierSearchQuery] = useState('');

  const [submittingPayment, setSubmittingPayment] = useState(false);

  const [loadingEmployees, setLoadingEmployees] = useState(false);

  useEffect(() => {
    loadExpenses();
    loadEmployees();
    loadPayrollSummary();
    loadClientPayments();
    loadAllPayments();
  }, []);

  const refreshClientDueAlerts = useCallback(async () => {
    try {
      const alerts = await fetchClientDueAlerts();
      setClientDueAlerts(Array.isArray(alerts) ? alerts : []);
    } catch (e) {
      console.error('refreshClientDueAlerts', e);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'client') {
      refreshClientDueAlerts();
    }
  }, [activeTab, refreshClientDueAlerts]);

  const openClientPaymentForm = useCallback(() => {
    setShowClientPaymentForm(true);
    setClientPaymentFormData({
      purchaseId: '',
      amount: '',
      date: getLocalDateString(),
      paymentMethod: 'cash',
      notes: '',
    });
  }, []);

  const loadClientPayments = async () => {
    try {
      const purchases = await fetchClientPurchases();
      if (purchases.length > 0) {
        // Fetch all payments and merge them into purchases to ensure paid amounts are accurate
        try {
          const rawAllPayments = await fetchAllPayments();
          const allPayments = Array.isArray(rawAllPayments)
            ? rawAllPayments
            : Array.isArray(rawAllPayments?.data)
              ? rawAllPayments.data
              : Array.isArray(rawAllPayments?.content)
                ? rawAllPayments.content
                : [];
          if (allPayments.length > 0) {
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
        await refreshClientDueAlerts();
      } else {
        setClientPayments([]);
        try {
          localStorage.removeItem('clientPayments');
        } catch {
          /* ignore */
        }
      }
    } catch (error) {
      console.error('Error loading client payments from API:', error);
      setClientPayments([]);
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
      const normalizedEmployees = Array.isArray(employeesData)
        ? employeesData
        : Array.isArray(employeesData?.content)
          ? employeesData.content
          : Array.isArray(employeesData?.data)
            ? employeesData.data
            : [];
      setEmployees(normalizedEmployees);
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
      const raw = await fetchEmployeePayrollSummary(currentMonth);
      const rows = Array.isArray(raw)
        ? raw
        : Array.isArray(raw?.data)
          ? raw.data
          : Array.isArray(raw?.content)
            ? raw.content
            : [];
      const map = {};
      rows.forEach((r) => {
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
      paymentMethod: 'CASH',
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
        paymentMode: normalizeEmployeePaymentModeForApi(paySalaryFormData.paymentMethod),
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
        paymentMethod: 'CASH',
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
    if (!payAdvanceFormData.employeeId || submittingPayAdvance) return;

    const selectedEmp = employees.find(emp => emp.id == payAdvanceFormData.employeeId);
    if (!selectedEmp) return;

    try {
      setSubmittingPayAdvance(true);
      await recordEmployeeAdvance(selectedEmp.id, {
        amount: parseFloat(payAdvanceFormData.amount) || 0,
        date: payAdvanceFormData.date,
        paymentMode: normalizeEmployeePaymentModeForApi(payAdvanceFormData.paymentMethod),
        notes: String(payAdvanceFormData.notes || '').trim() || `Employee advance for ${selectedEmp.employeeName}`
      });
      await loadExpenses();
      await loadPayrollSummary();
      await loadBudgetState();
      // Notify parent component (Dashboard) to refresh expenses for chart
      if (onExpenseUpdate) {
        onExpenseUpdate();
      }
      showToast('Employee advance recorded.');
      setShowPayAdvanceForm(false);
      setPayAdvanceFormData({
        employeeId: '',
        amount: '',
        date: getLocalDateString(),
        paymentMethod: 'CASH',
        notes: ''
      });
    } catch (error) {
      console.error('Error saving advance payment to API:', error);
      showToast('Failed to save advance payment. Please check your connection and try again.', 'error');
      // Don't use localStorage fallback - only use API
    } finally {
      setSubmittingPayAdvance(false);
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
  const [submittingPayAdvance, setSubmittingPayAdvance] = useState(false);

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

  const clientLedgerPseudoExpenses = useMemo(() => {
    const fmtPm = (mode) => {
      if (mode == null || mode === '') return 'cash';
      const m = String(mode).trim().toUpperCase().replace(/-/g, '_');
      if (m === 'BANK_TRANSFER' || m === 'BANK') return 'bank';
      if (m === 'UPI') return 'upi';
      if (m === 'CASH') return 'cash';
      if (m === 'CARD') return 'card';
      if (m === 'CHEQUE' || m === 'CHECK') return 'cheque';
      if (m === 'OTHER') return 'bank';
      return String(mode).toLowerCase().replace(/_/g, ' ');
    };
    return (clientLedgerFeedRows || []).map((r) => {
      const d = r.txnDate ?? r.txn_date;
      let dateStr = getLocalDateString();
      if (d != null) {
        if (typeof d === 'string' && d.length >= 10) dateStr = d.slice(0, 10);
        else if (typeof d === 'string') dateStr = d;
      }
      const ref = r.referenceId ?? r.reference_id;
      return {
        id: `ulk-${r.id}`,
        _ledgerOnly: true,
        date: dateStr,
        createdAt: r.createdAt ?? r.created_at ?? r.txnDate ?? r.txn_date ?? null,
        type: 'client_ledger',
        category: 'client_purchase_payment',
        description:
          r.description ||
          r.notes ||
          (ref != null ? `Client / supplier payment (ref ${ref})` : 'Client / supplier payment'),
        amount: Number(r.amount) || 0,
        paymentMethod: fmtPm(r.paymentMode ?? r.payment_mode),
      };
    });
  }, [clientLedgerFeedRows]);

  const loanOutflowPseudoExpenses = useMemo(() => {
    const fmtPm = (mode) => {
      if (mode == null || mode === '') return 'cash';
      const m = String(mode).trim().toUpperCase().replace(/-/g, '_');
      if (m === 'BANK_TRANSFER' || m === 'BANK') return 'bank';
      if (m === 'UPI') return 'upi';
      if (m === 'CASH') return 'cash';
      if (m === 'CARD') return 'card';
      if (m === 'CHEQUE' || m === 'CHECK') return 'cheque';
      return String(mode).toLowerCase().replace(/_/g, ' ');
    };
    // Only receivable "loan given" (borrower disbursements). Market-loan repayments already
    // appear as daily expenses (loan_repayment) — lender ledger REPAYMENT rows use giveTake=GIVE
    // but must not be duplicated here.
    return (Array.isArray(loanTransactions) ? loanTransactions : [])
      .filter((r) => String(r.giveTake || '').toUpperCase() === 'GIVE')
      .filter((r) => String(r.id || '').startsWith('b-'))
      .map((r) => {
        const dateRaw = r.date || '';
        let dateStr = getLocalDateString();
        if (typeof dateRaw === 'string' && dateRaw.length >= 10) dateStr = dateRaw.slice(0, 10);
        else if (typeof dateRaw === 'string' && dateRaw) dateStr = dateRaw;
        return {
          id: `loan-out-${r.id}`,
          _ledgerOnly: true,
          _ledgerSource: 'loan',
          date: dateStr,
          createdAt: r.createdAt ?? r.created_at ?? r.date ?? null,
          type: 'loan_ledger',
          category: 'loan_outflow',
          description: r.person ? `Give to ${r.person}` : 'Loan outflow',
          amount: Number(r.amount) || 0,
          paymentMethod: fmtPm(r.paymentMode),
          notes: r.notes || '',
        };
      });
  }, [loanTransactions]);

  const safeExpenses = Array.isArray(expenses) ? expenses : [];
  const expenseTableSource = activeTab === 'all'
    ? [...safeExpenses, ...clientLedgerPseudoExpenses, ...loanOutflowPseudoExpenses]
    : safeExpenses;

  // Filter expenses based on active tab
  let filteredExpenses = expenseTableSource.filter((expense) => {
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

  // Sort expenses — default date descending (newest calendar day on top); same day uses createdAt then id.
  filteredExpenses = [...filteredExpenses].sort((a, b) => {
    if (sortConfig.key === 'date') {
      const da = expenseCalendarDayKey(a);
      const db = expenseCalendarDayKey(b);
      if (da !== db) {
        return sortConfig.direction === 'desc' ? db - da : da - db;
      }
      const ta = expenseRecencyMs(a);
      const tb = expenseRecencyMs(b);
      if (ta !== tb) {
        return sortConfig.direction === 'desc' ? tb - ta : ta - tb;
      }
      const ia = expenseNumericId(a);
      const ib = expenseNumericId(b);
      if (ia !== ib) {
        return sortConfig.direction === 'desc' ? ib - ia : ia - ib;
      }
      return 0;
    }

    let aValue = a[sortConfig.key];
    let bValue = b[sortConfig.key];

    if (sortConfig.key === 'amount') {
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
    if (type === 'client_ledger') return 'Client payment';
    if (type === 'loan_ledger') return 'Loan outflow';
    if (String(type || '').toLowerCase() === 'advance') return 'Employee advance';
    if (String(type || '').toLowerCase() === 'salary') return 'Salary';
    return 'Daily Expense';
  };

  const getTypeIcon = (type) => {
    if (type === 'client_ledger') return '🏭';
    if (type === 'loan_ledger') return '💸';
    if (String(type || '').toLowerCase() === 'advance') return '👨‍🏭';
    if (String(type || '').toLowerCase() === 'salary') return '💼';
    return '💰';
  };

  // Calculate total expenses
  const totalExpenses = filteredExpenses.reduce((sum, exp) => {
    return sum + (parseFloat(exp.amount) || 0);
  }, 0);
  
  const todayExpenses = expenseTableSource
    .filter((exp) => {
      const expDate = new Date(exp.date).toDateString();
      const today = new Date().toDateString();
      return expDate === today;
    })
    .reduce((sum, exp) => sum + (parseFloat(exp.amount) || 0), 0);

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
        <ExpensesHeader
          budgetInHand={budgetInHand}
          onOpenBudgetModal={(value) => {
            setDailyBudgetModalValue(value === 0 ? '' : String(value));
            setDailyBudgetFundingSource('CASH_UPI');
            setShowDailyBudgetModal(true);
          }}
          onAddExpense={handleAddClick}
        />
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
        <div className="modal-overlay" onClick={() => { if (!savingBudget) { setShowDailyBudgetModal(false); setShowUpdateBudgetPopup(false); } }}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '980px' }}>
            <div className="modal-header">
              <h3>{hasDailyBudgetFromApi ? 'Edit daily budget' : 'Add daily budget'}</h3>
              <button
                type="button"
                className="modal-close"
                onClick={() => { if (!savingBudget) { setShowDailyBudgetModal(false); setShowUpdateBudgetPopup(false); } }}
              >
                ×
              </button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>Daily budget amount (₹)</label>
                <p style={{ margin: '4px 0 8px', fontSize: '13px', color: '#666' }}>
                  Optional daily cap. Remaining vs that cap:{' '}
                  <strong>₹{(Number(todayFromEvents.remaining) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
                  . Ledger nets are on the main Expenses tab (GET /api/v1/balance/summary).
                </p>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    flexWrap: 'nowrap',
                  }}
                >
                  <input
                    type="number"
                    min="0"
                    step="100"
                    value={dailyBudgetModalValue}
                    onChange={(e) => setDailyBudgetModalValue(e.target.value)}
                    placeholder="e.g. 20000"
                    className="budget-in-hand-input"
                    style={{ flex: 1, minWidth: 0, padding: '8px 12px', marginTop: 0 }}
                    disabled={savingBudget}
                  />
                  <div
                    className="form-actions"
                    style={{
                      display: 'flex',
                      flexWrap: 'nowrap',
                      justifyContent: 'flex-end',
                      alignItems: 'center',
                      gap: '8px',
                      marginTop: 0,
                    }}
                  >
                    <button
                      type="button"
                      className="btn btn-primary"
                      disabled={savingBudget}
                      onClick={handleSaveDailyBudget}
                    >
                      {savingBudget ? 'Saving...' : 'Save'}
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      disabled={savingBudget}
                      onClick={openUpdateBudgetPopup}
                    >
                      Update budget
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary budget-history-download-btn"
                      onClick={downloadBudgetHistoryPdf}
                      disabled={loadingBudgetHistory || filteredBudgetHistoryRows.length === 0}
                    >
                      Download PDF
                    </button>
                  </div>
                </div>
              </div>
              <BudgetHistorySection
                loadingBudgetHistory={loadingBudgetHistory}
                filteredBudgetHistoryRows={filteredBudgetHistoryRows}
                budgetHistoryDateRange={budgetHistoryDateRange}
                setBudgetHistoryDateRange={setBudgetHistoryDateRange}
                budgetHistoryTypeFilter={budgetHistoryTypeFilter}
                setBudgetHistoryTypeFilter={setBudgetHistoryTypeFilter}
                onDownloadPdf={downloadBudgetHistoryPdf}
                bankSourceLabel={BUDGET_SOURCE_BANK}
                showDownloadButton={false}
              />
            </div>
          </div>
        </div>
      )}

      {showUpdateBudgetPopup && (
        <div className="modal-overlay" onClick={closeUpdateBudgetPopup}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '520px' }}>
            <div className="modal-header">
              <h3>Update budget</h3>
              <button type="button" className="modal-close" onClick={closeUpdateBudgetPopup}>×</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>Amount (₹)</label>
                <input
                  type="number"
                  min="0"
                  step="100"
                  value={updateBudgetAmount}
                  onChange={(e) => setUpdateBudgetAmount(e.target.value)}
                  placeholder="e.g. 5000"
                  className="budget-in-hand-input"
                  style={{ width: '100%', padding: '8px 12px' }}
                  disabled={savingBudget}
                />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Action</label>
                  <select
                    value={updateBudgetDirection}
                    onChange={(e) => setUpdateBudgetDirection(e.target.value)}
                    className="budget-in-hand-input"
                    style={{ width: '100%', padding: '8px 12px' }}
                    disabled={savingBudget}
                  >
                    <option value="INCREASE">Increase</option>
                    <option value="DECREASE">Decrease</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Payment mode</label>
                  <select
                    value={updateBudgetMode}
                    onChange={(e) => setUpdateBudgetMode(e.target.value)}
                    className="budget-in-hand-input"
                    style={{ width: '100%', padding: '8px 12px' }}
                    disabled={savingBudget}
                  >
                    <option value="CASH_UPI">Cash / UPI</option>
                    <option value="BANK_TRANSFER">Bank</option>
                  </select>
                </div>
              </div>
              <div className="form-actions" style={{ marginTop: '14px' }}>
                <button type="button" className="btn btn-primary" disabled={savingBudget} onClick={handleApplyBudgetUpdate}>
                  {savingBudget ? 'Updating...' : 'Update'}
                </button>
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
                    No lenders yet — use the <strong>Loan</strong> tab to record money you borrowed first.
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
        <div className="expenses-tab-navigation__tabs">
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
            Loan
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
        {activeTab === 'client' && (
          <div className="expenses-tab-navigation__actions">
            <button type="button" className="btn btn-secondary" onClick={openClientPaymentForm}>
              💰 Make Payment
            </button>
            <button type="button" className="btn btn-primary" onClick={() => setShowClientPurchaseForm(true)}>
              + Add Client Purchase
            </button>
          </div>
        )}
      </div>

      {/* All Expenses Tab Content */}
      {activeTab === 'all' && (
        <div>
          {/* Budget in hand card – daily / date-wise */}
          <div className="budget-in-hand-card">
            <div className="budget-in-hand-header">
              <span className="budget-in-hand-title" title="Net position from transactions (CREDIT − DEBIT by payment mode).">
                💰 Ledger balances
              </span>
            </div>
            {(() => {
              const splitCashUpi = Number(ledgerTodayDebits.cashUpi || 0) || 0;
              const splitBank = Number(ledgerTodayDebits.bank || 0) || 0;
              const cards = [
                {
                  label: 'Net cash + UPI (ledger)',
                  value: ledgerBalances.inHand,
                  color: '#059669',
                  title: 'All-time net on CASH and UPI rails in the unified ledger (credits minus debits).',
                },
                {
                  label: 'Net bank + card + cheque (ledger)',
                  value: ledgerBalances.bank,
                  color: '#1d4ed8',
                  title: 'All-time net on BANK, CARD, and CHEQUE rails in the unified ledger.',
                },
                {
                  label: 'Total liquidity (ledger)',
                  value: ledgerBalances.total,
                  color: '#0f172a',
                  title: 'Cash+UPI net plus bank-rail net from the unified ledger.',
                },
                {
                  label: 'Expenses in UPI + cash',
                  value: splitCashUpi,
                  color: '#0d9488',
                  title:
                    'Today’s operating expenses on cash/UPI only — excludes bill cancellations and partial return refunds (BILL_REVERSAL / BILL_RETURN).',
                },
                {
                  label: 'Expenses in card + bank transfer + cheque',
                  value: splitBank,
                  color: '#64748b',
                  title:
                    'Today’s money out on bank/card/cheque in the unified ledger — includes client purchase payments by bank (they do not appear as lines in the Daily Expenses table).',
                },
              ];
              return (
                <div className="budget-in-hand-stats ledger-balances-row">
                  {cards.map((c) => (
                    <div
                      key={c.label}
                      className="budget-stat ledger-balance-card"
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
            <button type="button" className="btn btn-secondary" onClick={() => { setDailyBudgetModalValue(budgetInHand === 0 ? '' : String(budgetInHand)); setDailyBudgetFundingSource('CASH_UPI'); setShowDailyBudgetModal(true); }}>
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

      {/* Loan — own tab */}
      {activeTab === 'loan' && (
        <div className="expenses-tab-content">
          <LoanPanel
            handleCreateLoanTransaction={handleCreateLoanTransaction}
            handleRecordLoanReceipt={handleRecordLoanReceipt}
            handleRecordLoanGiven={handleRecordLoanGiven}
            handleRecordLoanCollection={handleRecordLoanCollection}
            loanReceiptAmount={loanReceiptAmount}
            setLoanReceiptAmount={setLoanReceiptAmount}
            loanReceiptPaymentMode={loanReceiptPaymentMode}
            setLoanReceiptPaymentMode={setLoanReceiptPaymentMode}
            loanReceiptLenderSelect={loanReceiptLenderSelect}
            setLoanReceiptLenderSelect={setLoanReceiptLenderSelect}
            loanReceiptNewLenderName={loanReceiptNewLenderName}
            setLoanReceiptNewLenderName={setLoanReceiptNewLenderName}
            submittingLoanReceipt={submittingLoanReceipt}
            loanLenders={loanLenders}
            formatLenderOutstandingLabel={formatLenderOutstandingLabel}
            loadingLoanLenders={loadingLoanLenders}
            loanLendersTotals={loanLendersTotals}
            formatLoanInr={formatLoanInr}
            openLoanLenderHistory={openLoanLenderHistory}
            loanGivenAmount={loanGivenAmount}
            setLoanGivenAmount={setLoanGivenAmount}
            loanGivenPaymentMode={loanGivenPaymentMode}
            setLoanGivenPaymentMode={setLoanGivenPaymentMode}
            loanGivenBorrowerSelect={loanGivenBorrowerSelect}
            setLoanGivenBorrowerSelect={setLoanGivenBorrowerSelect}
            loanGivenNewBorrowerName={loanGivenNewBorrowerName}
            setLoanGivenNewBorrowerName={setLoanGivenNewBorrowerName}
            submittingLoanGiven={submittingLoanGiven}
            loanCollectionAmount={loanCollectionAmount}
            setLoanCollectionAmount={setLoanCollectionAmount}
            loanCollectionPaymentMode={loanCollectionPaymentMode}
            setLoanCollectionPaymentMode={setLoanCollectionPaymentMode}
            loanCollectionBorrowerSelect={loanCollectionBorrowerSelect}
            setLoanCollectionBorrowerSelect={setLoanCollectionBorrowerSelect}
            loanCollectionNewBorrowerName={loanCollectionNewBorrowerName}
            setLoanCollectionNewBorrowerName={setLoanCollectionNewBorrowerName}
            submittingLoanCollection={submittingLoanCollection}
            loanBorrowers={loanBorrowers}
            loadingLoanBorrowers={loadingLoanBorrowers}
            loanBorrowersTotals={loanBorrowersTotals}
            loanTransactions={loanTransactions}
            loadingLoanTransactions={loadingLoanTransactions}
            openLoanBorrowerHistory={openLoanBorrowerHistory}
            setActiveTab={setActiveTab}
            setCurrentPage={setCurrentPage}
            handleAddClick={handleAddClick}
          />

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

          {borrowerHistoryModal.open && borrowerHistoryModal.borrower && (
            <div className="modal-overlay" onClick={closeBorrowerHistoryModal} role="presentation">
              <div
                className="modal-content"
                onClick={(e) => e.stopPropagation()}
                style={{ maxWidth: 'min(740px, 90vw)', width: '90vw' }}
              >
                <div className="modal-header">
                  <h3>
                    {borrowerHistoryModal.borrower.displayName
                      || borrowerHistoryModal.borrower.display_name
                      || `Borrower #${borrowerHistoryModal.borrower.id}`}{' '}
                    — lent history
                  </h3>
                  <button type="button" className="modal-close" onClick={closeBorrowerHistoryModal} aria-label="Close">
                    ×
                  </button>
                </div>
                <div className="modal-body">
                  {borrowerHistoryModal.loading ? (
                    <Loading message="Loading transactions…" />
                  ) : borrowerHistoryModal.rows.length === 0 ? (
                    <p style={{ margin: 0, fontSize: '14px', color: '#64748b' }}>No transactions yet.</p>
                  ) : (
                    <div className="sales-table-wrapper" style={{ maxHeight: '360px', overflowY: 'auto', overflowX: 'auto', width: '100%' }}>
                      <table className="data-table expenses-table" style={{ width: '100%', tableLayout: 'fixed' }}>
                        <thead>
                          <tr>
                            <th style={{ width: '18%' }}>Date</th>
                            <th style={{ width: '18%' }}>Type</th>
                            <th style={{ width: '22%' }}>Amount</th>
                            <th style={{ width: '22%' }}>Outstanding</th>
                            <th style={{ width: '20%' }}>Notes</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(() => {
                            const chronological = [...borrowerHistoryModal.rows].sort((a, b) => {
                              const ta = new Date(a?.createdAt || a?.entryDate || 0).getTime() || 0;
                              const tb = new Date(b?.createdAt || b?.entryDate || 0).getTime() || 0;
                              if (ta !== tb) return ta - tb;
                              return (Number(a?.id) || 0) - (Number(b?.id) || 0);
                            });
                            let outstanding = 0;
                            const outstandingById = new Map();
                            chronological.forEach((row) => {
                              const typ = String(row.entryType || '').toUpperCase();
                              const amt = Number(row.amount ?? 0) || 0;
                              if (typ === 'DISBURSEMENT') outstanding += amt;
                              if (typ === 'REPAYMENT_RECEIVED') outstanding -= amt;
                              outstandingById.set(row.id, outstanding);
                            });
                            return borrowerHistoryModal.rows.map((row) => {
                              const typ = String(row.entryType || '').toUpperCase();
                              const label = typ === 'DISBURSEMENT' ? 'Loan given' : typ === 'REPAYMENT_RECEIVED' ? 'Collection' : typ || '—';
                              const dateStr = row.entryDate ? String(row.entryDate).slice(0, 10) : '—';
                              const amt = Number(row.amount ?? 0) || 0;
                              const out = Number(outstandingById.get(row.id) || 0);
                              return (
                                <tr key={row.id}>
                                  <td>{dateStr}</td>
                                  <td style={{ fontWeight: 600, color: typ === 'DISBURSEMENT' ? '#b91c1c' : '#0f766e' }}>{label}</td>
                                  <td>₹{amt.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                  <td style={{ fontWeight: 600, color: out > 0.005 ? '#b45309' : out < -0.005 ? '#1d4ed8' : '#0f766e' }}>
                                    {out < -0.005
                                      ? `Credit ₹${Math.abs(out).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                                      : `₹${out.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                                  </td>
                                  <td style={{ fontSize: '12px', color: '#64748b', wordBreak: 'break-word' }}>{row.notes || '—'}</td>
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
            date: getLocalDateString(),
            paymentMethod: 'CASH',
            notes: ''
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
                  date: getLocalDateString(),
                  paymentMethod: 'CASH',
                  notes: ''
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
                  <div className="form-group">
                    <label>Payment mode *</label>
                    <select
                      name="paymentMethod"
                      value={payAdvanceFormData.paymentMethod || 'CASH'}
                      onChange={(e) => setPayAdvanceFormData({ ...payAdvanceFormData, paymentMethod: e.target.value })}
                      required
                    >
                      {EMPLOYEE_PAYMENT_MODE_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                    <p style={{ margin: '6px 0 0', fontSize: '11px', color: '#64748b' }}>
                      How you paid this advance to the employee. Stored on payroll ledger and expenses.
                    </p>
                  </div>
                </div>
                <div className="form-group">
                  <label>Notes (optional)</label>
                  <input
                    type="text"
                    name="notes"
                    value={payAdvanceFormData.notes || ''}
                    onChange={(e) => setPayAdvanceFormData({ ...payAdvanceFormData, notes: e.target.value })}
                    placeholder="e.g. Week 1 advance"
                  />
                </div>
                <div className="form-actions">
                  <button type="submit" className="btn btn-primary" disabled={submittingPayAdvance}>
                    {submittingPayAdvance ? 'Paying...' : 'Pay Advance'}
                  </button>
                  <button type="button" className="btn btn-secondary" onClick={() => {
                    setShowPayAdvanceForm(false);
                    setPayAdvanceFormData({
                      employeeId: '',
                      amount: '',
                      date: getLocalDateString(),
                      paymentMethod: 'CASH',
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

      {/* Pay Salary Form Modal */}
      {showPaySalaryForm && selectedEmployee && (
        <div className="modal-overlay" onClick={() => {
          setShowPaySalaryForm(false);
          setSelectedEmployee(null);
          setPaySalaryFormData({
            month: getLocalMonthString(),
            date: getLocalDateString(),
            paymentMethod: 'CASH',
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
                  paymentMethod: 'CASH',
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
                    <label>Payment mode *</label>
                    <select
                      name="paymentMethod"
                      value={paySalaryFormData.paymentMethod || 'CASH'}
                      onChange={(e) => setPaySalaryFormData({ ...paySalaryFormData, paymentMethod: e.target.value })}
                      required
                    >
                      {EMPLOYEE_PAYMENT_MODE_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                    <p style={{ margin: '6px 0 0', fontSize: '11px', color: '#64748b' }}>
                      How you paid this salary (cash, UPI, bank transfer, or cheque). This is stored on the payroll ledger and expenses.
                    </p>
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
                      paymentMethod: 'CASH',
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

      {/* Edit Employee Modal */}
      {showEditEmployeeModal && editEmployeeForm.id != null && (
        <div
          className="modal-overlay"
          onClick={() => {
            if (!savingEditEmployee) closeEditEmployeeModal();
          }}
        >
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Edit Employee</h3>
              <button
                type="button"
                className="modal-close"
                disabled={savingEditEmployee}
                onClick={closeEditEmployeeModal}
              >
                ×
              </button>
            </div>
            <div className="modal-body">
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  const name = String(editEmployeeForm.employeeName || '').trim();
                  const salaryNum = parseFloat(String(editEmployeeForm.salaryAmount).replace(/,/g, ''));
                  if (!name) {
                    showToast('Employee name is required.', 'error');
                    return;
                  }
                  if (!Number.isFinite(salaryNum) || salaryNum <= 0) {
                    showToast('Salary must be a number greater than 0.', 'error');
                    return;
                  }
                  if (!editEmployeeForm.joiningDate) {
                    showToast('Joining date is required.', 'error');
                    return;
                  }
                  setSavingEditEmployee(true);
                  try {
                    await apiUpdateEmployee(editEmployeeForm.id, {
                      employeeName: name,
                      salaryAmount: salaryNum,
                      joiningDate: editEmployeeForm.joiningDate,
                    });
                    await loadEmployees();
                    await loadPayrollSummary();
                    closeEditEmployeeModal();
                    showToast('Employee updated successfully.', 'success');
                  } catch (error) {
                    console.error('Error updating employee:', error);
                    showToast('Failed to update employee. Please try again.', 'error');
                  } finally {
                    setSavingEditEmployee(false);
                  }
                }}
              >
                <div className="form-group">
                  <label>Employee Name *</label>
                  <input
                    type="text"
                    value={editEmployeeForm.employeeName}
                    onChange={(e) =>
                      setEditEmployeeForm((p) => ({ ...p, employeeName: e.target.value }))
                    }
                    placeholder="Enter employee name"
                    required
                    disabled={savingEditEmployee}
                  />
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Salary Amount (₹) *</label>
                    <input
                      type="number"
                      value={editEmployeeForm.salaryAmount}
                      onChange={(e) =>
                        setEditEmployeeForm((p) => ({ ...p, salaryAmount: e.target.value }))
                      }
                      min="0.01"
                      step="0.01"
                      placeholder="Enter salary amount"
                      required
                      disabled={savingEditEmployee}
                    />
                  </div>
                  <div className="form-group">
                    <label>Joining Date</label>
                    <input
                      type="date"
                      value={editEmployeeForm.joiningDate}
                      disabled
                      title="Joining date cannot be changed"
                      className="employee-edit-joining-readonly"
                    />
                  </div>
                </div>
                <div className="form-actions">
                  <button type="submit" className="btn btn-primary" disabled={savingEditEmployee}>
                    {savingEditEmployee ? 'Saving…' : 'Save changes'}
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    disabled={savingEditEmployee}
                    onClick={closeEditEmployeeModal}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      <EmployeeLedgerModal
        open={showEmployeeLedgerModal}
        selectedEmployee={selectedLedgerEmployee}
        onClose={() => setShowEmployeeLedgerModal(false)}
        employeeLedgerRange={employeeLedgerRange}
        setEmployeeLedgerRange={setEmployeeLedgerRange}
        loadEmployeeLedger={loadEmployeeLedger}
        employeeLedgerLoading={employeeLedgerLoading}
        computeLedgerView={computeLedgerView}
        employeeLedgerRows={employeeLedgerRows}
        payrollSummaryByEmpId={payrollSummaryByEmpId}
        countMonthsInRangeInclusive={countMonthsInRangeInclusive}
        getLedgerEventLabel={getLedgerEventLabel}
      />

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
                  date: getLocalDateString(),
                  paymentMethod: 'CASH',
                  notes: ''
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
                                onClick={() => openEditEmployeeModal(employee)}
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
                                  openEditEmployeeModal(employee);
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
          {clientPayments.length > 0 && (
          <div className="salaries-actions" style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
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
          </div>
          )}

          {Array.isArray(clientDueAlerts) && clientDueAlerts.length > 0 && (
            <div
              role="alert"
              style={{
                marginTop: '14px',
                padding: '12px 16px',
                borderRadius: '12px',
                background: 'linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)',
                border: '1px solid #f59e0b',
                fontSize: '13px',
              }}
            >
              <strong style={{ display: 'block', marginBottom: '8px' }}>Client / supplier alerts</strong>
              <ul style={{ margin: 0, paddingLeft: '18px' }}>
                {clientDueAlerts.map((a, i) => (
                  <li key={i} style={{ marginBottom: '4px' }}>
                    <strong>{a.alertType === 'OVER_CREDIT_LIMIT' ? 'Over limit' : 'Overdue'}:</strong>{' '}
                    {a.clientName || a.clientKey} — {a.message}
                  </li>
                ))}
              </ul>
            </div>
          )}

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
                dueDate: '',
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
                      dueDate: '',
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
                      if (clientPurchaseFormData.dueDate) {
                        purchaseData.dueDate = clientPurchaseFormData.dueDate;
                      }

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
                      <label>Due date (optional)</label>
                      <input
                        type="date"
                        value={clientPurchaseFormData.dueDate}
                        onChange={(e) => setClientPurchaseFormData({ ...clientPurchaseFormData, dueDate: e.target.value })}
                      />
                      <p style={{ marginTop: '6px', fontSize: '12px', color: '#64748b' }}>
                        Leave blank to use payment terms from Credit &amp; terms (days after purchase date).
                      </p>
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
                          dueDate: '',
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
                    
                    // Resolve purchase from latest server-backed list first.
                    let purchase = null;
                    if (clientPaymentFormData.purchaseId) {
                      purchase = clientPayments.find((p) => String(p?.id) === String(clientPaymentFormData.purchaseId));
                    }
                    // Fallback to modal-selected object.
                    if (!purchase && selectedClientPurchase) {
                      purchase = selectedClientPurchase;
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
                      
                      // Reload expenses + unified-ledger CLIENT_OUT rows (shown on Daily Expenses tab).
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
                      let msg = error.message || 'Unknown error';
                      if (error.status === 404) {
                        msg +=
                          ' This purchase may not exist on the server (for example it was saved only in the browser while the API was down), or it belongs to another location. Try refreshing the Client tab or create the purchase again from the server.';
                      }
                      showToast(`Failed to record payment: ${msg}`, 'error');
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
                            <th>Due</th>
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
                        const paidFromLines = Number(
                          (Array.isArray(payments)
                            ? payments.reduce((sum, p) => sum + (parseFloat(p?.amount) || 0), 0)
                            : 0) || 0
                        ) || 0;
                        const paidAmount = Math.max(
                          paidFromLines,
                          Number(purchase?.amountPaid ?? purchase?.amount_paid ?? 0) || 0
                        );
                        const totalAmount = Number(parseFloat(purchase?.totalAmount || 0) || 0) || 0;
                        const outstandingRaw =
                          purchase?.amountOutstanding ?? purchase?.amount_outstanding;
                        const pendingAmount =
                          outstandingRaw != null && Number.isFinite(Number(outstandingRaw))
                            ? Math.max(0, Number(outstandingRaw))
                            : Math.max(0, totalAmount - paidAmount);
                        const isFullyPaid = pendingAmount <= 0;
                        const safePaid = isNaN(paidAmount) ? 0 : paidAmount;
                        const safeTotal = isNaN(totalAmount) ? 0 : totalAmount;
                        const safePending = isNaN(pendingAmount) ? 0 : pendingAmount;
                        const dueStr = purchase?.dueDate ? String(purchase.dueDate).slice(0, 10) : '';
                        const todayStr = getLocalDateString();
                        const overdue = Boolean(dueStr && safePending > 0 && dueStr < todayStr);
                        return (
                          <tr key={purchase?.id}>
                            <td className="date-cell client-purchase-client-cell">{purchase?.clientName || '-'}</td>
                            <td className="client-purchase-desc-cell">
                              <span className="client-purchase-desc-inner">{purchase?.purchaseDescription || '-'}</span>
                            </td>
                            <td style={{ fontSize: '12px' }}>
                              {purchase?.purchaseDate ? new Date(purchase.purchaseDate).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '-'}
                            </td>
                            <td style={{ fontSize: '12px', color: overdue ? '#b45309' : undefined, fontWeight: overdue ? 600 : undefined }}>
                              {dueStr
                                ? `${new Date(`${dueStr}T12:00:00`).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' })}${overdue ? ' ⚠' : ''}`
                                : '—'}
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
                                  type="button"
                                  title="Running ledger (signed balance)"
                                  onClick={async () => {
                                    const cid = String(purchase?.clientName || '').trim();
                                    if (!cid) return;
                                    setClientRunningLedgerTitle(cid);
                                    setShowClientRunningLedgerModal(true);
                                    setLoadingClientRunningLedger(true);
                                    setClientRunningLedgerRows([]);
                                    try {
                                      const rows = await fetchClientRunningLedger(cid);
                                      setClientRunningLedgerRows(Array.isArray(rows) ? rows : []);
                                    } catch (err) {
                                      showToast(err.message || 'Could not load ledger', 'error');
                                    } finally {
                                      setLoadingClientRunningLedger(false);
                                    }
                                  }}
                                >
                                  📒
                                </button>
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
                <p className="empty-subtitle">
                  Record stock bought on credit from a supplier or client. Retail bill customers, loans, and customer
                  advances appear under Sales / Ledger, not here.
                </p>
              </div>
            )}
          </div>

          {showClientRunningLedgerModal && (
            <div className="modal-overlay" onClick={() => setShowClientRunningLedgerModal(false)}>
              <div className="modal-content" style={{ maxWidth: '720px' }} onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                  <h3>Running balance — {clientRunningLedgerTitle}</h3>
                  <button type="button" className="modal-close" onClick={() => setShowClientRunningLedgerModal(false)}>×</button>
                </div>
                <div className="modal-body">
                  {loadingClientRunningLedger ? (
                    <Loading message="Loading ledger…" />
                  ) : (!clientRunningLedgerRows || clientRunningLedgerRows.length === 0) ? (
                    <p className="empty-state" style={{ padding: '20px' }}>No transactions for this name yet.</p>
                  ) : (
                    <div className="sales-table-wrapper">
                      <table className="data-table expenses-table" style={{ fontSize: '13px' }}>
                        <thead>
                          <tr>
                            <th>Date</th>
                            <th>Type</th>
                            <th>Mode</th>
                            <th>Amount</th>
                            <th>Balance</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(clientRunningLedgerRows || []).map((row) => (
                            <tr key={row.id}>
                              <td>{row.transactionDate}</td>
                              <td>{row.transactionType}</td>
                              <td>{row.paymentMode}</td>
                              <td>₹{Number(row.amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                              <td style={{ fontWeight: 700 }}>
                                {row.runningBalanceAfter != null
                                  ? `₹${Number(row.runningBalanceAfter).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`
                                  : '—'}
                              </td>
                            </tr>
                          ))}
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
                        {expense._ledgerOnly ? (
                          <span
                            className="ledger-feed-actions-hint"
                            title={expense._ledgerSource === 'loan'
                              ? 'Recorded from Loan ledger. Edit or remove it in Loan tab.'
                              : 'Recorded from Client Transactions (purchase payment). Edit or remove it there.'}
                            style={{ fontSize: '12px', color: '#64748b' }}
                          >
                            {expense._ledgerSource === 'loan' ? 'Loan module' : 'Client module'}
                          </span>
                        ) : (
                          <>
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
                          </>
                        )}
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
                          {expense._ledgerOnly ? (
                            <span
                              style={{ fontSize: '12px', color: '#64748b' }}
                              title={expense._ledgerSource === 'loan' ? 'Manage under Loan tab' : 'Manage under Client Transactions'}
                            >
                              {expense._ledgerSource === 'loan'
                                ? 'Loan module — use Loan tab to adjust'
                                : 'Client module — use Client tab to adjust'}
                            </span>
                          ) : (
                            <>
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
                            </>
                          )}
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


