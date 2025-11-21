import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { getInventory, getExpenses, getSales } from '../utils/storage';
import Expenses from './Expenses';
import Invoice from './Invoice';
import HomeScreenManagement from './HomeScreenManagement';
import { downloadBillPDF, handleApiResponse } from '../utils/api';
import { fetchExpenses as apiFetchExpenses } from '../utils/api';
import { API_BASE_URL } from '../config/api';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import './Dashboard.css';

const Dashboard = ({ activeNav, setActiveNav }) => {
  // Shared state for Expenses form
  const [expensesFormOpen, setExpensesFormOpen] = useState(false);
  
  // Expenses Section Component
  const ExpensesSection = () => {
    return (
      <div className="dashboard-section expenses-section">
        <div className="section-header-enhanced">
          <div className="section-title-wrapper">
            <span className="section-icon">💵</span>
            <h3>Daily Expenses</h3>
          </div>
          <div className="section-header-actions">
            <button className="btn btn-primary" onClick={() => setExpensesFormOpen(true)}>
              + Add Expense
            </button>
          </div>
        </div>
        <div className="section-content">
          <Expenses 
            hideHeader={true} 
            hideStats={true} 
            showForm={expensesFormOpen} 
            onFormOpen={() => setExpensesFormOpen(true)} 
            onFormClose={() => setExpensesFormOpen(false)}
            onExpenseUpdate={fetchExpenses}
          />
        </div>
      </div>
    );
  };
  // Map sidebar navigation to internal tab state
  const getActiveTab = () => {
    if (activeNav === 'sales') return 'sales';
    if (activeNav === 'inventory') return 'inventory';
    if (activeNav === 'expenses') return 'expenses';
    if (activeNav === 'home-screen') return 'home-screen';
    return 'sales'; // Default to sales when dashboard is selected
  };

  const [activeTab, setActiveTab] = useState(getActiveTab());
  
  // Update active tab when sidebar navigation changes
  React.useEffect(() => {
    if (activeNav === 'dashboard') {
      setActiveTab('sales');
    } else {
      setActiveTab(activeNav);
    }
  }, [activeNav]);

  // Expenses are now loaded from API only via the Expenses component
  // No need to refresh from localStorage
  const [stats, setStats] = useState({
    totalSales: 0,
    totalWithGST: 0,
    totalWithoutGST: 0,
    totalGSTCollected: 0,
    countWithGST: 0,
    countWithoutGST: 0,
    totalCount: 0
  });
  const [inventory, setInventory] = useState([]);
  const [bills, setBills] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [loadingBills, setLoadingBills] = useState(true);
  const [showAddInventory, setShowAddInventory] = useState(false);
  const [showEditInventory, setShowEditInventory] = useState(false);
  const [editingInventoryItem, setEditingInventoryItem] = useState(null);
  const [showBillItems, setShowBillItems] = useState(false);
  const [selectedBill, setSelectedBill] = useState(null);
  const [billItems, setBillItems] = useState([]);
  const [loadingBillItems, setLoadingBillItems] = useState(false);
  const [selectedBillForInvoice, setSelectedBillForInvoice] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [inventorySearchQuery, setInventorySearchQuery] = useState('');
  const [salesCurrentPage, setSalesCurrentPage] = useState(1);
  const [inventoryCurrentPage, setInventoryCurrentPage] = useState(1);
  const [dateRange, setDateRange] = useState({ start: '', end: '' });
  // Default to sorting by date (newest first) for all tabs
  const [sortConfig, setSortConfig] = useState({ key: 'billDate', direction: 'desc' });
  const [inventorySortConfig, setInventorySortConfig] = useState({ key: null, direction: 'asc' });
  const [toast, setToast] = useState(null);
  const [apiConnectionError, setApiConnectionError] = useState(false);
  const [collapsedSections, setCollapsedSections] = useState({
    stats: false,
    charts: false
  });
  const itemsPerPage = 10;
  const [formData, setFormData] = useState({
    name: '',
    slug: '',
    product_type: '',
    price_per_sqft: '',
    total_sqft_stock: '',
    unit: '',
    primary_image_url: '',
    color: ''
  });

  const calculateStats = (billsData) => {
    if (!billsData || billsData.length === 0) {
      return {
        totalSales: 0,
        totalWithGST: 0,
        totalWithoutGST: 0,
        totalGSTCollected: 0,
        countWithGST: 0,
        countWithoutGST: 0,
        totalCount: 0
      };
    }

    const totalSales = billsData.reduce((sum, bill) => sum + (bill.totalAmount || 0), 0);
    const salesWithGST = billsData.filter(bill => bill.billType === 'GST');
    const salesWithoutGST = billsData.filter(bill => bill.billType !== 'GST');
    
    const totalWithGST = salesWithGST.reduce((sum, bill) => sum + (bill.totalAmount || 0), 0);
    const totalWithoutGST = salesWithoutGST.reduce((sum, bill) => sum + (bill.totalAmount || 0), 0);
    const totalGSTCollected = salesWithGST.reduce((sum, bill) => sum + (bill.taxAmount || 0), 0);
    
    return {
      totalSales,
      totalWithGST,
      totalWithoutGST,
      totalGSTCollected,
      countWithGST: salesWithGST.length,
      countWithoutGST: salesWithoutGST.length,
      totalCount: billsData.length
    };
  };

  const fetchInventory = useCallback(async () => {
    try {
      console.log('Fetching inventory from API via proxy...');
      const token = localStorage.getItem('authToken');
      const headers = {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      const response = await fetch(`${API_BASE_URL}/inventory`, {
        method: 'GET',
        headers: headers
      });
      
      console.log('GET Response status:', response.status, response.statusText);
      
      if (!response.ok) {
        // Check for session expiry (401)
        if (response.status === 401) {
          await handleApiResponse(response);
          return [];
        }
        
        const errorText = await response.text();
        console.error('GET Error response:', errorText);
        
        // Server error (500, 502, 503, etc.) - backend is reachable but has issues
        if (response.status >= 500) {
          console.warn('Backend server error:', response.status, errorText);
          setApiConnectionError(true);
          // Still throw to trigger fallback
          throw new Error(`Backend server error: ${response.status} ${response.statusText}`);
        }
        
        // Client error (400, 403, 404, etc.)
        throw new Error(`Failed to fetch inventory: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      console.log('Inventory fetched successfully, items count:', data?.length || 0);
      setInventory(data || []);
      setApiConnectionError(false); // Clear error if successful
      return data || [];
    } catch (error) {
      console.error('Error fetching inventory:', error);
      
      // Check if it's a network/CORS error (no response received)
      // Only treat as network error if we didn't get a response status
      const isNetworkError = (
        error.name === 'TypeError' && 
        !error.message.includes('Backend server error') &&
        !error.message.includes('Failed to fetch inventory:')
      ) || (
        error.message.includes('Failed to fetch') && 
        !error.message.includes('Backend server error') &&
        !error.message.includes('Failed to fetch inventory:')
      ) || error.message.includes('CORS') || error.message.includes('NetworkError');
      
      if (isNetworkError) {
        console.warn('Network error detected. This usually means:');
        console.warn('1. Backend server is not running on http://localhost:8080');
        console.warn('2. React dev server proxy is not working (restart required)');
        console.warn('3. Network connectivity issue');
        console.warn('Falling back to localStorage...');
        setApiConnectionError(true);
      } else if (error.message.includes('Backend server error')) {
        console.warn('Backend server returned an error. This is a server-side issue, not a connectivity problem.');
        setApiConnectionError(true);
      }
      
      // Fallback to localStorage if API fails
      try {
        const localInventory = getInventory();
        console.log('Using localStorage inventory as fallback, items count:', localInventory.length);
        setInventory(localInventory);
      } catch (localError) {
        console.error('Error loading from localStorage:', localError);
        setInventory([]);
      }
      
      // Don't throw error - just use fallback
      return [];
    }
  }, []);

  const fetchExpenses = useCallback(async () => {
    try {
      const expensesData = await apiFetchExpenses();
      setExpenses(expensesData || []);
    } catch (error) {
      console.error('Error fetching expenses:', error);
      setExpenses([]);
    }
  }, []);

  const fetchBills = useCallback(async () => {
    try {
      setLoadingBills(true);
      const token = localStorage.getItem('authToken');
      const headers = {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      const billsUrl = `${API_BASE_URL}/bills`;
      console.log('[Dashboard] Fetching bills from:', billsUrl, 'API_BASE_URL:', API_BASE_URL);
      const response = await fetch(billsUrl, {
        method: 'GET',
        headers: headers
      });
      
      if (!response.ok) {
        // Check for session expiry (401)
        if (response.status === 401) {
          await handleApiResponse(response);
          return;
        }
        
        // Server error (500, 502, 503, etc.) - backend is reachable but has issues
        if (response.status >= 500) {
          const errorText = await response.text();
          console.error('Backend server error when fetching bills:', response.status, errorText);
          setApiConnectionError(true);
          throw new Error(`Backend server error: ${response.status} ${response.statusText}`);
        }
        
        throw new Error(`Failed to fetch bills: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      const billsData = data || [];
      setBills(billsData);
      
      // Calculate stats from API bills data
      const newStats = calculateStats(billsData);
      setStats(newStats);
      setApiConnectionError(false); // Clear error if successful
    } catch (error) {
      console.error('Error fetching bills:', error);
      
      // Check if it's a network/CORS error (no response received)
      // Only treat as network error if we didn't get a response status
      const isNetworkError = (
        error.name === 'TypeError' && 
        !error.message.includes('Backend server error') &&
        !error.message.includes('Failed to fetch bills:')
      ) || (
        error.message.includes('Failed to fetch') && 
        !error.message.includes('Backend server error') &&
        !error.message.includes('Failed to fetch bills:')
      ) || error.message.includes('CORS') || error.message.includes('NetworkError');
      
      if (isNetworkError) {
        console.warn('Network error when fetching bills. Backend may not be running or proxy not configured.');
        setApiConnectionError(true);
      } else if (error.message.includes('Backend server error')) {
        console.warn('Backend server returned an error when fetching bills. This is a server-side issue.');
        setApiConnectionError(true);
      }
      
      setBills([]);
      setStats(calculateStats([]));
    } finally {
      setLoadingBills(false);
    }
  }, []);

  useEffect(() => {
    // Only fetch on initial page load
    // Wrap in async function to handle errors gracefully
    const loadData = async () => {
      try {
        await fetchInventory();
        await fetchBills();
        await fetchExpenses(); // Load expenses for the chart
      } catch (error) {
        // Errors are already handled in fetchInventory, fetchBills, and fetchExpenses
        // This just prevents unhandled promise rejection
        console.log('Data loading completed with fallbacks');
      }
    };
    
    loadData();
  }, [fetchInventory, fetchBills, fetchExpenses]); // Include dependencies

  // Chart data preparation - Must be before any early returns
  const [chartPeriod, setChartPeriod] = useState('monthly'); // daily, weekly, monthly
  const [gstChartPeriod, setGstChartPeriod] = useState('monthly'); // daily, weekly, monthly, annually

  // Prepare sales chart data
  const salesChartData = useMemo(() => {
    if (!bills || bills.length === 0) return [];
    
    const dataMap = new Map();
    
    bills.forEach(bill => {
      const billDate = new Date(bill.date || bill.createdAt || Date.now());
      let key, label;
      
      if (chartPeriod === 'daily') {
        key = billDate.toISOString().split('T')[0];
        label = billDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
      } else if (chartPeriod === 'weekly') {
        const weekStart = new Date(billDate);
        weekStart.setDate(billDate.getDate() - billDate.getDay());
        key = weekStart.toISOString().split('T')[0];
        label = `Week ${weekStart.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}`;
      } else { // monthly
        key = `${billDate.getFullYear()}-${String(billDate.getMonth() + 1).padStart(2, '0')}`;
        label = billDate.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
      }
      
      if (!dataMap.has(key)) {
        dataMap.set(key, {
          period: label,
          total: 0,
          withGST: 0,
          withoutGST: 0
        });
      }
      
      const data = dataMap.get(key);
      data.total += bill.totalAmount || 0;
      
      if (bill.billType === 'GST') {
        data.withGST += bill.totalAmount || 0;
      } else {
        data.withoutGST += bill.totalAmount || 0;
      }
    });
    
    return Array.from(dataMap.values()).sort((a, b) => {
      return a.period.localeCompare(b.period);
    });
  }, [bills, chartPeriod]);

  // Prepare GST chart data - Only GST sales
  const gstChartData = useMemo(() => {
    if (!bills || bills.length === 0) return [];
    
    // Filter only GST bills
    const gstBills = bills.filter(bill => bill.billType === 'GST');
    if (gstBills.length === 0) return [];
    
    const dataMap = new Map();
    
    gstBills.forEach(bill => {
      const billDate = new Date(bill.date || bill.createdAt || Date.now());
      let key, label;
      
      if (gstChartPeriod === 'daily') {
        key = billDate.toISOString().split('T')[0];
        label = billDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
      } else if (gstChartPeriod === 'weekly') {
        const weekStart = new Date(billDate);
        weekStart.setDate(billDate.getDate() - billDate.getDay());
        key = weekStart.toISOString().split('T')[0];
        label = `Week ${weekStart.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}`;
      } else if (gstChartPeriod === 'annually') {
        key = `${billDate.getFullYear()}`;
        label = billDate.getFullYear().toString();
      } else { // monthly
        key = `${billDate.getFullYear()}-${String(billDate.getMonth() + 1).padStart(2, '0')}`;
        label = billDate.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
      }
      
      if (!dataMap.has(key)) {
        dataMap.set(key, {
          period: label,
          gstSales: 0
        });
      }
      
      const data = dataMap.get(key);
      data.gstSales += bill.totalAmount || 0;
    });
    
    return Array.from(dataMap.values()).sort((a, b) => {
      return a.period.localeCompare(b.period);
    });
  }, [bills, gstChartPeriod]);

  // Prepare inventory chart data (by category/type)
  const inventoryChartData = useMemo(() => {
    if (!inventory || inventory.length === 0) return [];
    
    const categoryMap = new Map();
    
    inventory.forEach(item => {
      const category = item.productType || item.product_type || item.category || 'Other';
      const stock = item.totalSqftStock || item.total_sqft_stock || item.quantity || 0;
      const price = item.pricePerSqft || item.price_per_sqft || item.pricePerUnit || item.unitPrice || 0;
      const value = stock * price;
      
      if (!categoryMap.has(category)) {
        categoryMap.set(category, {
          name: category,
          value: 0,
          quantity: 0
        });
      }
      
      const data = categoryMap.get(category);
      data.value += value;
      data.quantity += stock;
    });
    
    return Array.from(categoryMap.values()).sort((a, b) => b.value - a.value);
  }, [inventory]);

  // Prepare expenses chart data (by category) for pie chart
  const expensesChartData = useMemo(() => {
    if (!expenses || expenses.length === 0) return [];
    
    const categoryMap = new Map();
    
    expenses.forEach(exp => {
      const category = exp.category || exp.type || 'Other';
      const amount = parseFloat(exp.amount) || 0;
      
      if (!categoryMap.has(category)) {
        categoryMap.set(category, {
          name: category,
          value: 0,
          amount: 0,
          count: 0
        });
      }
      
      const data = categoryMap.get(category);
      data.value += amount;
      data.amount += amount;
      data.count += 1;
    });
    
    return Array.from(categoryMap.values()).sort((a, b) => b.value - a.value);
  }, [expenses]);

  // Colors for pie chart segments
  const COLORS = ['#dc3545', '#667eea', '#17a2b8', '#28a745', '#ffc107', '#fd7e14', '#6f42c1', '#e83e8c'];

  if (loadingBills && bills.length === 0) {
    return <div className="dashboard-container">Loading...</div>;
  }

  const totalInventoryValue = inventory.reduce((sum, item) => {
    const stock = item.totalSqftStock || item.total_sqft_stock || item.quantity || 0;
    const price = item.pricePerSqft || item.price_per_sqft || item.pricePerUnit || item.unitPrice || 0;
    return sum + (stock * price);
  }, 0);

  // Calculate total expenses
  const totalExpenses = expenses.reduce((sum, exp) => {
    return sum + (parseFloat(exp.amount) || 0);
  }, 0);

  const lowStockItems = inventory.filter(item => {
    const stock = item.totalSqftStock || item.total_sqft_stock || item.quantity || 0;
    return stock < 10;
  });

  // Filter and sort inventory
  let filteredInventory = inventory.filter(item => {
    if (!inventorySearchQuery.trim()) return true;

    const query = inventorySearchQuery.toLowerCase().trim();
    const name = item.name?.toLowerCase() || '';
    const productType = (item.productType || item.product_type || item.category || '').toLowerCase();
    const color = (item.color || '').toLowerCase();
    const pricePerSqft = (item.pricePerSqft || item.price_per_sqft || item.pricePerUnit || item.unitPrice || 0).toString();
    const totalSqftStock = (item.totalSqftStock || item.total_sqft_stock || item.quantity || 0).toString();
    const slug = (item.slug || '').toLowerCase();

    return (
      name.includes(query) ||
      productType.includes(query) ||
      color.includes(query) ||
      pricePerSqft.includes(query) ||
      totalSqftStock.includes(query) ||
      slug.includes(query)
    );
  });

  // Sort inventory
  if (inventorySortConfig.key) {
    filteredInventory = [...filteredInventory].sort((a, b) => {
      let aValue = a[inventorySortConfig.key] || a[`${inventorySortConfig.key.charAt(0).toUpperCase() + inventorySortConfig.key.slice(1)}`] || 0;
      let bValue = b[inventorySortConfig.key] || b[`${inventorySortConfig.key.charAt(0).toUpperCase() + inventorySortConfig.key.slice(1)}`] || 0;

      // Handle camelCase to snake_case mapping
      if (inventorySortConfig.key === 'productType') {
        aValue = a.productType || a.product_type || '';
        bValue = b.productType || b.product_type || '';
      } else if (inventorySortConfig.key === 'pricePerSqft') {
        aValue = a.pricePerSqft || a.price_per_sqft || a.pricePerUnit || a.unitPrice || 0;
        bValue = b.pricePerSqft || b.price_per_sqft || b.pricePerUnit || b.unitPrice || 0;
      } else if (inventorySortConfig.key === 'totalSqftStock') {
        aValue = a.totalSqftStock || a.total_sqft_stock || 0;
        bValue = b.totalSqftStock || b.total_sqft_stock || 0;
      }

      if (typeof aValue === 'string') {
        aValue = aValue.toLowerCase();
        bValue = bValue?.toLowerCase() || '';
      }

      if (aValue < bValue) return inventorySortConfig.direction === 'asc' ? -1 : 1;
      if (aValue > bValue) return inventorySortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
  }

  // Pagination handlers for Sales
  const handleSalesPageChange = (page) => {
    setSalesCurrentPage(page);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Pagination handlers for Inventory
  const handleInventoryPageChange = (page) => {
    setInventoryCurrentPage(page);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  
  const formatBillDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-IN', { 
      day: 'numeric', 
      month: 'numeric', 
      year: 'numeric'
    });
  };

  const handleSearchChange = (e) => {
    setSearchQuery(e.target.value);
    setSalesCurrentPage(1); // Reset to first page when search changes
  };

  const clearSearch = () => {
    setSearchQuery('');
    setSalesCurrentPage(1);
  };

  const handleInventorySearchChange = (e) => {
    setInventorySearchQuery(e.target.value);
    setInventoryCurrentPage(1); // Reset to first page when search changes
  };

  const clearInventorySearch = () => {
    setInventorySearchQuery('');
    setInventoryCurrentPage(1);
  };

  // Filter bills with search and date range
  let filteredBills = bills.filter(bill => {
    // Date range filter
    if (dateRange.start || dateRange.end) {
      const billDate = new Date(bill.billDate);
      if (dateRange.start && billDate < new Date(dateRange.start)) return false;
      if (dateRange.end) {
        const endDate = new Date(dateRange.end);
        endDate.setHours(23, 59, 59, 999);
        if (billDate > endDate) return false;
      }
    }

    // Search filter
    if (!searchQuery.trim()) return true;

    const query = searchQuery.trim();
    const queryLower = query.toLowerCase();
    
    // If query is all digits (likely a mobile number or bill number), check specific fields
    const isNumericQuery = /^\d+$/.test(query);
    
    if (isNumericQuery) {
      // For numeric queries, check mobile number (most common use case)
      const mobileNumber = bill.customerMobileNumber?.toString().trim() || '';
      if (mobileNumber.includes(query)) return true;
      
      // Also check bill number if it contains the query (for searching by bill ID)
      const billNumber = bill.billNumber?.toString().trim() || '';
      if (billNumber.includes(query)) return true;
      
      // Don't check other fields for numeric queries to avoid false matches
      return false;
    }

    // For non-numeric queries, search across all fields
    // Search in Bill Number
    if (bill.billNumber?.toLowerCase().includes(queryLower)) return true;

    // Search in Customer Mobile Number
    if (bill.customerMobileNumber?.toLowerCase().includes(queryLower)) return true;

    // Search in Bill Type (GST/NON-GST)
    if (bill.billType?.toLowerCase().includes(queryLower)) return true;
    if (queryLower === 'gst' && bill.billType === 'GST') return true;
    if (queryLower === 'non-gst' || queryLower === 'non gst') {
      if (bill.billType !== 'GST') return true;
    }

    // Search in Date
    if (formatBillDate(bill.billDate).toLowerCase().includes(queryLower)) return true;

    // Search in Total Amount
    if (bill.totalAmount?.toString().includes(query)) return true;

    return false;
  });

  // Sort bills - always sort by date by default (newest first)
  // If user clicks another column, sort by that column instead
  filteredBills = [...filteredBills].sort((a, b) => {
    let aValue = a[sortConfig.key];
    let bValue = b[sortConfig.key];

    if (sortConfig.key === 'billDate') {
      // Parse dates properly - handle ISO format and other formats
      const aDate = aValue ? new Date(aValue) : new Date(0);
      const bDate = bValue ? new Date(bValue) : new Date(0);
      // Use timestamp for reliable comparison
      aValue = isNaN(aDate.getTime()) ? 0 : aDate.getTime();
      bValue = isNaN(bDate.getTime()) ? 0 : bDate.getTime();
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

  // Pagination calculations for Sales (after filteredBills is defined)
  const salesTotalPages = Math.ceil(filteredBills.length / itemsPerPage);
  const salesStartIndex = (salesCurrentPage - 1) * itemsPerPage;
  const salesEndIndex = salesStartIndex + itemsPerPage;
  const paginatedBills = filteredBills.slice(salesStartIndex, salesEndIndex);

  // Pagination calculations for Inventory (after filteredInventory is defined)
  const inventoryTotalPages = Math.ceil(filteredInventory.length / itemsPerPage);
  const inventoryStartIndex = (inventoryCurrentPage - 1) * itemsPerPage;
  const inventoryEndIndex = inventoryStartIndex + itemsPerPage;
  const paginatedInventory = filteredInventory.slice(inventoryStartIndex, inventoryEndIndex);

  const generateSlug = (text) => {
    return text
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, '')
      .replace(/[\s_-]+/g, '-')
      .replace(/^-+|-+$/g, '');
  };

  // Toast notification helper
  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  // Export to CSV helper
  const exportToCSV = (data, filename, headers) => {
    const csvContent = [
      headers.join(','),
      ...data.map(row => Object.values(row).map(val => `"${val}"`).join(','))
    ].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast(`${filename} exported successfully!`, 'success');
  };

  // Print bill helper
  const printBill = () => {
    if (!selectedBill) return;
    
    const printWindow = window.open('', '_blank');
    const printContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Bill - ${selectedBill.billNumber}</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 20px; }
            .bill-header { text-align: center; margin-bottom: 30px; }
            .bill-info { margin-bottom: 20px; }
            table { width: 100%; border-collapse: collapse; margin: 20px 0; }
            th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
            th { background-color: #f2f2f2; }
            .total-row { font-weight: bold; }
            .text-right { text-align: right; }
          </style>
        </head>
        <body>
          <div class="bill-header">
            <h1>Kataria Stone World</h1>
            <h2>Bill - ${selectedBill.billNumber}</h2>
          </div>
          <div class="bill-info">
            <p><strong>Date:</strong> ${formatBillDate(selectedBill.billDate)}</p>
            <p><strong>Customer Mobile:</strong> ${selectedBill.customerMobileNumber || '-'}</p>
            <p><strong>Bill Type:</strong> ${selectedBill.billType}</p>
          </div>
          <table>
            <thead>
              <tr>
                <th>Item Name</th>
                <th>Category</th>
                <th>Quantity</th>
                <th>Price</th>
                <th>Subtotal</th>
              </tr>
            </thead>
            <tbody>
              ${billItems.map(item => {
                const qty = Number(parseFloat(item?.quantity) || 0) || 0;
                const price = Number(parseFloat(item?.pricePerUnit || item?.price_per_unit || item?.unitPrice || item?.price) || 0) || 0;
                const safeQty = isNaN(qty) ? 0 : qty;
                const safePrice = isNaN(price) ? 0 : price;
                const safeTotal = isNaN(qty * price) ? 0 : (qty * price);
                return `
                  <tr>
                    <td>${item?.itemName || item?.name || '-'}</td>
                    <td>${item?.category || '-'}</td>
                    <td>${safeQty}</td>
                    <td>₹${safePrice.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                    <td>₹${safeTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                  </tr>
                `;
              }).join('')}
            </tbody>
            <tfoot>
              <tr class="total-row">
                <td colspan="4" class="text-right">Subtotal:</td>
                <td>₹${(Number(parseFloat(selectedBill?.subtotal) || 0) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
              </tr>
              ${selectedBill.taxAmount > 0 ? `
                <tr class="total-row">
                  <td colspan="4" class="text-right">Tax (${selectedBill.taxPercentage || 0}%):</td>
                  <td>₹${(Number(parseFloat(selectedBill?.taxAmount) || 0) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                </tr>
              ` : ''}
              ${selectedBill.discountAmount > 0 ? `
                <tr class="total-row">
                  <td colspan="4" class="text-right">Discount:</td>
                  <td>-₹${(Number(parseFloat(selectedBill?.discountAmount) || 0) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                </tr>
              ` : ''}
              <tr class="total-row">
                <td colspan="4" class="text-right"><strong>Total:</strong></td>
                <td><strong>₹${(Number(parseFloat(selectedBill?.totalAmount) || 0) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong></td>
              </tr>
            </tfoot>
          </table>
        </body>
      </html>
    `;
    printWindow.document.write(printContent);
    printWindow.document.close();
    printWindow.print();
  };

  // Sort helper function
  const handleSort = (key, isInventory = false) => {
    const setSort = isInventory ? setInventorySortConfig : setSortConfig;
    const currentSort = isInventory ? inventorySortConfig : sortConfig;
    
    // For date columns, default to descending (newest first)
    // For other columns, default to ascending
    const defaultDirection = key === 'billDate' ? 'desc' : 'asc';
    
    setSort({
      key,
      direction: currentSort.key === key && currentSort.direction === 'asc' ? 'desc' : 
                 currentSort.key === key && currentSort.direction === 'desc' ? 'asc' : 
                 defaultDirection
    });
  };

  // Handle bill row click to fetch and display items
  const handleBillRowClick = async (bill) => {
    setSelectedBill(bill);
    setLoadingBillItems(true);
    setShowBillItems(true);

    try {
      // Check if bill already has items
      if (bill.items && bill.items.length > 0) {
        setBillItems(bill.items);
        setLoadingBillItems(false);
      } else {
        // Fetch bill details from API
        const token = localStorage.getItem('authToken');
        const headers = {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        };
        if (token) {
          headers['Authorization'] = `Bearer ${token}`;
        }
        const response = await fetch(`${API_BASE_URL}/bills/${bill.id}`, {
          headers: headers
        });
        
        // Check for session expiry (401)
        if (response.status === 401) {
          await handleApiResponse(response);
          return;
        }
        
        if (response.ok) {
          const billDetails = await response.json();
          setBillItems(billDetails.items || []);
        } else {
          console.error('Failed to fetch bill details');
          setBillItems([]);
        }
        setLoadingBillItems(false);
      }
    } catch (error) {
      console.error('Error fetching bill items:', error);
      setBillItems([]);
      setLoadingBillItems(false);
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => {
      const newData = {
        ...prev,
        [name]: value
      };
      // Auto-generate slug from product name
      if (name === 'name') {
        newData.slug = generateSlug(value);
      }
      return newData;
    });
  };

  const handleAddInventory = async (e) => {
    e.preventDefault();
    
    // Validate required fields
    if (!formData.name || !formData.product_type || !formData.price_per_sqft || !formData.total_sqft_stock || !formData.primary_image_url) {
      alert('Please fill all required fields');
      return;
    }

    // Prepare data with proper types and field names
    const pricePerSqft = parseFloat(formData.price_per_sqft);
    const totalSqftStock = parseFloat(formData.total_sqft_stock);
    
    if (isNaN(pricePerSqft) || pricePerSqft < 0) {
      alert('Please enter a valid price per unit');
      return;
    }
    
    if (isNaN(totalSqftStock) || totalSqftStock < 0) {
      alert('Please enter a valid quantity/stock');
      return;
    }
    
    // Ensure all string values are trimmed and not empty
    const trimmedName = formData.name.trim();
    const trimmedSlug = (formData.slug || generateSlug(formData.name)).trim();
    const trimmedProductType = formData.product_type.trim();
    const trimmedImageUrl = formData.primary_image_url.trim();
    const trimmedColor = (formData.color || '').trim();
    
    // Double-check required fields are not empty after trimming
    if (!trimmedName || !trimmedProductType || !trimmedImageUrl) {
      alert('Please fill all required fields (name, product type, and image URL cannot be empty)');
      return;
    }
    
    // Use camelCase format (as shown in API error messages)
    // The error shows: primaryImageUrl, pricePerSqft, totalSqftStock, productTypeString
    const trimmedUnit = (formData.unit || '').trim();
    const itemData = {
      name: trimmedName,
      slug: trimmedSlug,
      productTypeString: trimmedProductType,  // Must match API's expected field name
      pricePerSqft: pricePerSqft,  // Must match API's expected field name
      totalSqftStock: totalSqftStock,  // Must match API's expected field name
      unit: trimmedUnit || 'piece',  // Unit (piece, sqr ft, etc.)
      primaryImageUrl: trimmedImageUrl,  // Must match API's expected field name
      color: trimmedColor
    };

    try {
      // POST request to add inventory
      const token = localStorage.getItem('authToken');
      const userData = JSON.parse(localStorage.getItem('user') || '{}');
      
      // Get admin role from user data - JWT token should already contain admin role
      // Backend should extract role from JWT token, but we'll also send it in request body
      const userRole = userData?.role || userData?.userRole || 'admin';
      
      // Add admin role to request body - backend may need it if JWT extraction fails
      // Try both 'role' and 'userRole' field names in case backend expects different field
      const requestBody = {
        ...itemData,
        role: userRole,        // Primary field name
        userRole: userRole    // Alternative field name (in case backend expects this)
      };
      
      // Debug logging
      console.log('Adding inventory item:', itemData);
      console.log('User role from localStorage:', userRole);
      console.log('Request body with role:', JSON.stringify(requestBody, null, 2));
      console.log('Request body keys:', Object.keys(requestBody));
      
      const headers = {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      
      const response = await fetch(`${API_BASE_URL}/inventory`, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(requestBody)
      });

      console.log('POST Response status:', response.status, response.statusText);

      // Check for session expiry (401)
      if (response.status === 401) {
        await handleApiResponse(response);
        return;
      }

      if (!response.ok) {
        const errorText = await response.text();
        console.error('POST Error response:', errorText);
        let errorData;
        try {
          errorData = JSON.parse(errorText);
        } catch {
          errorData = { message: errorText || 'Failed to add inventory item' };
        }
        throw new Error(errorData.message || `Server error: ${response.status} ${response.statusText}`);
      }

      const newItem = await response.json();
      console.log('Inventory item added successfully:', newItem);
      
      // Reset form
      setFormData({
        name: '',
        slug: '',
        product_type: '',
        price_per_sqft: '',
        total_sqft_stock: '',
        unit: '',
        primary_image_url: '',
        color: ''
      });
      setShowAddInventory(false);
      
      // Refresh inventory from API after adding item (silently handle errors)
      try {
        await fetchInventory();
      } catch (refreshError) {
        console.warn('Failed to refresh inventory after adding, but item was added successfully:', refreshError);
        // Don't show error to user since item was added successfully
      }
      
      showToast('Inventory item added successfully!', 'success');
    } catch (error) {
      console.error('Error adding inventory:', error);
      showToast(`Error: ${error.message || 'Failed to add inventory item'}`, 'error');
    }
  };

  // Handle edit inventory
  const handleEditInventory = (item) => {
    setEditingInventoryItem(item);
    setFormData({
      name: item.name || '',
      slug: item.slug || '',
      product_type: item.productType || item.product_type || '',
      price_per_sqft: item.pricePerSqft || item.price_per_sqft || '',
      total_sqft_stock: item.totalSqftStock || item.total_sqft_stock || '',
      unit: item.unit || '',
      primary_image_url: item.primaryImageUrl || item.primary_image_url || '',
      color: item.color || ''
    });
    setShowEditInventory(true);
  };

  // Handle update inventory
  const handleUpdateInventory = async (e) => {
    e.preventDefault();
    
    if (!editingInventoryItem) return;

    // Validate required fields
    if (!formData.name || !formData.product_type || !formData.price_per_sqft || !formData.total_sqft_stock || !formData.primary_image_url) {
      showToast('Please fill all required fields', 'error');
      return;
    }

    const pricePerSqft = parseFloat(formData.price_per_sqft);
    const totalSqftStock = parseFloat(formData.total_sqft_stock);
    
    if (isNaN(pricePerSqft) || pricePerSqft < 0) {
      showToast('Please enter a valid price per unit', 'error');
      return;
    }
    
    if (isNaN(totalSqftStock) || totalSqftStock < 0) {
      showToast('Please enter a valid quantity/stock', 'error');
      return;
    }

    const trimmedName = formData.name.trim();
    const trimmedSlug = (formData.slug || generateSlug(formData.name)).trim();
    const trimmedProductType = formData.product_type.trim();
    const trimmedImageUrl = formData.primary_image_url.trim();
    const trimmedColor = (formData.color || '').trim();
    const trimmedUnit = (formData.unit || '').trim();

    if (!trimmedName || !trimmedProductType || !trimmedImageUrl) {
      showToast('Please fill all required fields', 'error');
      return;
    }

    const itemData = {
      name: trimmedName,
      slug: trimmedSlug,
      productTypeString: trimmedProductType,
      pricePerSqft: pricePerSqft,
      totalSqftStock: totalSqftStock,
      unit: trimmedUnit || 'piece',  // Unit (piece, sqr ft, etc.)
      primaryImageUrl: trimmedImageUrl,
      color: trimmedColor
    };

    try {
      const token = localStorage.getItem('authToken');
      const userData = JSON.parse(localStorage.getItem('user') || '{}');
      
      // Add admin role to request body - backend should extract from JWT token
      // But we'll send it in request body as well in case backend needs it
      const userRole = userData?.role || userData?.userRole || 'admin';
      const requestBody = {
        ...itemData,
        role: userRole,        // Primary field name
        userRole: userRole    // Alternative field name (in case backend expects this)
      };
      
      const headers = {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      const response = await fetch(`${API_BASE_URL}/inventory/${editingInventoryItem.id}`, {
        method: 'PUT',
        headers: headers,
        body: JSON.stringify(requestBody)
      });

      // Check for session expiry (401)
      if (response.status === 401) {
        await handleApiResponse(response);
        return;
      }

      if (!response.ok) {
        const errorText = await response.text();
        let errorData;
        try {
          errorData = JSON.parse(errorText);
        } catch {
          errorData = { message: errorText || 'Failed to update inventory item' };
        }
        throw new Error(errorData.message || `Server error: ${response.status}`);
      }

      await fetchInventory();
      setShowEditInventory(false);
      setEditingInventoryItem(null);
      setFormData({
        name: '',
        slug: '',
        product_type: '',
        price_per_sqft: '',
        total_sqft_stock: '',
        unit: '',
        primary_image_url: '',
        color: ''
      });
      showToast('Inventory item updated successfully!', 'success');
    } catch (error) {
      console.error('Error updating inventory:', error);
      showToast(`Error: ${error.message || 'Failed to update inventory item'}`, 'error');
    }
  };

  // Handle delete inventory
  const handleDeleteInventory = async (item) => {
    if (!window.confirm(`Are you sure you want to delete "${item.name}"?`)) {
      return;
    }

    try {
      const token = localStorage.getItem('authToken');
      const headers = {
        'Content-Type': 'application/json',
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      const response = await fetch(`${API_BASE_URL}/inventory/${item.id}`, {
        method: 'DELETE',
        headers: headers
      });

      // Check for session expiry (401)
      if (response.status === 401) {
        await handleApiResponse(response);
        return;
      }

      if (!response.ok) {
        throw new Error('Failed to delete inventory item');
      }

      await fetchInventory();
      showToast('Inventory item deleted successfully!', 'success');
    } catch (error) {
      console.error('Error deleting inventory:', error);
      showToast(`Error: ${error.message || 'Failed to delete inventory item'}`, 'error');
    }
  };

  // Export sales to CSV
  const exportSalesToCSV = () => {
    const headers = ['Bill Number', 'Date', 'Customer Mobile', 'Type', 'Sqft', 'Subtotal', 'Tax', 'Discount', 'Total'];
    const csvData = filteredBills.map(bill => ({
      'Bill Number': bill.billNumber || '',
      'Date': formatBillDate(bill.billDate),
      'Customer Mobile': bill.customerMobileNumber || '',
      'Type': bill.billType || '',
      'Sqft': bill.totalSqft || 0,
      'Subtotal': bill.subtotal || 0,
      'Tax': bill.taxAmount || 0,
      'Discount': bill.discountAmount || 0,
      'Total': bill.totalAmount || 0
    }));
    exportToCSV(csvData, `sales_${new Date().toISOString().split('T')[0]}.csv`, headers);
  };

  // Export inventory to CSV
  const exportInventoryToCSV = () => {
    const headers = ['Product Name', 'Product Type', 'Price/Unit', 'Quantity/Stock', 'Color', 'Total Value'];
    const csvData = filteredInventory.map(item => {
      const pricePerSqft = item.pricePerSqft || item.price_per_sqft || item.pricePerUnit || item.unitPrice || 0;
      const totalSqftStock = item.totalSqftStock || item.total_sqft_stock || item.quantity || 0;
      return {
        'Product Name': item.name || '',
        'Product Type': item.productType || item.product_type || '',
        'Price/Unit': pricePerSqft,
        'Quantity/Stock': totalSqftStock,
        'Color': item.color || '',
        'Total Value': pricePerSqft * totalSqftStock
      };
    });
    exportToCSV(csvData, `inventory_${new Date().toISOString().split('T')[0]}.csv`, headers);
  };

  return (
    <div className="dashboard-container">

      {/* API Connection Error Banner */}
      {apiConnectionError && (
        <div className="api-error-banner">
          <div className="api-error-content">
            <span className="api-error-icon">⚠️</span>
            <div className="api-error-text">
              <strong>API Error</strong>
              <p>Unable to fetch data from backend server. This could be:</p>
              <ul>
                <li><strong>Connection Issue:</strong> Backend server not running on <code>http://localhost:8080</code> or proxy not configured</li>
                <li><strong>Server Error:</strong> Backend returned a 500 error (check backend logs for details)</li>
                <li>Check browser console for detailed error messages</li>
              </ul>
              <p><strong>Note:</strong> If you see a 500 error, the backend is reachable but has an internal error. Check your backend server logs.</p>
              <p>Using local storage as fallback. Some features may be limited.</p>
            </div>
            <button className="api-error-close" onClick={() => setApiConnectionError(false)}>×</button>
          </div>
        </div>
      )}

      {/* Stats Cards - Only show on Dashboard */}
      {activeNav === 'dashboard' && (
        <div className={`collapsible-section ${collapsedSections.stats ? 'collapsed' : ''}`}>
          <div 
            className="section-toggle-header"
            onClick={() => setCollapsedSections(prev => ({ ...prev, stats: !prev.stats }))}
          >
            <h3 className="section-toggle-title">
              <span className="section-toggle-icon">{collapsedSections.stats ? '▶' : '▼'}</span>
              Statistics Overview
            </h3>
          </div>
          <div className="section-toggle-content">
            <div className="stats-grid">
          <div className="stat-card primary">
            <div className="stat-icon">💰</div>
            <div className="stat-content">
              <h3>Total Sales</h3>
              <p className="stat-value">₹{stats.totalSales.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
              <p className="stat-label">{stats.totalCount} sale(s)</p>
            </div>
          </div>

          <div className="stat-card success">
            <div className="stat-icon">✓</div>
            <div className="stat-content">
              <h3>Sales with GST</h3>
              <p className="stat-value">₹{stats.totalWithGST.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
              <p className="stat-label">{stats.countWithGST} sale(s)</p>
            </div>
          </div>

          <div className="stat-card warning">
            <div className="stat-icon">ℹ</div>
            <div className="stat-content">
              <h3>Sales without GST</h3>
              <p className="stat-value">₹{stats.totalWithoutGST.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
              <p className="stat-label">{stats.countWithoutGST} sale(s)</p>
            </div>
          </div>

          <div className="stat-card info">
            <div className="stat-icon">📦</div>
            <div className="stat-content">
              <h3>Inventory Value</h3>
              <p className="stat-value">₹{totalInventoryValue.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
              <p className="stat-label">{inventory.length} item(s)</p>
            </div>
          </div>

          <div className="stat-card expense">
            <div className="stat-icon">💵</div>
            <div className="stat-content">
              <h3>Total Expenses</h3>
              <p className="stat-value">₹{totalExpenses.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
              <p className="stat-label">{expenses.length} expense(s)</p>
            </div>
          </div>
            </div>
          </div>
        </div>
      )}

      {/* Charts Section - Only show on Dashboard */}
      {activeNav === 'dashboard' && (
        <div className={`collapsible-section ${collapsedSections.charts ? 'collapsed' : ''}`}>
          <div 
            className="section-toggle-header"
            onClick={() => setCollapsedSections(prev => ({ ...prev, charts: !prev.charts }))}
          >
            <h3 className="section-toggle-title">
              <span className="section-toggle-icon">{collapsedSections.charts ? '▶' : '▼'}</span>
              Charts & Analytics
            </h3>
          </div>
          <div className="section-toggle-content">
            <div className="charts-section">
          {/* Sales Chart */}
          <div className="chart-card">
            <div className="chart-header">
              <h3>Sales Overview</h3>
              <div className="chart-period-selector">
                <button 
                  className={chartPeriod === 'daily' ? 'active' : ''}
                  onClick={() => setChartPeriod('daily')}
                >
                  Daily
                </button>
                <button 
                  className={chartPeriod === 'weekly' ? 'active' : ''}
                  onClick={() => setChartPeriod('weekly')}
                >
                  Weekly
                </button>
                <button 
                  className={chartPeriod === 'monthly' ? 'active' : ''}
                  onClick={() => setChartPeriod('monthly')}
                >
                  Monthly
                </button>
              </div>
            </div>
            <div className="chart-container">
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={salesChartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="period" />
                  <YAxis />
                  <Tooltip 
                    formatter={(value) => {
                      const num = Number(value) || 0;
                      return `₹${num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
                    }}
                  />
                  <Bar dataKey="withGST" fill="#28a745" name="GST" />
                  <Bar dataKey="withoutGST" fill="#ffc107" name="NON-GST" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* GST Chart */}
          <div className="chart-card">
            <div className="chart-header">
              <h3>GST Sales</h3>
              <div className="chart-period-selector">
                <button 
                  className={gstChartPeriod === 'daily' ? 'active' : ''}
                  onClick={() => setGstChartPeriod('daily')}
                >
                  Daily
                </button>
                <button 
                  className={gstChartPeriod === 'weekly' ? 'active' : ''}
                  onClick={() => setGstChartPeriod('weekly')}
                >
                  Weekly
                </button>
                <button 
                  className={gstChartPeriod === 'monthly' ? 'active' : ''}
                  onClick={() => setGstChartPeriod('monthly')}
                >
                  Monthly
                </button>
                <button 
                  className={gstChartPeriod === 'annually' ? 'active' : ''}
                  onClick={() => setGstChartPeriod('annually')}
                >
                  Annually
                </button>
              </div>
            </div>
            <div className="chart-container">
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={gstChartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="period" />
                  <YAxis />
                  <Tooltip 
                    formatter={(value) => {
                      const num = Number(value) || 0;
                      return `₹${num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
                    }}
                  />
                  <Bar dataKey="gstSales" fill="#28a745" name="GST Sales" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Inventory Chart - Horizontal Bar Chart */}
          <div className="chart-card">
            <div className="chart-header">
              <h3>Inventory Value by Category</h3>
            </div>
            <div className="chart-container">
              <ResponsiveContainer width="100%" height={380}>
                <BarChart
                  data={inventoryChartData.map(item => {
                    const total = inventoryChartData.reduce((sum, i) => sum + (Number(i.value) || 0), 0);
                    const percent = total > 0 ? ((Number(item.value) / total) * 100) : 0;
                    return { ...item, percent };
                  })}
                  layout="vertical"
                  margin={{ top: 20, right: 30, left: 20, bottom: 20 }}
                >
                  <XAxis 
                    type="number" 
                    domain={[0, 'dataMax']}
                    tickFormatter={(value) => `${value.toFixed(0)}%`}
                    stroke="#666"
                    fontSize={12}
                  />
                  <YAxis 
                    type="category" 
                    dataKey="name" 
                    width={50}
                    stroke="#666"
                    fontSize={12}
                    tick={{ fill: '#333' }}
                  />
                  <Tooltip 
                    formatter={(value, name, props) => {
                      const num = Number(props.payload.value) || 0;
                      const total = inventoryChartData.reduce((sum, item) => sum + (Number(item.value) || 0), 0);
                      const percent = total > 0 ? ((num / total) * 100).toFixed(1) : '0';
                      return [
                        `₹${num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (${percent}%)`,
                        'Value'
                      ];
                    }}
                    labelFormatter={(label) => label}
                  />
                  <Bar 
                    dataKey="percent" 
                    radius={[0, 8, 8, 0]}
                  >
                    {inventoryChartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Expenses Chart - Horizontal Bar Chart */}
          <div className="chart-card">
            <div className="chart-header">
              <h3>Expenses by Category</h3>
            </div>
            <div className="chart-container">
              <ResponsiveContainer width="100%" height={380}>
                <BarChart
                  data={expensesChartData.map(item => {
                    const total = expensesChartData.reduce((sum, i) => sum + (Number(i.value) || 0), 0);
                    const percent = total > 0 ? ((Number(item.value) / total) * 100) : 0;
                    return { ...item, percent };
                  })}
                  layout="vertical"
                  margin={{ top: 20, right: 30, left: 20, bottom: 20 }}
                >
                  <XAxis 
                    type="number" 
                    domain={[0, 'dataMax']}
                    tickFormatter={(value) => `${value.toFixed(0)}%`}
                    stroke="#666"
                    fontSize={12}
                  />
                  <YAxis 
                    type="category" 
                    dataKey="name" 
                    width={50}
                    stroke="#666"
                    fontSize={12}
                    tick={{ fill: '#333' }}
                  />
                  <Tooltip 
                    formatter={(value, name, props) => {
                      const num = Number(props.payload.value) || 0;
                      const total = expensesChartData.reduce((sum, item) => sum + (Number(item.value) || 0), 0);
                      const percent = total > 0 ? ((num / total) * 100).toFixed(1) : '0';
                      return [
                        `₹${num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (${percent}%)`,
                        'Value'
                      ];
                    }}
                    labelFormatter={(label) => label}
                  />
                  <Bar 
                    dataKey="percent" 
                    radius={[0, 8, 8, 0]}
                  >
                    {expensesChartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab Navigation - Hidden since we're using sidebar navigation */}
      <div className="tab-navigation" style={{ display: 'none' }}>
        <button
          className={`tab-btn ${activeTab === 'sales' ? 'active' : ''}`}
          onClick={() => {
            setActiveTab('sales');
            if (setActiveNav) setActiveNav('sales');
          }}
        >
          💰 Sales
        </button>
        <button
          className={`tab-btn ${activeTab === 'inventory' ? 'active' : ''}`}
          onClick={() => {
            setActiveTab('inventory');
            if (setActiveNav) setActiveNav('inventory');
          }}
        >
          📦 Inventory
        </button>
        <button
          className={`tab-btn ${activeTab === 'expenses' ? 'active' : ''}`}
          onClick={() => {
            setActiveTab('expenses');
            if (setActiveNav) setActiveNav('expenses');
          }}
        >
          💵 Daily Expenses
        </button>
        <button
          className={`tab-btn ${activeTab === 'home-screen' ? 'active' : ''}`}
          onClick={() => {
            setActiveTab('home-screen');
            if (setActiveNav) setActiveNav('home-screen');
          }}
        >
          🏠 Home Screen
        </button>
      </div>

      {/* Render content based on active tab */}
      <div className="dashboard-sections">
        {/* Sales Section - Only show when Sales tab is selected, not on Dashboard */}
        {activeTab === 'sales' && activeNav === 'sales' && (
          <div className="dashboard-section sales-section">
          <div className="section-header-enhanced">
            <div className="section-title-wrapper">
              <span className="section-icon">💰</span>
              <h3>Recent Sales</h3>
              <span className="sales-count">({filteredBills.length})</span>
            </div>
            <div className="section-header-actions">
              {!loadingBills && filteredBills.length > 0 && (
                <div className="section-summary">
                  <span className="summary-item">
                    Total: ₹{filteredBills.reduce((sum, bill) => sum + (bill.totalAmount || 0), 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
              )}
              {!loadingBills && filteredBills.length > 0 && (
                <button className="btn btn-export" onClick={exportSalesToCSV} title="Export to CSV">
                  📥 Export CSV
                </button>
              )}
            </div>
          </div>

          {/* Search and Date Range Section */}
          {!loadingBills && bills.length > 0 && (
            <div className="search-section">
              <div className="search-wrapper">
                <span className="search-icon">🔍</span>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={handleSearchChange}
                  placeholder="Search by bill number, customer mobile, GST/Non-GST, date, or amount..."
                  className="search-input"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={clearSearch}
                    className="search-clear-btn"
                    title="Clear search"
                  >
                    ×
                  </button>
                )}
              </div>
              <div className="date-range-filter">
                <input
                  type="date"
                  value={dateRange.start}
                  onChange={(e) => {
                    setDateRange({ ...dateRange, start: e.target.value });
                    setSalesCurrentPage(1);
                  }}
                  className="date-input"
                  placeholder="Start Date"
                />
                <span className="date-separator">to</span>
                <input
                  type="date"
                  value={dateRange.end}
                  onChange={(e) => {
                    setDateRange({ ...dateRange, end: e.target.value });
                    setSalesCurrentPage(1);
                  }}
                  className="date-input"
                  placeholder="End Date"
                />
                {(dateRange.start || dateRange.end) && (
                  <button
                    type="button"
                    onClick={() => {
                      setDateRange({ start: '', end: '' });
                      setSalesCurrentPage(1);
                    }}
                    className="btn-filter-clear"
                    title="Clear date filter"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>
          )}

          <div className="section-content">
            {loadingBills ? (
              <div className="loading-state">
                <div className="loading-spinner"></div>
                <p>Loading sales data...</p>
              </div>
            ) : filteredBills.length > 0 ? (
              <>
                {/* Desktop Table View */}
                <div className="sales-table-wrapper">
                  <table className="data-table sales-table">
                    <thead>
                      <tr>
                        <th className="sortable" onClick={() => handleSort('billNumber')}>
                          Bill Number
                          {sortConfig.key === 'billNumber' && (
                            <span className="sort-icon">{sortConfig.direction === 'asc' ? ' ↑' : ' ↓'}</span>
                          )}
                        </th>
                        <th className="sortable" onClick={() => handleSort('billDate')}>
                          Date
                          {sortConfig.key === 'billDate' && (
                            <span className="sort-icon">{sortConfig.direction === 'asc' ? ' ↑' : ' ↓'}</span>
                          )}
                        </th>
                        <th className="sortable" onClick={() => handleSort('customerMobileNumber')}>
                          Customer Mobile
                          {sortConfig.key === 'customerMobileNumber' && (
                            <span className="sort-icon">{sortConfig.direction === 'asc' ? ' ↑' : ' ↓'}</span>
                          )}
                        </th>
                        <th className="sortable" onClick={() => handleSort('billType')}>
                          Type
                          {sortConfig.key === 'billType' && (
                            <span className="sort-icon">{sortConfig.direction === 'asc' ? ' ↑' : ' ↓'}</span>
                          )}
                        </th>
                        <th className="sortable" onClick={() => handleSort('totalSqft')}>
                          Sqft
                          {sortConfig.key === 'totalSqft' && (
                            <span className="sort-icon">{sortConfig.direction === 'asc' ? ' ↑' : ' ↓'}</span>
                          )}
                        </th>
                        <th className="sortable" onClick={() => handleSort('subtotal')}>
                          Subtotal
                          {sortConfig.key === 'subtotal' && (
                            <span className="sort-icon">{sortConfig.direction === 'asc' ? ' ↑' : ' ↓'}</span>
                          )}
                        </th>
                        <th className="sortable" onClick={() => handleSort('taxAmount')}>
                          Tax
                          {sortConfig.key === 'taxAmount' && (
                            <span className="sort-icon">{sortConfig.direction === 'asc' ? ' ↑' : ' ↓'}</span>
                          )}
                        </th>
                        <th className="sortable" onClick={() => handleSort('discountAmount')}>
                          Discount
                          {sortConfig.key === 'discountAmount' && (
                            <span className="sort-icon">{sortConfig.direction === 'asc' ? ' ↑' : ' ↓'}</span>
                          )}
                        </th>
                        <th className="total-col sortable" onClick={() => handleSort('totalAmount')}>
                          Total
                          {sortConfig.key === 'totalAmount' && (
                            <span className="sort-icon">{sortConfig.direction === 'asc' ? ' ↑' : ' ↓'}</span>
                          )}
                        </th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedBills.map((bill, index) => (
                      <tr key={`bill-${bill.id || index}`} className="sales-row" onClick={() => handleBillRowClick(bill)}>
                        <td className="bill-number-cell">
                          <span className="bill-number">#{bill.billNumber}</span>
                        </td>
                        <td className="date-cell">
                          {formatBillDate(bill.billDate)}
                        </td>
                        <td className="customer-cell">
                          {bill.customerMobileNumber || '-'}
                        </td>
                        <td>
                          <span className={`gst-badge ${bill.billType === 'GST' ? 'gst-paid' : 'gst-not-paid'}`}>
                            {bill.billType === 'GST' ? '✓ GST' : 'NON-GST'}
                          </span>
                        </td>
                        <td className="sqft-cell">
                          {bill.totalSqft?.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} sqft
                        </td>
                        <td className="amount-cell">₹{bill.subtotal?.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                        <td className="tax-cell">₹{bill.taxAmount?.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                        <td className="discount-cell">₹{bill.discountAmount?.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                        <td className="total-cell total-col">
                          <span className="total-amount">₹{bill.totalAmount?.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                        </td>
                        <td>
                          <div className="action-buttons" onClick={(e) => e.stopPropagation()}>
                            <button
                              className="action-btn"
                              onClick={() => handleBillRowClick(bill)}
                              title="View Details"
                            >
                              👁️
                            </button>
                            <button
                              className="action-btn"
                              onClick={async () => {
                                try {
                                  await downloadBillPDF(bill.id, bill.billType);
                                } catch (error) {
                                  alert(`Failed to download bill: ${error.message}`);
                                }
                              }}
                              title="Download PDF"
                            >
                              ⬇️
                            </button>
                          </div>
                        </td>
                      </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Mobile Card View */}
                <div className="mobile-sales-cards">
                  {paginatedBills.map((bill, index) => (
                    <div 
                      key={`bill-card-${bill.id || index}`} 
                      className="sales-card" 
                      onClick={() => handleBillRowClick(bill)}
                    >
                      <div className="sales-card-header">
                        <span className="sales-card-title">#{bill.billNumber}</span>
                        <span className={`gst-badge sales-card-badge ${bill.billType === 'GST' ? 'gst-paid' : 'gst-not-paid'}`}>
                          {bill.billType === 'GST' ? '✓ GST' : 'NON-GST'}
                        </span>
                      </div>
                      <div className="sales-card-row">
                        <span className="sales-card-label">Date:</span>
                        <span className="sales-card-value">{formatBillDate(bill.billDate)}</span>
                      </div>
                      <div className="sales-card-row">
                        <span className="sales-card-label">Customer:</span>
                        <span className="sales-card-value">{bill.customerMobileNumber || '-'}</span>
                      </div>
                      <div className="sales-card-row">
                        <span className="sales-card-label">Units:</span>
                        <span className="sales-card-value">{bill.totalSqft?.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} sqft</span>
                      </div>
                      <div className="sales-card-row">
                        <span className="sales-card-label">Subtotal:</span>
                        <span className="sales-card-value">₹{bill.subtotal?.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                      </div>
                      {bill.taxAmount > 0 && (
                        <div className="sales-card-row">
                          <span className="sales-card-label">Tax:</span>
                          <span className="sales-card-value">₹{bill.taxAmount?.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                        </div>
                      )}
                      {bill.discountAmount > 0 && (
                        <div className="sales-card-row">
                          <span className="sales-card-label">Discount:</span>
                          <span className="sales-card-value">₹{bill.discountAmount?.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                        </div>
                      )}
                      <div className="sales-card-total">
                        <span className="sales-card-label">Total:</span>
                        <span className="sales-card-value">₹{bill.totalAmount?.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                      </div>
                      <div className="sales-card-actions" onClick={(e) => e.stopPropagation()}>
                        <button
                          className="action-btn"
                          onClick={() => handleBillRowClick(bill)}
                          title="View Details"
                        >
                          👁️
                        </button>
                        <button
                          className="action-btn"
                          onClick={async () => {
                            try {
                              await downloadBillPDF(bill.id, bill.billType);
                            } catch (error) {
                              alert(`Failed to download bill: ${error.message}`);
                            }
                          }}
                          title="Download PDF"
                        >
                          ⬇️
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                {/* Pagination Controls for Sales */}
                {salesTotalPages > 1 && (
                  <div className="pagination-wrapper">
                    <div className="pagination-info">
                      Showing {salesStartIndex + 1} - {Math.min(salesEndIndex, filteredBills.length)} of {filteredBills.length} sales
                    </div>
                    <div className="pagination-controls">
                      <button
                        className="pagination-btn"
                        onClick={() => handleSalesPageChange(salesCurrentPage - 1)}
                        disabled={salesCurrentPage === 1}
                      >
                        ← Previous
                      </button>
                      <div className="pagination-numbers">
                        {Array.from({ length: salesTotalPages }, (_, i) => i + 1).map((page) => {
                          if (
                            page === 1 ||
                            page === salesTotalPages ||
                            (page >= salesCurrentPage - 1 && page <= salesCurrentPage + 1)
                          ) {
                            return (
                              <button
                                key={page}
                                className={`pagination-number ${salesCurrentPage === page ? 'active' : ''}`}
                                onClick={() => handleSalesPageChange(page)}
                              >
                                {page}
                              </button>
                            );
                          } else if (page === salesCurrentPage - 2 || page === salesCurrentPage + 2) {
                            return <span key={page} className="pagination-ellipsis">...</span>;
                          }
                          return null;
                        })}
                      </div>
                      <button
                        className="pagination-btn"
                        onClick={() => handleSalesPageChange(salesCurrentPage + 1)}
                        disabled={salesCurrentPage === salesTotalPages}
                      >
                        Next →
                      </button>
                    </div>
                  </div>
                )}
              </>
            ) : bills.length > 0 ? (
              <div className="empty-state-wrapper">
                <span className="empty-icon">🔍</span>
                <p className="empty-state">No sales match your search</p>
                <p className="empty-subtitle">Try a different search term</p>
                <button onClick={clearSearch} className="btn-filter-clear-inline">
                  Clear Search
                </button>
              </div>
            ) : (
              <div className="empty-state-wrapper">
                <span className="empty-icon">📊</span>
                <p className="empty-state">No sales recorded yet</p>
                <p className="empty-subtitle">Sales will appear here once bills are created</p>
              </div>
            )}
          </div>
        </div>
        )}

        {/* Inventory Section */}
        {activeTab === 'inventory' && (
          <div className="dashboard-section inventory-section">
            <div className="section-header-enhanced">
            <div className="section-title-wrapper">
              <span className="section-icon">📦</span>
              <h3>Inventory Items</h3>
              <span className="sales-count">({filteredInventory.length})</span>
            </div>
            <div className="section-header-actions">
              {!loadingBills && filteredInventory.length > 0 && (
                <div className="section-summary">
                  <span className="summary-item">
                    Total Value: ₹{filteredInventory.reduce((sum, item) => {
                      const stock = item.totalSqftStock || item.total_sqft_stock || item.quantity || 0;
                      const price = item.pricePerSqft || item.price_per_sqft || item.pricePerUnit || item.unitPrice || 0;
                      return sum + (stock * price);
                    }, 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
              )}
              {!loadingBills && filteredInventory.length > 0 && (
                <button className="btn btn-export" onClick={exportInventoryToCSV} title="Export to CSV">
                  📥 Export CSV
                </button>
              )}
              <button className="btn btn-primary" onClick={() => setShowAddInventory(true)}>
                + Add Inventory
              </button>
            </div>
          </div>

          {/* Search Section */}
          {inventory.length > 0 && (
            <div className="search-section">
              <div className="search-wrapper">
                <span className="search-icon">🔍</span>
                <input
                  type="text"
                  value={inventorySearchQuery}
                  onChange={handleInventorySearchChange}
                  placeholder="Search by product name, type, color, price, stock, or slug..."
                  className="search-input"
                />
                {inventorySearchQuery && (
                  <button
                    type="button"
                    onClick={clearInventorySearch}
                    className="search-clear-btn"
                    title="Clear search"
                  >
                    ×
                  </button>
                )}
              </div>
            </div>
          )}

          <div className="section-content">
            {inventory.length > 0 ? (
              filteredInventory.length > 0 ? (
                <>
                  {/* Desktop Table View */}
                  <div className="sales-table-wrapper">
                      <table className="data-table inventory-table">
                        <thead>
                          <tr>
                            <th className="sortable" onClick={() => handleSort('name', true)}>
                              Product Name
                              {inventorySortConfig.key === 'name' && (
                                <span className="sort-icon">{inventorySortConfig.direction === 'asc' ? ' ↑' : ' ↓'}</span>
                              )}
                            </th>
                            <th className="sortable" onClick={() => handleSort('productType', true)}>
                              Product Type
                              {inventorySortConfig.key === 'productType' && (
                                <span className="sort-icon">{inventorySortConfig.direction === 'asc' ? ' ↑' : ' ↓'}</span>
                              )}
                            </th>
                            <th className="sortable" onClick={() => handleSort('pricePerSqft', true)}>
                              Price/Unit
                              {inventorySortConfig.key === 'pricePerSqft' && (
                                <span className="sort-icon">{inventorySortConfig.direction === 'asc' ? ' ↑' : ' ↓'}</span>
                              )}
                            </th>
                            <th className="sortable" onClick={() => handleSort('totalSqftStock', true)}>
                              Quantity/Stock
                              {inventorySortConfig.key === 'totalSqftStock' && (
                                <span className="sort-icon">{inventorySortConfig.direction === 'asc' ? ' ↑' : ' ↓'}</span>
                              )}
                            </th>
                            <th>Color</th>
                            <th className="total-col">Total Value</th>
                            <th>Actions</th>
                          </tr>
                        </thead>
                      <tbody>
                        {paginatedInventory.map((item, index) => {
                        const pricePerSqft = item.pricePerSqft || item.price_per_sqft || item.pricePerUnit || item.unitPrice || 0;
                        const totalSqftStock = item.totalSqftStock || item.total_sqft_stock || item.quantity || 0;
                        const productType = item.productType || item.product_type || item.category || '-';
                        const primaryImageUrl = item.primaryImageUrl || item.primary_image_url;
                        const totalValue = totalSqftStock * pricePerSqft;
                        const isLowStock = totalSqftStock < 10;
                        
                        return (
                          <tr key={`inventory-${item.id || index}`} className={isLowStock ? 'low-stock-row' : ''}>
                            <td className="product-name-cell">
                              {primaryImageUrl ? (
                                <div className="product-with-image">
                                  <img 
                                    src={primaryImageUrl} 
                                    alt={item.name} 
                                    className="product-thumbnail" 
                                    onError={(e) => { e.target.style.display = 'none'; }} 
                                  />
                                  <span className="product-name">{item.name}</span>
                                </div>
                              ) : (
                                <span className="product-name">{item.name}</span>
                              )}
                            </td>
                            <td>
                              <span className="product-type-badge">{productType}</span>
                            </td>
                            <td className="amount-cell">₹{pricePerSqft.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                            <td className={isLowStock ? 'low-stock-cell' : 'stock-cell'}>
                              {isLowStock && <span className="low-stock-indicator">⚠️ </span>}
                              {totalSqftStock.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>
                            <td>
                              {item.color ? (
                                <span className="color-badge">{item.color}</span>
                              ) : (
                                '-'
                              )}
                            </td>
                            <td className="total-cell total-col">
                              <span className="total-amount">₹{totalValue.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                            </td>
                            <td className="actions-cell">
                              <button
                                className="btn-icon btn-edit"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleEditInventory(item);
                                }}
                                title="Edit"
                              >
                                ✏️
                              </button>
                              <button
                                className="btn-icon btn-delete"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeleteInventory(item);
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

                  {/* Mobile Card View for Inventory */}
                  <div className="mobile-inventory-cards">
                    {paginatedInventory.map((item, index) => {
                      const pricePerSqft = item.pricePerSqft || item.price_per_sqft || item.pricePerUnit || item.unitPrice || 0;
                      const totalSqftStock = item.totalSqftStock || item.total_sqft_stock || item.quantity || 0;
                      const productType = item.productType || item.product_type || item.category || '-';
                      const primaryImageUrl = item.primaryImageUrl || item.primary_image_url;
                      const totalValue = totalSqftStock * pricePerSqft;
                      const isLowStock = totalSqftStock < 10;
                      
                      return (
                        <div 
                          key={`inventory-card-${item.id || index}`} 
                          className={`inventory-card ${isLowStock ? 'low-stock-card' : ''}`}
                        >
                          <div className="inventory-card-header">
                            {primaryImageUrl && (
                              <img 
                                src={primaryImageUrl} 
                                alt={item.name} 
                                className="inventory-card-image" 
                                onError={(e) => { e.target.style.display = 'none'; }} 
                              />
                            )}
                            <div className="inventory-card-title-section">
                              <h4 className="inventory-card-title">{item.name}</h4>
                              <span className="product-type-badge">{productType}</span>
                            </div>
                            {isLowStock && <span className="low-stock-badge">⚠️ Low Stock</span>}
                          </div>
                          <div className="inventory-card-body">
                            <div className="inventory-card-row">
                              <span className="inventory-card-label">Price/Unit:</span>
                              <span className="inventory-card-value">₹{pricePerSqft.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                            </div>
                            <div className="inventory-card-row">
                              <span className="inventory-card-label">Quantity/Stock:</span>
                              <span className={`inventory-card-value ${isLowStock ? 'low-stock-value' : ''}`}>
                                {totalSqftStock.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </span>
                            </div>
                            {item.color && (
                              <div className="inventory-card-row">
                                <span className="inventory-card-label">Color:</span>
                                <span className="color-badge">{item.color}</span>
                              </div>
                            )}
                            <div className="inventory-card-total">
                              <span className="inventory-card-label">Total Value:</span>
                              <span className="inventory-card-value total-value">₹{totalValue.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                            </div>
                          </div>
                          <div className="inventory-card-actions">
                            <button
                              className="btn btn-primary btn-sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleEditInventory(item);
                              }}
                            >
                              ✏️ Edit
                            </button>
                            <button
                              className="btn btn-secondary btn-sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteInventory(item);
                              }}
                            >
                              🗑️ Delete
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {/* Pagination Controls for Inventory */}
                  {inventoryTotalPages > 1 && (
                    <div className="pagination-wrapper">
                      <div className="pagination-info">
                        Showing {inventoryStartIndex + 1} - {Math.min(inventoryEndIndex, filteredInventory.length)} of {filteredInventory.length} items
                      </div>
                      <div className="pagination-controls">
                        <button
                          className="pagination-btn"
                          onClick={() => handleInventoryPageChange(inventoryCurrentPage - 1)}
                          disabled={inventoryCurrentPage === 1}
                        >
                          ← Previous
                        </button>
                        <div className="pagination-numbers">
                          {Array.from({ length: inventoryTotalPages }, (_, i) => i + 1).map((page) => {
                            if (
                              page === 1 ||
                              page === inventoryTotalPages ||
                              (page >= inventoryCurrentPage - 1 && page <= inventoryCurrentPage + 1)
                            ) {
                              return (
                                <button
                                  key={page}
                                  className={`pagination-number ${inventoryCurrentPage === page ? 'active' : ''}`}
                                  onClick={() => handleInventoryPageChange(page)}
                                >
                                  {page}
                                </button>
                              );
                            } else if (page === inventoryCurrentPage - 2 || page === inventoryCurrentPage + 2) {
                              return <span key={page} className="pagination-ellipsis">...</span>;
                            }
                            return null;
                          })}
                        </div>
                        <button
                          className="pagination-btn"
                          onClick={() => handleInventoryPageChange(inventoryCurrentPage + 1)}
                          disabled={inventoryCurrentPage === inventoryTotalPages}
                        >
                          Next →
                        </button>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="empty-state-wrapper">
                  <span className="empty-icon">🔍</span>
                  <p className="empty-state">No inventory items match your search</p>
                  <p className="empty-subtitle">Try a different search term</p>
                  <button onClick={clearInventorySearch} className="btn-filter-clear-inline">
                    Clear Search
                  </button>
                </div>
              )
            ) : (
              <div className="empty-state-wrapper">
                <span className="empty-icon">📦</span>
                <p className="empty-state">No inventory items yet</p>
                <p className="empty-subtitle">Click "Add Inventory" to add your first product</p>
              </div>
            )}
          </div>
        </div>
        )}

        {/* Expenses Section */}
        {activeTab === 'expenses' && (
          <div className="dashboard-section expenses-section">
            <div className="section-content">
              <Expenses hideHeader={true} hideStats={true} showForm={expensesFormOpen} onFormClose={() => setExpensesFormOpen(false)} onFormOpen={() => setExpensesFormOpen(true)} />
            </div>
          </div>
        )}

        {/* Home Screen Management Section */}
        {activeTab === 'home-screen' && (
          <HomeScreenManagement />
        )}
      </div>

      {/* Low Stock Alert - Only show when not in expenses section */}
      {activeTab !== 'expenses' && lowStockItems.length > 0 && (
        <div className="dashboard-sections">
          <div className="dashboard-section">
            <h3>Low Stock Alert</h3>
            <div className="low-stock-card">
              <p>The following items are running low on stock:</p>
              <ul className="low-stock-list">
                {lowStockItems.map((item, index) => {
                  const stock = item.totalSqftStock || item.total_sqft_stock || item.quantity || 0;
                  return (
                    <li key={`lowstock-${item.id || index}`}>
                      <strong>{item.name}</strong> - Only {stock.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} units remaining
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Add Inventory Modal */}
      {showAddInventory && (
        <div className="modal-overlay" onClick={() => setShowAddInventory(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Add New Inventory Item</h3>
              <button className="modal-close" onClick={() => setShowAddInventory(false)}>
                ×
              </button>
            </div>
            <div className="modal-body">
              <form onSubmit={handleAddInventory}>
                <div className="form-group">
                  <label>Product Name *</label>
                  <input
                    type="text"
                    name="name"
                    value={formData.name}
                    onChange={handleInputChange}
                    maxLength="200"
                    placeholder="e.g., Carrara White Marble"
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Slug *</label>
                  <input
                    type="text"
                    name="slug"
                    value={formData.slug}
                    onChange={handleInputChange}
                    maxLength="250"
                    placeholder="e.g., carrara-white-marble"
                    required
                  />
                  <small className="form-help">URL-friendly version (auto-generated from product name)</small>
                </div>
                <div className="form-group">
                  <label>Product Type *</label>
                  <select
                    name="product_type"
                    value={formData.product_type}
                    onChange={handleInputChange}
                    required
                  >
                    <option value="">Select Product Type</option>
                    <option value="table">Table</option>
                    <option value="chair">Chair</option>
                    <option value="marble">Marble</option>
                    <option value="tiles">Tiles</option>
                    <option value="counter top">Counter Top</option>
                    <option value="granite">Granite</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Price Per Unit (₹) *</label>
                    <input
                      type="number"
                      name="price_per_sqft"
                      value={formData.price_per_sqft}
                      onChange={handleInputChange}
                      min="0"
                      step="0.01"
                      placeholder="e.g., 180.00"
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>Quantity/Stock *</label>
                    <input
                      type="number"
                      name="total_sqft_stock"
                      value={formData.total_sqft_stock}
                      onChange={handleInputChange}
                      min="0"
                      step="0.01"
                      placeholder="e.g., 150.00"
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>Unit</label>
                    <input
                      type="text"
                      name="unit"
                      value={formData.unit}
                      onChange={handleInputChange}
                      maxLength="20"
                      placeholder="e.g., piece, sqr ft, kg, meter"
                    />
                  </div>
                </div>
                <div className="form-group">
                  <label>Primary Image URL *</label>
                  <input
                    type="url"
                    name="primary_image_url"
                    value={formData.primary_image_url}
                    onChange={handleInputChange}
                    maxLength="500"
                    placeholder="https://example.com/image.jpg"
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Color</label>
                  <input
                    type="text"
                    name="color"
                    value={formData.color}
                    onChange={handleInputChange}
                    maxLength="50"
                    placeholder="e.g., white, black, beige, multi"
                  />
                </div>
                <div className="form-actions">
                  <button type="submit" className="btn btn-primary">
                    Add Item
                  </button>
                  <button type="button" className="btn btn-secondary" onClick={() => setShowAddInventory(false)}>
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Bill Items Modal */}
      {showBillItems && (
        <div className="modal-overlay" onClick={() => setShowBillItems(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Bill Items - {selectedBill?.billNumber}</h3>
              <button className="modal-close" onClick={() => setShowBillItems(false)}>×</button>
            </div>
            <div className="modal-body">
              {selectedBill && (
                <div className="bill-details-summary">
                  <div className="bill-info-row">
                    <span className="bill-info-label">Bill Date:</span>
                    <span className="bill-info-value">{formatBillDate(selectedBill.billDate)}</span>
                  </div>
                  <div className="bill-info-row">
                    <span className="bill-info-label">Customer Mobile:</span>
                    <span className="bill-info-value">{selectedBill.customerMobileNumber || '-'}</span>
                  </div>
                  <div className="bill-info-row">
                    <span className="bill-info-label">Bill Type:</span>
                    <span className={`gst-badge ${selectedBill.billType === 'GST' ? 'gst-paid' : 'gst-not-paid'}`}>
                      {selectedBill.billType === 'GST' ? '✓ GST' : 'NON-GST'}
                    </span>
                  </div>
                  <div className="bill-info-row">
                    <span className="bill-info-label">Total Sqft:</span>
                    <span className="bill-info-value">{selectedBill.totalSqft?.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} sqft</span>
                  </div>
                </div>
              )}

              {loadingBillItems ? (
                <div className="loading-state">
                  <div className="loading-spinner"></div>
                  <p>Loading bill items...</p>
                </div>
              ) : billItems.length > 0 ? (
                <div className="bill-items-table-wrapper">
                  <table className="data-table bill-items-table">
                    <thead>
                      <tr>
                        <th>Item Name</th>
                        <th>Category</th>
                        <th>Quantity</th>
                        <th>Price Per Unit</th>
                        <th className="total-col">Subtotal</th>
                      </tr>
                    </thead>
                    <tbody>
                      {billItems.map((item, index) => {
                        const quantity = Number(parseFloat(item?.quantity) || 0) || 0;
                        const pricePerUnit = Number(parseFloat(item?.pricePerUnit || item?.price_per_unit || item?.unitPrice || item?.price) || 0) || 0;
                        const subtotal = Number((quantity * pricePerUnit) || 0) || 0;
                        
                        const safeQuantity = isNaN(quantity) ? 0 : quantity;
                        const safePrice = isNaN(pricePerUnit) ? 0 : pricePerUnit;
                        const safeSubtotal = isNaN(subtotal) ? 0 : subtotal;
                        
                        return (
                          <tr key={index}>
                            <td className="item-name-cell">{item?.itemName || item?.name || '-'}</td>
                            <td>
                              <span className="product-type-badge">{item?.category || '-'}</span>
                            </td>
                            <td className="quantity-cell">{safeQuantity.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                            <td className="amount-cell">₹{safePrice.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                            <td className="total-cell total-col">
                              <span className="total-amount">₹{safeSubtotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    {selectedBill && (
                      <tfoot>
                        <tr className="bill-totals-row">
                          <td colSpan="4" className="totals-label">Subtotal:</td>
                          <td className="total-cell total-col">₹{selectedBill.subtotal?.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                        </tr>
                        {selectedBill.taxAmount > 0 && (
                          <tr className="bill-totals-row">
                            <td colSpan="4" className="totals-label">Tax ({selectedBill.taxPercentage || 0}%):</td>
                            <td className="total-cell total-col">₹{selectedBill.taxAmount?.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                          </tr>
                        )}
                        {selectedBill.discountAmount > 0 && (
                          <tr className="bill-totals-row">
                            <td colSpan="4" className="totals-label">Discount:</td>
                            <td className="total-cell total-col discount-amount">-₹{selectedBill.discountAmount?.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                          </tr>
                        )}
                        <tr className="bill-totals-row final-total">
                          <td colSpan="4" className="totals-label">Total Amount:</td>
                          <td className="total-cell total-col">
                            <span className="total-amount">₹{selectedBill.totalAmount?.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                          </td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              ) : (
                <div className="empty-state-wrapper">
                  <span className="empty-icon">📦</span>
                  <p className="empty-state">No items found in this bill</p>
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-primary" onClick={printBill} title="Print Bill">
                🖨️ Print Bill
              </button>
              <button className="btn btn-secondary" onClick={() => setShowBillItems(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Inventory Modal */}
      {showEditInventory && (
        <div className="modal-overlay" onClick={() => {
          setShowEditInventory(false);
          setEditingInventoryItem(null);
          setFormData({
            name: '',
            slug: '',
            product_type: '',
            price_per_sqft: '',
            total_sqft_stock: '',
            primary_image_url: '',
            color: ''
          });
        }}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Edit Inventory Item</h3>
              <button className="modal-close" onClick={() => {
                setShowEditInventory(false);
                setEditingInventoryItem(null);
                setFormData({
                  name: '',
                  slug: '',
                  product_type: '',
                  price_per_sqft: '',
                  total_sqft_stock: '',
                  primary_image_url: '',
                  color: ''
                });
              }}>×</button>
            </div>
            <div className="modal-body">
              <form onSubmit={handleUpdateInventory}>
                <div className="form-group">
                  <label>Product Name *</label>
                  <input
                    type="text"
                    name="name"
                    value={formData.name}
                    onChange={handleInputChange}
                    maxLength="200"
                    placeholder="e.g., Carrara White Marble"
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Slug *</label>
                  <input
                    type="text"
                    name="slug"
                    value={formData.slug}
                    onChange={handleInputChange}
                    maxLength="250"
                    placeholder="e.g., carrara-white-marble"
                    required
                  />
                  <small className="form-help">URL-friendly version (auto-generated from product name)</small>
                </div>
                <div className="form-group">
                  <label>Product Type *</label>
                  <select
                    name="product_type"
                    value={formData.product_type}
                    onChange={handleInputChange}
                    required
                  >
                    <option value="">Select Product Type</option>
                    <option value="table">Table</option>
                    <option value="chair">Chair</option>
                    <option value="marble">Marble</option>
                    <option value="tiles">Tiles</option>
                    <option value="counter top">Counter Top</option>
                    <option value="granite">Granite</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Price Per Unit (₹) *</label>
                    <input
                      type="number"
                      name="price_per_sqft"
                      value={formData.price_per_sqft}
                      onChange={handleInputChange}
                      min="0"
                      step="0.01"
                      placeholder="e.g., 180.00"
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>Quantity/Stock *</label>
                    <input
                      type="number"
                      name="total_sqft_stock"
                      value={formData.total_sqft_stock}
                      onChange={handleInputChange}
                      min="0"
                      step="0.01"
                      placeholder="e.g., 150.00"
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>Unit</label>
                    <input
                      type="text"
                      name="unit"
                      value={formData.unit}
                      onChange={handleInputChange}
                      maxLength="20"
                      placeholder="e.g., piece, sqr ft, kg, meter"
                    />
                  </div>
                </div>
                <div className="form-group">
                  <label>Primary Image URL *</label>
                  <input
                    type="url"
                    name="primary_image_url"
                    value={formData.primary_image_url}
                    onChange={handleInputChange}
                    maxLength="500"
                    placeholder="https://example.com/image.jpg"
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Color</label>
                  <input
                    type="text"
                    name="color"
                    value={formData.color}
                    onChange={handleInputChange}
                    maxLength="50"
                    placeholder="e.g., white, black, beige, multi"
                  />
                </div>
                <div className="form-actions">
                  <button type="submit" className="btn btn-primary">
                    Update Item
                  </button>
                  <button type="button" className="btn btn-secondary" onClick={() => {
                    setShowEditInventory(false);
                    setEditingInventoryItem(null);
                    setFormData({
                      name: '',
                      slug: '',
                      product_type: '',
                      price_per_sqft: '',
                      total_sqft_stock: '',
                      primary_image_url: '',
                      color: ''
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

      {/* Toast Notification */}
      {toast && (
        <div className={`toast toast-${toast.type}`}>
          <span className="toast-message">{toast.message}</span>
          <button className="toast-close" onClick={() => setToast(null)}>×</button>
        </div>
      )}

      {/* Invoice Modal */}
      {selectedBillForInvoice && (
        <Invoice 
          bill={selectedBillForInvoice} 
          onClose={() => setSelectedBillForInvoice(null)} 
        />
      )}
    </div>
  );
};

export default Dashboard;
