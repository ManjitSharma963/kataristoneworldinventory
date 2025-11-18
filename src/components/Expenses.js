import React, { useState, useEffect } from 'react';
// Note: localStorage functions are no longer used - all data comes from API
// Keeping imports for potential future use or reference, but not actively used
import { getExpenses, addExpense, updateExpense, deleteExpense, getEmployees, addEmployee, updateEmployee, deleteEmployee } from '../utils/storage';
import { 
  fetchExpenses as apiFetchExpenses, 
  createExpense as apiCreateExpense, 
  updateExpense as apiUpdateExpense, 
  deleteExpense as apiDeleteExpense,
  fetchEmployees as apiFetchEmployees,
  createEmployee as apiCreateEmployee,
  updateEmployee as apiUpdateEmployee,
  deleteEmployee as apiDeleteEmployee
} from '../utils/api';
import { useForm } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import { expenseSchema, employeeSchema, salaryPaymentSchema, advancePaymentSchema, clientPurchaseSchema, clientPaymentSchema } from '../utils/validation';
import Loading from './Loading';
import './Expenses.css';

const Expenses = ({ hideHeader = false, hideStats = false, showAddButtonInHeader = false, showForm: externalShowForm = null, onFormClose = null, onFormOpen = null, onExpenseUpdate = null }) => {
  const [expenses, setExpenses] = useState([]);
  const [employees, setEmployees] = useState([]);
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
    // Reset form data when opening
    setFormData({
      date: new Date().toISOString().split('T')[0],
      category: '',
      description: '',
      amount: '',
      paymentMethod: 'cash'
    });
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
  const [showClientPurchaseForm, setShowClientPurchaseForm] = useState(false);
  const [showClientPaymentForm, setShowClientPaymentForm] = useState(false);
  const [selectedClientPurchase, setSelectedClientPurchase] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [dateFilter, setDateFilter] = useState({ start: '', end: '' });
  const [currentPage, setCurrentPage] = useState(1);
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });
  const [expandedExpenses, setExpandedExpenses] = useState(new Set());
  const [expandedEmployees, setExpandedEmployees] = useState(new Set());
  const itemsPerPage = 10;

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
    formState: { errors: expenseErrors } 
  } = useForm({
    resolver: yupResolver(expenseSchema),
    defaultValues: {
      date: new Date().toISOString().split('T')[0],
      category: '',
      description: '',
      amount: '',
      paymentMethod: 'cash'
    }
  });

  // Keep formData for backward compatibility with existing code
  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    category: '',
    description: '',
    amount: '',
    paymentMethod: 'cash'
  });

  const [salaryFormData, setSalaryFormData] = useState({
    employeeName: '',
    salaryAmount: '',
    joiningDate: new Date().toISOString().split('T')[0]
  });

  const [paySalaryFormData, setPaySalaryFormData] = useState({
    month: new Date().toISOString().slice(0, 7), // YYYY-MM format
    date: new Date().toISOString().split('T')[0],
    paymentMethod: 'cash',
    amount: ''
  });

  const [payAdvanceFormData, setPayAdvanceFormData] = useState({
    employeeId: '',
    amount: '',
    date: new Date().toISOString().split('T')[0]
  });

  const [clientPurchaseFormData, setClientPurchaseFormData] = useState({
    clientName: '',
    purchaseDescription: '',
    totalAmount: '',
    purchaseDate: new Date().toISOString().split('T')[0],
    notes: ''
  });

  const [clientPaymentFormData, setClientPaymentFormData] = useState({
    purchaseId: '',
    amount: '',
    date: new Date().toISOString().split('T')[0],
    paymentMethod: 'cash',
    notes: ''
  });

  const [loadingEmployees, setLoadingEmployees] = useState(false);
  const [loadingExpenses, setLoadingExpenses] = useState(false);
  const [apiError, setApiError] = useState(false);

  useEffect(() => {
    loadExpenses();
    loadEmployees();
    loadClientPayments();
  }, []);

  const loadClientPayments = () => {
    try {
      const stored = localStorage.getItem('clientPayments');
      if (stored) {
        setClientPayments(JSON.parse(stored));
      } else {
        setClientPayments([]);
      }
    } catch (error) {
      console.error('Error loading client payments:', error);
      setClientPayments([]);
    }
  };

  const saveClientPayments = (payments) => {
    try {
      localStorage.setItem('clientPayments', JSON.stringify(payments));
      setClientPayments(payments);
    } catch (error) {
      console.error('Error saving client payments:', error);
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

  // Calculate advance payments for an employee (using expenses from API only)
  const getAdvancePayments = (employeeId) => {
    if (!employeeId || !expenses || !Array.isArray(expenses)) return 0;
    const advances = expenses.filter(exp => 
      exp?.type === 'advance' && 
      (exp?.employeeId === employeeId || exp?.employeeId === String(employeeId)) &&
      (exp?.settled === false || exp?.settled === undefined || !exp?.settled)
    );
    const total = advances.reduce((sum, adv) => {
      const amount = Number(parseFloat(adv?.amount) || 0) || 0;
      return (sum || 0) + (isNaN(amount) ? 0 : amount);
    }, 0);
    return isNaN(total) ? 0 : Number(total);
  };

  // Calculate pending payments (Total Salary - Advance Payment) (using expenses from API only)
  const getPendingPayments = (employeeId, employeeSalary) => {
    if (!employeeId) return 0;
    const advancePayments = expenses.filter(exp => 
      exp?.type === 'advance' && 
      (exp?.employeeId === employeeId || exp?.employeeId === String(employeeId)) &&
      (exp?.settled === false || exp?.settled === undefined || !exp?.settled)
    );
    const totalAdvances = advancePayments.reduce((sum, adv) => {
      const amount = Number(parseFloat(adv?.amount) || 0) || 0;
      return (sum || 0) + (isNaN(amount) ? 0 : amount);
    }, 0);
    const totalSalary = Number(parseFloat(employeeSalary) || 0) || 0;
    const pendingPayment = Number((totalSalary - totalAdvances) || 0) || 0;
    return (isNaN(pendingPayment) || pendingPayment < 0) ? 0 : pendingPayment; // Don't show negative values
  };

  // Get current month salary status (using expenses from API only)
  const getCurrentMonthSalaryStatus = (employeeId) => {
    const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM format
    const salaryPayments = expenses.filter(exp => 
      exp.type === 'salary' && 
      exp.employeeId === employeeId &&
      exp.month === currentMonth
    );
    return salaryPayments.length > 0 ? 'Paid' : 'Pending';
  };

  // Handle Pay Salary button click
  const handlePaySalaryClick = (employee) => {
    setSelectedEmployee(employee);
    
    // Calculate pending amount (Total Salary - Advance Payments)
    const advancePayments = getAdvancePayments(employee.id);
    const totalSalary = parseFloat(employee.salaryAmount) || 0;
    const pendingAmount = totalSalary - advancePayments;
    const amountToPay = pendingAmount > 0 ? pendingAmount : 0;
    
    setPaySalaryFormData({
      month: new Date().toISOString().slice(0, 7),
      date: new Date().toISOString().split('T')[0],
      paymentMethod: 'cash',
      amount: amountToPay.toFixed(2)
    });
    setShowPaySalaryForm(true);
  };

  // Handle Pay Salary form submission
  const handlePaySalarySubmit = async (e) => {
    e.preventDefault();
    if (!selectedEmployee) return;

    const salaryAmount = parseFloat(paySalaryFormData.amount) || 0;
    
    // Mark advance payments as settled when salary is paid
    try {
      const allExpenses = await apiFetchExpenses({ employeeId: selectedEmployee.id, type: 'advance', settled: false });
      const advancePayments = allExpenses || [];
      
      // Mark advances as settled
      for (const advance of advancePayments) {
        try {
          await apiUpdateExpense(advance.id, { settled: true });
        } catch (error) {
          console.error('Error updating advance:', error);
          // Don't use localStorage fallback
        }
      }
    } catch (error) {
      console.error('Error fetching advances:', error);
      // Don't use localStorage fallback - only use API data
    }

    const salaryPayment = {
      type: 'salary',
      category: 'salary',
      employeeId: selectedEmployee.id,
      employeeName: selectedEmployee.employeeName,
      amount: salaryAmount,
      month: paySalaryFormData.month,
      date: paySalaryFormData.date,
      paymentMethod: paySalaryFormData.paymentMethod,
      description: `Salary payment for ${selectedEmployee.employeeName} - ${paySalaryFormData.month}`
    };

    try {
      await apiCreateExpense(salaryPayment);
      await loadExpenses();
      // Notify parent component (Dashboard) to refresh expenses for chart
      if (onExpenseUpdate) {
        onExpenseUpdate();
      }
      setShowPaySalaryForm(false);
      setSelectedEmployee(null);
      setPaySalaryFormData({
        month: new Date().toISOString().slice(0, 7),
        date: new Date().toISOString().split('T')[0],
        paymentMethod: 'cash',
        amount: ''
      });
    } catch (error) {
      console.error('Error saving salary payment to API:', error);
      alert('Failed to save salary payment. Please check your connection and try again.');
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

    // Exact format matching the CURL request
    const advancePayment = {
      type: 'advance',
      category: 'advance',
      date: payAdvanceFormData.date,
      amount: parseFloat(payAdvanceFormData.amount) || 0,
      paymentMethod: 'cash',
      employeeId: typeof selectedEmp.id === 'string' ? parseInt(selectedEmp.id) : selectedEmp.id,
      employeeName: selectedEmp.employeeName,
      description: `Advance payment for ${selectedEmp.employeeName}`,
      settled: false
    };

    try {
      await apiCreateExpense(advancePayment);
      await loadExpenses();
      // Notify parent component (Dashboard) to refresh expenses for chart
      if (onExpenseUpdate) {
        onExpenseUpdate();
      }
      setShowPayAdvanceForm(false);
      setPayAdvanceFormData({
        employeeId: '',
        amount: '',
        date: new Date().toISOString().split('T')[0]
      });
    } catch (error) {
      console.error('Error saving advance payment to API:', error);
      alert('Failed to save advance payment. Please check your connection and try again.');
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
    const expenseData = {
      type: 'daily',
      date: data.date,
      category: data.category,
      description: data.description || '',
      amount: parseFloat(data.amount) || 0,
      paymentMethod: data.paymentMethod
    };

    try {
      setSubmittingExpense(true);
      if (editingExpense) {
        await apiUpdateExpense(editingExpense.id, expenseData);
      } else {
        await apiCreateExpense(expenseData);
      }
      resetForm();
      resetExpense();
      await loadExpenses();
      // Notify parent component (Dashboard) to refresh expenses for chart
      if (onExpenseUpdate) {
        onExpenseUpdate();
      }
    } catch (error) {
      console.error('Error saving expense to API:', error);
      alert('Failed to save expense. Please check your connection and try again.');
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
      date: expense.date || new Date().toISOString().split('T')[0],
      category: expense.category || '',
      description: expense.description || '',
      amount: expense.amount?.toString() || '',
      paymentMethod: expense.paymentMethod || 'cash',
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
    if (window.confirm('Are you sure you want to delete this expense?')) {
      try {
        await apiDeleteExpense(id);
        await loadExpenses();
        // Notify parent component (Dashboard) to refresh expenses for chart
        if (onExpenseUpdate) {
          onExpenseUpdate();
        }
      } catch (error) {
        console.error('Error deleting expense from API:', error);
        alert('Failed to delete expense. Please check your connection and try again.');
        // Don't use localStorage fallback - only use API
      }
    }
  };

  const resetForm = () => {
    setFormData({
      date: new Date().toISOString().split('T')[0],
      category: '',
      description: '',
      amount: '',
      paymentMethod: 'cash'
    });
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
      // Don't show expenses in employee tab - employees are shown separately
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

  // Sort expenses
  if (sortConfig.key) {
    filteredExpenses = [...filteredExpenses].sort((a, b) => {
      let aValue = a[sortConfig.key];
      let bValue = b[sortConfig.key];

      if (sortConfig.key === 'date') {
        aValue = new Date(aValue);
        bValue = new Date(bValue);
      } else if (sortConfig.key === 'amount') {
        aValue = parseFloat(aValue) || 0;
        bValue = parseFloat(bValue) || 0;
      } else if (typeof aValue === 'string') {
        aValue = aValue.toLowerCase();
        bValue = bValue?.toLowerCase() || '';
      }

      if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
  }

  // Pagination
  const totalPages = Math.ceil(filteredExpenses.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedExpenses = filteredExpenses.slice(startIndex, endIndex);

  const handleSort = (key) => {
    setSortConfig({
      key,
      direction: sortConfig.key === key && sortConfig.direction === 'asc' ? 'desc' : 'asc'
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
          <button className="btn btn-primary" onClick={handleAddClick}>
            + Add Expense
          </button>
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
                <option value="other">Other</option>
              </select>
              {expenseErrors.category && (
                <span className="error-message">{expenseErrors.category.message}</span>
              )}
            </div>
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
          All Expenses
        </button>
        <button
          className={`expense-tab ${activeTab === 'employee' ? 'active' : ''}`}
          onClick={() => {
            setActiveTab('employee');
            setCurrentPage(1);
          }}
        >
          Employee
        </button>
        <button
          className={`expense-tab ${activeTab === 'client' ? 'active' : ''}`}
          onClick={() => {
            setActiveTab('client');
            setCurrentPage(1);
          }}
        >
          Client Payment
        </button>
      </div>

      {/* All Expenses Tab Content */}
      {activeTab === 'all' && (
        <div>
          {/* Add Expense Button */}
          <div className="expenses-actions">
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
            date: new Date().toISOString().split('T')[0]
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
                  date: new Date().toISOString().split('T')[0]
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
                      date: new Date().toISOString().split('T')[0]
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
            month: new Date().toISOString().slice(0, 7),
            date: new Date().toISOString().split('T')[0],
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
                  month: new Date().toISOString().slice(0, 7),
                  date: new Date().toISOString().split('T')[0],
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
                      month: new Date().toISOString().slice(0, 7),
                      date: new Date().toISOString().split('T')[0],
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

      {/* Add Employee Form Modal */}
      {showSalaryForm && (
        <div className="modal-overlay" onClick={() => {
          setShowSalaryForm(false);
          setSalaryFormData({
            employeeName: '',
            salaryAmount: '',
            joiningDate: new Date().toISOString().split('T')[0],
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
                  joiningDate: new Date().toISOString().split('T')[0]
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
                    joiningDate: new Date().toISOString().split('T')[0]
                  });
                } catch (error) {
                  console.error('Error saving employee to API:', error);
                  alert('Failed to save employee. Please check your connection and try again.');
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
                      joiningDate: new Date().toISOString().split('T')[0],
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
                  date: new Date().toISOString().split('T')[0]
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
                        <th>Advance Payment</th>
                        <th>Pending Payment</th>
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
                          <td className="amount-cell">
                            <span className="expense-amount" style={{ color: '#dc3545' }}>
                              ₹{safePending.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                          </td>
                          <td>
                            <span className={`payment-badge ${salaryStatus === 'Paid' ? 'status-paid' : 'status-pending'}`}>
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
                              onClick={async () => {
                                if (window.confirm('Are you sure you want to delete this employee?')) {
                                  try {
                                    await apiDeleteEmployee(employee.id);
                                    await loadEmployees();
                                  } catch (error) {
                                    console.error('Error deleting employee from API:', error);
                                    alert('Failed to delete employee. Please check your connection and try again.');
                                    // Don't use localStorage fallback - only use API
                                  }
                                }
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
                              <span className={`payment-badge ${salaryStatus === 'Paid' ? 'status-paid' : 'status-pending'}`}>
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
                              <span className="employee-card-label">Advance Payment:</span>
                              <span className="employee-card-value" style={{ color: '#ffc107', fontWeight: '700' }}>
                                ₹{safeAdvance.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </span>
                            </div>
                            <div className="employee-card-row">
                              <span className="employee-card-label">Pending Payment:</span>
                              <span className="employee-card-value" style={{ color: '#dc3545', fontWeight: '700' }}>
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
                                  console.log('Edit employee', employee);
                                }}
                                title="Edit"
                              >
                                ✏️
                              </button>
                              <button
                                className="btn-icon btn-delete"
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  if (window.confirm('Are you sure you want to delete this employee?')) {
                                    try {
                                      await apiDeleteEmployee(employee.id);
                                      await loadEmployees();
                                    } catch (error) {
                                      console.error('Error deleting employee from API:', error);
                                      alert('Failed to delete employee. Please check your connection and try again.');
                                      // Don't use localStorage fallback - only use API
                                    }
                                  }
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
          <div className="salaries-actions">
            <button className="btn btn-primary" onClick={() => setShowClientPurchaseForm(true)}>
              + Add Client Purchase
            </button>
            {clientPayments.length > 0 && (
              <button className="btn btn-secondary" onClick={() => {
                setShowClientPaymentForm(true);
                setClientPaymentFormData({
                  purchaseId: '',
                  amount: '',
                  date: new Date().toISOString().split('T')[0],
                  paymentMethod: 'cash',
                  notes: ''
                });
              }}>
                💰 Make Payment
              </button>
            )}
          </div>

          {/* Client Purchase Form Modal */}
          {showClientPurchaseForm && (
            <div className="modal-overlay" onClick={() => {
              setShowClientPurchaseForm(false);
              setClientPurchaseFormData({
                clientName: '',
                purchaseDescription: '',
                totalAmount: '',
                purchaseDate: new Date().toISOString().split('T')[0],
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
                      purchaseDate: new Date().toISOString().split('T')[0],
                      notes: ''
                    });
                  }}>×</button>
                </div>
                <div className="modal-body">
                  <form onSubmit={(e) => {
                    e.preventDefault();
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
                    setShowClientPurchaseForm(false);
                    setClientPurchaseFormData({
                      clientName: '',
                      purchaseDescription: '',
                      totalAmount: '',
                      purchaseDate: new Date().toISOString().split('T')[0],
                      notes: ''
                    });
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
                          purchaseDate: new Date().toISOString().split('T')[0],
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
                date: new Date().toISOString().split('T')[0],
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
                      date: new Date().toISOString().split('T')[0],
                      paymentMethod: 'cash',
                      notes: ''
                    });
                  }}>×</button>
                </div>
                <div className="modal-body">
                  <form onSubmit={(e) => {
                    e.preventDefault();
                    if (!clientPaymentFormData.purchaseId) {
                      alert('Please select a purchase');
                      return;
                    }
                    const purchase = clientPayments.find(p => p?.id === clientPaymentFormData?.purchaseId);
                    if (!purchase) return;
                    
                    const payments = purchase?.payments || [];
                    const paidAmount = Number((Array.isArray(payments) ? payments.reduce((sum, p) => sum + (parseFloat(p?.amount) || 0), 0) : 0) || 0) || 0;
                    const totalAmount = Number(parseFloat(purchase?.totalAmount || 0) || 0) || 0;
                    const pendingAmount = Number((totalAmount - paidAmount) || 0) || 0;
                    const paymentAmount = Number(parseFloat(clientPaymentFormData?.amount || 0) || 0) || 0;
                    const safePending = isNaN(pendingAmount) ? 0 : pendingAmount;
                    const safePayment = isNaN(paymentAmount) ? 0 : paymentAmount;
                    
                    if (safePayment > safePending) {
                      alert(`Payment amount (₹${safePayment.toLocaleString('en-IN')}) exceeds pending amount (₹${safePending.toLocaleString('en-IN')})`);
                      return;
                    }
                    
                    const newPayment = {
                      id: Date.now().toString(),
                      amount: paymentAmount,
                      date: clientPaymentFormData.date,
                      paymentMethod: clientPaymentFormData.paymentMethod,
                      notes: clientPaymentFormData.notes || '',
                      createdAt: new Date().toISOString()
                    };
                    
                    const updated = clientPayments.map(p => {
                      if (p.id === clientPaymentFormData.purchaseId) {
                        return {
                          ...p,
                          payments: [...p.payments, newPayment]
                        };
                      }
                      return p;
                    });
                    
                    saveClientPayments(updated);
                    setShowClientPaymentForm(false);
                    setSelectedClientPurchase(null);
                    setClientPaymentFormData({
                      purchaseId: '',
                      amount: '',
                      date: new Date().toISOString().split('T')[0],
                      paymentMethod: 'cash',
                      notes: ''
                    });
                  }}>
                    <div className="form-group">
                      <label>Select Purchase *</label>
                      <select
                        value={clientPaymentFormData.purchaseId}
                        onChange={(e) => {
                          const purchase = clientPayments.find(p => p.id === e.target.value);
                          setSelectedClientPurchase(purchase);
                          setClientPaymentFormData({ ...clientPaymentFormData, purchaseId: e.target.value });
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
                      <button type="submit" className="btn btn-primary">
                        Make Payment
                      </button>
                      <button type="button" className="btn btn-secondary" onClick={() => {
                        setShowClientPaymentForm(false);
                        setSelectedClientPurchase(null);
                        setClientPaymentFormData({
                          purchaseId: '',
                          amount: '',
                          date: new Date().toISOString().split('T')[0],
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
              <div className="expenses-table-container">
                {/* Desktop Table View */}
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
                      {clientPayments.map((purchase) => {
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
                                      date: new Date().toISOString().split('T')[0],
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
                                    if (window.confirm('Are you sure you want to delete this purchase and all its payments?')) {
                                      const updated = clientPayments.filter(p => p.id !== purchase.id);
                                      saveClientPayments(updated);
                                    }
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
              <table className="data-table expenses-table">
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
                      <td>
                        <div>
                          <strong>{expense.category?.charAt(0).toUpperCase() + expense.category?.slice(1)}</strong>
                          {expense.description && <div className="expense-desc">{expense.description}</div>}
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
    </div>
  );
};

export default Expenses;

