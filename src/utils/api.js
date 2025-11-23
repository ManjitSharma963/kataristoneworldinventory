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
      
      // Handle session expiry - 401 Unauthorized
      if (response.status === 401 && !isAuthEndpoint) {
        // Session expired - logout automatically
        handleSessionExpiry();
        throw new Error('Session expired. Please login again.');
      }
      
      // For auth endpoints, provide more helpful error messages
      if (isAuthEndpoint && response.status === 401) {
        throw new Error(`Authentication endpoint error: The backend may be incorrectly requiring authentication for public endpoints. ${errorText}`);
      }
      throw new Error(`API Error: ${response.status} ${response.statusText} - ${errorText}`);
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
    
    const response = await fetch(url, {
      method: 'GET',
      headers: headers,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Download failed: ${response.status} ${response.statusText} - ${errorText}`);
    }

    // Get the blob from response
    const blob = await response.blob();
    
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

