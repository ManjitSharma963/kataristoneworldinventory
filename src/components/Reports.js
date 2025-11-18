import React, { useState, useEffect, useMemo } from 'react';
import { fetchExpenses as apiFetchExpenses } from '../utils/api';
import { API_BASE_URL } from '../config/api';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import Loading from './Loading';
import './Reports.css';

const Reports = () => {
  const [bills, setBills] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [reportType, setReportType] = useState('profit-loss');
  const [dateRange, setDateRange] = useState({
    start: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0],
    end: new Date().toISOString().split('T')[0]
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      // Load bills
      const token = localStorage.getItem('authToken');
      const billsHeaders = {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      };
      if (token) {
        billsHeaders['Authorization'] = `Bearer ${token}`;
      }
      const billsResponse = await fetch(`${API_BASE_URL}/bills`, {
        method: 'GET',
        headers: billsHeaders
      });
      if (billsResponse.ok) {
        const billsData = await billsResponse.json();
        setBills(billsData || []);
      }

      // Load expenses
      const expensesData = await apiFetchExpenses();
      setExpenses(expensesData || []);

      // Load inventory
      const inventoryHeaders = {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      };
      if (token) {
        inventoryHeaders['Authorization'] = `Bearer ${token}`;
      }
      const inventoryResponse = await fetch(`${API_BASE_URL}/inventory`, {
        method: 'GET',
        headers: inventoryHeaders
      });
      if (inventoryResponse.ok) {
        const inventoryData = await inventoryResponse.json();
        setInventory(inventoryData || []);
      }
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  // Filter data by date range
  const filteredBills = useMemo(() => {
    if (!dateRange.start && !dateRange.end) return bills;
    return bills.filter(bill => {
      const billDate = new Date(bill.date || bill.createdAt);
      if (dateRange.start && billDate < new Date(dateRange.start)) return false;
      if (dateRange.end) {
        const endDate = new Date(dateRange.end);
        endDate.setHours(23, 59, 59, 999);
        if (billDate > endDate) return false;
      }
      return true;
    });
  }, [bills, dateRange]);

  const filteredExpenses = useMemo(() => {
    if (!dateRange.start && !dateRange.end) return expenses;
    return expenses.filter(exp => {
      const expDate = new Date(exp.date || exp.createdAt);
      if (dateRange.start && expDate < new Date(dateRange.start)) return false;
      if (dateRange.end) {
        const endDate = new Date(dateRange.end);
        endDate.setHours(23, 59, 59, 999);
        if (expDate > endDate) return false;
      }
      return true;
    });
  }, [expenses, dateRange]);

  // Calculate Profit & Loss
  const profitLossData = useMemo(() => {
    const totalRevenue = filteredBills.reduce((sum, bill) => sum + (parseFloat(bill.totalAmount) || 0), 0);
    const totalExpenses = filteredExpenses.reduce((sum, exp) => sum + (parseFloat(exp.amount) || 0), 0);
    const netProfit = totalRevenue - totalExpenses;
    const profitMargin = totalRevenue > 0 ? ((netProfit / totalRevenue) * 100).toFixed(2) : 0;

    return {
      totalRevenue,
      totalExpenses,
      netProfit,
      profitMargin
    };
  }, [filteredBills, filteredExpenses]);

  // GST Report Data
  const gstReportData = useMemo(() => {
    const gstBills = filteredBills.filter(bill => bill.billType === 'GST');
    const gstCollected = gstBills.reduce((sum, bill) => sum + (parseFloat(bill.taxAmount) || 0), 0);
    const gstSales = gstBills.reduce((sum, bill) => sum + (parseFloat(bill.totalAmount) || 0), 0);
    const nonGstSales = filteredBills.filter(bill => bill.billType !== 'GST')
      .reduce((sum, bill) => sum + (parseFloat(bill.totalAmount) || 0), 0);

    return {
      gstBills: gstBills.length,
      gstCollected,
      gstSales,
      nonGstSales,
      totalSales: gstSales + nonGstSales
    };
  }, [filteredBills]);

  // Expense Report by Category
  const expenseCategoryData = useMemo(() => {
    const categoryMap = new Map();
    filteredExpenses.forEach(exp => {
      const category = exp.category || exp.type || 'Other';
      const amount = parseFloat(exp.amount) || 0;
      if (!categoryMap.has(category)) {
        categoryMap.set(category, { name: category, value: 0, count: 0 });
      }
      const data = categoryMap.get(category);
      data.value += amount;
      data.count += 1;
    });
    return Array.from(categoryMap.values()).sort((a, b) => b.value - a.value);
  }, [filteredExpenses]);

  // Sales Report Data
  const salesReportData = useMemo(() => {
    const dailySales = {};
    filteredBills.forEach(bill => {
      const date = new Date(bill.date || bill.createdAt).toISOString().split('T')[0];
      if (!dailySales[date]) {
        dailySales[date] = { date, sales: 0, count: 0 };
      }
      dailySales[date].sales += parseFloat(bill.totalAmount) || 0;
      dailySales[date].count += 1;
    });
    return Object.values(dailySales).sort((a, b) => a.date.localeCompare(b.date));
  }, [filteredBills]);

  const COLORS = ['#dc3545', '#667eea', '#17a2b8', '#28a745', '#ffc107', '#fd7e14', '#6f42c1', '#e83e8c'];

  if (loading) {
    return <Loading message="Loading reports..." />;
  }

  return (
    <div className="reports-container">
      <div className="reports-header">
        <h2>Financial Reports</h2>
        <div className="reports-actions">
          <button className="btn btn-secondary" onClick={() => window.print()}>
            🖨️ Print Report
          </button>
        </div>
      </div>

      {/* Date Range Filter */}
      <div className="report-filters">
        <div className="form-row">
          <div className="form-group">
            <label>Start Date</label>
            <input
              type="date"
              value={dateRange.start}
              onChange={(e) => setDateRange({ ...dateRange, start: e.target.value })}
            />
          </div>
          <div className="form-group">
            <label>End Date</label>
            <input
              type="date"
              value={dateRange.end}
              onChange={(e) => setDateRange({ ...dateRange, end: e.target.value })}
            />
          </div>
          <div className="form-group">
            <label>&nbsp;</label>
            <button className="btn btn-secondary" onClick={() => setDateRange({ start: '', end: '' })}>
              Clear Filter
            </button>
          </div>
        </div>
      </div>

      {/* Report Type Selector */}
      <div className="report-type-selector">
        <button
          className={`report-type-btn ${reportType === 'profit-loss' ? 'active' : ''}`}
          onClick={() => setReportType('profit-loss')}
        >
          Profit & Loss
        </button>
        <button
          className={`report-type-btn ${reportType === 'gst' ? 'active' : ''}`}
          onClick={() => setReportType('gst')}
        >
          GST Report
        </button>
        <button
          className={`report-type-btn ${reportType === 'sales' ? 'active' : ''}`}
          onClick={() => setReportType('sales')}
        >
          Sales Report
        </button>
        <button
          className={`report-type-btn ${reportType === 'expenses' ? 'active' : ''}`}
          onClick={() => setReportType('expenses')}
        >
          Expense Report
        </button>
      </div>

      {/* Profit & Loss Report */}
      {reportType === 'profit-loss' && (
        <div className="report-section">
          <h3>Profit & Loss Statement</h3>
          <div className="report-card">
            <div className="report-row">
              <span className="report-label">Total Revenue (Sales):</span>
              <span className="report-value positive">
                ₹{(Number(profitLossData?.totalRevenue || 0) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
            <div className="report-row">
              <span className="report-label">Total Expenses:</span>
              <span className="report-value negative">
                ₹{(Number(profitLossData?.totalExpenses || 0) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
            <div className="report-row total">
              <span className="report-label">Net Profit/Loss:</span>
              <span className={`report-value ${profitLossData.netProfit >= 0 ? 'positive' : 'negative'}`}>
                ₹{(Number(profitLossData?.netProfit || 0) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
            <div className="report-row">
              <span className="report-label">Profit Margin:</span>
              <span className={`report-value ${profitLossData.profitMargin >= 0 ? 'positive' : 'negative'}`}>
                {profitLossData.profitMargin}%
              </span>
            </div>
          </div>
        </div>
      )}

      {/* GST Report */}
      {reportType === 'gst' && (
        <div className="report-section">
          <h3>GST Report</h3>
          <div className="report-card">
            <div className="report-row">
              <span className="report-label">Total GST Bills:</span>
              <span className="report-value">{gstReportData.gstBills}</span>
            </div>
            <div className="report-row">
              <span className="report-label">GST Collected:</span>
              <span className="report-value positive">
                ₹{(Number(gstReportData?.gstCollected || 0) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
            <div className="report-row">
              <span className="report-label">GST Sales:</span>
              <span className="report-value">
                ₹{(Number(gstReportData?.gstSales || 0) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
            <div className="report-row">
              <span className="report-label">Non-GST Sales:</span>
              <span className="report-value">
                ₹{(Number(gstReportData?.nonGstSales || 0) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
            <div className="report-row total">
              <span className="report-label">Total Sales:</span>
              <span className="report-value positive">
                ₹{(Number(gstReportData?.totalSales || 0) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Sales Report */}
      {reportType === 'sales' && (
        <div className="report-section">
          <h3>Sales Report</h3>
          <div className="chart-card">
            <div className="chart-container">
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={salesReportData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" angle={-45} textAnchor="end" height={80} />
                  <YAxis />
                  <Tooltip 
                    formatter={(value) => {
                      const num = Number(value) || 0;
                      return `₹${num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
                    }}
                  />
                  <Legend />
                  <Bar dataKey="sales" fill="#667eea" name="Sales (₹)" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {/* Expense Report */}
      {reportType === 'expenses' && (
        <div className="report-section">
          <h3>Expense Report by Category</h3>
          <div className="chart-card">
            <div className="chart-container">
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={expenseCategoryData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                    outerRadius={100}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {expenseCategoryData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip 
                    formatter={(value) => {
                      const num = Number(value) || 0;
                      return `₹${num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
                    }}
                  />
                  <Legend 
                    formatter={(value, entry) => {
                      const num = Number(entry?.payload?.value) || 0;
                      return `${entry?.payload?.name || value}: ₹${num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="report-card">
            <h4>Expense Summary</h4>
            {expenseCategoryData.map((item, index) => (
              <div key={index} className="report-row">
                <span className="report-label">{item.name}:</span>
                <span className="report-value negative">
                  ₹{(Number(item?.value || 0) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ({item?.count || 0} transactions)
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default Reports;

