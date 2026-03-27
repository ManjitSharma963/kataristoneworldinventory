import React, { useState, useEffect, useMemo } from 'react';
import { API_BASE_URL } from '../config/api';
import {
  handleApiResponse,
  downloadBillPDF,
  fetchSalesPaymentModeSummary,
  addBillPayment,
  deleteBillPayment
} from '../utils/api';
import { DataTable } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { InputText } from 'primereact/inputtext';
import { Dropdown } from 'primereact/dropdown';
import { Calendar } from 'primereact/calendar';
import { Button } from 'primereact/button';
import { Tag } from 'primereact/tag';
import { Dialog } from 'primereact/dialog';
import InlineToast from './InlineToast';
import useDebouncedValue from '../utils/useDebouncedValue';
import './Sales.css';

const PAYMENT_MODE_LABELS = {
  UPI: 'UPI',
  CASH: 'CASH',
  BANK_TRANSFER: 'BANK TRANSFER',
  CHEQUE: 'CHEQUE',
  NETBANKING: 'BANK TRANSFER',
  CREDIT: 'CREDIT'
};

const formatPaymentModeLabel = (mode) => {
  if (!mode) return '—';
  const key = String(mode).toUpperCase().replace(/\s+/g, '_');
  return PAYMENT_MODE_LABELS[key] || mode;
};

const splitPaymentSummaryLines = (raw) => {
  const s = String(raw || '').trim();
  if (!s || s === '-' || s === '—') return [];
  // Common legacy formats:
  // - "CASH_₹5000.00, UPI_₹2000.00 | DUE: ₹1500.00"
  // - "CASH,UPI" (simple)
  const normalized = s.replace(/_/g, ' ').replace(/\s*\|\s*/g, ' | ');
  const parts = normalized
    .split('|')
    .flatMap((p) => String(p).split(','))
    .map((p) => p.trim())
    .filter(Boolean);
  // Keep "DUE:" or "DUE" at the bottom if present.
  const due = parts.filter((p) => /^DUE\b/i.test(p));
  const rest = parts.filter((p) => !/^DUE\b/i.test(p));
  return [...rest, ...due];
};

/** Normalize stored/API values for banding (legacy NETBANKING → bank transfer) */
const normalizePaymentModeKey = (mode) => {
  const m = String(mode || '').toUpperCase().replace(/\s+/g, '_').trim();
  if (m === 'NETBANKING' || m === 'NET_BANKING') return 'BANK_TRANSFER';
  return m;
};

/** Group payment modes for header totals */
const getPaymentBand = (mode) => {
  const m = normalizePaymentModeKey(mode);
  if (m === 'UPI') return 'UPI';
  if (m === 'CASH') return 'CASH';
  if (m === 'BANK_TRANSFER') return 'BANK_TRANSFER';
  if (m === 'CHEQUE') return 'CHEQUE';
  return 'OTHER';
};

const normalizeSearchText = (value) =>
  String(value ?? '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

const Sales = () => {
  const [sales, setSales] = useState([]);
  const [loading, setLoading] = useState(true);
  const today = new Date();
  const [dateFrom, setDateFrom] = useState(today);
  const [dateTo, setDateTo] = useState(today);
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearchQuery = useDebouncedValue(searchQuery, 250);
  const [billTypeFilter, setBillTypeFilter] = useState('ALL');
  const [paymentModeFilter, setPaymentModeFilter] = useState('ALL');
  const [toast, setToast] = useState({ message: '', type: 'success' });
  const [paymentBandTotals, setPaymentBandTotals] = useState({
    upi: 0,
    cash: 0,
    bankTransfer: 0,
    cheque: 0,
    other: 0
  });

  const [isBillPopupVisible, setBillPopupVisible] = useState(false);
  const [selectedBill, setSelectedBill] = useState(null);
  const [paymentAddAmount, setPaymentAddAmount] = useState('');
  const [paymentAddMode, setPaymentAddMode] = useState('CASH');
  const [paymentAddDate, setPaymentAddDate] = useState(() => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  });
  const [paymentSubmitting, setPaymentSubmitting] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    const toIso = (d) => {
      const x = d instanceof Date ? d : (d ? new Date(d) : null);
      if (!x || Number.isNaN(x.getTime())) return null;
      const y = x.getFullYear();
      const m = String(x.getMonth() + 1).padStart(2, '0');
      const day = String(x.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    };
    const today = toIso(new Date());
    const fromIso = toIso(dateFrom) || today;
    const toIsoDate = toIso(dateTo) || fromIso;
    fetchSalesPaymentModeSummary({ date: fromIso, dateTo: toIsoDate })
      .then((res) => {
        setPaymentBandTotals({
          upi: Number(res?.upi) || 0,
          cash: Number(res?.cash) || 0,
          bankTransfer: Number(res?.bankTransfer) || 0,
          cheque: Number(res?.cheque) || 0,
          other: Number(res?.other) || 0
        });
      })
      .catch((e) => {
        console.error('Failed to load payment mode totals', e);
      });
  }, [dateFrom, dateTo]);

  const loadData = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('authToken');
      const headers = {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      
      const billsResponse = await fetch(`${API_BASE_URL}/bills`, {
        method: 'GET',
        headers: headers
      });
      
      if (billsResponse.status === 401) {
        await handleApiResponse(billsResponse);
        return;
      }
      
      if (billsResponse.ok) {
        const billsData = await billsResponse.json();
        const allBills = Array.isArray(billsData) ? billsData : [];
        setSales(allBills);
      } else {
        console.error('Failed to fetch bills:', billsResponse.status);
        setSales([]);
      }
      
    } catch (error) {
      console.error('Error loading sales data:', error);
      setSales([]);
    } finally {
      setLoading(false);
    }
  };

  // Prepare data for DataTable
  const prepareSalesData = useMemo(() => {
    return sales.map(sale => {
      const billId = sale.id || sale.billId;
      const billNumber = sale.billNumber || sale.billId || billId || '-';
      const billDate = sale.billDate || sale.createdAt || sale.date;
      const customerNumber = sale.customerMobileNumber || sale.customerNumber || sale.customerPhone || '-';
      const items = sale.items || sale.billItems || [];
      
      // Normalize billType
      let billType = sale.billType || (sale.gstPaid ? 'GST' : 'NON-GST');
      const billTypeUpper = (billType || '').toUpperCase();
      if (billTypeUpper !== 'GST') {
        billType = 'NON-GST';
      } else {
        billType = 'GST';
      }
      
      const isGST = billType === 'GST';
      const gstRate = sale.gstRate || (isGST ? 18 : 0);
      const subtotal = sale.subtotal || sale.subTotal || 0;
      const gstAmount = sale.taxAmount || sale.gstAmount || sale.gst || 0;
      const totalAmount = sale.totalAmount || sale.total || sale.amount || 0;
      const paidAmount =
        Number(sale.paidAmount ?? sale.paid_amount) ||
        Math.max(
          0,
          (Number(sale.totalAmount || sale.total || sale.amount) || 0) -
            (Number(sale.dueAmount ?? sale.due_amount) || 0)
        );
      const paymentModeRaw =
        sale.paymentMode ??
        sale.payment_mode ??
        sale.paymentMethod ??
        sale.payment_method ??
        '';
      const paymentModeNorm = String(paymentModeRaw).trim();
      const isNoPayment =
        !paymentModeNorm || paymentModeNorm === '-' || paymentModeNorm === '—';
      const paymentMode = isNoPayment
        ? null
        : normalizePaymentModeKey(paymentModeNorm) || null;

      // Ensure billDate is a proper Date object
      let dateObj = null;
      if (billDate) {
        try {
          dateObj = billDate instanceof Date ? billDate : new Date(billDate);
          if (isNaN(dateObj.getTime())) {
            dateObj = null;
          }
        } catch (e) {
          dateObj = null;
        }
      }

      return {
        id: billId,
        billNumber: String(billNumber || '').toUpperCase(),
        billDate: dateObj,
        customerNumber: String(customerNumber || ''),
        itemsCount: items.length,
        billType: billType,
        isGST: isGST,
        gstRate: gstRate,
        subtotal: Number(subtotal) || 0,
        gstAmount: Number(gstAmount) || 0,
        totalAmount: Number(totalAmount) || 0,
        paidAmount: Number(paidAmount) || 0,
        advanceUsed: Number(sale.advanceUsed) || 0,
        paymentMode: paymentMode,
        paymentModeRaw: String(paymentModeRaw || ''),
        originalSale: sale
      };
    });
  }, [sales]);

  const dateRangeFilteredSales = useMemo(() => {
    const from = dateFrom instanceof Date ? dateFrom : (dateFrom ? new Date(dateFrom) : null);
    const to = dateTo instanceof Date ? dateTo : (dateTo ? new Date(dateTo) : null);
    if (!from && !to) return prepareSalesData;
    const fromStart = from ? new Date(from.getFullYear(), from.getMonth(), from.getDate(), 0, 0, 0, 0) : null;
    const toEnd = to ? new Date(to.getFullYear(), to.getMonth(), to.getDate(), 23, 59, 59, 999) : null;
    return prepareSalesData.filter((row) => {
      const d = row.billDate instanceof Date ? row.billDate : (row.billDate ? new Date(row.billDate) : null);
      if (!d || Number.isNaN(d.getTime())) return false;
      if (fromStart && d < fromStart) return false;
      if (toEnd && d > toEnd) return false;
      return true;
    });
  }, [prepareSalesData, dateFrom, dateTo]);

  const commonFilteredSales = useMemo(() => {
      const q = normalizeSearchText(debouncedSearchQuery);
    return dateRangeFilteredSales.filter((row) => {
      if (billTypeFilter && billTypeFilter !== 'ALL') {
        if (String(row.billType || '').toUpperCase() !== billTypeFilter) return false;
      }
      if (paymentModeFilter && paymentModeFilter !== 'ALL') {
        const band = getPaymentBand(row.paymentMode);
        if (band !== paymentModeFilter) return false;
      }
      if (!q) return true;
      const billNo = normalizeSearchText(row.billNumber);
      const cust = normalizeSearchText(row.customerNumber);
      const pm = normalizeSearchText(formatPaymentModeLabel(row.paymentMode));
      const type = normalizeSearchText(row.billType);
      return billNo.includes(q) || cust.includes(q) || pm.includes(q) || type.includes(q);
    });
  }, [dateRangeFilteredSales, debouncedSearchQuery, billTypeFilter, paymentModeFilter]);

  const formatCurrency = (n) =>
    `₹${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  // Format date for display
  const formatDate = (dateString) => {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-IN');
  };

  // Column templates
  const billNumberBodyTemplate = (rowData) => {
    return <span className="bill-number">#{rowData.billNumber}</span>;
  };

  const dateBodyTemplate = (rowData) => {
    return rowData.billDate ? formatDate(rowData.billDate) : '-';
  };

  const billTypeBodyTemplate = (rowData) => {
    const severity = rowData.isGST ? 'success' : 'secondary';
    const label = rowData.isGST ? `GST (${rowData.gstRate}%)` : 'NON-GST';
    return <Tag value={label} severity={severity} />;
  };

  const amountBodyTemplate = (rowData, field) => {
    const amount = rowData[field] || 0;
    return `₹${amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const totalAmountBodyTemplate = (rowData) => {
    return (
      <span className="total-amount-cell">
        {amountBodyTemplate(rowData, 'totalAmount')}
      </span>
    );
  };

  const actionsBodyTemplate = (rowData) => {
    return (
      <div className="actions-buttons">
        <Button
          icon="pi pi-eye"
          rounded
          outlined
          severity="info"
          onClick={() => handleViewBillDetails(rowData)}
          title="View Bill Details"
        />
        <Button
          icon="pi pi-download"
          rounded
          outlined
          severity="secondary"
          onClick={async () => {
            try {
              console.log('[Sales] Downloading PDF for bill:', {
                id: rowData.id,
                billType: rowData.billType,
                billNumber: rowData.billNumber
              });
              await downloadBillPDF(rowData.id, rowData.billType);
              setToast({ message: 'Bill PDF downloaded successfully.', type: 'success' });
            } catch (error) {
              console.error('[Sales] PDF download error:', error);
              const errorMessage = error.message || 'Unable to download bill PDF right now.';
              setToast({ message: errorMessage, type: 'error' });
            }
          }}
          title="Download Bill PDF"
        />
      </div>
    );
  };

  const handleViewBillDetails = (bill) => {
    setSelectedBill(bill);
    setPaymentAddAmount('');
    setPaymentAddMode('CASH');
    setBillPopupVisible(true);
  };

  const closeBillPopup = () => {
    setBillPopupVisible(false);
    setSelectedBill(null);
  };

  const handleAddPaymentToBill = async () => {
    if (!selectedBill?.id || !selectedBill?.billType) return;
    const amount = Number(paymentAddAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setToast({ message: 'Enter a valid payment amount.', type: 'error' });
      return;
    }
    try {
      setPaymentSubmitting(true);
      await addBillPayment(selectedBill.id, selectedBill.billType, {
        amount,
        paymentMode: paymentAddMode,
        paymentDate: paymentAddDate || undefined
      });
      await loadData();
      setToast({ message: 'Payment added successfully.', type: 'success' });
      closeBillPopup();
    } catch (e) {
      setToast({ message: e?.message || 'Payment could not be added.', type: 'error' });
    } finally {
      setPaymentSubmitting(false);
    }
  };

  const handleDeletePaymentFromBill = async (paymentId) => {
    if (!selectedBill?.id || !selectedBill?.billType || !paymentId) return;
    const ok = window.confirm('Delete this payment? This action can affect bill status and available balance.');
    if (!ok) return;
    try {
      setPaymentSubmitting(true);
      await deleteBillPayment(selectedBill.id, selectedBill.billType, paymentId);
      await loadData();
      setToast({ message: 'Payment deleted successfully.', type: 'success' });
      closeBillPopup();
    } catch (e) {
      setToast({ message: e?.message || 'Payment could not be deleted.', type: 'error' });
    } finally {
      setPaymentSubmitting(false);
    }
  };

  // Filter templates for row-based filtering
  const billTypeFilterOptions = [
    { label: 'All', value: 'ALL' },
    { label: 'GST', value: 'GST' },
    { label: 'NON-GST', value: 'NON-GST' }
  ];

  const paymentModeFilterOptions = [
    { label: 'All', value: 'ALL' },
    { label: 'Cash', value: 'CASH' },
    { label: 'UPI', value: 'UPI' },
    { label: 'Bank transfer', value: 'BANK_TRANSFER' },
    { label: 'Cheque', value: 'CHEQUE' },
    { label: 'Other/Unknown', value: 'OTHER' }
  ];


  return (
    <div className="sales-container">
      <div className="sales-header">
        <h2>Sales Management</h2>
        <div className="sales-payment-totals" role="region" aria-label="Payment mode totals">
          <div className="sales-payment-total-card">
            <span className="sales-payment-total-label">UPI Total</span>
            <span className="sales-payment-total-value">{formatCurrency(paymentBandTotals.upi)}</span>
          </div>
          <div className="sales-payment-total-card">
            <span className="sales-payment-total-label">Cash Total</span>
            <span className="sales-payment-total-value">{formatCurrency(paymentBandTotals.cash)}</span>
          </div>
          <div className="sales-payment-total-card">
            <span className="sales-payment-total-label">Bank Transfer Total</span>
            <span className="sales-payment-total-value">{formatCurrency(paymentBandTotals.bankTransfer)}</span>
          </div>
          <div className="sales-payment-total-card">
            <span className="sales-payment-total-label">Cheque Total</span>
            <span className="sales-payment-total-value">{formatCurrency(paymentBandTotals.cheque)}</span>
          </div>
          <div className="sales-payment-total-card">
            <span className="sales-payment-total-label">Other Total</span>
            <span className="sales-payment-total-value">{formatCurrency(paymentBandTotals.other)}</span>
          </div>
        </div>
      </div>

      <div className="sales-list">
        <h3>Sales History</h3>
        <InlineToast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast({ message: '', type: 'success' })}
        />
        <div className="sales-common-search" role="region" aria-label="Sales search and filters">
          <div className="sales-common-search-left">
            <span className="sales-search-icon">🔍</span>
            <InputText
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by bill #, customer, payment mode, or bill type…"
              className="sales-common-search-input"
              title="Search bills by number, customer phone, paid via, or bill type"
            />
          </div>
          <div className="sales-common-search-right">
            <Dropdown
              value={billTypeFilter}
              options={billTypeFilterOptions}
              onChange={(e) => setBillTypeFilter(e.value)}
              placeholder="Bill type"
              className="sales-common-search-dropdown"
            />
            <Dropdown
              value={paymentModeFilter}
              options={paymentModeFilterOptions}
              onChange={(e) => setPaymentModeFilter(e.value)}
              placeholder="Paid via"
              className="sales-common-search-dropdown"
            />
            <Button
              type="button"
              icon="pi pi-times"
              label="Clear"
              outlined
              onClick={() => {
                setSearchQuery('');
                setBillTypeFilter('ALL');
                setPaymentModeFilter('ALL');
              }}
            />
          </div>
        </div>
        <div className="sales-filter-bar" role="region" aria-label="Sales filters">
          <div className="sales-filter-item">
            <span className="sales-filter-label">From</span>
            <Calendar
              value={dateFrom}
              onChange={(e) => setDateFrom(e.value || null)}
              dateFormat="dd/mm/yy"
              placeholder="dd/mm/yyyy"
              showIcon
            />
          </div>
          <div className="sales-filter-item">
            <span className="sales-filter-label">To</span>
            <Calendar
              value={dateTo}
              onChange={(e) => setDateTo(e.value || null)}
              dateFormat="dd/mm/yy"
              placeholder="dd/mm/yyyy"
              showIcon
              minDate={dateFrom || undefined}
            />
          </div>
          <div className="sales-filter-actions">
            <Button
              type="button"
              icon="pi pi-times"
              label="Clear"
              outlined
              onClick={() => {
                setDateFrom(null);
                setDateTo(null);
              }}
            />
          </div>
        </div>
        <div className="sales-table-container">
          <DataTable
            value={commonFilteredSales}
            paginator
            rows={10}
            rowsPerPageOptions={[10, 25, 50]}
            loading={loading}
            dataKey="id"
            emptyMessage="No bills found for today or selected filters."
            showGridlines
            stripedRows
            tableStyle={{ minWidth: '44rem', width: '100%' }}
            className="sales-datatable"
          >
            <Column
              field="billNumber"
              header="Bill Number"
              style={{ minWidth: '9rem' }}
              body={billNumberBodyTemplate}
            />
            <Column
              field="billDate"
              header="Date"
              style={{ minWidth: '8rem' }}
              body={dateBodyTemplate}
            />
            <Column
              field="customerNumber"
              header="Customer Number"
              style={{ minWidth: '9rem' }}
            />
            <Column
              field="itemsCount"
              header="Items"
              style={{ minWidth: '6rem' }}
              body={(rowData) => `${rowData.itemsCount} item(s)`}
            />
            <Column
              field="billType"
              header="GST Status"
              style={{ minWidth: '8rem' }}
              body={billTypeBodyTemplate}
            />
            <Column
              field="subtotal"
              header="Item Total"
              dataType="numeric"
              style={{ minWidth: '8rem' }}
              body={(rowData) => amountBodyTemplate(rowData, 'subtotal')}
            />
            <Column
              field="gstAmount"
              header="GST"
              dataType="numeric"
              style={{ minWidth: '7rem' }}
              body={(rowData) => amountBodyTemplate(rowData, 'gstAmount')}
            />
            <Column
              field="totalAmount"
              header="Final Amount"
              dataType="numeric"
              style={{ minWidth: '8rem' }}
              body={totalAmountBodyTemplate}
            />
            <Column
              field="advanceUsed"
              header="Advance"
              dataType="numeric"
              style={{ minWidth: '7rem' }}
              body={(rowData) => (
                <span title="Prepaid amount from customer">
                  {formatCurrency(rowData.advanceUsed)}
                </span>
              )}
            />
            <Column
              field="paymentMode"
              header="Paid Via"
              style={{ minWidth: '8rem' }}
              body={(rowData) => (
                <div className="payment-mode-cell">
                  {(() => {
                    const raw =
                      rowData.originalSale?.paymentMethod ??
                      rowData.originalSale?.payment_method ??
                      rowData.originalSale?.paymentMode ??
                      rowData.originalSale?.payment_mode ??
                      rowData.paymentMode ??
                      rowData.payment_mode ??
                      rowData.originalSale?.paymentStatus ??
                      '';
                    const lines = splitPaymentSummaryLines(raw);
                    if (lines.length === 0) {
                      return <span>—</span>;
                    }
                    if (lines.length === 1) {
                      return <span>{formatPaymentModeLabel(lines[0])}</span>;
                    }
                    return (
                      <ul className="payment-mode-lines">
                        {lines.map((l, idx) => (
                          <li key={`${idx}-${l}`}>{formatPaymentModeLabel(l)}</li>
                        ))}
                      </ul>
                    );
                  })()}
                </div>
              )}
            />
            <Column
              header="Actions"
              style={{ minWidth: '7rem' }}
              body={actionsBodyTemplate}
            />
          </DataTable>
        </div>
      </div>

      {/* Bill Details Popup */}
      <Dialog
        header="Bill Details"
        visible={isBillPopupVisible}
        style={{ width: '70vw' }}
        onHide={closeBillPopup}
        className="bill-details-dialog"
        contentClassName="bill-details-dialog-content"
      >
        {selectedBill ? (
          <div className="bill-details">
            <h3>Invoice No: {selectedBill.billNumber}</h3>
            <div className="bill-customer-details">
              <div className="detail-row">
                <span className="label">Name:</span>
                <span className="value">{selectedBill.originalSale.customerName}</span>
              </div>
              <div className="detail-row">
                <span className="label">Mobile:</span>
                <span className="value">{selectedBill.customerNumber}</span>
              </div>
              <div className="detail-row">
                <span className="label">Address:</span>
                <span className="value">{selectedBill.originalSale.address}</span>
              </div>
              <div className="detail-row">
                <span className="label">Date:</span>
                <span className="value">{formatDate(selectedBill.billDate)}</span>
              </div>
              {(selectedBill.originalSale?.paymentMode || selectedBill.paymentMode) && (
                <div className="detail-row">
                  <span className="label">Paid Via:</span>
                  <span className="value">
                    {formatPaymentModeLabel(selectedBill.originalSale?.paymentMode || selectedBill.paymentMode)}
                  </span>
                </div>
              )}
            </div>

            <div className="bill-summary" style={{ marginBottom: '12px' }}>
              <p><strong>Add Payment to this Bill</strong></p>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={paymentAddAmount}
                  onChange={(e) => setPaymentAddAmount(e.target.value)}
                  placeholder="Amount"
                  style={{ padding: '8px', minWidth: '140px' }}
                />
                <select
                  value={paymentAddMode}
                  onChange={(e) => setPaymentAddMode(e.target.value)}
                  style={{ padding: '8px', minWidth: '140px' }}
                >
                  <option value="CASH">Cash</option>
                  <option value="UPI">UPI</option>
                  <option value="BANK_TRANSFER">Bank transfer</option>
                  <option value="CHEQUE">Cheque</option>
                  <option value="OTHER">Other</option>
                </select>
                <input
                  type="date"
                  value={paymentAddDate}
                  onChange={(e) => setPaymentAddDate(e.target.value)}
                  style={{ padding: '8px', minWidth: '160px' }}
                />
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={paymentSubmitting}
                  onClick={handleAddPaymentToBill}
                >
                  {paymentSubmitting ? 'Saving...' : 'Add Payment'}
                </button>
              </div>
              <div style={{ marginTop: '10px' }}>
                {(selectedBill?.originalSale?.payments || []).length === 0 ? (
                  <span style={{ color: '#64748b' }}>No payments recorded yet.</span>
                ) : (
                  <ul style={{ margin: 0, paddingLeft: '18px' }}>
                    {(selectedBill.originalSale.payments || []).map((p) => (
                      <li key={p.paymentId} style={{ marginBottom: '4px' }}>
                        {p.paymentDate} - {p.paymentMode} - ₹{Number(p.amount || 0).toFixed(2)}{' '}
                        <button
                          type="button"
                          className="btn btn-danger"
                          style={{ marginLeft: '8px', padding: '2px 8px' }}
                          onClick={() => handleDeletePaymentFromBill(p.paymentId)}
                          disabled={paymentSubmitting}
                        >
                          Delete
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            <table className="bill-table">
              <thead>
                <tr>
                  <th>Sr. No.</th>
                  <th>Item Description</th>
                  <th>Quantity</th>
                  <th>Rate</th>
                  <th>Amount (₹)</th>
                  <th>Purchase Price (₹)</th>
                  <th>Total Purchase Amount (₹)</th>
                  <th>Gross Profit (₹)</th>
                </tr>
              </thead>
              <tbody>
                {selectedBill.originalSale.items.map((item, index) => {
                  const grossProfit = (item.pricePerUnit - item.purchasePrice) * item.quantity;
                  return (
                    <tr key={index}>
                      <td>{index + 1}</td>
                      <td>{item.itemName || item.description || 'N/A'}</td>
                      <td>{item.quantity} ({item.unit || 'unit'})</td>
                      <td>₹ {item.pricePerUnit.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                      <td>₹ {(item.pricePerUnit * item.quantity).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                      <td>₹ {item.purchasePrice ? item.purchasePrice.toLocaleString('en-IN', { minimumFractionDigits: 2 }) : 'N/A'}</td>
                      <td>₹ {item.purchasePrice ? (item.purchasePrice * item.quantity).toLocaleString('en-IN', { minimumFractionDigits: 2 }) : 'N/A'}</td>
                      <td>₹ {grossProfit.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan="4" style={{ textAlign: 'right', fontWeight: 'bold' }}>Subtotal for Sale:</td>
                  <td colSpan="3"></td>
                  <td style={{ fontWeight: 'bold', textAlign: 'right', whiteSpace: 'nowrap' }}>
                    ₹ {selectedBill.originalSale.items.reduce((total, item) => {
                      return total + (item.pricePerUnit * item.quantity);
                    }, 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </td>
                </tr>
                <tr>
                  <td colSpan="4" style={{ textAlign: 'right', fontWeight: 'bold' }}>Total Gross Profit:</td>
                  <td colSpan="3"></td>
                  <td style={{ fontWeight: 'bold', textAlign: 'right', whiteSpace: 'nowrap' }}>
                    ₹ {selectedBill.originalSale.items.reduce((total, item) => {
                      const grossProfit = (item.pricePerUnit - item.purchasePrice) * item.quantity;
                      return total + grossProfit;
                    }, 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </td>
                </tr>
              </tfoot>
            </table>

            <div className="bill-summary">
              <p><strong>Discount Amount:</strong> ₹ {selectedBill.originalSale.discountAmount.toLocaleString('en-IN')}</p>
              <p><strong>Labour Charge:</strong> ₹ {selectedBill.originalSale.labourCharge.toLocaleString('en-IN')}</p>
              <p><strong>Transportation Charge:</strong> ₹ {selectedBill.originalSale.transportationCharge.toLocaleString('en-IN')}</p>
              <p><strong>Other Expense:</strong> ₹ {(selectedBill.originalSale.otherExpenses ?? selectedBill.originalSale.otherExpense ?? 0).toLocaleString('en-IN')}</p>
              <p><strong>GST Value:</strong> ₹ {(selectedBill.isGST ? (selectedBill.gstAmount ?? selectedBill.originalSale?.taxAmount ?? 0) : 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
              <p><strong>Final Amount:</strong> ₹ {selectedBill.totalAmount.toLocaleString('en-IN')}</p>
              <p>
                <strong>Advance (token) used:</strong>{' '}
                ₹{' '}
                {(
                  Number(selectedBill.advanceUsed ?? selectedBill.originalSale?.advanceUsed) || 0
                ).toLocaleString('en-IN', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </p>
            </div>
          </div>
        ) : (
          <p>No bill details available.</p>
        )}
      </Dialog>
    </div>
  );
};

export default Sales;

