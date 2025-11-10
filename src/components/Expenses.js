import React, { useState, useEffect } from 'react';
import { getExpenses, addExpense, updateExpense, deleteExpense, getEmployees, addEmployee, updateEmployee, deleteEmployee } from '../utils/storage';
import './Expenses.css';

const Expenses = ({ hideHeader = false, hideStats = false, showAddButtonInHeader = false, showForm: externalShowForm = null, onFormClose = null, onFormOpen = null }) => {
  const [expenses, setExpenses] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [internalShowForm, setInternalShowForm] = useState(false);
  
  // Use external showForm if provided, otherwise use internal state
  const showForm = externalShowForm !== null ? externalShowForm : internalShowForm;
  
  const handleAddClick = () => {
    if (externalShowForm !== null && onFormClose) {
      // External control - toggle the form
      onFormClose();
    } else {
      setInternalShowForm(true);
    }
  };
  
  // Update internal state when external state changes
  useEffect(() => {
    if (externalShowForm !== null) {
      // External control - don't use internal state
    }
  }, [externalShowForm]);
  const [editingExpense, setEditingExpense] = useState(null);
  const [filterType, setFilterType] = useState('all'); // all, daily
  const [activeTab, setActiveTab] = useState('all'); // all, employee
  const [showSalaryForm, setShowSalaryForm] = useState(false);
  const [showPaySalaryForm, setShowPaySalaryForm] = useState(false);
  const [showPayAdvanceForm, setShowPayAdvanceForm] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [dateFilter, setDateFilter] = useState({ start: '', end: '' });
  const [currentPage, setCurrentPage] = useState(1);
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });
  const itemsPerPage = 10;

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

  useEffect(() => {
    loadExpenses();
    loadEmployees();
  }, []);

  const loadEmployees = () => {
    const employeesData = getEmployees();
    setEmployees(employeesData);
  };

  // Calculate advance payments for an employee
  const getAdvancePayments = (employeeId) => {
    const allExpenses = getExpenses();
    const advances = allExpenses.filter(exp => 
      exp.type === 'advance' && 
      exp.employeeId === employeeId &&
      (exp.settled === false || exp.settled === undefined || !exp.settled)
    );
    return advances.reduce((sum, adv) => sum + (parseFloat(adv.amount) || 0), 0);
  };

  // Calculate pending payments (Total Salary - Advance Payment)
  const getPendingPayments = (employeeId, employeeSalary) => {
    const allExpenses = getExpenses();
    const advancePayments = allExpenses.filter(exp => 
      exp.type === 'advance' && 
      exp.employeeId === employeeId &&
      (exp.settled === false || exp.settled === undefined || !exp.settled)
    );
    const totalAdvances = advancePayments.reduce((sum, adv) => sum + (parseFloat(adv.amount) || 0), 0);
    const totalSalary = parseFloat(employeeSalary) || 0;
    const pendingPayment = totalSalary - totalAdvances;
    return pendingPayment > 0 ? pendingPayment : 0; // Don't show negative values
  };

  // Get current month salary status
  const getCurrentMonthSalaryStatus = (employeeId) => {
    const allExpenses = getExpenses();
    const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM format
    const salaryPayments = allExpenses.filter(exp => 
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
  const handlePaySalarySubmit = (e) => {
    e.preventDefault();
    if (!selectedEmployee) return;

    const salaryAmount = parseFloat(paySalaryFormData.amount) || 0;
    
    // Mark advance payments as settled when salary is paid
    const allExpenses = getExpenses();
    const advancePayments = allExpenses.filter(exp => 
      exp.type === 'advance' && 
      exp.employeeId === selectedEmployee.id &&
      (exp.settled === false || exp.settled === undefined || !exp.settled)
    );
    
    // Mark advances as settled
    advancePayments.forEach(advance => {
      updateExpense(advance.id, { settled: true });
    });

    const salaryPayment = {
      type: 'salary',
      category: 'salary',
      employeeId: selectedEmployee.id,
      employeeName: selectedEmployee.employeeName,
      amount: salaryAmount,
      month: paySalaryFormData.month,
      date: paySalaryFormData.date,
      paymentMethod: paySalaryFormData.paymentMethod,
      description: `Salary payment for ${selectedEmployee.employeeName} - ${paySalaryFormData.month}`,
      createdAt: new Date().toISOString()
    };

    addExpense(salaryPayment);
    loadExpenses();
    setShowPaySalaryForm(false);
    setSelectedEmployee(null);
    setPaySalaryFormData({
      month: new Date().toISOString().slice(0, 7),
      date: new Date().toISOString().split('T')[0],
      paymentMethod: 'cash',
      amount: ''
    });
  };

  // Handle Pay Advance form submission
  const handlePayAdvanceSubmit = (e) => {
    e.preventDefault();
    if (!payAdvanceFormData.employeeId) return;

    const selectedEmp = employees.find(emp => emp.id === payAdvanceFormData.employeeId);
    if (!selectedEmp) return;

    const advancePayment = {
      type: 'advance',
      category: 'advance',
      employeeId: selectedEmp.id,
      employeeName: selectedEmp.employeeName,
      amount: parseFloat(payAdvanceFormData.amount) || 0,
      date: payAdvanceFormData.date,
      paymentMethod: 'cash', // Default for advance
      description: `Advance payment for ${selectedEmp.employeeName}`,
      settled: false, // Mark as unsettled initially
      createdAt: new Date().toISOString()
    };

    addExpense(advancePayment);
    loadExpenses();
    setShowPayAdvanceForm(false);
    setPayAdvanceFormData({
      employeeId: '',
      amount: '',
      date: new Date().toISOString().split('T')[0]
    });
  };

  const loadExpenses = () => {
    const allExpenses = getExpenses();
    setExpenses(allExpenses);
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    
    if (!formData.category || !formData.amount) {
      alert('Please fill all required fields');
      return;
    }

    const expenseData = {
      type: 'daily',
      date: formData.date,
      category: formData.category,
      description: formData.description || '',
      amount: parseFloat(formData.amount) || 0,
      paymentMethod: formData.paymentMethod,
      createdAt: new Date().toISOString()
    };

    if (editingExpense) {
      updateExpense(editingExpense.id, expenseData);
    } else {
      addExpense(expenseData);
    }

    resetForm();
    loadExpenses();
  };

  const handleEdit = (expense) => {
    setEditingExpense(expense);
    setFormData({
      date: expense.date || new Date().toISOString().split('T')[0],
      category: expense.category || '',
      description: expense.description || '',
      amount: expense.amount?.toString() || '',
      paymentMethod: expense.paymentMethod || 'cash',
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

  const handleDelete = (id) => {
    if (window.confirm('Are you sure you want to delete this expense?')) {
      deleteExpense(id);
      loadExpenses();
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
              <p className="stat-value">₹{totalExpenses.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
              <p className="stat-label">{filteredExpenses.length} record(s)</p>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon">📅</div>
            <div className="stat-content">
              <h3>Today's Expenses</h3>
              <p className="stat-value">₹{todayExpenses.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
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
          <form onSubmit={handleSubmit}>
            <div className="form-row">
              <div className="form-group">
                <label>Date *</label>
                <input
                  type="date"
                  name="date"
                  value={formData.date}
                  onChange={handleInputChange}
                  required
                />
              </div>
              <div className="form-group">
                <label>Payment Method *</label>
                <select
                  name="paymentMethod"
                  value={formData.paymentMethod}
                  onChange={handleInputChange}
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

            <div className="form-group">
              <label>Category *</label>
              <select
                name="category"
                value={formData.category}
                onChange={handleInputChange}
                required
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
            </div>
            <div className="form-group">
              <label>Description</label>
              <input
                type="text"
                name="description"
                value={formData.description}
                onChange={handleInputChange}
                placeholder="Brief description of the expense"
              />
            </div>
            <div className="form-group">
              <label>Amount (₹) *</label>
              <input
                type="number"
                name="amount"
                value={formData.amount}
                onChange={handleInputChange}
                min="0"
                step="0.01"
                required
              />
            </div>

              <div className="form-actions">
                <button type="submit" className="btn btn-primary">
                  {editingExpense ? 'Update Expense' : 'Add Expense'}
                </button>
                <button type="button" className="btn btn-secondary" onClick={resetForm}>
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
                        <div>Total Salary: ₹{parseFloat(selectedEmployee.salaryAmount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                        <div>Advance Taken: ₹{getAdvancePayments(selectedEmployee.id).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                        <div style={{ fontWeight: '600', color: '#28a745', marginTop: '4px' }}>
                          Pending Amount: ₹{getPendingPayments(selectedEmployee.id, selectedEmployee.salaryAmount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
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
              <form onSubmit={(e) => {
                e.preventDefault();
                const employeeData = {
                  employeeName: salaryFormData.employeeName,
                  salaryAmount: parseFloat(salaryFormData.salaryAmount) || 0,
                  joiningDate: salaryFormData.joiningDate
                };
                addEmployee(employeeData);
                loadEmployees();
                setShowSalaryForm(false);
                setSalaryFormData({
                  employeeName: '',
                  salaryAmount: '',
                  joiningDate: new Date().toISOString().split('T')[0]
                });
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
            {employees.length > 0 ? (
              <div className="expenses-table-container">
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
                        const advancePayments = getAdvancePayments(employee.id);
                        const pendingPayments = getPendingPayments(employee.id, employee.salaryAmount);
                        const salaryStatus = getCurrentMonthSalaryStatus(employee.id);
                        return (
                        <tr key={employee.id}>
                          <td className="date-cell">{employee.employeeName}</td>
                          <td className="amount-cell total-col">
                            <span className="expense-amount">₹{parseFloat(employee.salaryAmount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                          </td>
                          <td style={{ fontSize: '12px' }}>{employee.joiningDate ? new Date(employee.joiningDate).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '-'}</td>
                          <td className="amount-cell">
                            <span className="expense-amount" style={{ color: '#ffc107' }}>
                              ₹{advancePayments.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                          </td>
                          <td className="amount-cell">
                            <span className="expense-amount" style={{ color: '#dc3545' }}>
                              ₹{pendingPayments.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
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
                              onClick={() => {
                                if (window.confirm('Are you sure you want to delete this employee?')) {
                                  deleteEmployee(employee.id);
                                  loadEmployees();
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

      {/* Expenses Table */}
      {activeTab === 'all' && (
      <div className="expenses-table-container">
        {filteredExpenses.length > 0 ? (
          <>
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
                        <span className="expense-amount">₹{parseFloat(expense.amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
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

