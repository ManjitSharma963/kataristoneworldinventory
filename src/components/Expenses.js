import React, { useState, useEffect, useMemo } from 'react';
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
  getDailyBudgetHistory as apiGetDailyBudgetHistory,
  getDailyBudgetEventHistory as apiGetDailyBudgetEventHistory,
  createDailyBudget as apiCreateDailyBudget,
  updateDailyBudget as apiUpdateDailyBudget,
  deleteDailyBudget as apiDeleteDailyBudget,
  fetchCashbookTransactions,
  getCashbookBudgetToday
} from '../utils/api';
import { useForm } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import { expenseSchema, employeeSchema, salaryPaymentSchema, advancePaymentSchema, clientPurchaseSchema, clientPaymentSchema } from '../utils/validation';
import Loading from './Loading';
import ConfirmationModal from './ConfirmationModal';
import './Expenses.css';

const roundMoney2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

/** Local YYYY-MM-DD for an expense row (for cashbook alignment). */
const expenseDateKey = (expense) => {
  if (!expense?.date) return null;
  const d = new Date(expense.date);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const formatLedgerInr = (n) => {
  if (n == null || n === '') return '—';
  const x = Number(n);
  if (!Number.isFinite(x)) return '—';
  return `₹${x.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

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
  const [activeTab, setActiveTab] = useState('all'); // all, employee, client
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
  /** Latest GET /budget/daily/by-date fields so the card matches server (incl. bill payments). */
  const [dailyBudgetSnapshot, setDailyBudgetSnapshot] = useState(null);
  const [savingBudget, setSavingBudget] = useState(false);
  const [budgetHistory, setBudgetHistory] = useState([]);
  const [budgetEvents, setBudgetEvents] = useState([]);
  const [loadingBudgetHistory, setLoadingBudgetHistory] = useState(false);
  const [editingBudgetEntryId, setEditingBudgetEntryId] = useState(null);
  const [editingBudgetAmount, setEditingBudgetAmount] = useState('');
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

  const parseBudgetSnapshot = (res) => {
    if (res == null || typeof res !== 'object') return null;
    const root = res.data && typeof res.data === 'object' ? res.data : res;
    const numOrNull = (v) => {
      if (v == null || v === '') return null;
      const n = typeof v === 'string' ? parseFloat(v.replace(/,/g, '')) : Number(v);
      return Number.isFinite(n) ? n : null;
    };
    return {
      spent: numOrNull(root.spentAmount ?? root.spent_amount),
      remaining: numOrNull(root.remainingAmount ?? root.remaining_amount),
      budget: numOrNull(root.budgetAmount ?? root.budget_amount)
    };
  };

  const loadDailyBudget = async () => {
    const todayStr = getLocalDateString(); // YYYY-MM-DD for today
    try {
      // Always fetch from API (by-date) so UI reflects database
      const res = await apiGetDailyBudgetByDate(todayStr);
      const amount = getBudgetAmountFromResponse(res);
      setBudgetInHand(amount);
      setDailyBudgetSnapshot(parseBudgetSnapshot(res));
      setHasDailyBudgetFromApi(true);
      // Persist so fallback is in sync with database
      try {
        localStorage.setItem('expenses_budget_in_hand', String(amount));
      } catch (_) {}
    } catch (e) {
      try {
        const res = await apiGetDailyBudget();
        const amount = getBudgetAmountFromResponse(res);
        setBudgetInHand(amount);
        setDailyBudgetSnapshot(parseBudgetSnapshot(res));
        setHasDailyBudgetFromApi(true);
        try {
          localStorage.setItem('expenses_budget_in_hand', String(amount));
        } catch (_) {}
      } catch (e2) {
        try {
          const saved = localStorage.getItem('expenses_budget_in_hand');
          const val = saved !== null && saved !== '' ? Math.max(0, parseFloat(saved) || 0) : 0;
          setBudgetInHand(val);
        } catch (err) {
          setBudgetInHand(0);
        }
        setDailyBudgetSnapshot(null);
        setHasDailyBudgetFromApi(false);
      }
    }
  };

  // Automatically fetch daily budget when user opens the Expenses tab (component mounts)
  useEffect(() => {
    loadDailyBudget();
  }, []);

  // After creating a bill elsewhere, coming back to this tab should refresh totals
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === 'visible' && activeTab === 'all') {
        loadDailyBudget();
        setLedgerRefreshKey((k) => k + 1);
      }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [activeTab]);

  const loadBudgetHistory = async () => {
    setLoadingBudgetHistory(true);
    try {
      const toStr = getLocalDateString();
      const fromD = new Date();
      fromD.setDate(fromD.getDate() - 90);
      const fromStr = `${fromD.getFullYear()}-${String(fromD.getMonth() + 1).padStart(2, '0')}-${String(fromD.getDate()).padStart(2, '0')}`;
      const [list, events] = await Promise.all([
        apiGetDailyBudgetHistory(),
        apiGetDailyBudgetEventHistory({ from: fromStr, to: toStr, limit: 150 }),
      ]);
      const arr = Array.isArray(list) ? list : [];
      const sorted = [...arr].sort((a, b) => {
        const tA = new Date(a.updatedAt || a.createdAt || a.updated_at || a.created_at || 0).getTime();
        const tB = new Date(b.updatedAt || b.createdAt || b.updated_at || b.created_at || 0).getTime();
        return tB - tA;
      });
      setBudgetHistory(sorted.slice(0, 20));
      setBudgetEvents(Array.isArray(events) ? events : []);
    } catch (_) {
      setBudgetHistory([]);
      setBudgetEvents([]);
    } finally {
      setLoadingBudgetHistory(false);
    }
  };

  useEffect(() => {
    if (showDailyBudgetModal) loadBudgetHistory();
  }, [showDailyBudgetModal]);

  const saveDailyBudgetToApi = async (amount) => {
    const num = Number.isFinite(amount) ? Math.max(0, amount) : 0;
    if (num > 0) {
      if (hasDailyBudgetFromApi) {
        await apiUpdateDailyBudget(num);
      } else {
        await apiCreateDailyBudget(num);
      }
      setHasDailyBudgetFromApi(true);
      await loadDailyBudget();
    } else {
      await apiDeleteDailyBudget();
      setBudgetInHand(0);
      setDailyBudgetSnapshot(null);
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
      employeeId: ''
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

  const [clientPurchaseFormData, setClientPurchaseFormData] = useState({
    clientName: '',
    purchaseDescription: '',
    totalAmount: '',
    purchaseDate: getLocalDateString(),
    notes: ''
  });

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
  /** Maps expense id string → cashbook row (referenceType EXPENSE). */
  const [cashbookExpenseMap, setCashbookExpenseMap] = useState({});
  const [cashbookLedgerLoading, setCashbookLedgerLoading] = useState(false);
  /** date YYYY-MM-DD → opening balance for that day (cashbook / this location). */
  const [openingByDate, setOpeningByDate] = useState({});
  const [ledgerRefreshKey, setLedgerRefreshKey] = useState(0);
  const [submittingExpense, setSubmittingExpense] = useState(false);

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
      await loadDailyBudget();
    } catch (error) {
      console.error('Error loading expenses from API:', error);
      setApiError(true);
      // Don't use localStorage fallback - only use API data
      setExpenses([]);
    } finally {
      setLoadingExpenses(false);
    }
  };

  const cashbookFetchKey = useMemo(() => {
    if (!expenses.length) return '';
    let min = null;
    let max = null;
    for (const e of expenses) {
      const k = expenseDateKey(e);
      if (!k) continue;
      if (!min || k < min) min = k;
      if (!max || k > max) max = k;
    }
    if (!min || !max) return '';
    return `${min}:${max}:${expenses.length}`;
  }, [expenses]);

  const expenseDatesForOpening = useMemo(() => {
    const s = new Set();
    for (const e of expenses) {
      const k = expenseDateKey(e);
      if (k) s.add(k);
    }
    const sorted = [...s].sort().reverse();
    return sorted.slice(0, 55);
  }, [expenses]);

  useEffect(() => {
    if (activeTab !== 'all') return;
    if (!cashbookFetchKey) {
      setCashbookExpenseMap({});
      return;
    }
    const [min, max] = cashbookFetchKey.split(':').slice(0, 2);
    if (!min || !max) return;
    let cancelled = false;
    (async () => {
      try {
        setCashbookLedgerLoading(true);
        const res = await fetchCashbookTransactions({ from: min, to: max });
        if (cancelled) return;
        const rows = Array.isArray(res?.rows) ? res.rows : [];
        const map = {};
        for (const row of rows) {
          if (
            row.rowKind === 'TRANSACTION' &&
            row.referenceType === 'EXPENSE' &&
            row.referenceId != null &&
            String(row.referenceId) !== ''
          ) {
            map[String(row.referenceId)] = row;
          }
        }
        setCashbookExpenseMap(map);
      } catch (err) {
        console.warn('Cashbook sync for expenses list failed:', err);
        if (!cancelled) setCashbookExpenseMap({});
      } finally {
        if (!cancelled) setCashbookLedgerLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeTab, cashbookFetchKey, ledgerRefreshKey]);

  useEffect(() => {
    if (activeTab !== 'all') return;
    if (!expenseDatesForOpening.length) return;
    let cancelled = false;
    (async () => {
      try {
        const results = await Promise.all(
          expenseDatesForOpening.map(async (d) => {
            try {
              const b = await getCashbookBudgetToday(d);
              const raw = b?.openingBalance ?? b?.opening_balance;
              const v = Number(raw);
              return [d, Number.isFinite(v) ? v : null];
            } catch {
              return [d, null];
            }
          })
        );
        if (cancelled) return;
        setOpeningByDate((prev) => {
          const next = { ...prev };
          for (const [d, v] of results) {
            if (v != null) next[d] = v;
          }
          return next;
        });
      } catch (_) {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeTab, expenseDatesForOpening.join('|'), ledgerRefreshKey]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const onSubmitExpense = async (data) => {
    const selectedEmp = employees.find(emp => String(emp.id) === String(data.employeeId || ''));
    const isEmployeeCategory = String(data.category || '').trim().toLowerCase() === 'employee';
    if (isEmployeeCategory && !selectedEmp) {
      showToast('Please select employee for employee expense.', 'error');
      return;
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
      } : {})
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
      await loadPayrollSummary();
      // Notify parent component (Dashboard) to refresh expenses for chart
      if (onExpenseUpdate) {
        onExpenseUpdate();
      }
    } catch (error) {
      console.error('Error saving expense to API:', error);
      showToast('Failed to save expense. Please check your connection and try again.', 'error');
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
    };
    setFormData(editData);
    // Update react-hook-form values
    Object.keys(editData).forEach(key => {
      setExpenseValue(key, editData[key]);
    });
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
      employeeId: ''
    };
    setFormData(defaults);
    // Reset react-hook-form so date and other fields stay in sync (submitted value = today)
    resetExpense(defaults);
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
    } else if (activeTab === 'employee') {
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

  const dailyBudget = Number(parseFloat(budgetInHand) || 0) || 0;
  // Carry-over disabled: we don't store per-day budget history, so we can't know what was actually left yesterday.
  const carryOverFromYesterday = 0;
  const todayBudgetWithCarryOver = dailyBudget;

  // Daily budget card: prefer API (includes bill payment credits in remaining for today).
  const todayOnlyBudgetContext = useMemo(() => {
    if (hasDailyBudgetFromApi && dailyBudgetSnapshot) {
      const s = dailyBudgetSnapshot;
      const savedCap =
        s.budget != null && s.budget >= 0 ? s.budget : dailyBudget;
      const spent = s.spent != null ? s.spent : todayExpenses;
      const remaining =
        s.remaining != null ? s.remaining : Math.max(0, savedCap - spent);
      // Effective "budget today" = saved cap + today's cash/UPI bill collections (= spent + remaining)
      const effectiveBudgetToday = roundMoney2(spent + remaining);
      return {
        spent,
        budgetTotal: savedCap,
        effectiveBudgetToday,
        remaining,
        periodLabel: 'Today',
        days: 1,
        carryOver: 0,
        baseBudget: savedCap
      };
    }
    const spent = todayExpenses;
    const rem = dailyBudget - todayExpenses;
    return {
      spent,
      budgetTotal: dailyBudget,
      effectiveBudgetToday: roundMoney2(spent + rem),
      remaining: rem,
      periodLabel: 'Today',
      days: 1,
      carryOver: 0,
      baseBudget: dailyBudget
    };
  }, [hasDailyBudgetFromApi, dailyBudgetSnapshot, todayExpenses, dailyBudget]);

  // Daily / date-wise budget: spent and budget for the current view (today, selected date, or date range)
  const getBudgetContext = () => {
    const start = dateFilter.start;
    const end = dateFilter.end;
    if (!start && !end) {
      return {
        spent: todayExpenses,
        budgetTotal: todayBudgetWithCarryOver,
        periodLabel: 'Today',
        days: 1,
        carryOver: carryOverFromYesterday,
        baseBudget: dailyBudget
      };
    }
    const singleDay = start && !end ? start : (!start && end ? end : null);
    if (singleDay) {
      const dayStart = new Date(singleDay);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(singleDay);
      dayEnd.setHours(23, 59, 59, 999);
      const spentOnDay = expenses
        .filter(exp => {
          const d = new Date(exp.date);
          return d >= dayStart && d <= dayEnd;
        })
        .reduce((sum, exp) => sum + (parseFloat(exp.amount) || 0), 0);
      return { spent: spentOnDay, budgetTotal: dailyBudget, periodLabel: `On ${formatDate(singleDay)}`, days: 1 };
    }
    if (start && end) {
      const startDate = new Date(start);
      const endDate = new Date(end);
      startDate.setHours(0, 0, 0, 0);
      endDate.setHours(23, 59, 59, 999);
      const daysInRange = Math.max(1, Math.ceil((endDate - startDate) / (24 * 60 * 60 * 1000)) + 1);
      const budgetForPeriod = dailyBudget * daysInRange;
      return { spent: totalExpenses, budgetTotal: budgetForPeriod, periodLabel: `Selected period (${daysInRange} day${daysInRange !== 1 ? 's' : ''})`, days: daysInRange };
    }
    return { spent: todayExpenses, budgetTotal: dailyBudget, periodLabel: 'Today', days: 1 };
  };
  const budgetContext = getBudgetContext();

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
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 'min(920px, 96vw)' }}>
            <div className="modal-header">
              <h3>{hasDailyBudgetFromApi ? 'Edit daily budget' : 'Add daily budget'}</h3>
              <button type="button" className="modal-close" onClick={() => !savingBudget && setShowDailyBudgetModal(false)}>×</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>Available Balance per day (₹)</label>
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
                <h4 style={{ margin: '0 0 8px 0', fontSize: '14px', color: '#555' }}>Budget history</h4>
                <p style={{ margin: '0 0 10px', fontSize: '12px', color: '#777' }}>
                  Your branch only (from login). Shows the saved daily cap for this location if one exists. Ledger net is for the calendar day of that row's last update.
                </p>
                {loadingBudgetHistory ? (
                  <p style={{ margin: 0, fontSize: '13px', color: '#888' }}>Loading...</p>
                ) : budgetHistory.length === 0 ? (
                  <p style={{ margin: 0, fontSize: '13px', color: '#888' }}>No summary rows yet.</p>
                ) : (
                  <ul className="budget-history-list" style={{ listStyle: 'none', margin: 0, padding: 0, maxHeight: '200px', overflowY: 'auto' }}>
                    {budgetHistory.map((entry, idx) => {
                      const amount = Number(entry.amount ?? entry.budgetAmount ?? 0);
                      const dateStr = entry.updatedAt ?? entry.createdAt ?? entry.date ?? entry.updated_at ?? entry.created_at ?? '';
                      const displayDate = dateStr ? (dateStr.length >= 10 ? dateStr.slice(0, 10) : dateStr) : '—';
                      const remaining = Number(
                        entry.netLedgerBalance ?? entry.remainingBudget ?? entry.remaining_budget ?? 0
                      );
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
                          await loadDailyBudget();
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
                        <li key={entry.id ?? idx} style={{ padding: '8px 0', borderBottom: '1px solid #f0f0f0', fontSize: '13px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ color: '#666' }}>{displayDate}</span>
                            <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              {isToday && isEditingThis ? (
                                <>
                                  <span style={{ fontWeight: '600' }}>₹</span>
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
                                    style={{ width: '90px', padding: '4px 8px', fontSize: '13px', fontWeight: '600' }}
                                  />
                                </>
                              ) : (
                                <>
                                  <span style={{ fontWeight: '600', background: isToday ? '#f0f0f0' : 'transparent', padding: isToday ? '2px 6px' : 0, borderRadius: '4px' }}>
                                    ₹{Number.isFinite(amount) ? amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00'}
                                  </span>
                                  {isToday && (
                                    <button
                                      type="button"
                                      className="btn btn-secondary"
                                      onClick={() => { setEditingBudgetEntryId(rowKey); setEditingBudgetAmount(String(amount)); }}
                                      style={{ fontSize: '12px', padding: '4px 10px' }}
                                    >
                                      Edit
                                    </button>
                                  )}
                                </>
                              )}
                            </span>
                          </div>
                          {(location || Number.isFinite(remaining)) && (
                            <div style={{ marginTop: '2px', fontSize: '12px', color: '#888' }}>
                              {location && <span>{location}</span>}
                              {location && Number.isFinite(remaining) && ' · '}
                              {Number.isFinite(remaining) && (
                                <span>Net (ledger that day): ₹{remaining.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                              )}
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
                <p style={{ margin: '12px 0 6px', fontSize: '12px', color: '#777' }}>
                  <strong>Your location — balance changes</strong> (from server log; last ~90 days). Each row is one budget update, expense, or collection affecting remaining balance.
                </p>
                {loadingBudgetHistory ? (
                  <p style={{ margin: 0, fontSize: '13px', color: '#888' }}>Loading events…</p>
                ) : budgetEvents.length === 0 ? (
                  <p style={{ margin: 0, fontSize: '13px', color: '#888' }}>No event log for this period.</p>
                ) : (
                  <div style={{ overflowX: 'auto', maxHeight: '280px', overflowY: 'auto', border: '1px solid #eee', borderRadius: '6px' }}>
                    <table className="data-table" style={{ width: '100%', fontSize: '12px', margin: 0 }}>
                      <thead>
                        <tr>
                          <th>Date</th>
                          <th style={{ textAlign: 'right' }}>Opening</th>
                          <th>Type</th>
                          <th style={{ textAlign: 'right' }}>Δ amount</th>
                          <th style={{ textAlign: 'right' }}>Remaining</th>
                          <th>Reason</th>
                        </tr>
                      </thead>
                      <tbody>
                        {budgetEvents.map((ev) => {
                          const d = Number(ev.delta ?? 0);
                          const isCredit = d >= 0;
                          const day =
                            (ev.date && String(ev.date).slice(0, 10)) ||
                            (ev.createdAt && String(ev.createdAt).slice(0, 10)) ||
                            '—';
                          const open = Number(ev.openingBalance ?? 0);
                          const close = Number(ev.closingBalance ?? 0);
                          const absAmt = Math.abs(d);
                          return (
                            <tr key={ev.id ?? `${day}-${ev.createdAt}`}>
                              <td>{day}</td>
                              <td style={{ textAlign: 'right' }}>
                                ₹{open.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </td>
                              <td style={{ color: isCredit ? '#0a7a32' : '#b00020', fontWeight: 600 }}>
                                {isCredit ? 'CREDIT' : 'DEBIT'}
                              </td>
                              <td style={{ textAlign: 'right' }}>
                                ₹{absAmt.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </td>
                              <td style={{ textAlign: 'right' }}>
                                ₹{close.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </td>
                              <td style={{ color: '#666', maxWidth: '140px', wordBreak: 'break-word' }}>
                                {ev.eventType || '—'}
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
              >
                <option value="">Select Category</option>
                <option value="water">Water Bill</option>
                <option value="electricity">Electricity Bill</option>
                <option value="petrol">Petrol</option>
                <option value="grocery">Grocery</option>
                <option value="rent">Rent</option>
                <option value="maintenance">Maintenance</option>
                <option value="transport">Transport</option>
                <option value="employee">Employee</option>
                <option value="other">Other</option>
              </select>
              {expenseErrors.category && (
                <span className="error-message">{expenseErrors.category.message}</span>
              )}
            </div>
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
              <span
                className="budget-in-hand-title"
                title="Today: saved cap minus today's expenses, plus today's bill payments in Cash and UPI only (same as main-branch behaviour)."
              >
                💰 Daily available balance
                <span style={{ fontWeight: 500, fontSize: '0.85em', color: '#64748b', marginLeft: '8px' }}>
                  ({getLocalDateString()})
                </span>
              </span>
            </div>
            <div className="budget-in-hand-stats">
              <div className="budget-stat">
                <span className="budget-stat-label">Spent (Today)</span>
                <span className="budget-stat-value spent">₹{(Number(todayOnlyBudgetContext.spent || 0) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>
              <div className="budget-stat">
                <span
                  className="budget-stat-label"
                  title="Saved daily cap (Budget button) plus today's customer bill payments in Cash and UPI. Bank/cheque on bills are not added here."
                >
                  Budget today
                </span>
                <span className="budget-stat-value">
                  ₹
                  {(Number(todayOnlyBudgetContext.effectiveBudgetToday) || 0).toLocaleString('en-IN', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2
                  })}
                </span>
              </div>
              <div className="budget-stat">
                {(() => {
                  const left = Number(todayOnlyBudgetContext.remaining ?? 0) || 0;
                  if (left >= 0) {
                    return (
                      <>
                        <span className="budget-stat-label">Available Balance</span>
                        <span className="budget-stat-value left">₹{left.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                      </>
                    );
                  }
                  return (
                    <>
                      <span className="budget-stat-label">Over budget by</span>
                      <span className="budget-stat-value over">₹{Math.abs(left).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </>
                  );
                })()}
              </div>
            </div>
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
                <div className="sales-table-wrapper">
                  <table className="data-table expenses-table">
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Amount</th>
                        <th>Joining Date</th>
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
                          <td style={{ fontSize: '12px' }}>{employee?.joiningDate ? new Date(employee.joiningDate).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '-'}</td>
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
                          <td>
                            <span className={`payment-badge ${getSalaryStatusBadgeClass(employee?.id)}`}>
                              {salaryStatus}
                            </span>
                          </td>
                          <td className="actions-cell">
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
                clientName: '',
                purchaseDescription: '',
                totalAmount: '',
                purchaseDate: getLocalDateString(),
                notes: ''
              });
            }}>
              <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                  <h3>Add Client Purchase</h3>
                  <button className="modal-close" onClick={() => {
                    setShowClientPurchaseForm(false);
                    setClientPurchaseFormData({
                      clientName: '',
                      purchaseDescription: '',
                      totalAmount: '',
                      purchaseDate: getLocalDateString(),
                      notes: ''
                    });
                  }}>×</button>
                </div>
                <div className="modal-body">
                  <form onSubmit={async (e) => {
                    e.preventDefault();
                    try {
                      // Prepare purchase data for API
                      const purchaseData = {
                        clientName: clientPurchaseFormData.clientName,
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
                        clientName: '',
                        purchaseDescription: '',
                        totalAmount: '',
                        purchaseDate: getLocalDateString(),
                        notes: ''
                      });
                    } catch (error) {
                      console.error('Error creating client purchase:', error);
                      // Fallback to localStorage if API fails
                      const newPurchase = {
                        id: Date.now().toString(),
                        clientName: clientPurchaseFormData.clientName,
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
                        clientName: '',
                        purchaseDescription: '',
                        totalAmount: '',
                        purchaseDate: getLocalDateString(),
                        notes: ''
                      });
                    }
                  }}>
                    <div className="form-group">
                      <label>Client Name *</label>
                      <input
                        type="text"
                        value={clientPurchaseFormData.clientName}
                        onChange={(e) => setClientPurchaseFormData({ ...clientPurchaseFormData, clientName: e.target.value })}
                        placeholder="Enter client name"
                        required
                      />
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
                          clientName: '',
                          purchaseDescription: '',
                          totalAmount: '',
                          purchaseDate: getLocalDateString(),
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
                      
                      // Also create this as an expense in the API
                      try {
                        const expenseData = {
                          type: 'client_payment',
                          date: clientPaymentFormData.date,
                          category: 'client_payment',
                          description: `Payment to ${purchase.clientName} - ${purchase.purchaseDescription || 'Purchase'}`,
                          amount: paymentAmount,
                          paymentMethod: clientPaymentFormData.paymentMethod
                        };
                        
                        if (clientPaymentFormData.notes) {
                          expenseData.description += ` - ${clientPaymentFormData.notes}`;
                        }
                        
                        await apiCreateExpense(expenseData);
                        await loadExpenses();
                        
                        showToast(`Payment of ₹${paymentAmount.toLocaleString('en-IN')} recorded and added to expenses!`, 'success');
                      } catch (error) {
                        console.error('Error creating expense for client payment:', error);
                        showToast(`Payment recorded, but failed to add to expenses: ${error.message}`, 'error');
                      }
                      
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
                  <div className="expenses-table-container">
                    <div className="sales-table-wrapper">
                      <table className="data-table expenses-table">
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
                            <td className="date-cell">{purchase?.clientName || '-'}</td>
                            <td>{purchase?.purchaseDescription || '-'}</td>
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
                            <td>
                              <span style={{
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
                            <td>
                              <div className="action-buttons">
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
            <p className="expense-ledger-hint">
              {cashbookLedgerLoading
                ? 'Syncing with cashbook…'
                : 'Day opening, cash change (Δ), and remaining balance come from the unified cashbook for this location. Balances use posting order for that day (not your current table sort).'}
            </p>
            {/* Desktop Table View */}
            <div className="sales-table-wrapper expenses-table-wrap">
              <table className="data-table expenses-table expenses-table-with-ledger">
                <thead>
                  <tr>
                    <th className="sortable expense-col-date" onClick={() => handleSort('date')}>
                      Date
                      {sortConfig.key === 'date' && (
                        <span className="sort-icon">{sortConfig.direction === 'asc' ? ' ↑' : ' ↓'}</span>
                      )}
                    </th>
                    <th className="sortable expense-col-type" onClick={() => handleSort('type')}>
                      Type
                      {sortConfig.key === 'type' && (
                        <span className="sort-icon">{sortConfig.direction === 'asc' ? ' ↑' : ' ↓'}</span>
                      )}
                    </th>
                    <th className="expense-details-col">Details</th>
                    <th className="sortable" onClick={() => handleSort('amount')}>
                      Amount
                      {sortConfig.key === 'amount' && (
                        <span className="sort-icon">{sortConfig.direction === 'asc' ? ' ↑' : ' ↓'}</span>
                      )}
                    </th>
                    <th
                      className="expense-ledger-col"
                      title="Cash on hand at the start of this calendar day (before that day’s ledger entries)."
                    >
                      Day opening
                    </th>
                    <th
                      className="expense-ledger-col"
                      title="How this expense moved cash: negative = outflow. “Before” is cash immediately before this entry in ledger order."
                    >
                      Δ Cash
                    </th>
                    <th
                      className="expense-ledger-col"
                      title="Cash remaining right after this expense, in ledger posting order for that day."
                    >
                      Balance after
                    </th>
                    <th>Payment Method</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedExpenses.map((expense) => {
                    const dKey = expenseDateKey(expense);
                    const ledger = cashbookExpenseMap[String(expense.id)];
                    const dayOpen =
                      dKey != null && openingByDate[dKey] !== undefined ? openingByDate[dKey] : null;
                    const signed =
                      ledger != null && ledger.signedAmount != null ? Number(ledger.signedAmount) : null;
                    const afterBal =
                      ledger != null && ledger.balanceAfter != null ? Number(ledger.balanceAfter) : null;
                    const amt = Number(parseFloat(expense?.amount || 0) || 0) || 0;
                    const beforeBal =
                      afterBal != null && Number.isFinite(afterBal)
                        ? roundMoney2(afterBal + amt)
                        : null;
                    return (
                    <tr key={expense.id}>
                      <td className="date-cell">{formatDate(expense.date)}</td>
                      <td>
                        <span className={`expense-type-badge type-${expense.type}`}>
                          {getTypeIcon(expense.type)} {getTypeLabel(expense.type)}
                        </span>
                      </td>
                      <td className="expense-details-cell">
                        <div className="expense-details-inner">
                          <span className="expense-details-cat" title={expense.category || ''}>
                            {expense.category
                              ? expense.category.charAt(0).toUpperCase() + expense.category.slice(1)
                              : '—'}
                          </span>
                          <span
                            className={`expense-details-text${expense.description ? '' : ' expense-details-muted'}`}
                            title={expense.description || undefined}
                          >
                            {expense.description || '—'}
                          </span>
                        </div>
                      </td>
                      <td className="amount-cell total-col">
                        <span className="expense-amount">₹{(Number(parseFloat(expense?.amount || 0) || 0) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                      </td>
                      <td className="amount-cell expense-ledger-cell" title={dKey ? `Date key: ${dKey}` : undefined}>
                        <span className="expense-ledger-value">{formatLedgerInr(dayOpen)}</span>
                      </td>
                      <td className="amount-cell expense-ledger-cell">
                        {signed != null && Number.isFinite(signed) ? (
                          <div>
                            <div className={`expense-ledger-delta ${signed >= 0 ? 'ledger-in' : 'ledger-out'}`}>
                              {signed >= 0 ? '+' : '−'}
                              {formatLedgerInr(Math.abs(signed))}
                            </div>
                            {beforeBal != null && (
                              <div className="expense-ledger-sub">
                                before {formatLedgerInr(beforeBal)}
                              </div>
                            )}
                          </div>
                        ) : (
                          <div title="This expense is not linked in the cashbook yet (e.g. older data). Δ shows the expense amount only.">
                            <div className="expense-ledger-delta ledger-out expense-ledger-unlinked">
                              −{formatLedgerInr(amt)}
                            </div>
                            <span className="expense-ledger-sub muted">not in ledger</span>
                          </div>
                        )}
                      </td>
                      <td className="amount-cell total-col expense-ledger-cell">
                        <span className="expense-ledger-value strong">{formatLedgerInr(afterBal)}</span>
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
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Card View - Expandable */}
            <div className="mobile-expenses-cards">
              {paginatedExpenses.map((expense) => {
                const isExpanded = expandedExpenses.has(expense.id);
                const dKeyM = expenseDateKey(expense);
                const ledgerM = cashbookExpenseMap[String(expense.id)];
                const dayOpenM =
                  dKeyM != null && openingByDate[dKeyM] !== undefined ? openingByDate[dKeyM] : null;
                const signedM =
                  ledgerM != null && ledgerM.signedAmount != null ? Number(ledgerM.signedAmount) : null;
                const afterM =
                  ledgerM != null && ledgerM.balanceAfter != null ? Number(ledgerM.balanceAfter) : null;
                const amtM = Number(parseFloat(expense?.amount || 0) || 0) || 0;
                const beforeM =
                  afterM != null && Number.isFinite(afterM) ? roundMoney2(afterM + amtM) : null;
                return (
                  <div key={expense.id} className={`expense-card ${isExpanded ? 'expanded' : ''}`}>
                    <div className="expense-card-header" onClick={() => toggleExpense(expense.id)}>
                      <button className="expand-toggle-btn">
                        {isExpanded ? '▲' : '▼'}
                      </button>
                      <div className="expense-card-title-section">
                        <div className="expense-card-main-info">
                          <span className="expense-card-category">{expense.category?.charAt(0).toUpperCase() + expense.category?.slice(1)}</span>
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
                        <div className="expense-card-row">
                          <span className="expense-card-label">Day opening:</span>
                          <span className="expense-card-value">{formatLedgerInr(dayOpenM)}</span>
                        </div>
                        <div className="expense-card-row">
                          <span className="expense-card-label">Δ Cash:</span>
                          <span className="expense-card-value">
                            {signedM != null && Number.isFinite(signedM) ? (
                              <>
                                <span className={signedM >= 0 ? 'ledger-in' : 'ledger-out'}>
                                  {signedM >= 0 ? '+' : '−'}
                                  {formatLedgerInr(Math.abs(signedM))}
                                </span>
                                {beforeM != null && (
                                  <span className="expense-ledger-sub"> (before {formatLedgerInr(beforeM)})</span>
                                )}
                              </>
                            ) : (
                              <span className="expense-ledger-unlinked" title="Not linked in cashbook">
                                −{formatLedgerInr(amtM)} <span className="expense-ledger-sub muted">(not in ledger)</span>
                              </span>
                            )}
                          </span>
                        </div>
                        <div className="expense-card-row">
                          <span className="expense-card-label">Balance after:</span>
                          <span className="expense-card-value">{formatLedgerInr(afterM)}</span>
                        </div>
                        {expense.description && (
                          <div className="expense-card-row">
                            <span className="expense-card-label">Description:</span>
                            <span className="expense-card-value">{expense.description}</span>
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

