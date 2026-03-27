// API service for Expenses and Employees
// Direct backend URL (proxy is disabled)
import { API_BASE_URL } from '../config/api';

const API_BASE = API_BASE_URL; // Use full backend URL: http://localhost:8080/api

// Helper function for API calls
// Uses direct backend URL (http://localhost:8080/api) since proxy is disabled
const apiCall = async (endpoint, options = {}) => {
  try {
    // Check if this is an auth endpoint (public, no token needed)
    const isAuthEndpoint = endpoint.startsWith('/auth/');
    
    // Get auth token from localStorage (only for protected endpoints)
    const token = !isAuthEndpoint ? getAuthToken() : null;
    
    // Use same headers as working endpoints (inventory, bills)
    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };
    
    // Add Authorization header ONLY for protected endpoints (not auth endpoints)
    if (token && !isAuthEndpoint) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    
    // Merge headers if options already has headers
    // But ensure we don't accidentally add Authorization for auth endpoints
    const finalHeaders = {
      ...headers,
      ...(options.headers || {})
    };
    
    // Explicitly remove Authorization header for auth endpoints if somehow it got added
    if (isAuthEndpoint && finalHeaders['Authorization']) {
      delete finalHeaders['Authorization'];
    }
    
    // Use API_BASE with endpoint - direct call to http://localhost:8080/api
    const url = endpoint.startsWith('http') ? endpoint : `${API_BASE}${endpoint}`;
    
    // Log request details for debugging (only in development)
    if (process.env.NODE_ENV === 'development') {
      console.log('[API] Making request:', {
        endpoint,
        apiBase: API_BASE,
        fullUrl: url,
        method: options.method || 'GET',
        hasAuthHeader: !!finalHeaders['Authorization']
      });
    }
    
    const response = await fetch(url, {
      ...options,
      headers: finalHeaders,
    });

    if (!response.ok) {
      const errorText = await response.text();

      let parsedBody = null;
      try {
        if (errorText) parsedBody = JSON.parse(errorText);
      } catch {
        /* not JSON */
      }

      const headerRequestId =
        response.headers.get('X-Request-Id') || response.headers.get('X-Request-ID');
      const requestId =
        headerRequestId ||
        (parsedBody && typeof parsedBody === 'object'
          ? parsedBody.requestId || parsedBody.request_id
          : null);

      // Handle session expiry - 401 Unauthorized
      // Session length is set by the backend (e.g. JWT exp claim). Frontend does not set any timeout;
      // we only logout when the backend returns 401. To increase session duration, update the backend.
      if (response.status === 401 && !isAuthEndpoint) {
        handleSessionExpiry();
        const err = new Error('Session expired. Please login again.');
        err.status = 401;
        err.requestId = requestId;
        err.responseBody = parsedBody;
        throw err;
      }

      // For auth endpoints, provide more helpful error messages
      if (isAuthEndpoint && response.status === 401) {
        throw new Error(`Authentication endpoint error: The backend may be incorrectly requiring authentication for public endpoints. ${errorText}`);
      }

      let friendly =
        response.status >= 500
          ? 'Something went wrong on the server. Please try again in a moment.'
          : `Request failed (${response.status}).`;
      if (parsedBody && typeof parsedBody === 'object') {
        if (parsedBody.message) friendly = String(parsedBody.message);
        else if (typeof parsedBody.error === 'string') friendly = parsedBody.error;
      }

      const err = new Error(friendly);
      err.status = response.status;
      err.requestId = requestId || undefined;
      err.responseBody = parsedBody;
      err.rawMessage = `API Error: ${response.status} ${response.statusText} - ${errorText}`;
      throw err;
    }

    // Handle empty responses
    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      const data = await response.json();
      return data;
    }
    
    return null;
  } catch (error) {
    console.error(`API call failed for ${endpoint}:`, error);
    throw error;
  }
};

// Helper function to download PDF files
const downloadPDF = async (endpoint, filename) => {
  try {
    const url = endpoint.startsWith('http') ? endpoint : `${API_BASE}${endpoint}`;
    
    // Get auth token for protected PDF downloads
    const token = getAuthToken();
    const headers = {
      'Accept': 'application/pdf',
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    
    console.log('[PDF Download] Requesting:', url);
    
    const response = await fetch(url, {
      method: 'GET',
      headers: headers,
    });

    if (!response.ok) {
      // Try to get error details
      let errorText = '';
      const contentType = response.headers.get('content-type');
      
      try {
        if (contentType && contentType.includes('application/json')) {
          const errorJson = await response.json();
          errorText = JSON.stringify(errorJson);
        } else {
          errorText = await response.text();
        }
      } catch (e) {
        errorText = `Unable to read error response: ${e.message}`;
      }
      
      console.error('[PDF Download] Error response:', {
        status: response.status,
        statusText: response.statusText,
        endpoint: url,
        errorText: errorText.substring(0, 500) // Limit error text length
      });
      
      throw new Error(`Download failed: ${response.status} ${response.statusText}${errorText ? ' - ' + errorText.substring(0, 200) : ''}`);
    }

    // Check if response is actually a PDF
    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('application/pdf')) {
      const errorText = await response.text();
      console.error('[PDF Download] Unexpected content type:', contentType, 'Response:', errorText.substring(0, 500));
      throw new Error(`Server returned non-PDF content. Content-Type: ${contentType}`);
    }

    // Get the blob from response
    const blob = await response.blob();
    
    // Verify blob is not empty
    if (blob.size === 0) {
      throw new Error('Downloaded PDF file is empty');
    }
    
    // Create a temporary URL for the blob
    const blobUrl = window.URL.createObjectURL(blob);
    
    // Create a temporary anchor element and trigger download
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = filename || 'bill.pdf';
    document.body.appendChild(link);
    link.click();
    
    // Clean up
    document.body.removeChild(link);
    window.URL.revokeObjectURL(blobUrl);
    
    console.log('[PDF Download] Success:', filename);
    return true;
  } catch (error) {
    console.error(`PDF download failed for ${endpoint}:`, error);
    throw error;
  }
};

// ==================== EMPLOYEE API ====================

/**
 * Get all employees
 * @returns {Promise<Array>} List of employees
 */
export const fetchEmployees = async () => {
  return await apiCall('/employees', { method: 'GET' });
};

/**
 * Get employee by ID
 * @param {string|number} id - Employee ID
 * @returns {Promise<Object>} Employee object
 */
export const fetchEmployeeById = async (id) => {
  return await apiCall(`/employees/${id}`, { method: 'GET' });
};

/**
 * Create new employee
 * @param {Object} employeeData - Employee data
 * @param {string} employeeData.employeeName - Employee name
 * @param {number} employeeData.salaryAmount - Salary amount
 * @param {string} employeeData.joiningDate - Joining date (YYYY-MM-DD)
 * @returns {Promise<Object>} Created employee
 */
export const createEmployee = async (employeeData) => {
  return await apiCall('/employees', {
    method: 'POST',
    body: JSON.stringify(employeeData),
  });
};

/**
 * Update employee
 * @param {string|number} id - Employee ID
 * @param {Object} updates - Employee updates
 * @returns {Promise<Object>} Updated employee
 */
export const updateEmployee = async (id, updates) => {
  return await apiCall(`/employees/${id}`, {
    method: 'PUT',
    body: JSON.stringify(updates),
  });
};

// ==================== PAYROLL (EMPLOYEE LEDGER) API ====================

export const fetchEmployeePayrollSummary = async (month) => {
  return await apiCall(`/payroll/employees/summary?month=${encodeURIComponent(month)}`, { method: 'GET' });
};

export const recordEmployeeAdvance = async (employeeId, payload) => {
  return await apiCall(`/payroll/employees/${employeeId}/advance`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
};

export const settleEmployeeSalaryMonth = async (employeeId, payload) => {
  return await apiCall(`/payroll/employees/${employeeId}/salary-settlement`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
};

export const fetchEmployeePayrollLedger = async (employeeId, { from, to } = {}) => {
  const params = new URLSearchParams();
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  const qs = params.toString();
  return await apiCall(
    `/payroll/employees/${encodeURIComponent(employeeId)}/ledger${qs ? `?${qs}` : ''}`,
    { method: 'GET' }
  );
};

export const fetchClientTransactions = async ({ from, to, transactionType } = {}) => {
  const params = new URLSearchParams();
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  if (transactionType) params.set('transactionType', transactionType);
  const qs = params.toString();
  return await apiCall(`/client-transactions${qs ? `?${qs}` : ''}`, { method: 'GET' });
};

export const createClientTransaction = async (payload) => {
  return await apiCall('/client-transactions', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
};

/**
 * Delete employee
 * @param {string|number} id - Employee ID
 * @returns {Promise<void>}
 */
export const deleteEmployee = async (id) => {
  return await apiCall(`/employees/${id}`, { method: 'DELETE' });
};

// ==================== EXPENSE API ====================

/**
 * Get all expenses
 * @param {Object} filters - Optional filters
 * @param {string} filters.type - Filter by type: 'daily', 'salary', 'advance'
 * @param {string} filters.startDate - Start date (YYYY-MM-DD)
 * @param {string} filters.endDate - End date (YYYY-MM-DD)
 * @param {string|number} filters.employeeId - Filter by employee ID
 * @param {string} filters.month - Filter by month (YYYY-MM)
 * @param {boolean} filters.settled - Filter by settled status
 * @returns {Promise<Array>} List of expenses
 */
export const fetchExpenses = async (filters = {}) => {
  const queryParams = new URLSearchParams();
  
  if (filters.type) queryParams.append('type', filters.type);
  if (filters.startDate) queryParams.append('startDate', filters.startDate);
  if (filters.endDate) queryParams.append('endDate', filters.endDate);
  if (filters.employeeId) queryParams.append('employeeId', filters.employeeId);
  if (filters.month) queryParams.append('month', filters.month);
  if (filters.settled !== undefined) queryParams.append('settled', filters.settled);
  
  const queryString = queryParams.toString();
  const endpoint = queryString ? `/expenses?${queryString}` : '/expenses';
  
  return await apiCall(endpoint, { method: 'GET' });
};

/**
 * Get expense by ID
 * @param {string|number} id - Expense ID
 * @returns {Promise<Object>} Expense object
 */
export const fetchExpenseById = async (id) => {
  return await apiCall(`/expenses/${id}`, { method: 'GET' });
};

/**
 * Create new expense
 * @param {Object} expenseData - Expense data
 * @param {string} expenseData.type - Type: 'daily', 'salary', 'advance'
 * @param {string} expenseData.date - Date (YYYY-MM-DD)
 * @param {string} expenseData.category - Category
 * @param {string} expenseData.description - Description (optional)
 * @param {number} expenseData.amount - Amount
 * @param {string} expenseData.paymentMethod - Payment method: 'cash', 'bank', 'card', 'upi'
 * @param {string|number} expenseData.employeeId - Employee ID (required for salary/advance)
 * @param {string} expenseData.employeeName - Employee name (required for salary/advance)
 * @param {string} expenseData.month - Month (YYYY-MM, required for salary)
 * @param {boolean} expenseData.settled - Settled status (for advance)
 * @returns {Promise<Object>} Created expense
 */
export const createExpense = async (expenseData) => {
  return await apiCall('/expenses', {
    method: 'POST',
    body: JSON.stringify(expenseData),
  });
};

/**
 * Update expense
 * @param {string|number} id - Expense ID
 * @param {Object} updates - Expense updates
 * @returns {Promise<Object>} Updated expense
 */
export const updateExpense = async (id, updates) => {
  return await apiCall(`/expenses/${id}`, {
    method: 'PUT',
    body: JSON.stringify(updates),
  });
};

/**
 * Delete expense
 * @param {string|number} id - Expense ID
 * @returns {Promise<void>}
 */
export const deleteExpense = async (id) => {
  return await apiCall(`/expenses/${id}`, { method: 'DELETE' });
};

// ==================== DAILY BUDGET ====================

/**
 * Get current daily budget (legacy endpoint)
 * @returns {Promise<Object>} e.g. { amount: 5000 }
 */
export const getDailyBudget = async () => {
  return await apiCall('/budget/daily', { method: 'GET' });
};

/**
 * Get daily budget for a specific date (preferred when backend supports by-date)
 * @param {string} date - Date in YYYY-MM-DD format (e.g. '2026-02-21')
 * @returns {Promise<Object>} e.g. { amount: 5000 } or budget record for that date
 */
export const getDailyBudgetByDate = async (date) => {
  const params = new URLSearchParams({ date });
  return await apiCall(`/budget/daily/by-date?${params.toString()}`, { method: 'GET' });
};

/**
 * Create daily budget (POST)
 * @param {number} amount - Budget amount per day
 * @returns {Promise<Object>}
 */
export const createDailyBudget = async (amount) => {
  return await apiCall('/budget/daily', {
    method: 'POST',
    body: JSON.stringify({ amount: Number(amount) }),
  });
};

/**
 * Update daily budget (PUT)
 * @param {number} amount - Budget amount per day
 * @returns {Promise<Object>}
 */
export const updateDailyBudget = async (amount) => {
  return await apiCall('/budget/daily', {
    method: 'PUT',
    body: JSON.stringify({ amount: Number(amount) }),
  });
};

/**
 * Delete daily budget (DELETE)
 * @returns {Promise<void>}
 */
export const deleteDailyBudget = async () => {
  return await apiCall('/budget/daily', { method: 'DELETE' });
};

/**
 * Get all daily budget records from the table (GET /api/daily-budget/all)
 * @returns {Promise<Array>} e.g. [{ id, amount, created_at, updated_at, location, remaining_budget }, ...]
 */
export const getDailyBudgetHistory = async () => {
  const res = await apiCall('/daily-budget/all', { method: 'GET' });
  if (Array.isArray(res)) return res;
  if (res?.content) return res.content;
  if (res?.data) return Array.isArray(res.data) ? res.data : [];
  return [];
};

/**
 * Daily closing report (location-scoped from JWT). Reads bills, bill_payments, expenses from the database.
 * @param {{ date: string, dateTo?: string, backfillLegacy?: boolean }} params - date and optional inclusive end (YYYY-MM-DD)
 * @returns {Promise<Object>} DailyClosingReportDTO
 */
export const fetchProductById = async (productId) => {
  return await apiCall(`/inventory/${productId}`, { method: 'GET' });
};

/** Suppliers for current JWT location (firm). */
export const fetchSuppliers = async () => {
  return await apiCall('/suppliers', { method: 'GET' });
};

/** Create supplier — admin only. */
export const createSupplier = async ({ name, contactNumber, contact_number, address }) => {
  return await apiCall('/suppliers', {
    method: 'POST',
    body: JSON.stringify({
      name: String(name || '').trim(),
      ...(contactNumber != null && String(contactNumber).trim() !== ''
        ? { contactNumber: String(contactNumber).trim() }
        : contact_number != null && String(contact_number).trim() !== ''
          ? { contactNumber: String(contact_number).trim() }
          : {}),
      ...(address != null && String(address).trim() !== '' ? { address: String(address).trim() } : {})
    })
  });
};

/** Dealers for current JWT location (middleman). */
export const fetchDealers = async () => {
  return await apiCall('/dealers', { method: 'GET' });
};

/** Create dealer — admin only. */
export const createDealer = async ({ name, contactNumber, contact_number, address }) => {
  return await apiCall('/dealers', {
    method: 'POST',
    body: JSON.stringify({
      name: String(name || '').trim(),
      ...(contactNumber != null && String(contactNumber).trim() !== ''
        ? { contactNumber: String(contactNumber).trim() }
        : contact_number != null && String(contact_number).trim() !== ''
          ? { contactNumber: String(contact_number).trim() }
          : {}),
      ...(address != null && String(address).trim() !== '' ? { address: String(address).trim() } : {})
    })
  });
};

export const updateInventoryProduct = async (productId, body) => {
  return await apiCall(`/inventory/${productId}`, {
    method: 'PUT',
    body: JSON.stringify(body)
  });
};

/** Full product edit snapshots (prices, GST, stock, etc.). Newest first. */
export const fetchProductChangeHistory = async (productId) => {
  return await apiCall(`/inventory/product-changes/${productId}`, { method: 'GET' });
};

/** Manual stock increase; admin only. */
export const addInventoryStock = async ({ productId, quantity, notes }) => {
  return await apiCall('/inventory/add-stock', {
    method: 'POST',
    body: JSON.stringify({
      productId,
      quantity,
      ...(notes != null && String(notes).trim() !== '' ? { notes: String(notes).trim() } : {})
    })
  });
};

/** Manual stock set to absolute quantity; admin only. */
export const updateInventoryStock = async ({ productId, newQuantity, notes }) => {
  return await apiCall('/inventory/update-stock', {
    method: 'POST',
    body: JSON.stringify({
      productId,
      newQuantity,
      ...(notes != null && String(notes).trim() !== '' ? { notes: String(notes).trim() } : {})
    })
  });
};

/** Stock audit trail for a product (newest first). */
export const fetchInventoryHistory = async (productId) => {
  return await apiCall(`/inventory/history/${productId}`, { method: 'GET' });
};

export const fetchDailyClosingReport = async ({ date, dateTo, backfillLegacy = false }) => {
  const params = new URLSearchParams();
  params.set('date', date);
  if (dateTo != null && dateTo !== '') {
    params.set('dateTo', dateTo);
  }
  params.set('backfillLegacy', String(!!backfillLegacy));
  return await apiCall(`/reports/daily-closing?${params.toString()}`, { method: 'GET' });
};

export const fetchSalesPaymentModeSummary = async ({ date, dateTo }) => {
  const params = new URLSearchParams();
  params.set('date', date);
  if (dateTo != null && dateTo !== '') {
    params.set('dateTo', dateTo);
  }
  return await apiCall(`/reports/payment-mode-summary?${params.toString()}`, { method: 'GET' });
};

// ==================== BILL PDF DOWNLOAD ====================

/**
 * Download bill PDF
 * @param {string|number} billId - Bill ID
 * @param {string} billType - Bill type: 'GST' or 'NON-GST'
 * @returns {Promise<boolean>}
 */
export const downloadBillPDF = async (billId, billType) => {
  try {
    // Determine endpoint based on bill type
    const endpoint = billType === 'GST' 
      ? `/bills/gst/${billId}/download`
      : `/bills/nongst/${billId}/download`;
    
    // Generate filename
    const filename = `Bill_${billType === 'GST' ? 'GST' : 'NonGST'}_${billId}.pdf`;
    
    return await downloadPDF(endpoint, filename);
  } catch (error) {
    console.error('Error downloading bill PDF:', error);
    throw error;
  }
};

export const addBillPayment = async (billId, billType, paymentData) => {
  const type = String(billType || '').replace('_', '-');
  return await apiCall(`/bills/${encodeURIComponent(type)}/${encodeURIComponent(billId)}/payments`, {
    method: 'POST',
    body: JSON.stringify(paymentData),
  });
};

export const updateBillPayment = async (billId, billType, paymentId, paymentData) => {
  const type = String(billType || '').replace('_', '-');
  return await apiCall(
    `/bills/${encodeURIComponent(type)}/${encodeURIComponent(billId)}/payments/${encodeURIComponent(paymentId)}`,
    {
      method: 'PUT',
      body: JSON.stringify(paymentData),
    }
  );
};

export const deleteBillPayment = async (billId, billType, paymentId) => {
  const type = String(billType || '').replace('_', '-');
  return await apiCall(
    `/bills/${encodeURIComponent(type)}/${encodeURIComponent(billId)}/payments/${encodeURIComponent(paymentId)}`,
    { method: 'DELETE' }
  );
};

// Authentication API functions
export const login = async (email, password) => {
  try {
    const response = await apiCall('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });
    return response;
  } catch (error) {
    console.error('Login failed:', error);
    throw error;
  }
};

export const register = async (userData) => {
  try {
    // Ensure no Authorization header is sent for registration
    const response = await apiCall('/auth/register', {
      method: 'POST',
      body: JSON.stringify(userData),
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    });
    return response;
  } catch (error) {
    console.error('Registration failed:', error);
    throw error;
  }
};

// Global session expiry handler
let sessionExpiryHandler = null;

export const setSessionExpiryHandler = (handler) => {
  sessionExpiryHandler = handler;
};

// Handle session expiry
const handleSessionExpiry = () => {
  // Clear auth data
  logout();
  
  // Trigger logout event for App.js to handle
  if (sessionExpiryHandler) {
    sessionExpiryHandler();
  } else {
    // Fallback: dispatch custom event
    window.dispatchEvent(new CustomEvent('sessionExpired'));
  }
};

export const logout = () => {
  localStorage.removeItem('authToken');
  localStorage.removeItem('user');
};

export const getAuthToken = () => {
  return localStorage.getItem('authToken');
};

export const getCurrentUser = () => {
  const userStr = localStorage.getItem('user');
  return userStr ? JSON.parse(userStr) : null;
};

/**
 * Build inventory endpoint with user and location query params for filtered fetch
 * @returns {string} e.g. '/inventory' or '/inventory?userId=3&location=Bhondsi'
 */
export const getInventoryEndpoint = () => {
  const user = getCurrentUser();
  if (!user) return '/inventory';
  const params = new URLSearchParams();
  const userId = user.userId ?? user.id;
  if (userId != null && userId !== '') params.set('userId', String(userId));
  const location = user.location ?? user.userLocation;
  if (location) params.set('location', String(location).trim());
  const qs = params.toString();
  return qs ? `/inventory?${qs}` : '/inventory';
};

// Helper function to check if user is admin
export const isAdmin = () => {
  const user = getCurrentUser();
  if (!user) return false;
  const userRole = user.role || user.userRole || '';
  return userRole.toLowerCase() === 'admin';
};

// Helper function to check if user is regular user
export const isRegularUser = () => {
  const user = getCurrentUser();
  if (!user) return false;
  const userRole = user.role || user.userRole || '';
  return userRole.toLowerCase() === 'user';
};

// Helper function to get user role
export const getUserRole = () => {
  const user = getCurrentUser();
  if (!user) return null;
  return (user.role || user.userRole || '').toLowerCase();
};

export const isAuthenticated = () => {
  return !!getAuthToken();
};

// Helper function to check if response is 401 and handle session expiry
export const handleApiResponse = async (response) => {
  if (response.status === 401) {
    // Session expired - logout automatically
    handleSessionExpiry();
    throw new Error('Session expired. Please login again.');
  }
  return response;
};

// ==================== CUSTOMER API ====================

/**
 * Get all customers
 * @returns {Promise<Array>} List of customers
 */
export const fetchCustomers = async () => {
  return await apiCall('/customers', { method: 'GET' });
};

/**
 * Get customer by ID
 * @param {string|number} id - Customer ID
 * @returns {Promise<Object>} Customer object
 */
export const fetchCustomerById = async (id) => {
  return await apiCall(`/customers/${id}`, { method: 'GET' });
};

/**
 * Lookup customer by phone (same location as token).
 */
export const fetchCustomerByPhone = async (phone) => {
  const encoded = encodeURIComponent(String(phone).trim());
  return await apiCall(`/customers/phone/${encoded}`, { method: 'GET' });
};

/** Record token / advance for a customer (POST /api/customer/advance). */
export const createCustomerAdvance = async ({ customerId, amount, description, paymentMode }) => {
  return await apiCall('/customer/advance', {
    method: 'POST',
    body: JSON.stringify({
      customerId,
      amount: Number(amount),
      paymentMode: paymentMode || 'CASH',
      description: description || undefined,
    }),
  });
};

export const fetchCustomerAdvanceSummary = async (customerId) => {
  return await apiCall(`/customer/advance/summary?customerId=${encodeURIComponent(customerId)}`, {
    method: 'GET',
  });
};

export const fetchCustomerAdvanceHistory = async (customerId) => {
  return await apiCall(`/customer/advance/history?customerId=${encodeURIComponent(customerId)}`, {
    method: 'GET',
  });
};

/**
 * Create new customer
 * @param {Object} customerData - Customer data
 * @param {string} customerData.customerName - Customer name
 * @param {string} customerData.phone - Phone number
 * @param {string} customerData.email - Email address
 * @param {string} customerData.address - Address
 * @param {string} customerData.gstin - GSTIN (optional)
 * @param {string} customerData.location - Location
 * @returns {Promise<Object>} Created customer
 */
export const createCustomer = async (customerData) => {
  return await apiCall('/customers', {
    method: 'POST',
    body: JSON.stringify(customerData),
  });
};

/**
 * Update customer
 * @param {string|number} id - Customer ID
 * @param {Object} updates - Customer updates
 * @returns {Promise<Object>} Updated customer
 */
export const updateCustomer = async (id, updates) => {
  return await apiCall(`/customers/${id}`, {
    method: 'PUT',
    body: JSON.stringify(updates),
  });
};

/**
 * Delete customer
 * @param {string|number} id - Customer ID
 * @returns {Promise<void>}
 */
export const deleteCustomer = async (id) => {
  return await apiCall(`/customers/${id}`, { method: 'DELETE' });
};

// ==================== CLIENT PURCHASE API ====================

/**
 * Get all client purchases
 * @returns {Promise<Array>} List of client purchases
 */
export const fetchClientPurchases = async () => {
  return await apiCall('/client-purchases', { method: 'GET' });
};

/**
 * Get client purchase by ID
 * @param {string|number} id - Client purchase ID
 * @returns {Promise<Object>} Client purchase object
 */
export const fetchClientPurchaseById = async (id) => {
  return await apiCall(`/client-purchases/${id}`, { method: 'GET' });
};

/**
 * Create new client purchase
 * @param {Object} purchaseData - Client purchase data
 * @param {string} purchaseData.clientName - Client name
 * @param {string} purchaseData.purchaseDescription - Purchase description
 * @param {number} purchaseData.totalAmount - Total amount
 * @param {string} purchaseData.purchaseDate - Purchase date (YYYY-MM-DD)
 * @param {string} purchaseData.notes - Optional notes
 * @returns {Promise<Object>} Created client purchase
 */
export const createClientPurchase = async (purchaseData) => {
  return await apiCall('/client-purchases', {
    method: 'POST',
    body: JSON.stringify(purchaseData),
  });
};

/**
 * Update client purchase
 * @param {string|number} id - Client purchase ID
 * @param {Object} updates - Client purchase updates
 * @returns {Promise<Object>} Updated client purchase
 */
export const updateClientPurchase = async (id, updates) => {
  return await apiCall(`/client-purchases/${id}`, {
    method: 'PUT',
    body: JSON.stringify(updates),
  });
};

/**
 * Delete client purchase
 * @param {string|number} id - Client purchase ID
 * @returns {Promise<void>}
 */
export const deleteClientPurchase = async (id) => {
  return await apiCall(`/client-purchases/${id}`, { method: 'DELETE' });
};

/**
 * Add payment for a client purchase (Simple transaction tracking)
 * @param {string|number} purchaseId - Purchase ID
 * @param {Object} paymentData - Payment data
 * @param {string} paymentData.clientId - Client ID (from database)
 * @param {number} paymentData.amount - Payment amount
 * @param {string} paymentData.date - Payment date (YYYY-MM-DD)
 * @param {string} paymentData.paymentMethod - Payment method (cash, bank, card, upi)
 * @param {string} paymentData.notes - Optional notes
 * @returns {Promise<Object>} Created payment
 */
export const addClientPayment = async (purchaseId, paymentData) => {
  return await apiCall(`/client-purchases/${purchaseId}/payments`, {
    method: 'POST',
    body: JSON.stringify(paymentData),
  });
};

/**
 * Get all payments (direct endpoint)
 * @returns {Promise<Array>} List of all payments
 */
export const fetchAllPayments = async () => {
  return await apiCall('/client-purchases/payments', { method: 'GET' });
};

/**
 * Get all payments for a specific client
 * @param {string} clientId - Client ID or client name
 * @returns {Promise<Array>} List of payments for the client
 */
export const fetchClientPayments = async (clientId) => {
  // Try direct payments endpoint first
  try {
    const allPayments = await fetchAllPayments();
    if (clientId) {
      // Filter by clientId if provided
      return allPayments.filter(payment => 
        payment.clientId === clientId || 
        payment.clientName === clientId ||
        String(payment.clientId) === String(clientId)
      );
    }
    return allPayments;
  } catch (error) {
    console.warn('Direct payments endpoint failed, falling back to purchases endpoint:', error);
    // Fallback to old method
    const endpoint = clientId 
      ? `/client-purchases?clientId=${encodeURIComponent(clientId)}`
      : '/client-purchases';
    const purchases = await apiCall(endpoint, { method: 'GET' });
    
    // Extract all payments from purchases and filter by clientId
    const allPayments = [];
    if (purchases && Array.isArray(purchases)) {
      purchases.forEach(purchase => {
        if (purchase.payments && Array.isArray(purchase.payments)) {
          purchase.payments.forEach(payment => {
            // Include payment if clientId matches or if no clientId filter specified
            if (!clientId || payment.clientId === clientId || payment.clientName === clientId) {
              allPayments.push({
                ...payment,
                purchaseId: purchase.id,
                purchaseDescription: purchase.purchaseDescription
              });
            }
          });
        }
      });
    }
    
    return allPayments;
  }
};

