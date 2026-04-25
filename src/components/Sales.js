import React, { useState, useMemo, useEffect } from 'react';
import {
  downloadBillPDF,
  addBillPayment,
  deleteBillPayment,
  deleteBill,
  getBillCancellations,
  updateBill
} from '../utils/api';
import { fetchProductsCatalog } from '../api/productsApi';
import {
  formatPaymentModeLabel,
  splitPaymentSummaryLines,
  normalizePaymentModeKey,
  getPaymentBand,
  normalizeSearchText
} from './sales/salesUtils';
import { DataTable } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { InputText } from 'primereact/inputtext';
import { Dropdown } from 'primereact/dropdown';
import { Calendar } from 'primereact/calendar';
import { Button } from 'primereact/button';
import { Tag } from 'primereact/tag';
import { Dialog } from 'primereact/dialog';
import { AutoComplete } from 'primereact/autocomplete';
import InlineToast from './InlineToast';
import useDebouncedValue from '../utils/useDebouncedValue';
import { useSalesData } from '../hooks/useSalesData';
import './Sales.css';

const Sales = () => {
  const today = new Date();
  const [dateFrom, setDateFrom] = useState(today);
  const [dateTo, setDateTo] = useState(today);
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearchQuery = useDebouncedValue(searchQuery, 250);
  const [billTypeFilter, setBillTypeFilter] = useState('ALL');
  const [paymentModeFilter, setPaymentModeFilter] = useState('ALL');
  const [toast, setToast] = useState({ message: '', type: 'success' });
  const { sales, loading, paymentBandTotals, refreshSales } = useSalesData(dateFrom, dateTo);

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
  const [cancellations, setCancellations] = useState([]);
  const [cancellationsLoading, setCancellationsLoading] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [editDraft, setEditDraft] = useState(null);
  const [productCatalog, setProductCatalog] = useState([]);
  const [productCatalogLoading, setProductCatalogLoading] = useState(false);
  const [productSuggestions, setProductSuggestions] = useState([]);

  const toIsoDate = (value) => {
    const d = value instanceof Date ? value : value ? new Date(value) : null;
    if (!d || Number.isNaN(d.getTime())) return null;
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  useEffect(() => {
    let ignore = false;
    (async () => {
      try {
        setCancellationsLoading(true);
        const todayIso = toIsoDate(new Date());
        const fromIso = toIsoDate(dateFrom) || todayIso;
        const toIso = toIsoDate(dateTo) || fromIso;
        const rows = await getBillCancellations(fromIso, toIso);
        if (!ignore) setCancellations(Array.isArray(rows) ? rows : []);
      } catch {
        if (!ignore) setCancellations([]);
      } finally {
        if (!ignore) setCancellationsLoading(false);
      }
    })();
    return () => {
      ignore = true;
    };
  }, [dateFrom, dateTo]);

  useEffect(() => {
    if (!editMode || productCatalog.length > 0 || productCatalogLoading) return;
    let cancelled = false;
    setProductCatalogLoading(true);
    fetchProductsCatalog()
      .then((list) => {
        if (!cancelled) setProductCatalog(Array.isArray(list) ? list : []);
      })
      .catch(() => {
        if (!cancelled) setProductCatalog([]);
      })
      .finally(() => {
        if (!cancelled) setProductCatalogLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [editMode, productCatalog.length, productCatalogLoading]);

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
        <Button
          icon="pi pi-pencil"
          rounded
          outlined
          severity="warning"
          onClick={() => {
            handleViewBillDetails(rowData);
            setTimeout(() => openEditMode(), 0);
          }}
          title="Edit Bill"
        />
      </div>
    );
  };

  const handleViewBillDetails = (bill) => {
    setSelectedBill(bill);
    setPaymentAddAmount('');
    setPaymentAddMode('CASH');
    setEditMode(false);
    setEditDraft(null);
    setBillPopupVisible(true);
  };

  const closeBillPopup = () => {
    setBillPopupVisible(false);
    setSelectedBill(null);
    setEditMode(false);
    setEditDraft(null);
  };

  const openEditMode = () => {
    if (!selectedBill?.originalSale) return;
    const sale = selectedBill.originalSale;
    const sourceItems = Array.isArray(sale.items) ? sale.items : [];
    setEditDraft({
      customerMobileNumber: String(
        sale.customerMobileNumber || sale.customerNumber || sale.customerPhone || selectedBill.customerNumber || ''
      ).trim(),
      customerName: String(sale.customerName || '').trim(),
      address: String(sale.address || '').trim(),
      gstin: String(sale.gstin || '').trim(),
      customerEmail: String(sale.customerEmail || sale.email || '').trim(),
      taxPercentage: Number(selectedBill.isGST ? (sale.taxPercentage ?? sale.taxRate ?? selectedBill.gstRate ?? 18) : 0) || 0,
      discountAmount: Number(sale.discountAmount || 0) || 0,
      labourCharge: Number(sale.labourCharge || 0) || 0,
      transportationCharge: Number(sale.transportationCharge || 0) || 0,
      otherExpenses: Number(sale.otherExpenses ?? sale.otherExpense ?? 0) || 0,
      billDate: toIsoDate(sale.billDate || selectedBill.billDate),
      items: sourceItems.map((item, idx) => ({
        rowId: `${item.itemId || item.id || idx}-${idx}`,
        itemName: String(item.itemName || item.description || '').trim(),
        category: String(item.category || item.productType || 'General').trim(),
        quantity: Number(item.quantity || 0) || 0,
        pricePerUnit: Number(item.pricePerUnit || item.rate || 0) || 0,
        unit: String(item.unit || 'sqft').trim(),
        productId: item.productId ?? item.id ?? null,
        itemId: item.itemId != null ? Number(item.itemId) : null,
        purchasePrice: Number(item.purchasePrice) || 0,
        hsnNumber: String(item.hsnNumber || item.hsnCode || '').trim()
      }))
    });
    setEditMode(true);
  };

  const handleEditItemChange = (rowId, key, value) => {
    setEditDraft((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        items: (prev.items || []).map((it) => (it.rowId === rowId ? { ...it, [key]: value } : it))
      };
    });
  };

  const applyProductToEditRow = (rowId, product) => {
    if (!product || typeof product !== 'object') return;
    const salePrice = Number(product.pricePerSqftAfter ?? product.pricePerUnit ?? product.price ?? 0) || 0;
    const costPrice = Number(product.pricePerUnit ?? 0) || 0;
    const hsn = String(product.hsnNumber ?? product.hsnCode ?? '').trim();
    setEditDraft((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        items: (prev.items || []).map((it) =>
          it.rowId === rowId
            ? {
                ...it,
                itemName: String(product.name || '').trim(),
                category: String(product.productType || it.category || 'General').trim(),
                unit: String(product.unit || 'sqft').trim(),
                productId: product.id != null ? Number(product.id) : null,
                pricePerUnit: salePrice,
                purchasePrice: costPrice,
                hsnNumber: hsn || it.hsnNumber || ''
              }
            : it
        )
      };
    });
  };

  const handleAddEditItem = () => {
    setEditDraft((prev) => {
      if (!prev) return prev;
      const id = `new-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      return {
        ...prev,
        items: [
          ...(prev.items || []),
          {
            rowId: id,
            itemName: '',
            category: 'General',
            quantity: 1,
            pricePerUnit: 0,
            unit: 'sqft',
            productId: null,
            itemId: null,
            purchasePrice: 0,
            hsnNumber: ''
          }
        ]
      };
    });
  };

  const handleRemoveEditItem = (rowId) => {
    setEditDraft((prev) => {
      if (!prev) return prev;
      const next = (prev.items || []).filter((it) => it.rowId !== rowId);
      return { ...prev, items: next };
    });
  };

  const previewBillItems = useMemo(() => {
    if (!selectedBill?.originalSale) return [];
    if (editMode && editDraft?.items?.length) {
      return editDraft.items.map((it) => ({
        itemName: it.itemName || '',
        quantity: Number(it.quantity) || 0,
        pricePerUnit: Number(it.pricePerUnit) || 0,
        purchasePrice: Number(it.purchasePrice) || 0,
        unit: it.unit || 'sqft'
      }));
    }
    return Array.isArray(selectedBill.originalSale.items) ? selectedBill.originalSale.items : [];
  }, [selectedBill, editMode, editDraft]);

  const handleSaveBillEdit = async () => {
    if (!selectedBill?.id || !selectedBill?.billType || !editDraft) return;
    const items = (editDraft.items || [])
      .map((it) => {
        const row = {
          itemName: String(it.itemName || '').trim(),
          category: String(it.category || 'General').trim(),
          quantity: Number(it.quantity),
          pricePerUnit: Number(it.pricePerUnit),
          unit: String(it.unit || 'sqft').trim()
        };
        if (it.productId != null && it.productId !== '') {
          const pid = Number(it.productId);
          if (Number.isFinite(pid) && pid > 0) row.productId = pid;
        }
        if (it.itemId != null && it.itemId !== '') {
          const iid = Number(it.itemId);
          if (Number.isFinite(iid) && iid > 0) row.itemId = iid;
        }
        const pp = Number(it.purchasePrice);
        if (Number.isFinite(pp) && pp >= 0) row.purchasePrice = pp;
        const hsn = String(it.hsnNumber || '').trim();
        if (hsn) row.hsnNumber = hsn;
        return row;
      })
      .filter((it) => it.itemName && Number.isFinite(it.quantity) && it.quantity > 0 && Number.isFinite(it.pricePerUnit) && it.pricePerUnit > 0);
    if (items.length === 0) {
      setToast({ message: 'At least one valid item is required.', type: 'error' });
      return;
    }
    const existingPayments = Array.isArray(selectedBill?.originalSale?.payments) ? selectedBill.originalSale.payments : [];
    const payments = existingPayments
      .filter((p) => String(p?.paymentMode || '').toUpperCase() !== 'WALLET')
      .map((p) => ({
        amount: Number(p.amount || 0) || 0,
        paymentMode: String(p.paymentMode || '').trim(),
        paymentDate: p.paymentDate || undefined
      }))
      .filter((p) => p.amount > 0 && p.paymentMode);

    const payload = {
      customerMobileNumber: String(editDraft.customerMobileNumber || '').trim(),
      customerName: String(editDraft.customerName || '').trim() || undefined,
      address: String(editDraft.address || '').trim() || undefined,
      gstin: String(editDraft.gstin || '').trim() || undefined,
      customerEmail: String(editDraft.customerEmail || '').trim() || undefined,
      items,
      taxPercentage: Number(editDraft.taxPercentage || 0),
      discountAmount: Number(editDraft.discountAmount || 0),
      labourCharge: Number(editDraft.labourCharge || 0),
      transportationCharge: Number(editDraft.transportationCharge || 0),
      otherExpenses: Number(editDraft.otherExpenses || 0),
      billDate: editDraft.billDate || undefined,
      payments
    };

    try {
      setEditSaving(true);
      await updateBill(selectedBill.id, selectedBill.billType, payload);
      await refreshSales();
      setToast({ message: 'Bill updated successfully.', type: 'success' });
      closeBillPopup();
    } catch (e) {
      setToast({ message: e?.message || 'Bill could not be updated.', type: 'error' });
    } finally {
      setEditSaving(false);
    }
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
      await refreshSales();
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
      await refreshSales();
      setToast({ message: 'Payment deleted successfully.', type: 'success' });
      closeBillPopup();
    } catch (e) {
      setToast({ message: e?.message || 'Payment could not be deleted.', type: 'error' });
    } finally {
      setPaymentSubmitting(false);
    }
  };

  const handleDeleteBill = async () => {
    if (!selectedBill?.id || !selectedBill?.billType) return;
    const ok = window.confirm(
      'Delete this entire bill?\n\n' +
        'This will:\n' +
        '• Put all line-item quantities back into inventory\n' +
        '• Remove all payments (paid, partial, or pending) and reverse cash/UPI effects on daily budget\n' +
        '• Restore any customer advance used on this bill\n\n' +
        'The bill will be cancelled and hidden from sales lists. This cannot be undone from the app.'
    );
    if (!ok) return;
    try {
      setPaymentSubmitting(true);
      await deleteBill(selectedBill.id, selectedBill.billType);
      await refreshSales();
      try {
        const todayIso = toIsoDate(new Date());
        const fromIso = toIsoDate(dateFrom) || todayIso;
        const toIso = toIsoDate(dateTo) || fromIso;
        const rows = await getBillCancellations(fromIso, toIso);
        setCancellations(Array.isArray(rows) ? rows : []);
      } catch {
        /* audit list refresh is best-effort */
      }
      setToast({ message: 'Bill deleted; stock and payments were rolled back.', type: 'success' });
      closeBillPopup();
    } catch (e) {
      setToast({ message: e?.message || 'Bill could not be deleted.', type: 'error' });
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

        <h3 style={{ marginTop: '1.75rem' }}>Cancelled bills (audit)</h3>
        <p style={{ color: '#64748b', fontSize: '13px', marginTop: 0, maxWidth: '48rem' }}>
          Logged when a bill is deleted. Filter uses the same bill date range as above. Totals and payment-mode
          summaries for the period exclude these bills once cancelled.
        </p>
        <div className="sales-table-container">
          <DataTable
            value={cancellations}
            paginator
            rows={8}
            rowsPerPageOptions={[8, 15, 25]}
            loading={cancellationsLoading}
            dataKey="id"
            emptyMessage="No cancelled bills in this bill-date range."
            showGridlines
            stripedRows
            tableStyle={{ minWidth: '44rem', width: '100%' }}
            className="sales-datatable"
          >
            <Column
              field="cancelledAt"
              header="Cancelled at"
              style={{ minWidth: '10rem' }}
              body={(row) => {
                if (!row.cancelledAt) return '—';
                try {
                  const d = new Date(row.cancelledAt);
                  return Number.isNaN(d.getTime()) ? String(row.cancelledAt) : d.toLocaleString();
                } catch {
                  return String(row.cancelledAt);
                }
              }}
            />
            <Column field="billDate" header="Bill date" style={{ minWidth: '7rem' }} />
            <Column field="billNumber" header="Bill #" style={{ minWidth: '7rem' }} />
            <Column
              field="billKind"
              header="Type"
              style={{ minWidth: '5rem' }}
              body={(row) => (String(row.billKind || '').includes('NON') ? 'NON-GST' : 'GST')}
            />
            <Column
              header="Customer"
              style={{ minWidth: '9rem' }}
              body={(row) => [row.customerName, row.customerPhone].filter(Boolean).join(' · ') || '—'}
            />
            <Column
              field="totalAmount"
              header="Bill total"
              body={(row) => formatCurrency(Number(row.totalAmount) || 0)}
            />
            <Column
              field="paidFromPayments"
              header="Paid (excl. advance)"
              body={(row) => formatCurrency(Number(row.paidFromPayments) || 0)}
            />
            <Column
              field="inHandCollected"
              header="Cash+UPI reversed"
              body={(row) => formatCurrency(Number(row.inHandCollected) || 0)}
            />
            <Column
              field="advanceApplied"
              header="Advance reversed"
              body={(row) => formatCurrency(Number(row.advanceApplied) || 0)}
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
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                <p><strong>Add Payment to this Bill</strong></p>
                {!editMode ? (
                  <button type="button" className="btn btn-primary" onClick={openEditMode}>
                    Edit bill
                  </button>
                ) : (
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      disabled={editSaving}
                      onClick={() => setEditMode(false)}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="btn btn-primary"
                      disabled={editSaving}
                      onClick={handleSaveBillEdit}
                    >
                      {editSaving ? 'Saving...' : 'Save edit'}
                    </button>
                  </div>
                )}
              </div>
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

            {editMode && editDraft && (
              <div className="bill-summary" style={{ marginBottom: '12px', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '12px' }}>
                <p><strong>Edit bill details</strong></p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(120px, 1fr))', gap: '8px', marginBottom: '8px' }}>
                  <input type="text" placeholder="Customer name" value={editDraft.customerName || ''} onChange={(e) => setEditDraft((p) => ({ ...p, customerName: e.target.value }))} />
                  <input type="text" placeholder="Mobile" value={editDraft.customerMobileNumber || ''} onChange={(e) => setEditDraft((p) => ({ ...p, customerMobileNumber: e.target.value }))} />
                  <input type="date" value={editDraft.billDate || ''} onChange={(e) => setEditDraft((p) => ({ ...p, billDate: e.target.value }))} />
                  <input type="number" step="0.01" placeholder="Tax %" value={editDraft.taxPercentage ?? 0} onChange={(e) => setEditDraft((p) => ({ ...p, taxPercentage: Number(e.target.value || 0) }))} />
                  <input type="number" step="0.01" placeholder="Discount" value={editDraft.discountAmount ?? 0} onChange={(e) => setEditDraft((p) => ({ ...p, discountAmount: Number(e.target.value || 0) }))} />
                  <input type="number" step="0.01" placeholder="Labour" value={editDraft.labourCharge ?? 0} onChange={(e) => setEditDraft((p) => ({ ...p, labourCharge: Number(e.target.value || 0) }))} />
                  <input type="number" step="0.01" placeholder="Transport" value={editDraft.transportationCharge ?? 0} onChange={(e) => setEditDraft((p) => ({ ...p, transportationCharge: Number(e.target.value || 0) }))} />
                  <input type="number" step="0.01" placeholder="Other expense" value={editDraft.otherExpenses ?? 0} onChange={(e) => setEditDraft((p) => ({ ...p, otherExpenses: Number(e.target.value || 0) }))} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px', marginBottom: '8px' }}>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: '#334155' }}>Line items</span>
                  <button type="button" className="btn btn-secondary" onClick={handleAddEditItem} disabled={editSaving}>
                    + Add item
                  </button>
                </div>
                <div style={{ display: 'grid', gap: '10px' }}>
                  {(editDraft.items || []).map((it) => (
                    <div
                      key={it.rowId}
                      style={{
                        padding: '10px',
                        background: '#fff',
                        borderRadius: '8px',
                        border: '1px solid #e2e8f0'
                      }}
                    >
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'flex-end' }}>
                        <div className="form-group bill-edit-item-field" style={{ margin: 0, flex: '1 1 200px', minWidth: '160px' }}>
                          <label style={{ fontSize: '11px', color: '#64748b', display: 'block', marginBottom: '4px' }}>Item</label>
                          <AutoComplete
                            value={it.itemName || ''}
                            suggestions={productSuggestions}
                            completeMethod={(e) => {
                              if (productCatalogLoading && productCatalog.length === 0) {
                                setProductSuggestions([]);
                                return;
                              }
                              const q = (e.query || '').trim().toLowerCase();
                              const max = 50;
                              const list = !q
                                ? productCatalog.slice(0, max)
                                : productCatalog.filter((p) => {
                                    const name = String(p.name || '').toLowerCase();
                                    const type = String(p.productType || '').toLowerCase();
                                    const slug = String(p.slug || '').toLowerCase();
                                    return name.includes(q) || type.includes(q) || slug.includes(q);
                                  }).slice(0, max);
                              setProductSuggestions(list);
                            }}
                            onChange={(e) => {
                              const v = e.value;
                              if (typeof v === 'string' || v == null) {
                                handleEditItemChange(it.rowId, 'itemName', v || '');
                                return;
                              }
                              if (typeof v === 'object' && (v.name != null || v.id != null)) {
                                applyProductToEditRow(it.rowId, v);
                              }
                            }}
                            field="name"
                            dropdown
                            forceSelection={false}
                            minLength={0}
                            placeholder={
                              productCatalogLoading && productCatalog.length === 0
                                ? 'Loading products…'
                                : 'Search or pick from catalog'
                            }
                            loading={productCatalogLoading && productCatalog.length === 0}
                            inputClassName="p-inputtext-sm"
                            className="bill-edit-item-autocomplete"
                            panelClassName="bill-edit-product-panel"
                            itemTemplate={(p) => (
                              <div className="bill-edit-product-suggest">
                                <div className="bill-edit-product-suggest-name">{p.name}</div>
                                <div className="bill-edit-product-suggest-meta">
                                  {[
                                    p.productType,
                                    p.unit || 'sqft',
                                    (() => {
                                      const n = Number(p.pricePerSqftAfter ?? p.pricePerUnit ?? 0);
                                      if (!Number.isFinite(n) || n === 0) return null;
                                      return `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
                                    })()
                                  ]
                                    .filter(Boolean)
                                    .join(' · ')}
                                </div>
                              </div>
                            )}
                          />
                        </div>
                        <div className="form-group" style={{ margin: 0, flex: '0 1 88px' }}>
                          <label style={{ fontSize: '11px', color: '#64748b', display: 'block', marginBottom: '4px' }}>Qty</label>
                          <input type="number" step="0.01" value={it.quantity ?? 0} onChange={(e) => handleEditItemChange(it.rowId, 'quantity', Number(e.target.value || 0))} style={{ width: '100%', padding: '6px 8px' }} />
                        </div>
                        <div className="form-group" style={{ margin: 0, flex: '0 1 100px' }}>
                          <label style={{ fontSize: '11px', color: '#64748b', display: 'block', marginBottom: '4px' }}>Rate</label>
                          <input type="number" step="0.01" value={it.pricePerUnit ?? 0} onChange={(e) => handleEditItemChange(it.rowId, 'pricePerUnit', Number(e.target.value || 0))} style={{ width: '100%', padding: '6px 8px' }} />
                        </div>
                        <div className="form-group" style={{ margin: 0, flex: '0 1 72px' }}>
                          <label style={{ fontSize: '11px', color: '#64748b', display: 'block', marginBottom: '4px' }}>Unit</label>
                          <input type="text" value={it.unit || 'sqft'} onChange={(e) => handleEditItemChange(it.rowId, 'unit', e.target.value)} placeholder="sqft" style={{ width: '100%', padding: '6px 8px' }} />
                        </div>
                        <div className="form-group" style={{ margin: 0, flex: '0 1 110px' }}>
                          <label style={{ fontSize: '11px', color: '#64748b', display: 'block', marginBottom: '4px' }}>Category</label>
                          <input type="text" value={it.category || ''} onChange={(e) => handleEditItemChange(it.rowId, 'category', e.target.value)} style={{ width: '100%', padding: '6px 8px' }} />
                        </div>
                        <div className="form-group" style={{ margin: 0, flex: '0 1 100px' }}>
                          <label style={{ fontSize: '11px', color: '#64748b', display: 'block', marginBottom: '4px' }}>Purchase</label>
                          <input type="number" step="0.01" value={it.purchasePrice ?? 0} onChange={(e) => handleEditItemChange(it.rowId, 'purchasePrice', Number(e.target.value || 0))} title="Optional — margin preview" style={{ width: '100%', padding: '6px 8px' }} />
                        </div>
                        <div className="form-group" style={{ margin: 0, flex: '0 1 100px' }}>
                          <label style={{ fontSize: '11px', color: '#64748b', display: 'block', marginBottom: '4px' }}>Product ID</label>
                          <input
                            type="number"
                            step="1"
                            value={it.productId != null && it.productId !== '' ? it.productId : ''}
                            onChange={(e) => handleEditItemChange(it.rowId, 'productId', e.target.value === '' ? null : Number(e.target.value))}
                            placeholder="—"
                            style={{ width: '100%', padding: '6px 8px' }}
                          />
                        </div>
                        <button
                          type="button"
                          className="btn btn-danger"
                          style={{ padding: '6px 10px', whiteSpace: 'nowrap' }}
                          disabled={editSaving || (editDraft.items || []).length <= 1}
                          onClick={() => handleRemoveEditItem(it.rowId)}
                          title={(editDraft.items || []).length <= 1 ? 'Keep at least one line' : 'Remove this line'}
                        >
                          Remove
                        </button>
                      </div>
                      {selectedBill.isGST && (
                        <div className="form-group" style={{ margin: '10px 0 0', maxWidth: '220px' }}>
                          <label style={{ fontSize: '11px', color: '#64748b', display: 'block', marginBottom: '4px' }}>HSN (optional)</label>
                          <input type="text" value={it.hsnNumber || ''} onChange={(e) => handleEditItemChange(it.rowId, 'hsnNumber', e.target.value)} placeholder="HSN" style={{ width: '100%', padding: '6px 8px' }} />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                <p style={{ marginTop: '8px', fontSize: '12px', color: '#64748b' }}>
                  Add rows with <strong>+ Add item</strong>, edit qty/rate, or remove a line. Save applies changes to the bill (stock is re-checked).
                </p>
              </div>
            )}

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
                {previewBillItems.map((item, index) => {
                  const pp = Number(item.purchasePrice) || 0;
                  const grossProfit = (Number(item.pricePerUnit) - pp) * Number(item.quantity);
                  return (
                    <tr key={index}>
                      <td>{index + 1}</td>
                      <td>{item.itemName || item.description || 'N/A'}</td>
                      <td>{item.quantity} ({item.unit || 'unit'})</td>
                      <td>₹ {Number(item.pricePerUnit).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                      <td>₹ {(Number(item.pricePerUnit) * Number(item.quantity)).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                      <td>₹ {pp ? pp.toLocaleString('en-IN', { minimumFractionDigits: 2 }) : 'N/A'}</td>
                      <td>₹ {pp ? (pp * Number(item.quantity)).toLocaleString('en-IN', { minimumFractionDigits: 2 }) : 'N/A'}</td>
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
                    ₹ {previewBillItems.reduce((total, item) => {
                      return total + (Number(item.pricePerUnit) * Number(item.quantity));
                    }, 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </td>
                </tr>
                <tr>
                  <td colSpan="4" style={{ textAlign: 'right', fontWeight: 'bold' }}>Total Gross Profit:</td>
                  <td colSpan="3"></td>
                  <td style={{ fontWeight: 'bold', textAlign: 'right', whiteSpace: 'nowrap' }}>
                    ₹ {previewBillItems.reduce((total, item) => {
                      const pp = Number(item.purchasePrice) || 0;
                      const grossProfit = (Number(item.pricePerUnit) - pp) * Number(item.quantity);
                      return total + grossProfit;
                    }, 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </td>
                </tr>
              </tfoot>
            </table>

            <div className="bill-summary">
              <p><strong>Discount Amount:</strong> ₹ {(editMode && editDraft ? Number(editDraft.discountAmount) : selectedBill.originalSale.discountAmount).toLocaleString('en-IN')}</p>
              <p><strong>Labour Charge:</strong> ₹ {(editMode && editDraft ? Number(editDraft.labourCharge) : selectedBill.originalSale.labourCharge).toLocaleString('en-IN')}</p>
              <p><strong>Transportation Charge:</strong> ₹ {(editMode && editDraft ? Number(editDraft.transportationCharge) : selectedBill.originalSale.transportationCharge).toLocaleString('en-IN')}</p>
              <p><strong>Other Expense:</strong> ₹ {(editMode && editDraft ? (Number(editDraft.otherExpenses) || 0) : (selectedBill.originalSale.otherExpenses ?? selectedBill.originalSale.otherExpense ?? 0)).toLocaleString('en-IN')}</p>
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

            <div
              style={{
                marginTop: '24px',
                paddingTop: '16px',
                borderTop: '1px solid #e2e8f0',
              }}
            >
              <p style={{ margin: '0 0 8px', fontWeight: 600, color: '#b91c1c' }}>Danger zone</p>
              <button
                type="button"
                className="btn btn-danger"
                disabled={paymentSubmitting}
                onClick={handleDeleteBill}
              >
                {paymentSubmitting ? 'Working…' : 'Delete entire bill'}
              </button>
              <p style={{ margin: '8px 0 0', fontSize: '12px', color: '#64748b', maxWidth: '520px' }}>
                Cancels the bill and rolls back inventory and all payments (any status).
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

