import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  downloadBillPDF,
  addBillPayment,
  deleteBillPayment,
  getBillCancellations,
  updateBill,
  fetchBillByTypeAndId,
  submitBillStockReturn,
  fetchBillAdjustments,
  openBillAdjustmentSession
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
import { Menu } from 'primereact/menu';
import { Tag } from 'primereact/tag';
import { Dialog } from 'primereact/dialog';
import { AutoComplete } from 'primereact/autocomplete';
import InlineToast from './InlineToast';
import useDebouncedValue from '../utils/useDebouncedValue';
import { computeGstSplit, resolveDeliveryState, SELLER_STATE } from '../utils/gst';
import { useSalesData } from '../hooks/useSalesData';
import BillEditPage from './sales/BillEditPage';
import AdjustmentExchangeDialog from './sales/AdjustmentExchangeDialog';
import CancelBillModal from './sales/CancelBillModal';
import { computeReturnSettlementPreview } from './sales/billReturnUtils';
import './Sales.css';

/** API list responses may omit lazy-loaded line items; GET by id returns full payload. */
function unwrapBillEnvelope(raw) {
  if (!raw || typeof raw !== 'object') return raw;
  if (Object.prototype.hasOwnProperty.call(raw, 'data') && raw.data != null && typeof raw.data === 'object') {
    return raw.data;
  }
  return raw;
}

function mergeBillWithFullDetail(row, detail) {
  const d = detail || {};
  const items = Array.isArray(d.items)
    ? d.items
    : Array.isArray(row.originalSale?.items)
      ? row.originalSale.items
      : [];
  const payments = Array.isArray(d.payments) ? d.payments : row.originalSale?.payments || [];
  const isGST = String(row.billType || '').toUpperCase() === 'GST';
  const taxPct =
    d.taxPercentage != null
      ? Number(d.taxPercentage)
      : isGST
        ? Number(row.gstRate ?? row.originalSale?.taxPercentage ?? 18)
        : 0;
  const originalSale = {
    ...(row.originalSale || {}),
    ...d,
    items,
    payments,
    customerMobileNumber:
      d.customerMobileNumber ?? row.originalSale?.customerMobileNumber ?? row.customerNumber,
    customerName: d.customerName ?? row.originalSale?.customerName ?? row.customerName,
    address: d.address ?? row.originalSale?.address,
    gstin: d.gstin ?? row.originalSale?.gstin,
    customerEmail: d.customerEmail ?? row.originalSale?.customerEmail,
    billDate: d.billDate ?? row.originalSale?.billDate,
    taxPercentage: taxPct,
    discountAmount:
      d.discountAmount != null ? Number(d.discountAmount) : Number(row.originalSale?.discountAmount ?? 0),
    labourCharge: d.labourCharge != null ? Number(d.labourCharge) : Number(row.originalSale?.labourCharge ?? 0),
    transportationCharge:
      d.transportationCharge != null
        ? Number(d.transportationCharge)
        : Number(row.originalSale?.transportationCharge ?? 0),
    otherExpenses:
      d.otherExpenses != null
        ? Number(d.otherExpenses)
        : Number(row.originalSale?.otherExpenses ?? row.originalSale?.otherExpense ?? 0),
    taxAmount:
      d.taxAmount != null ? Number(d.taxAmount) : Number(row.originalSale?.taxAmount ?? row.gstAmount ?? 0),
    billLifecycleStatus:
      d.billLifecycleStatus != null && d.billLifecycleStatus !== ''
        ? d.billLifecycleStatus
        : row.originalSale?.billLifecycleStatus,
    returnSummary: d.returnSummary != null ? d.returnSummary : row.originalSale?.returnSummary,
    returnHistory: Array.isArray(d.returnHistory) ? d.returnHistory : row.originalSale?.returnHistory,
    supplementaryBills: Array.isArray(d.supplementaryBills) ? d.supplementaryBills : row.originalSale?.supplementaryBills,
    billEvents: Array.isArray(d.billEvents) ? d.billEvents : row.originalSale?.billEvents,
  };
  return {
    ...row,
    subtotal: Number(d.subtotal ?? row.subtotal) || 0,
    gstAmount: Number(d.taxAmount ?? d.gstAmount ?? row.gstAmount) || 0,
    totalAmount: Number(d.totalAmount ?? row.totalAmount) || 0,
    advanceUsed: Number(d.advanceUsed ?? row.advanceUsed) || 0,
    paidAmount: Number(d.paidAmount ?? row.paidAmount) || 0,
    paidDisplay: Number(d.totalPaid ?? d.paidAmount ?? row.paidDisplay) || 0,
    paidBillPaymentsOnly: Number(d.totalPaid ?? d.paidAmount ?? row.paidBillPaymentsOnly ?? row.paidDisplay) || 0,
    paidIncludingAdvance: Number(
      (
        Number(d.totalPaid ?? d.paidAmount ?? 0) + Number(d.advanceUsed ?? row.advanceUsed ?? 0)
      ).toFixed(2)
    ),
    balanceDue:
      d.amountDue != null && d.amountDue !== ''
        ? Number(d.amountDue)
        : d.balanceDue != null && d.balanceDue !== ''
          ? Number(d.balanceDue)
          : row.balanceDue != null
            ? Number(row.balanceDue)
            : row.balanceDue,
    paymentStatus: d.paymentStatus != null && d.paymentStatus !== '' ? d.paymentStatus : row.paymentStatus,
    paymentMode: d.paymentMode ?? d.paymentMethod ?? row.paymentMode,
    paymentModeRaw: d.paymentMode ?? d.paymentMethod ?? row.paymentModeRaw,
    billLifecycleStatus:
      d.billLifecycleStatus != null && d.billLifecycleStatus !== ''
        ? d.billLifecycleStatus
        : row.billLifecycleStatus,
    returnSummary: d.returnSummary != null ? d.returnSummary : row.returnSummary,
    returnHistory: Array.isArray(d.returnHistory) ? d.returnHistory : row.returnHistory,
    supplementaryBills: Array.isArray(d.supplementaryBills) ? d.supplementaryBills : row.supplementaryBills,
    billEvents: Array.isArray(d.billEvents) ? d.billEvents : row.billEvents,
    originalSale,
  };
}

/** Amount still owed: prefer API amountDue/balanceDue, else total − advance − paid. */
function computeBalanceDueForBill(bill) {
  if (!bill) return 0;
  const fromApi = Number(bill.amountDue ?? bill.balanceDue);
  if (Number.isFinite(fromApi) && fromApi >= 0) return fromApi;
  const total = Number(bill.totalAmount) || 0;
  const paid =
    Number(bill.totalPaid ?? bill.paidDisplay ?? bill.paidAmount) || 0;
  const adv = Number(bill.advanceUsed ?? bill.originalSale?.advanceUsed) || 0;
  return Math.max(0, Number((total - adv - paid).toFixed(2)));
}

function getBillPaymentStatusKey(bill) {
  if (!bill) return '';
  const raw = bill.paymentStatus ?? bill.originalSale?.paymentStatus ?? '';
  return String(raw).trim().toUpperCase();
}

/** Cancelled / superseded bills: view & PDF only in the row ⋮ menu. */
function billIsReadOnlyInSalesList(bill) {
  if (!bill) return true;
  if (bill.isCancelled) return true;
  if (getBillPaymentStatusKey(bill) === 'CANCELLED') return true;
  const life = String(
    bill.billLifecycleStatus ??
      bill.billStatus ??
      bill.originalSale?.billLifecycleStatus ??
      bill.originalSale?.billStatus ??
      ''
  )
    .trim()
    .toUpperCase();
  return life === 'CANCELLED' || life === 'SUPERSEDED';
}

/**
 * Enable "Add payment" only for Due / Pending / Partial with a positive balance.
 * Paid and cancelled bills are read-only for new payments.
 */
function billAllowsAdditionalPayment(bill) {
  if (!bill) return false;
  const st = getBillPaymentStatusKey(bill);
  if (st === 'PAID' || st === 'CANCELLED') return false;
  const balance = computeBalanceDueForBill(bill);
  if (balance <= 0.005) return false;
  if (st === 'DUE' || st === 'PENDING' || st === 'PARTIAL') return true;
  if (!st) return true;
  return false;
}

/** Physical return entry (does not rewrite bill lines). Block cancelled / fully returned lifecycle. */
function billAllowsStockReturn(bill) {
  if (!bill) return false;
  const pay = getBillPaymentStatusKey(bill);
  if (pay === 'CANCELLED') return false;
  const life = String(bill.billLifecycleStatus || bill.originalSale?.billLifecycleStatus || '').trim().toUpperCase();
  if (
    life === 'FULLY_RETURNED' ||
    life === 'RETURNED' ||
    life === 'CANCELLED' ||
    life === 'SUPERSEDED' ||
    life === 'LOCKED'
  ) {
    return false;
  }
  return true;
}

/** Supplementary child bill: parent must stay valid (mirrors backend assertParent*AllowsSupplementary). */
function billAllowsSupplementaryExchange(bill) {
  if (!bill?.id || !bill?.billType) return false;
  if (getBillPaymentStatusKey(bill) === 'CANCELLED') return false;
  const life = String(bill.billLifecycleStatus || bill.originalSale?.billLifecycleStatus || '')
    .trim()
    .toUpperCase();
  if (['CANCELLED', 'SUPERSEDED', 'FULLY_RETURNED', 'LOCKED', 'EXCHANGED'].includes(life)) {
    return false;
  }
  const rs = bill.returnSummary ?? bill.originalSale?.returnSummary;
  if (rs != null) {
    const eff = Number(rs.effectiveSoldQuantityRemaining);
    if (Number.isFinite(eff) && eff <= 0.0005) return false;
  }
  return true;
}

/** True when every sold quantity has been returned (safe to offer bill cancel/delete). */
function billAllItemsReturned(bill) {
  if (!bill) return false;
  const life = String(
    bill.billLifecycleStatus ??
      bill.billStatus ??
      bill.originalSale?.billLifecycleStatus ??
      bill.originalSale?.billStatus ??
      ''
  )
    .trim()
    .toUpperCase();
  if (life === 'FULLY_RETURNED' || life === 'RETURNED') return true;
  const rs = bill.returnSummary ?? bill.originalSale?.returnSummary;
  if (rs != null) {
    const eff = Number(rs.effectiveSoldQuantityRemaining);
    if (Number.isFinite(eff) && eff <= 0.0005) return true;
    const orig = Number(rs.originalInvoiceQuantity);
    const ret = Number(rs.cumulativeReturnedQuantity);
    if (Number.isFinite(orig) && orig > 0.0005 && Number.isFinite(ret) && ret >= orig - 0.0005) {
      return true;
    }
  }
  return false;
}

function billIsDraftRow(row) {
  const life = String(
    row?.billLifecycleStatus ?? row?.billStatus ?? row?.originalSale?.billLifecycleStatus ?? ''
  )
    .trim()
    .toUpperCase();
  return life === 'DRAFT';
}

/** Row ⋮ menu: View, Adjust/Exchange, PDF, Cancel bill. Payments/returns are inside View. */
function SalesRowActionsMenu({
  row,
  onView,
  onAdjustExchange,
  onPdf,
  onCancel,
  readOnly = false
}) {
  const menuRef = useRef(null);
  const items = useMemo(() => {
    const locked = readOnly || billIsReadOnlyInSalesList(row);
    const base = [{ label: 'View', icon: 'pi pi-eye', command: () => void onView(row) }];
    if (!locked && typeof onAdjustExchange === 'function' && billAllowsSupplementaryExchange(row)) {
      base.push({
        label: 'Adjust bill / Exchange',
        icon: 'pi pi-sync',
        command: () => void onAdjustExchange(row)
      });
    }
    base.push({ label: 'Download PDF', icon: 'pi pi-file-pdf', command: () => void onPdf(row) });
    if (!locked) {
      base.push(
        { separator: true },
        {
          label: billIsDraftRow(row) ? 'Delete draft' : 'Cancel bill',
          icon: 'pi pi-trash',
          className: 'sales-dash-menu-delete',
          command: () => void onCancel(row)
        }
      );
    }
    return base;
  }, [row, readOnly, onView, onAdjustExchange, onPdf, onCancel]);

  return (
    <div className="sales-dash-actions-menu">
      <Menu
        ref={menuRef}
        model={items}
        popup
        popupAlignment="right"
        className="sales-dash-bill-actions-menu"
      />
      <Button
        type="button"
        icon="pi pi-ellipsis-v"
        rounded
        text
        className="sales-dash-actions-trigger"
        aria-haspopup
        aria-label={row?.billNumber ? `Actions for bill ${row.billNumber}` : 'Bill actions'}
        onClick={(e) => menuRef.current?.toggle(e)}
      />
    </div>
  );
}

const Sales = ({ setActiveNav }) => {
  const today = new Date();
  const [dateFrom, setDateFrom] = useState(today);
  const [dateTo, setDateTo] = useState(today);
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearchQuery = useDebouncedValue(searchQuery, 250);
  const [billTypeFilter, setBillTypeFilter] = useState('ALL');
  const [paymentModeFilter, setPaymentModeFilter] = useState('ALL');
  const [salesListTab, setSalesListTab] = useState('active');
  const [toast, setToast] = useState({ message: '', type: 'success' });
  const { sales, loading, paymentBandTotals, refreshSales } = useSalesData(dateFrom, dateTo);

  const [isBillPopupVisible, setBillPopupVisible] = useState(false);
  const [editPageBill, setEditPageBill] = useState(null);
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
  const [billDetailLoading, setBillDetailLoading] = useState(false);
  const [productCatalog, setProductCatalog] = useState([]);
  const [productCatalogLoading, setProductCatalogLoading] = useState(false);
  const [productSuggestions, setProductSuggestions] = useState([]);

  const [stockReturnOpen, setStockReturnOpen] = useState(false);
  const [stockReturnRefundMode, setStockReturnRefundMode] = useState('NO_REFUND');
  const [stockReturnCashRail, setStockReturnCashRail] = useState('CASH');
  const [stockReturnQtyById, setStockReturnQtyById] = useState({});
  const [stockReturnNotes, setStockReturnNotes] = useState('');
  const [stockReturnSubmitting, setStockReturnSubmitting] = useState(false);

  const [cancelBillOpen, setCancelBillOpen] = useState(false);
  const [cancelBillTarget, setCancelBillTarget] = useState(null);

  const [adjustExchangeOpen, setAdjustExchangeOpen] = useState(false);
  const [adjustExchangeBill, setAdjustExchangeBill] = useState(null);
  const [adjustExchangeSession, setAdjustExchangeSession] = useState(null);
  const [adjustExchangeLoading, setAdjustExchangeLoading] = useState(false);
  const [billDetailTab, setBillDetailTab] = useState('details');
  const [adjustmentHistory, setAdjustmentHistory] = useState(null);
  const [adjustmentHistoryLoading, setAdjustmentHistoryLoading] = useState(false);

  const canAddMorePayments = useMemo(() => {
    if (!selectedBill || billDetailLoading) return false;
    return billAllowsAdditionalPayment(selectedBill);
  }, [selectedBill, billDetailLoading]);

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
        const raw = await getBillCancellations(fromIso, toIso);
        const rows = Array.isArray(raw) ? raw : Array.isArray(raw?.data) ? raw.data : [];
        if (!ignore) setCancellations(rows);
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

  // Load catalog when the bill dialog opens so the Item dropdown is ready before Edit;
  // always clear loading in `finally` so Strict Mode / closing the dialog never leaves
  // productCatalogLoading stuck true (which blocked refetch and showed "Loading products…" forever).
  useEffect(() => {
    if (!isBillPopupVisible) return;
    if (productCatalog.length > 0) return;
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
        setProductCatalogLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isBillPopupVisible, productCatalog.length]);

  // Prepare data for DataTable
  const prepareSalesData = useMemo(() => {
    return sales
      .filter((sale) => {
        if (sale.isCancelled) return false;
        const pay = String(sale.paymentStatus ?? '').trim().toUpperCase();
        if (pay === 'CANCELLED') return false;
        const life = String(sale.billLifecycleStatus ?? sale.billStatus ?? '').trim().toUpperCase();
        if (life === 'CANCELLED' || life === 'SUPERSEDED') return false;
        return true;
      })
      .map(sale => {
        const billId = sale.id || sale.billId;
        const billNumber = sale.billNumber || sale.billId || billId || '-';
        const billDate = sale.billDate || sale.createdAt || sale.date;
        const customerNumber = sale.customerMobileNumber || sale.customerNumber || sale.customerPhone || '-';
        const customerName =
          String(
            sale.customerName ??
              sale.customer_name ??
              sale.name ??
              sale.customer?.customerName ??
              sale.customer?.name ??
              ''
          ).trim() || '—';
        const items = sale.items || sale.billItems || [];

        // Normalize billType
        let billType = sale.billType || (sale.gstPaid ? 'GST' : 'NON-GST');
        const billTypeUpper = (billType || '').toUpperCase();
        if (billTypeUpper !== 'GST') {
          billType = 'NON-GST';
        } else {
          billType = 'GST';
        }

        const totalAmount = Number(sale.totalAmount) || 0;
        const advanceUsed = Number(sale.advanceUsed) || 0;
        const paidDisplay =
          Number(sale.totalPaid ?? sale.paidDisplay ?? sale.paidAmount) || 0;
        /** Cash/UPI/bank/cheque collected on the bill (excludes wallet advance). */
        const paidBillPaymentsOnly = paidDisplay;
        /** Total settled toward the bill including customer advance (matches business “received”). */
        const paidIncludingAdvance = Number(
          (paidBillPaymentsOnly + advanceUsed).toFixed(2)
        );
        const fromApiDue = Number(sale.amountDue ?? sale.balanceDue);
        const balanceDue =
          Number.isFinite(fromApiDue) && fromApiDue >= 0
            ? fromApiDue
            : Math.max(0, Number((totalAmount - advanceUsed - paidDisplay).toFixed(2)));
        const isGST = billType === 'GST';
        const gstRate =
          sale.taxPercentage != null && sale.taxPercentage !== ''
            ? Number(sale.taxPercentage)
            : sale.gstRate != null && sale.gstRate !== ''
              ? Number(sale.gstRate)
              : isGST
                ? 18
                : 0;

        return {
          ...sale,
          billId,
          billNumber,
          billDate,
          customerNumber,
          customerName,
          items,
          billType,
          isGST,
          gstRate,
          advanceUsed,
          paidDisplay,
          paidBillPaymentsOnly,
          paidIncludingAdvance,
          balanceDue
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

  /**
   * Bills filtered by every active filter EXCEPT bill type (date range,
   * search, payment mode). Bill type is now controlled by the GST / Non-GST
   * tab split below, so it's intentionally excluded here.
   */
  const commonFilteredSales = useMemo(() => {
      const q = normalizeSearchText(debouncedSearchQuery);
    return dateRangeFilteredSales.filter((row) => {
      if (paymentModeFilter && paymentModeFilter !== 'ALL') {
        const band = getPaymentBand(row.paymentMode);
        if (band !== paymentModeFilter) return false;
      }
      if (!q) return true;
      const billNo = normalizeSearchText(row.billNumber);
      const cust = normalizeSearchText(row.customerNumber);
      const custName = normalizeSearchText(
        row.customerName && row.customerName !== '—' ? row.customerName : ''
      );
      const pm = normalizeSearchText(formatPaymentModeLabel(row.paymentMode));
      const type = normalizeSearchText(row.billType);
      return (
        billNo.includes(q) ||
        cust.includes(q) ||
        custName.includes(q) ||
        pm.includes(q) ||
        type.includes(q)
      );
    });
  }, [dateRangeFilteredSales, debouncedSearchQuery, paymentModeFilter]);

  /** Regular bills (Non-GST) — these are the only bills that count as "real" sales. */
  const nonGstFilteredSales = useMemo(
    () => commonFilteredSales.filter((r) => String(r.billType || '').toUpperCase() !== 'GST'),
    [commonFilteredSales]
  );

  /** B2B GST bills — kept entirely separate from in-hand cash and stock. */
  const gstFilteredSales = useMemo(
    () => commonFilteredSales.filter((r) => String(r.billType || '').toUpperCase() === 'GST'),
    [commonFilteredSales]
  );

  /**
   * The slice of sales the active tab is responsible for. KPIs and the payment-
   * method breakdown both follow this so the cards always describe the table
   * the user is looking at, and GST B2B bills never bleed into Non-GST totals.
   */
  const activeTabSales = useMemo(() => {
    if (salesListTab === 'gst') return gstFilteredSales;
    return nonGstFilteredSales;
  }, [salesListTab, nonGstFilteredSales, gstFilteredSales]);

  const filteredCancellations = useMemo(() => {
    const q = normalizeSearchText(debouncedSearchQuery);
    const rows = Array.isArray(cancellations) ? cancellations : [];
    if (!q) return rows;
    return rows.filter((row) => {
      const name = normalizeSearchText(row.customerName || row.customer_name || '');
      const phone = normalizeSearchText(row.customerPhone || row.customer_phone || '');
      const billNo = normalizeSearchText(row.billNumber || '');
      const kind = normalizeSearchText(row.billKind || '');
      return name.includes(q) || phone.includes(q) || billNo.includes(q) || kind.includes(q);
    });
  }, [cancellations, debouncedSearchQuery]);

  const cancelledPeriodStats = useMemo(() => {
    const rows = Array.isArray(cancellations) ? cancellations : [];
    let total = 0;
    for (const row of rows) {
      total += Number(row.totalAmount) || 0;
    }
    return {
      count: rows.length,
      total: Number(total.toFixed(2)),
    };
  }, [cancellations]);

  const kpiTotals = useMemo(() => {
    // KPIs reflect the currently selected tab (Non-GST or GST B2B). They never
    // mix the two so GST bills don't inflate Non-GST "in-hand" / Total Received.
    const rows = activeTabSales;
    let totalSales = 0;
    /** Sum of bill_payment lines only (counter collections). */
    let totalBillPayments = 0;
    /** Customer wallet applied on bills in period. */
    let totalAdvanceOnBills = 0;
    let totalPending = 0;
    for (const r of rows) {
      const totalAmount = Number(r.totalAmount) || 0;
      const billPayments = Number(r.paidBillPaymentsOnly ?? r.paidDisplay) || 0;
      const advanceUsed = Number(r.advanceUsed) || 0;
      const balanceDue = Number(r.balanceDue) || 0;

      totalSales += totalAmount;
      totalBillPayments += billPayments;
      totalAdvanceOnBills += advanceUsed;
      totalPending += balanceDue;
    }
    const totalReceived = Number((totalBillPayments + totalAdvanceOnBills).toFixed(2));
    const coveredByPayments = Number((totalReceived + totalPending).toFixed(2));
    const salesVsCoveredDelta = Number((totalSales - coveredByPayments).toFixed(2));
    return {
      totalSales,
      /** Payments + advance applied (full “money toward bills” for the period). */
      totalReceived,
      totalBillPayments,
      totalAdvanceOnBills,
      totalPending,
      coveredByPayments,
      salesVsCoveredDelta,
      periodCount: rows.length
    };
  }, [activeTabSales]);

  const adjustmentKpis = useMemo(() => {
    if (salesListTab === 'gst') return null;
    const rows = activeTabSales;
    let gross = 0;
    let supplementary = 0;
    let returns = 0;
    for (const r of rows) {
      const amt = Number(r.totalAmount) || 0;
      const isSupp =
        r.supplementaryBill === true ||
        r.isSupplementary === true ||
        String(r.billLifecycleStatus || '').toUpperCase() === 'SUPPLEMENTARY' ||
        String(r.billStatus || '').toUpperCase() === 'SUPPLEMENTARY';
      if (isSupp) supplementary += amt;
      else gross += amt;
      returns += Number(r.returnSummary?.cumulativeReturnedValue ?? 0);
    }
    return {
      gross: Number(gross.toFixed(2)),
      supplementary: Number(supplementary.toFixed(2)),
      returns: Number(returns.toFixed(2)),
      net: Number((gross - returns + supplementary).toFixed(2)),
    };
  }, [activeTabSales, salesListTab]);

  /**
   * Breakdown that sums to Total Received exactly (same bill-date axis as KPIs).
   * For each bill in the period we bucket payments[] by mode, then add a per-bill
   * "Adjustments" residual = bill.totalPaid − sum(payments[] excluding wallet).
   * That residual is normally 0; it's non-zero when payments[] returned by the API
   * doesn't match the bill's stored paid amount (legacy PAID bills, refunds, etc.).
   */
  const paymentBreakdownExact = useMemo(() => {
    // Mirror KPIs: breakdown follows the same filtered row set so it always
    // reconciles with the Total Received card for the active tab.
    const rows = activeTabSales;
    const round2 = (n) => Math.round(n * 100) / 100;
    let cash = 0;
    let upi = 0;
    let bank = 0;
    let chequeOther = 0;
    let advance = 0;
    let adjustments = 0;
    const adjustmentBills = [];
    for (const r of rows) {
      const payments = Array.isArray(r.payments)
        ? r.payments
        : Array.isArray(r.originalSale?.payments)
          ? r.originalSale.payments
          : [];
      const expectedPaid = Number(r.paidBillPaymentsOnly ?? r.totalPaid ?? r.paidAmount ?? r.paidDisplay) || 0;
      let bucketedPaid = 0;
      for (const p of payments) {
        const amt = Number(p?.amount) || 0;
        if (amt === 0) continue;
        const mode = String(p?.paymentMode || p?.paymentMethod || '').trim().toUpperCase();
        if (mode === 'WALLET' || mode === 'ADVANCE') {
          // wallet rows are not counted here; advanceUsed is added once per bill below
          continue;
        }
        bucketedPaid += amt;
        if (mode === 'CASH') cash += amt;
        else if (mode === 'UPI') upi += amt;
        else if (
          mode === 'BANK_TRANSFER' ||
          mode === 'BANK' ||
          mode === 'NETBANKING' ||
          mode === 'BANK TRANSFER'
        )
          bank += amt;
        else chequeOther += amt;
      }
      const residual = round2(expectedPaid - bucketedPaid);
      if (Math.abs(residual) > 0.005) {
        adjustments += residual;
        adjustmentBills.push({
          billNumber: r.billNumber,
          customerName: r.customerName,
          expectedPaid,
          bucketedPaid: round2(bucketedPaid),
          residual,
          paymentMode: r.paymentModeRaw || r.paymentMode || ''
        });
      }
      advance += Number(r.advanceUsed) || 0;
    }
    cash = round2(cash);
    upi = round2(upi);
    bank = round2(bank);
    chequeOther = round2(chequeOther);
    advance = round2(advance);
    adjustments = round2(adjustments);
    const sum = round2(cash + upi + bank + chequeOther + advance + adjustments);
    const pct = (x) => (sum > 0 ? Math.round((x / sum) * 100) : 0);
    return {
      cash,
      upi,
      bank,
      other: chequeOther,
      advance,
      adjustments,
      adjustmentBills,
      sum,
      pctCash: pct(cash),
      pctUpi: pct(upi),
      pctBank: pct(bank),
      pctOther: pct(chequeOther),
      pctAdvance: pct(advance),
      pctAdjustments: pct(adjustments)
    };
  }, [activeTabSales]);

  const paymentBreakdown = useMemo(() => {
    const c = Number(paymentBandTotals.cash) || 0;
    const u = Number(paymentBandTotals.upi) || 0;
    const b = Number(paymentBandTotals.bankTransfer) || 0;
    const o = (Number(paymentBandTotals.other) || 0) + (Number(paymentBandTotals.cheque) || 0);
    const sum = c + u + b + o;
    const pct = (x) => (sum > 0 ? Math.round((x / sum) * 100) : 0);
    return { cash: c, upi: u, bank: b, other: o, sum, pctCash: pct(c), pctUpi: pct(u), pctBank: pct(b), pctOther: pct(o) };
  }, [paymentBandTotals]);

  const formatCurrency = (n) =>
    `₹${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  // Format date for display
  const formatDate = (dateString) => {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-IN');
  };

  const formatDayShort = (d) => {
    if (!d) return '—';
    const dt = d instanceof Date ? d : new Date(d);
    if (Number.isNaN(dt.getTime())) return '—';
    return dt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  const handleResetAllFilters = () => {
    const t = new Date();
    setDateFrom(t);
    setDateTo(t);
    setSearchQuery('');
    setBillTypeFilter('ALL');
    setPaymentModeFilter('ALL');
  };

  const handleExportCsv = () => {
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = [];
    if (salesListTab === 'active' || salesListTab === 'gst') {
      const rows = salesListTab === 'gst' ? gstFilteredSales : nonGstFilteredSales;
      lines.push(['BillNo', 'Customer', 'Phone', 'Date', 'Items', 'Type', 'Amount', 'Paid', 'Balance', 'PaidVia'].join(','));
      for (const r of rows) {
        lines.push(
          [
            esc(r.billNumber),
            esc(r.customerName),
            esc(r.customerNumber),
            r.billDate ? new Date(r.billDate).toISOString() : '',
            r.itemsCount,
            esc(r.billType),
            Number(r.totalAmount) || 0,
            Number(r.paidIncludingAdvance ?? r.paidDisplay) || 0,
            Number(r.balanceDue) || 0,
            esc(r.paymentModeRaw || formatPaymentModeLabel(r.paymentMode) || '')
          ].join(',')
        );
      }
    } else {
      lines.push(['CancelledAt', 'BillDate', 'BillNo', 'Type', 'Customer', 'Phone', 'Total', 'Paid'].join(','));
      for (const r of filteredCancellations) {
        lines.push(
          [
            esc(r.cancelledAt),
            esc(r.billDate),
            esc(r.billNumber),
            esc(String(r.billKind || '').includes('NON') ? 'NON-GST' : 'GST'),
            esc(r.customerName || r.customer_name),
            esc(r.customerPhone || r.customer_phone),
            Number(r.totalAmount) || 0,
            Number(r.paidFromPayments) || 0
          ].join(',')
        );
      }
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download =
      salesListTab === 'gst'
        ? 'gst-bills.csv'
        : salesListTab === 'cancelled'
          ? 'cancelled-bills.csv'
          : 'sales-bills.csv';
    a.click();
    URL.revokeObjectURL(url);
    setToast({ message: 'CSV file downloaded.', type: 'success' });
  };

  // Column templates
  const billNumberBodyTemplate = (rowData) => {
    return <span className="sales-dash-bill-no">{rowData.billNumber}</span>;
  };

  const dateBodyTemplate = (rowData) => {
    return rowData.billDate ? formatDate(rowData.billDate) : '-';
  };

  const billTypeBodyTemplate = (rowData) => {
    const label = rowData.isGST ? `GST ${rowData.gstRate}%` : 'NON-GST';
    return <Tag value={label} severity={rowData.isGST ? 'info' : 'secondary'} />;
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

  const handleOpenEditPage = (bill) => {
    setEditPageBill(bill);
  };

  const handlePdfFromRow = async (bill) => {
    try {
      await downloadBillPDF(bill.id, bill.billType);
      setToast({ message: 'Bill PDF downloaded successfully.', type: 'success' });
    } catch (error) {
      setToast({ message: error?.message || 'Unable to download bill PDF.', type: 'error' });
    }
  };

  const handleOpenCancelBill = (bill) => {
    if (!bill?.id) return;
    setCancelBillTarget(bill);
    setCancelBillOpen(true);
  };

  const handleCancelBillSuccess = async () => {
    window.dispatchEvent(new CustomEvent('kataria-ledger-refresh'));
    await refreshSales();
    try {
      const todayIso = toIsoDate(new Date());
      const fromIso = toIsoDate(dateFrom) || todayIso;
      const toIso = toIsoDate(dateTo) || fromIso;
      const raw = await getBillCancellations(fromIso, toIso);
      const rows = Array.isArray(raw) ? raw : Array.isArray(raw?.data) ? raw.data : [];
      setCancellations(rows);
    } catch {
      /* best-effort */
    }
    setToast({
      message: 'Bill cancelled; stock and payments reversed in the ledger.',
      type: 'success',
    });
    if (selectedBill && cancelBillTarget && String(selectedBill.id) === String(cancelBillTarget.id)) {
      closeBillPopup();
    }
    setCancelBillTarget(null);
  };

  const actionsBodyTemplate = (rowData) => (
    <SalesRowActionsMenu
      row={rowData}
      readOnly={salesListTab === 'cancelled'}
      onView={handleViewBillDetails}
      onAdjustExchange={handleOpenAdjustExchangeGuide}
      onPdf={handlePdfFromRow}
      onCancel={handleOpenCancelBill}
    />
  );

  const handleViewBillDetails = async (bill) => {
    if (!bill?.id) {
      setToast({ message: 'Bill id is missing; cannot load details.', type: 'error' });
      throw new Error('missing bill id');
    }
    setSelectedBill(bill);
    setPaymentAddAmount('');
    setPaymentAddMode('CASH');
    setEditMode(false);
    setEditDraft(null);
    setBillDetailTab('details');
    setAdjustmentHistory(null);
    setBillPopupVisible(true);
    setBillDetailLoading(true);
    try {
      const raw = await fetchBillByTypeAndId(bill.id, bill.billType);
      const detail = unwrapBillEnvelope(raw);
      setSelectedBill((prev) => (prev && prev.id === bill.id ? mergeBillWithFullDetail(prev, detail) : prev));
    } catch (err) {
      console.error('[Sales] load bill detail', err);
      setToast({
        message: err?.message || 'Could not load full bill (items, charges, payments).',
        type: 'error',
      });
      throw err;
    } finally {
      setBillDetailLoading(false);
    }
  };

  /** Refetch full bill into the open dialog (e.g. after add/delete payment without closing). */
  const reloadBillDetailInDialog = async (billId, billType) => {
    const id = billId ?? selectedBill?.id;
    const type = billType ?? selectedBill?.billType;
    if (id == null || !type) return;
    try {
      const raw = await fetchBillByTypeAndId(id, type);
      const detail = unwrapBillEnvelope(raw);
      setSelectedBill((prev) => {
        if (!prev || String(prev.id) !== String(id)) return prev;
        return mergeBillWithFullDetail(prev, detail);
      });
    } catch (e) {
      console.error('[Sales] reload bill in dialog', e);
      setToast({ message: e?.message || 'Could not refresh bill from server.', type: 'error' });
    }
  };

  const stockReturnPreviewTotal = useMemo(() => {
    if (!selectedBill || !stockReturnOpen) return 0;
    return computeReturnSettlementPreview(selectedBill, stockReturnQtyById, Boolean(selectedBill.isGST));
  }, [selectedBill, stockReturnQtyById, stockReturnOpen]);

  const stockReturnableItems = useMemo(() => {
    const items = selectedBill?.originalSale?.items;
    if (!Array.isArray(items)) return [];
    return items.filter((it) => {
      const id = Number(it.itemId);
      if (!Number.isFinite(id) || id <= 0) return false;
      const max = Number(it.quantityReturnable ?? it.quantity);
      return Number.isFinite(max) && max > 0;
    });
  }, [selectedBill]);

  const handleOpenStockReturn = async (bill) => {
    if (!bill?.id || !bill?.billType) return;
    if (!billAllowsStockReturn(bill)) {
      setToast({
        message: 'This bill cannot accept stock returns (cancelled, locked, or fully returned).',
        type: 'error'
      });
      return;
    }
    setStockReturnRefundMode('NO_REFUND');
    setStockReturnCashRail('CASH');
    setStockReturnQtyById({});
    setStockReturnNotes('');
    setSelectedBill(bill);
    setBillDetailLoading(true);
    try {
      const raw = await fetchBillByTypeAndId(bill.id, bill.billType);
      const detail = unwrapBillEnvelope(raw);
      setSelectedBill((prev) => (prev && prev.id === bill.id ? mergeBillWithFullDetail(prev, detail) : prev));
      setStockReturnOpen(true);
    } catch (err) {
      console.error('[Sales] load bill for return', err);
      setToast({
        message: err?.message || 'Could not load bill lines for return.',
        type: 'error'
      });
    } finally {
      setBillDetailLoading(false);
    }
  };

  const handleOpenAdjustExchangeGuide = async (bill) => {
    if (!bill?.id || !bill?.billType) {
      setToast({ message: 'Bill id missing.', type: 'error' });
      return;
    }
    const isGstBill =
      bill.isGST === true || String(bill.billType || '').toUpperCase().replace(/-/g, '_') === 'GST';
    if (isGstBill) {
      setToast({ message: 'Adjustment / exchange is available for Non-GST bills only.', type: 'error' });
      return;
    }
    setAdjustExchangeLoading(true);
    setAdjustExchangeOpen(true);
    setAdjustExchangeBill(null);
    setAdjustExchangeSession(null);
    try {
      const raw = await openBillAdjustmentSession(bill.id);
      const session = raw?.data ?? raw;
      const detail = session?.originalBill;
      if (!detail) {
        throw new Error('Adjustment session did not return bill details.');
      }
      const enriched = mergeBillWithFullDetail(bill, detail);
      if (!billAllowsSupplementaryExchange(enriched)) {
        setToast({
          message:
            'This bill cannot accept a supplementary exchange (cancelled, superseded, fully returned, exchanged, locked, or no sale quantity left on the parent).',
          type: 'error',
        });
        setAdjustExchangeOpen(false);
        return;
      }
      setAdjustExchangeSession(session);
      setAdjustExchangeBill(enriched);
    } catch (e) {
      setToast({ message: e?.message || 'Could not open exchange guide.', type: 'error' });
      setAdjustExchangeOpen(false);
    } finally {
      setAdjustExchangeLoading(false);
    }
  };

  const handleSubmitStockReturn = async () => {
    if (!selectedBill?.id || !selectedBill?.billType) return;
    const lines = [];
    for (const it of stockReturnableItems) {
      const id = Number(it.itemId);
      const max = Number(it.quantityReturnable ?? it.quantity) || 0;
      const q = Number(stockReturnQtyById[id]);
      if (!Number.isFinite(q) || q <= 0) continue;
      if (q > max + 1e-6) {
        setToast({
          message: `Return qty cannot exceed returnable (${max}) for line ${it.itemName || id}.`,
          type: 'error'
        });
        return;
      }
      lines.push({ billItemId: id, quantity: q });
    }
    if (lines.length === 0) {
      setToast({ message: 'Enter return quantity on at least one line.', type: 'error' });
      return;
    }
    try {
      setStockReturnSubmitting(true);
      const payload = {
        refundMode: stockReturnRefundMode,
        notes: stockReturnNotes.trim() || undefined,
        lines
      };
      if (stockReturnRefundMode === 'CASH_REFUND') {
        payload.refundPaymentMode = stockReturnCashRail;
      }
      const res = await submitBillStockReturn(selectedBill.id, selectedBill.billType, payload);
      const unwrapped = res && typeof res === 'object' && res.data != null ? res.data : res;
      const computed = Number(
        unwrapped?.computedReturnAmount ?? stockReturnPreviewTotal
      );
      const posted = Number(unwrapped?.postedSettlementAmount ?? (stockReturnRefundMode === 'NO_REFUND' ? 0 : computed));
      setStockReturnOpen(false);
      window.dispatchEvent(new CustomEvent('kataria-ledger-refresh'));
      await refreshSales();
      setToast({
        message:
          `Stock return recorded. Computed ₹${Number.isFinite(computed) ? computed.toFixed(2) : '0.00'}` +
          (Number.isFinite(posted) && posted > 0 ? ` · Booked ₹${posted.toFixed(2)}` : ''),
        type: 'success'
      });
    } catch (e) {
      setToast({ message: e?.message || 'Return could not be saved.', type: 'error' });
    } finally {
      setStockReturnSubmitting(false);
    }
  };

  const closeBillPopup = () => {
    setBillPopupVisible(false);
    setSelectedBill(null);
    setEditMode(false);
    setEditDraft(null);
    setBillDetailLoading(false);
    setBillDetailTab('details');
    setAdjustmentHistory(null);
  };

  useEffect(() => {
    if (!isBillPopupVisible || billDetailTab !== 'adjustments' || !selectedBill?.id || selectedBill.isGST) {
      return;
    }
    let cancelled = false;
    setAdjustmentHistoryLoading(true);
    fetchBillAdjustments(selectedBill.id)
      .then((raw) => {
        if (!cancelled) setAdjustmentHistory(raw?.data ?? raw);
      })
      .catch((e) => {
        if (!cancelled) {
          setAdjustmentHistory(null);
          setToast({ message: e?.message || 'Could not load adjustment history.', type: 'error' });
        }
      })
      .finally(() => {
        if (!cancelled) setAdjustmentHistoryLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isBillPopupVisible, billDetailTab, selectedBill?.id, selectedBill?.isGST]);

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
            hsnNumber: '',
            isNewLine: true
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

  /** Live totals for edit sidebar (approximates GST on discounted subtotal). */
  const editBillTotals = useMemo(() => {
    if (!editMode || !editDraft || !selectedBill) return null;
    const items = editDraft.items || [];
    const itemsSubtotal = items.reduce(
      (s, it) => s + (Number(it.quantity) || 0) * (Number(it.pricePerUnit) || 0),
      0
    );
    const discount = Number(editDraft.discountAmount) || 0;
    const afterDisc = Math.max(0, itemsSubtotal - discount);
    const taxPct = Number(editDraft.taxPercentage) || 0;
    const labour = Number(editDraft.labourCharge) || 0;
    const transport = Number(editDraft.transportationCharge) || 0;
    const other = Number(editDraft.otherExpenses) || 0;
    const gstAmount = selectedBill.isGST ? afterDisc * (taxPct / 100) : 0;
    const finalAmount = afterDisc + gstAmount + labour + transport + other;
    const payments = selectedBill.originalSale?.payments || [];
    const totalPaid = payments.reduce((s, p) => {
      if (String(p?.paymentMode || '').toUpperCase() === 'WALLET') return s;
      return s + (Number(p.amount) || 0);
    }, 0);
    const advanceUsed = Number(selectedBill.advanceUsed ?? selectedBill.originalSale?.advanceUsed) || 0;
    const balanceDue = Math.max(0, finalAmount - advanceUsed - totalPaid);
    return {
      itemsSubtotal,
      discount,
      afterDisc,
      gstAmount,
      labour,
      transport,
      other,
      finalAmount,
      totalPaid,
      advanceUsed,
      balanceDue,
      taxPct
    };
  }, [editMode, editDraft, selectedBill]);

  const handleClearAllEditItems = () => {
    if (!editDraft) return;
    const ok = window.confirm('Remove all line items and start with one blank row?');
    if (!ok) return;
    const id = `new-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    setEditDraft((prev) =>
      prev
        ? {
            ...prev,
            items: [
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
                hsnNumber: '',
                isNewLine: true
              }
            ]
          }
        : null
    );
  };

  const handleCancelBillEdit = () => {
    setEditMode(false);
    setEditDraft(null);
  };

  const handlePreviewBillInDialog = async () => {
    if (!selectedBill?.id || !selectedBill?.billType) return;
    try {
      await downloadBillPDF(selectedBill.id, selectedBill.billType);
      setToast({ message: 'Bill PDF downloaded.', type: 'success' });
    } catch (error) {
      setToast({ message: error?.message || 'Could not download PDF.', type: 'error' });
    }
  };

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
      billDate: editDraft.billDate || undefined
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
    if (!billAllowsAdditionalPayment(selectedBill)) {
      setToast({
        message: 'Add payment is only allowed when the bill is Due, Pending, or Partially paid with a balance due.',
        type: 'error',
      });
      return;
    }
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
      setPaymentAddAmount('');
      await reloadBillDetailInDialog(selectedBill.id, selectedBill.billType);
      setToast({ message: 'Payment added successfully.', type: 'success' });
      if (!editMode) {
        closeBillPopup();
      }
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
      await reloadBillDetailInDialog(selectedBill.id, selectedBill.billType);
      setToast({ message: 'Payment deleted successfully.', type: 'success' });
      if (!editMode) {
        closeBillPopup();
      }
    } catch (e) {
      setToast({ message: e?.message || 'Payment could not be deleted.', type: 'error' });
    } finally {
      setPaymentSubmitting(false);
    }
  };


  // Filter templates for row-based filtering. The bill-type dropdown was
  // removed in favour of the GST / Non-GST tab split, so the options array
  // has been retired with it.

  const paymentModeFilterOptions = [
    { label: 'All modes', value: 'ALL' },
    { label: 'Cash', value: 'CASH' },
    { label: 'UPI', value: 'UPI' },
    { label: 'Bank transfer', value: 'BANK_TRANSFER' },
    { label: 'Cheque', value: 'CHEQUE' },
    { label: 'Other', value: 'OTHER' }
  ];


  if (editPageBill) {
    return (
      <BillEditPage
        bill={editPageBill}
        onBack={() => setEditPageBill(null)}
        onSaved={() => {
          setEditPageBill(null);
          refreshSales?.();
        }}
        onPaymentsRecorded={() => {
          refreshSales?.();
        }}
      />
    );
  }

  return (
    <div className="sales-dashboard">
      <InlineToast
        message={toast.message}
        type={toast.type}
        onClose={() => setToast({ message: '', type: 'success' })}
      />

      <header className="sales-dash-header">
        <div>
          <h1 className="sales-dash-title">Sales Management</h1>
          <p className="sales-dash-subtitle">Track your sales, payments and manage bills</p>
        </div>
        <div className="sales-dash-header-actions">
          <div className="sales-dash-range-pill" title="Bill date range for KPIs and table">
            <i className="pi pi-calendar" aria-hidden />
            <span>
              {formatDayShort(dateFrom)} – {formatDayShort(dateTo)}
            </span>
          </div>
          <Button type="button" label="Export" icon="pi pi-upload" outlined onClick={handleExportCsv} />
          <Button
            type="button"
            label="New sale"
            icon="pi pi-plus"
            onClick={() => setActiveNav?.('dashboard')}
            title="Open dashboard to create a bill"
          />
        </div>
      </header>

      <section
        className="sales-dash-kpis"
        aria-label={salesListTab === 'gst' ? 'GST B2B summary' : 'Period summary'}
      >
        <div className="sales-kpi-card sales-kpi-card--blue">
          <div className="sales-kpi-icon" aria-hidden>
            <i className="pi pi-chart-line" />
          </div>
          <div className="sales-kpi-body">
            <span className="sales-kpi-label">
              {salesListTab === 'gst' ? 'Total GST sales' : 'Total sales'}
            </span>
            <span className="sales-kpi-value">{formatCurrency(kpiTotals.totalSales)}</span>
            <span className="sales-kpi-hint">
              {salesListTab === 'gst'
                ? 'B2B GST invoices — not counted in in-hand cash'
                : 'Sum of bill amounts for filtered bills'}
            </span>
          </div>
        </div>
        <div className="sales-kpi-card sales-kpi-card--green">
          <div className="sales-kpi-icon" aria-hidden>
            <i className="pi pi-wallet" />
          </div>
          <div className="sales-kpi-body">
            <span className="sales-kpi-label">
              {salesListTab === 'gst' ? 'Received from GST' : 'Total received'}
            </span>
            <span className="sales-kpi-value">{formatCurrency(kpiTotals.totalReceived)}</span>
            <span className="sales-kpi-hint">
              {salesListTab === 'gst'
                ? `Recorded on GST bills (separate from in-hand cash)`
                : `Bill payments ${formatCurrency(kpiTotals.totalBillPayments)} + advance applied ${formatCurrency(kpiTotals.totalAdvanceOnBills)}`}
            </span>
          </div>
        </div>
        <div className="sales-kpi-card sales-kpi-card--red">
          <div className="sales-kpi-icon" aria-hidden>
            <i className="pi pi-clock" />
          </div>
          <div className="sales-kpi-body">
            <span className="sales-kpi-label">
              {salesListTab === 'gst' ? 'Pending on GST' : 'Pending amount'}
            </span>
            <span className="sales-kpi-value">{formatCurrency(kpiTotals.totalPending)}</span>
            <span className="sales-kpi-hint">
              {salesListTab === 'gst'
                ? 'Outstanding on B2B invoices'
                : 'Balance still due on bills'}
            </span>
          </div>
        </div>
        <div className="sales-kpi-card sales-kpi-card--wide">
          <span className="sales-kpi-wide-title">
            Payment method breakdown
            <span
              className="sales-kpi-wide-title-note"
              title="Built from bill.payments[] for the filtered bills (date range + search + type + mode), plus advance applied on those bills. Sums to Total Received."
            >
              {' '}
              (matches Total Received)
            </span>
          </span>
          <div className="sales-kpi-breakdown">
            <div>
              <span className="sales-kpi-br-label">
                <i className="pi pi-wallet" /> Cash
              </span>
              <span className="sales-kpi-br-amt">{formatCurrency(paymentBreakdownExact.cash)}</span>
              <span className="sales-kpi-br-pct">{paymentBreakdownExact.pctCash}%</span>
            </div>
            <div>
              <span className="sales-kpi-br-label">
                <i className="pi pi-mobile" /> UPI
              </span>
              <span className="sales-kpi-br-amt">{formatCurrency(paymentBreakdownExact.upi)}</span>
              <span className="sales-kpi-br-pct">{paymentBreakdownExact.pctUpi}%</span>
            </div>
            <div>
              <span className="sales-kpi-br-label">
                <i className="pi pi-building" /> Bank
              </span>
              <span className="sales-kpi-br-amt">{formatCurrency(paymentBreakdownExact.bank)}</span>
              <span className="sales-kpi-br-pct">{paymentBreakdownExact.pctBank}%</span>
            </div>
            <div>
              <span className="sales-kpi-br-label">
                <i className="pi pi-money-bill" /> Advance
              </span>
              <span className="sales-kpi-br-amt">{formatCurrency(paymentBreakdownExact.advance)}</span>
              <span className="sales-kpi-br-pct">{paymentBreakdownExact.pctAdvance}%</span>
            </div>
            {paymentBreakdownExact.other > 0 ? (
              <div className="sales-kpi-breakdown-other">
                <span className="sales-kpi-br-label">
                  <i className="pi pi-ellipsis-h" /> Other / Cheque
                </span>
                <span className="sales-kpi-br-amt">{formatCurrency(paymentBreakdownExact.other)}</span>
                <span className="sales-kpi-br-pct">{paymentBreakdownExact.pctOther}%</span>
              </div>
            ) : null}
            {Math.abs(paymentBreakdownExact.adjustments) > 0.005 ? (
              <div
                className="sales-kpi-breakdown-other sales-kpi-breakdown-adjustments"
                title={paymentBreakdownExact.adjustmentBills
                  .map(
                    (b) =>
                      `${b.billNumber} (${b.customerName || ''}) → stored paid ${formatCurrency(b.expectedPaid)} vs payment lines ${formatCurrency(b.bucketedPaid)} = ${formatCurrency(b.residual)} (${b.paymentMode || 'no mode'})`
                  )
                  .join('\n')}
              >
                <span className="sales-kpi-br-label">
                  <i className="pi pi-info-circle" /> Adjustments / legacy
                </span>
                <span className="sales-kpi-br-amt">{formatCurrency(paymentBreakdownExact.adjustments)}</span>
                <span className="sales-kpi-br-pct">{paymentBreakdownExact.pctAdjustments}%</span>
              </div>
            ) : null}
            <div className="sales-kpi-breakdown-total">
              <span className="sales-kpi-br-label">Total</span>
              <span className="sales-kpi-br-amt">{formatCurrency(paymentBreakdownExact.sum)}</span>
              <span className="sales-kpi-br-pct">100%</span>
            </div>
          </div>
        </div>
        <div className="sales-kpi-recon-strip" role="note">
          <span className="sales-kpi-recon-formula">
            Total sales ≈ Received + Pending:&nbsp;
            {formatCurrency(kpiTotals.totalReceived)} + {formatCurrency(kpiTotals.totalPending)} ={' '}
            {formatCurrency(kpiTotals.coveredByPayments)}
          </span>
          {Math.abs(kpiTotals.salesVsCoveredDelta) > 0.05 ? (
            <span className="sales-kpi-recon-delta">
              {' '}
              (diff vs total sales {formatCurrency(kpiTotals.salesVsCoveredDelta)} — rounding or unusual payment rows,
              e.g. refunds)
            </span>
          ) : null}
        </div>
        {adjustmentKpis ? (
          <div
            className="sales-kpi-adjustment-strip"
            role="note"
            style={{
              gridColumn: '1 / -1',
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
              gap: '12px',
              padding: '12px 14px',
              borderRadius: '10px',
              border: '1px solid #e2e8f0',
              background: '#f8fafc',
            }}
          >
            <div>
              <span className="sales-kpi-label">Gross sales</span>
              <span className="sales-kpi-value" style={{ display: 'block', fontSize: '1.1rem' }}>
                {formatCurrency(adjustmentKpis.gross)}
              </span>
            </div>
            <div>
              <span className="sales-kpi-label">Stock returns (partial)</span>
              <span className="sales-kpi-value" style={{ display: 'block', fontSize: '1.1rem' }}>
                {formatCurrency(adjustmentKpis.returns)}
              </span>
              <span className="sales-kpi-hint" style={{ display: 'block', fontSize: '0.7rem', marginTop: 2 }}>
                Item returns on active bills — not bill cancellation
              </span>
            </div>
            {cancelledPeriodStats.count > 0 ? (
              <div>
                <span className="sales-kpi-label">Cancelled bills</span>
                <span className="sales-kpi-value" style={{ display: 'block', fontSize: '1.1rem' }}>
                  {formatCurrency(cancelledPeriodStats.total)}
                </span>
                <span className="sales-kpi-hint" style={{ display: 'block', fontSize: '0.7rem', marginTop: 2 }}>
                  {cancelledPeriodStats.count} bill(s) — open Cancelled bills tab
                </span>
              </div>
            ) : null}
            <div>
              <span className="sales-kpi-label">Supplementary</span>
              <span className="sales-kpi-value" style={{ display: 'block', fontSize: '1.1rem' }}>
                {formatCurrency(adjustmentKpis.supplementary)}
              </span>
            </div>
            <div>
              <span className="sales-kpi-label">Net sales</span>
              <span className="sales-kpi-value" style={{ display: 'block', fontSize: '1.1rem' }}>
                {formatCurrency(adjustmentKpis.net)}
              </span>
              <span className="sales-kpi-hint">Gross − returns + supplementary</span>
            </div>
          </div>
        ) : null}
      </section>

      <section className="sales-dash-filters" aria-label="Filters">
        <div className="sales-dash-search-wrap">
          <i className="pi pi-search sales-dash-search-icon" aria-hidden />
          <InputText
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by bill no., customer name, phone…"
            className="sales-dash-search-input"
          />
        </div>
        {/* Bill type is now controlled by the GST / Non-GST tab split, so the
            type dropdown is intentionally removed here to avoid confusion. */}
        <Dropdown
          value={paymentModeFilter}
          options={paymentModeFilterOptions}
          onChange={(e) => setPaymentModeFilter(e.value)}
          placeholder="All modes"
          className="sales-dash-dropdown"
        />
        <div className="sales-dash-date-field">
          <label htmlFor="sales-from-date">From date</label>
          <Calendar
            id="sales-from-date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.value || null)}
            dateFormat="dd/mm/yy"
            placeholder="From"
            showIcon
          />
        </div>
        <div className="sales-dash-date-field">
          <label htmlFor="sales-to-date">To date</label>
          <Calendar
            id="sales-to-date"
            value={dateTo}
            onChange={(e) => setDateTo(e.value || null)}
            dateFormat="dd/mm/yy"
            placeholder="To"
            showIcon
            minDate={dateFrom || undefined}
          />
        </div>
        <Button type="button" label="Reset filters" icon="pi pi-replay" outlined onClick={handleResetAllFilters} />
      </section>

      <section className="sales-dash-table-section">
        <div className="sales-dash-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={salesListTab === 'active'}
            className={`sales-dash-tab ${salesListTab === 'active' ? 'sales-dash-tab--active' : ''}`}
            onClick={() => setSalesListTab('active')}
            title="Regular (Non-GST) sales — counted in in-hand cash and stock movements"
          >
            Non-GST bills ({nonGstFilteredSales.length})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={salesListTab === 'gst'}
            className={`sales-dash-tab ${salesListTab === 'gst' ? 'sales-dash-tab--active' : ''}`}
            onClick={() => setSalesListTab('gst')}
            title="B2B GST invoices — kept separate; not counted in in-hand cash or stock"
          >
            GST bills ({gstFilteredSales.length})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={salesListTab === 'cancelled'}
            className={`sales-dash-tab ${salesListTab === 'cancelled' ? 'sales-dash-tab--active' : ''}`}
            onClick={() => setSalesListTab('cancelled')}
          >
            Cancelled bills ({cancelledPeriodStats.count})
          </button>
        </div>

        {salesListTab === 'gst' ? (
          <div
            className="sales-dash-gst-note"
            role="note"
            style={{
              background: '#fff7ed',
              border: '1px solid #fed7aa',
              color: '#9a3412',
              borderRadius: 8,
              padding: '8px 12px',
              fontSize: 12,
              margin: '8px 0',
            }}
          >
            <strong>B2B GST invoices.</strong> These bills are tracked separately and do NOT
            affect in-hand cash, the regular Total Received, or stock levels. KPIs above
            reflect only the GST tab while it is selected.
          </div>
        ) : null}

        <div className="sales-dash-table-container">
          {salesListTab === 'active' || salesListTab === 'gst' ? (
            <DataTable
              value={salesListTab === 'gst' ? gstFilteredSales : nonGstFilteredSales}
              paginator
              rows={10}
              rowsPerPageOptions={[10, 25, 50]}
              loading={loading}
              dataKey="id"
              emptyMessage={
                salesListTab === 'gst'
                  ? (debouncedSearchQuery.trim() && gstFilteredSales.length === 0 && dateRangeFilteredSales.length > 0
                      ? 'No GST bills match your search for this date range.'
                      : 'No GST bills in this period.')
                  : (debouncedSearchQuery.trim() && nonGstFilteredSales.length === 0 && dateRangeFilteredSales.length > 0
                      ? 'No bills match your search for this date range.'
                      : 'No bills found for this period or filters.')
              }
              showGridlines
              stripedRows
              tableStyle={{ minWidth: '58rem', width: '100%' }}
              className="sales-dash-datatable"
            >
              <Column field="billNumber" header="Bill no." style={{ minWidth: '8rem' }} body={billNumberBodyTemplate} />
              <Column
                header="Customer"
                style={{ minWidth: '11rem' }}
                body={(rowData) => (
                  <div className="sales-dash-customer">
                    <div className="sales-dash-customer-name">{rowData.customerName || '—'}</div>
                    <div className="sales-dash-customer-phone">{rowData.customerNumber || '—'}</div>
                  </div>
                )}
              />
              <Column
                field="billDate"
                header="Date"
                style={{ minWidth: '10rem' }}
                body={(rowData) => (rowData.billDate ? formatDayShort(rowData.billDate) : '—')}
              />
              <Column
                field="itemsCount"
                header="Items"
                align="center"
                alignHeader="center"
                style={{ minWidth: '5rem' }}
                body={(rowData) => String(rowData.itemsCount ?? 0)}
              />
              <Column field="billType" header="Type" style={{ minWidth: '7rem' }} body={billTypeBodyTemplate} />
              <Column
                field="totalAmount"
                header="Amount"
                align="right"
                alignHeader="right"
                style={{ minWidth: '8rem' }}
                body={(rowData) => <span className="sales-dash-amt">{amountBodyTemplate(rowData, 'totalAmount')}</span>}
              />
              <Column
                field="paidIncludingAdvance"
                header="Paid"
                align="right"
                alignHeader="right"
                style={{ minWidth: '8rem' }}
                body={(rowData) => {
                  const total = Number(rowData.paidIncludingAdvance) || 0;
                  const adv = Number(rowData.advanceUsed) || 0;
                  const paymentsOnly = Number(rowData.paidBillPaymentsOnly ?? rowData.paidDisplay) || 0;
                  return (
                    <span className="sales-dash-paid" title={adv > 0 ? `Payments ${formatCurrency(paymentsOnly)} + Advance ${formatCurrency(adv)}` : undefined}>
                      {formatCurrency(total)}
                    </span>
                  );
                }}
              />
              <Column
                field="balanceDue"
                header="Balance"
                align="right"
                alignHeader="right"
                style={{ minWidth: '8rem' }}
                body={(rowData) => {
                  const b = Number(rowData.balanceDue) || 0;
                  return (
                    <span className={b <= 0.005 ? 'sales-dash-balance sales-dash-balance--zero' : 'sales-dash-balance sales-dash-balance--due'}>
                      {formatCurrency(b)}
                    </span>
                  );
                }}
              />
              <Column
                field="paymentMode"
                header="Paid via"
                style={{ minWidth: '9rem' }}
                body={(rowData) => (
                  <div className="payment-mode-cell sales-dash-paidvia">
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
                        <span>
                          {lines.map((l) => formatPaymentModeLabel(l)).join(' + ')} ({lines.length} modes)
                        </span>
                      );
                    })()}
                  </div>
                )}
              />
              <Column
                header="Actions"
                align="center"
                alignHeader="center"
                style={{ minWidth: '3.25rem', width: '3.5rem' }}
                body={actionsBodyTemplate}
              />
            </DataTable>
          ) : (
            <DataTable
              value={filteredCancellations}
              paginator
              rows={10}
              rowsPerPageOptions={[10, 25, 50]}
              loading={cancellationsLoading}
              dataKey="id"
              emptyMessage={
                debouncedSearchQuery.trim() &&
                filteredCancellations.length === 0 &&
                Array.isArray(cancellations) &&
                cancellations.length > 0
                  ? 'No cancelled bills match your search.'
                  : 'No cancelled bills for this date range (by bill date or cancel date). Widen the range at the top if needed.'
              }
              showGridlines
              stripedRows
              tableStyle={{ minWidth: '48rem', width: '100%' }}
              className="sales-dash-datatable"
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
            <Column
              field="billDate"
              header="Bill date"
              style={{ minWidth: '7rem' }}
              body={(row) => (row.billDate ? formatDayShort(row.billDate) : '—')}
            />
            <Column field="billNumber" header="Bill #" style={{ minWidth: '7rem' }} />
            <Column
              field="billKind"
              header="Type"
              style={{ minWidth: '5rem' }}
              body={(row) => (String(row.billKind || '').includes('NON') ? 'NON-GST' : 'GST')}
            />
            <Column
              field="customerName"
              header="Customer name"
              style={{ minWidth: '10rem' }}
              body={(row) =>
                String(row.customerName || row.customer_name || '').trim() || '—'
              }
            />
            <Column
              field="customerPhone"
              header="Phone"
              style={{ minWidth: '8rem' }}
              body={(row) =>
                String(row.customerPhone || row.customer_phone || '').trim() || '—'
              }
            />
            <Column
              field="totalAmount"
              header="Bill total"
              align="right"
              alignHeader="right"
              body={(row) => formatCurrency(Number(row.totalAmount) || 0)}
            />
            <Column
              field="paidFromPayments"
              header="Paid (excl. advance)"
              align="right"
              alignHeader="right"
              body={(row) => formatCurrency(Number(row.paidFromPayments) || 0)}
            />
            <Column
              field="inHandCollected"
              header="Cash+UPI reversed"
              align="right"
              alignHeader="right"
              body={(row) => formatCurrency(Number(row.inHandCollected) || 0)}
            />
            <Column
              field="advanceApplied"
              header="Advance reversed"
              align="right"
              alignHeader="right"
              body={(row) => formatCurrency(Number(row.advanceApplied) || 0)}
            />
            <Column
              field="cancellationReason"
              header="Cancel reason"
              style={{ minWidth: '12rem' }}
              body={(row) => {
                const t = String(row.cancellationReason || row.cancellation_reason || '').trim();
                return t || '—';
              }}
            />
            <Column
              header="Actions"
              align="center"
              alignHeader="center"
              style={{ minWidth: '3.25rem', width: '3.5rem' }}
              body={(row) => (
                <SalesRowActionsMenu
                  row={{
                    ...row,
                    id: row.billId ?? row.id,
                    billType: String(row.billKind || '').includes('NON') ? 'NON-GST' : 'GST',
                    isCancelled: true,
                    paymentStatus: 'CANCELLED',
                    billLifecycleStatus: 'CANCELLED'
                  }}
                  readOnly
                  onView={handleViewBillDetails}
                  onPdf={handlePdfFromRow}
                  onCancel={handleOpenCancelBill}
                />
              )}
            />
          </DataTable>
          )}
        </div>
      </section>

      {/* Bill Details Popup */}
      <Dialog
        header={editMode ? 'Edit Bill' : 'Bill Details'}
        visible={isBillPopupVisible}
        style={editMode ? { width: 'min(1180px, 96vw)', maxWidth: '100%' } : { width: '70vw' }}
        onHide={closeBillPopup}
        className={`bill-details-dialog${editMode ? ' bill-details-dialog--edit' : ''}`}
        contentClassName="bill-details-dialog-content"
      >
        {selectedBill ? (
          <div className={`bill-details${editMode ? ' bill-details--edit-mode' : ''}`}>
            {billDetailLoading ? (
              <p style={{ marginBottom: '12px', color: '#64748b' }}>Loading full bill (items, charges, payments)…</p>
            ) : null}
            {!editMode && (
              <>
                <h3>Invoice No: {selectedBill.billNumber}</h3>
                {!selectedBill.isGST ? (
                  <div
                    style={{
                      display: 'flex',
                      gap: '8px',
                      marginBottom: '14px',
                      flexWrap: 'wrap',
                    }}
                  >
                    <button
                      type="button"
                      className={billDetailTab === 'details' ? 'btn btn-primary' : 'btn btn-secondary'}
                      onClick={() => setBillDetailTab('details')}
                    >
                      Bill details
                    </button>
                    <button
                      type="button"
                      className={
                        billDetailTab === 'adjustments' ? 'btn btn-primary' : 'btn btn-secondary'
                      }
                      onClick={() => setBillDetailTab('adjustments')}
                    >
                      Adjustment history
                    </button>
                  </div>
                ) : null}
                {billDetailTab === 'adjustments' && !selectedBill.isGST ? (
                  <div style={{ marginBottom: '16px' }}>
                    {adjustmentHistoryLoading ? (
                      <p style={{ color: '#64748b' }}>Loading adjustment history…</p>
                    ) : adjustmentHistory ? (
                      <>
                        {adjustmentHistory.returnSummary ? (
                          <section
                            className="bill-return-summary-panel"
                            style={{
                              marginBottom: '14px',
                              padding: '12px 14px',
                              borderRadius: '10px',
                              border: '1px solid #e2e8f0',
                              background: '#f8fafc',
                            }}
                          >
                            <h4 style={{ margin: '0 0 8px', fontSize: '14px' }}>Effective values</h4>
                            <div style={{ fontSize: '13px', lineHeight: 1.6 }}>
                              <div>
                                Original bill:{' '}
                                <strong>
                                  {formatCurrency(
                                    adjustmentHistory.returnSummary.originalInvoiceTotalAmount
                                  )}
                                </strong>
                              </div>
                              <div>
                                Returned:{' '}
                                <strong>
                                  {formatCurrency(
                                    adjustmentHistory.returnSummary.cumulativeReturnedValue
                                  )}
                                </strong>
                              </div>
                              <div>
                                Net effective:{' '}
                                <strong>
                                  {formatCurrency(adjustmentHistory.returnSummary.effectiveBillTotal)}
                                </strong>
                              </div>
                              <div>
                                Suggested refund vs effective:{' '}
                                <strong>
                                  {formatCurrency(
                                    adjustmentHistory.returnSummary
                                      .suggestedCustomerRefundVersusEffective
                                  )}
                                </strong>
                              </div>
                            </div>
                          </section>
                        ) : null}
                        {Array.isArray(adjustmentHistory.returns) &&
                        adjustmentHistory.returns.length > 0 ? (
                          <section style={{ marginBottom: '14px' }}>
                            <h4 style={{ margin: '0 0 8px', fontSize: '14px' }}>Return timeline</h4>
                            <table className="bill-return-history-table" style={{ width: '100%', fontSize: '13px' }}>
                              <thead>
                                <tr>
                                  <th>Date</th>
                                  <th>Return #</th>
                                  <th>Value</th>
                                  <th>Refund mode</th>
                                </tr>
                              </thead>
                              <tbody>
                                {adjustmentHistory.returns.map((r) => (
                                  <tr key={r.returnId}>
                                    <td>{r.createdAt ? formatDate(r.createdAt) : '—'}</td>
                                    <td>{r.returnId}</td>
                                    <td>{formatCurrency(Number(r.computedReturnAmount) || 0)}</td>
                                    <td>{r.refundMode || '—'}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </section>
                        ) : null}
                        {Array.isArray(adjustmentHistory.supplementaryBills) &&
                        adjustmentHistory.supplementaryBills.length > 0 ? (
                          <section style={{ marginBottom: '14px' }}>
                            <h4 style={{ margin: '0 0 8px', fontSize: '14px' }}>Supplementary bills</h4>
                            <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '13px' }}>
                              {adjustmentHistory.supplementaryBills.map((s) => (
                                <li key={s.id}>
                                  #{s.billNumber} · {formatCurrency(s.totalAmount)} ·{' '}
                                  {s.paymentStatus || '—'}
                                </li>
                              ))}
                            </ul>
                          </section>
                        ) : null}
                        {Array.isArray(adjustmentHistory.timeline) &&
                        adjustmentHistory.timeline.length > 0 ? (
                          <section style={{ marginBottom: '14px' }}>
                            <h4 style={{ margin: '0 0 8px', fontSize: '14px' }}>Adjustment timeline</h4>
                            <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '13px' }}>
                              {adjustmentHistory.timeline.map((step, i) => (
                                <li key={i}>
                                  <strong>{step.label}</strong>
                                  {step.detail ? ` — ${step.detail}` : ''}
                                </li>
                              ))}
                            </ul>
                          </section>
                        ) : null}
                      </>
                    ) : (
                      <p style={{ color: '#64748b' }}>No adjustment history.</p>
                    )}
                  </div>
                ) : null}
                {billDetailTab === 'details' || selectedBill.isGST ? (
                <>
                <div className="bill-customer-details">
                  <div className="detail-row">
                    <span className="label">Name:</span>
                    <span className="value">
                      {selectedBill.originalSale?.customerName ||
                        selectedBill.customerName ||
                        '—'}
                    </span>
                  </div>
                  <div className="detail-row">
                    <span className="label">Mobile:</span>
                    <span className="value">{selectedBill.customerNumber}</span>
                  </div>
                  <div className="detail-row">
                    <span className="label">Address:</span>
                    <span className="value">{selectedBill.originalSale?.address || '—'}</span>
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

                {billAllowsStockReturn(selectedBill) ? (
                  <div style={{ marginBottom: '12px' }}>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      disabled={billDetailLoading || paymentSubmitting}
                      onClick={() => void handleOpenStockReturn(selectedBill)}
                    >
                      Return items…
                    </button>
                    <span style={{ marginLeft: '10px', fontSize: '12px', color: '#64748b' }}>
                      Restores inventory; does not rewrite original line items.
                    </span>
                  </div>
                ) : null}

                {billAllowsSupplementaryExchange(selectedBill) ? (
                  <div style={{ marginBottom: '12px' }}>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      disabled={billDetailLoading || paymentSubmitting}
                      onClick={() => void handleOpenAdjustExchangeGuide(selectedBill)}
                    >
                      Adjust bill / Exchange…
                    </button>
                    <span style={{ marginLeft: '10px', fontSize: '12px', color: '#64748b' }}>
                      Return module + supplementary bill for new items (no destructive edit of the original).
                    </span>
                  </div>
                ) : null}

                {(() => {
                  const rs = selectedBill.returnSummary ?? selectedBill.originalSale?.returnSummary;
                  if (!rs || billDetailLoading) return null;
                  const origQ = Number(rs.originalInvoiceQuantity ?? 0);
                  const origAmt = Number(rs.originalInvoiceTotalAmount ?? selectedBill.totalAmount ?? 0);
                  const retQ = Number(rs.cumulativeReturnedQuantity ?? 0);
                  const retAmt = Number(rs.cumulativeReturnedValue ?? 0);
                  const effQ = Number(rs.effectiveSoldQuantityRemaining ?? 0);
                  const effAmt = Number(rs.effectiveBillTotal ?? 0);
                  const sug = Number(rs.suggestedCustomerRefundVersusEffective ?? 0);
                  const adv = Number(selectedBill.advanceUsed ?? selectedBill.originalSale?.advanceUsed ?? 0);
                  const paidCash = Number(selectedBill.totalPaid ?? selectedBill.paidAmount ?? 0);
                  return (
                    <section
                      className="bill-return-summary-panel"
                      style={{
                        marginBottom: '14px',
                        padding: '12px 14px',
                        borderRadius: '10px',
                        border: '1px solid #e2e8f0',
                        background: '#f8fafc',
                      }}
                    >
                      <h4 style={{ margin: '0 0 10px', fontSize: '14px', fontWeight: 700, color: '#0f172a' }}>
                        Bill vs returns (separate module — original invoice untouched)
                      </h4>
                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                          gap: '12px',
                          marginBottom: '10px',
                        }}
                      >
                        <div style={{ fontSize: '13px' }}>
                          <div style={{ color: '#64748b', marginBottom: '4px' }}>Original bill</div>
                          <div style={{ fontWeight: 700, color: '#0f172a' }}>
                            {origQ.toLocaleString('en-IN', { maximumFractionDigits: 3 })} sq.ft
                          </div>
                          <div style={{ fontWeight: 600 }}>{formatCurrency(origAmt)}</div>
                        </div>
                        <div style={{ fontSize: '13px' }}>
                          <div style={{ color: '#64748b', marginBottom: '4px' }}>Return summary (cumulative)</div>
                          <div style={{ fontWeight: 700, color: '#0f172a' }}>
                            Returned: {retQ.toLocaleString('en-IN', { maximumFractionDigits: 3 })} sq.ft
                          </div>
                          <div style={{ fontWeight: 600 }}>{formatCurrency(retAmt)}</div>
                        </div>
                        <div style={{ fontSize: '13px' }}>
                          <div style={{ color: '#64748b', marginBottom: '4px' }}>Effective final bill</div>
                          <div style={{ fontWeight: 700, color: '#0f172a' }}>
                            {effQ.toLocaleString('en-IN', { maximumFractionDigits: 3 })} sq.ft
                          </div>
                          <div style={{ fontWeight: 600 }}>{formatCurrency(effAmt)}</div>
                        </div>
                      </div>
                      <div
                        style={{
                          fontSize: '12px',
                          lineHeight: 1.5,
                          color: '#334155',
                          paddingTop: '10px',
                          borderTop: '1px solid #e2e8f0',
                        }}
                      >
                        <strong>Advance:</strong> {formatCurrency(adv)} already applied — not recomputed here. Additional
                        paid (non-advance): {formatCurrency(paidCash)}. Total paid {formatCurrency(adv + paidCash)} vs
                        effective final bill {formatCurrency(effAmt)}.{' '}
                        {sug > 0.005 ? (
                          <span>
                            <strong>Refund via normal rails</strong> (cash / bank / wallet credit):{' '}
                            {formatCurrency(sug)} — same surplus; do not recreate advance postings.
                          </span>
                        ) : (
                          <span>
                            No surplus vs effective bill from these figures (printed invoice totals may still show the
                            original grand total for audit).
                          </span>
                        )}
                      </div>
                    </section>
                  );
                })()}

                {!selectedBill.isGST && selectedBill.billLifecycleStatus ? (
                  <p style={{ margin: '0 0 12px', fontSize: '13px', color: '#475569' }}>
                    Lifecycle: <strong>{selectedBill.billLifecycleStatus}</strong>
                  </p>
                ) : null}

                {(() => {
                  const rh = selectedBill.returnHistory ?? selectedBill.originalSale?.returnHistory ?? [];
                  if (!Array.isArray(rh) || rh.length === 0 || billDetailLoading) return null;
                  return (
                    <section style={{ marginBottom: '14px' }}>
                      <h4 style={{ margin: '0 0 8px', fontSize: '14px' }}>Return history</h4>
                      <table className="bill-table" style={{ fontSize: '13px' }}>
                        <thead>
                          <tr>
                            <th>Date</th>
                            <th>#</th>
                            <th>Value</th>
                            <th>Posted</th>
                            <th>Mode</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rh.map((r) => (
                            <tr key={r.returnId}>
                              <td>{r.createdAt ? formatDate(r.createdAt) : '—'}</td>
                              <td>{r.returnId}</td>
                              <td>{formatCurrency(Number(r.computedReturnAmount) || 0)}</td>
                              <td>{formatCurrency(Number(r.postedSettlementAmount) || 0)}</td>
                              <td>{r.refundMode || '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </section>
                  );
                })()}

                {(() => {
                  const sup =
                    selectedBill.supplementaryBills ?? selectedBill.originalSale?.supplementaryBills ?? [];
                  if (!Array.isArray(sup) || sup.length === 0 || billDetailLoading) return null;
                  return (
                    <section style={{ marginBottom: '14px' }}>
                      <h4 style={{ margin: '0 0 8px', fontSize: '14px' }}>Supplementary bills</h4>
                      <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '13px' }}>
                        {sup.map((s) => (
                          <li key={s.id}>
                            #{s.billNumber} · {formatCurrency(s.totalAmount)} · {s.paymentStatus || '—'}
                          </li>
                        ))}
                      </ul>
                    </section>
                  );
                })()}

                {(() => {
                  const events = selectedBill.billEvents ?? selectedBill.originalSale?.billEvents ?? [];
                  if (!Array.isArray(events) || events.length === 0 || billDetailLoading) return null;
                  return (
                    <section style={{ marginBottom: '14px' }}>
                      <h4 style={{ margin: '0 0 8px', fontSize: '14px' }}>Adjustment timeline</h4>
                      <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '12px' }}>
                        {events.slice(0, 20).map((e) => (
                          <li key={e.id ?? `${e.eventType}-${e.createdAt}`}>
                            {e.createdAt ? formatDate(e.createdAt) : '—'} — {e.eventType}
                          </li>
                        ))}
                      </ul>
                    </section>
                  );
                })()}

                <div className="bill-summary" style={{ marginBottom: '12px' }} />
                </>
                ) : null}
              </>
            )}

            {editMode && editDraft && editBillTotals && (
              <div className="bill-edit-shell">
                <header className="bill-edit-hero">
                  <div className="bill-edit-hero-top">
                    <span className="bill-edit-hero-title">
                      <i className="pi pi-file-edit bill-edit-hero-icon" aria-hidden />
                      Edit bill
                    </span>
                    <span className="bill-edit-invoice-badge">Invoice No: {selectedBill.billNumber}</span>
                  </div>
                  <div className="bill-edit-customer-strip">
                    <span className="bill-edit-strip-item">
                      <span className="bill-edit-strip-label">Customer</span>
                      <span className="bill-edit-strip-value bill-edit-strip-value--accent">
                        {selectedBill.originalSale?.customerName || selectedBill.customerName || '—'}
                      </span>
                    </span>
                    <span className="bill-edit-strip-item">
                      <span className="bill-edit-strip-label">Mobile</span>
                      <span className="bill-edit-strip-value">{selectedBill.customerNumber}</span>
                    </span>
                    <span className="bill-edit-strip-item bill-edit-strip-item--grow">
                      <span className="bill-edit-strip-label">Address</span>
                      <span className="bill-edit-strip-value">{selectedBill.originalSale?.address || '—'}</span>
                    </span>
                    <span className="bill-edit-strip-item">
                      <span className="bill-edit-strip-label">
                        <i className="pi pi-calendar" style={{ marginRight: '4px', opacity: 0.7 }} aria-hidden />
                        Date
                      </span>
                      <span className="bill-edit-strip-value">{formatDate(selectedBill.billDate)}</span>
                    </span>
                  </div>
                </header>

                <div className="bill-edit-layout">
                  <div className="bill-edit-main">
                    <section className="bill-edit-section">
                      <div className="bill-edit-section-head">
                        <div>
                          <h4 className="bill-edit-section-title">1. Line items</h4>
                          <p className="bill-edit-section-hint">Edit items, add new lines, or remove rows. Amount is calculated from qty × rate.</p>
                        </div>
                        <button type="button" className="btn btn-secondary bill-edit-btn-add" onClick={handleAddEditItem} disabled={editSaving}>
                          <i className="pi pi-plus" aria-hidden /> Add item
                        </button>
                      </div>
                      <div className="bill-edit-table-wrap">
                        <table className="bill-edit-items-table">
                          <thead>
                            <tr>
                              <th className="bill-edit-col-idx">#</th>
                              <th>Item description</th>
                              {selectedBill.isGST ? <th className="bill-edit-col-hsn">HSN</th> : null}
                              <th className="bill-edit-col-unit">Unit</th>
                              <th className="bill-edit-col-qty">Qty</th>
                              <th className="bill-edit-col-rate">Rate (₹)</th>
                              <th className="bill-edit-col-amt">Amount (₹)</th>
                              <th className="bill-edit-col-action">Action</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(editDraft.items || []).map((it, idx) => {
                              const lineAmt = (Number(it.quantity) || 0) * (Number(it.pricePerUnit) || 0);
                              const rowNew = Boolean(it.isNewLine);
                              return (
                                <tr key={it.rowId} className={rowNew ? 'bill-edit-items-row bill-edit-items-row--new' : 'bill-edit-items-row'}>
                                  <td>{idx + 1}</td>
                                  <td>
                                    <div className="bill-edit-item-field bill-edit-cell-autocomplete">
                                      <AutoComplete
                                        value={it.itemName || ''}
                                        suggestions={productSuggestions}
                                        completeMethod={(e) => {
                                          if (productCatalogLoading && productCatalog.length === 0) {
                                            setProductSuggestions([]);
                                            return;
                                          }
                                          const q = (e.query || '').trim().toLowerCase();
                                          const maxSearch = 200;
                                          const list = !q
                                            ? productCatalog
                                            : productCatalog.filter((p) => {
                                                const name = String(p.name || '').toLowerCase();
                                                const type = String(p.productType || '').toLowerCase();
                                                const slug = String(p.slug || '').toLowerCase();
                                                return name.includes(q) || type.includes(q) || slug.includes(q);
                                              }).slice(0, maxSearch);
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
                                            : 'Search catalog'
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
                                  </td>
                                  {selectedBill.isGST ? (
                                    <td>
                                      <input
                                        type="text"
                                        className="bill-edit-cell-input"
                                        value={it.hsnNumber || ''}
                                        onChange={(e) => handleEditItemChange(it.rowId, 'hsnNumber', e.target.value)}
                                        placeholder="—"
                                      />
                                    </td>
                                  ) : null}
                                  <td>
                                    <input
                                      type="text"
                                      className="bill-edit-cell-input"
                                      value={it.unit || 'sqft'}
                                      onChange={(e) => handleEditItemChange(it.rowId, 'unit', e.target.value)}
                                    />
                                  </td>
                                  <td>
                                    <input
                                      type="number"
                                      step="0.01"
                                      className="bill-edit-cell-input"
                                      value={it.quantity ?? 0}
                                      onChange={(e) => handleEditItemChange(it.rowId, 'quantity', Number(e.target.value || 0))}
                                    />
                                  </td>
                                  <td>
                                    <input
                                      type="number"
                                      step="0.01"
                                      className="bill-edit-cell-input"
                                      value={it.pricePerUnit ?? 0}
                                      onChange={(e) => handleEditItemChange(it.rowId, 'pricePerUnit', Number(e.target.value || 0))}
                                    />
                                  </td>
                                  <td className="bill-edit-cell-amt">
                                    ₹{' '}
                                    {lineAmt.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                  </td>
                                  <td>
                                    <Button
                                      type="button"
                                      icon="pi pi-trash"
                                      rounded
                                      text
                                      severity="danger"
                                      disabled={editSaving || (editDraft.items || []).length <= 1}
                                      onClick={() => handleRemoveEditItem(it.rowId)}
                                      title={(editDraft.items || []).length <= 1 ? 'Keep at least one line' : 'Remove line'}
                                      aria-label="Remove line"
                                    />
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                      <div className="bill-edit-section-foot">
                        <div className="bill-edit-legend">
                          <span>
                            <span className="bill-edit-legend-dot bill-edit-legend-dot--saved" /> Existing line
                          </span>
                          <span>
                            <span className="bill-edit-legend-dot bill-edit-legend-dot--new" /> New line
                          </span>
                        </div>
                        <button type="button" className="btn btn-danger btn-ghost-danger" onClick={handleClearAllEditItems} disabled={editSaving}>
                          <i className="pi pi-trash" aria-hidden /> Clear all items
                        </button>
                      </div>
                    </section>

                    <section className="bill-edit-section bill-edit-section--payments">
                      <div className="bill-edit-section-head">
                        <div>
                          <h4 className="bill-edit-section-title">2. Payments</h4>
                          <p className="bill-edit-section-hint">
                            Add or remove payments (saved immediately). Item and charge changes use <strong>Save changes</strong> below.
                          </p>
                        </div>
                      </div>
                      <div className="bill-edit-table-wrap">
                        <table className="bill-edit-items-table bill-edit-payments-table">
                          <thead>
                            <tr>
                              <th className="bill-edit-col-idx">#</th>
                              <th>Date</th>
                              <th>Mode</th>
                              <th className="bill-edit-col-rate">Amount (₹)</th>
                              <th>Note / reference</th>
                              <th className="bill-edit-col-action">Action</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(!(selectedBill?.originalSale?.payments) ||
                              selectedBill.originalSale.payments.length === 0) && (
                              <tr>
                                <td colSpan={6} className="bill-edit-cell-muted" style={{ padding: '14px' }}>
                                  No payments recorded yet.
                                </td>
                              </tr>
                            )}
                            {(selectedBill?.originalSale?.payments || []).map((p, pidx) => (
                              <tr key={p.paymentId || pidx}>
                                <td>{pidx + 1}</td>
                                <td>{String(p.paymentDate || '—').slice(0, 10)}</td>
                                <td>{formatPaymentModeLabel(p.paymentMode)}</td>
                                <td>₹ {Number(p.amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                                <td className="bill-edit-cell-muted">—</td>
                                <td>
                                  <Button
                                    type="button"
                                    icon="pi pi-trash"
                                    rounded
                                    text
                                    severity="danger"
                                    disabled={paymentSubmitting || editSaving}
                                    onClick={() => handleDeletePaymentFromBill(p.paymentId)}
                                    aria-label="Delete payment"
                                  />
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <div className="bill-edit-payment-add">
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          className="bill-edit-cell-input bill-edit-payment-add-field"
                          value={paymentAddAmount}
                          onChange={(e) => setPaymentAddAmount(e.target.value)}
                          placeholder="Amount"
                          disabled={paymentSubmitting || editSaving || !canAddMorePayments}
                        />
                        <select
                          className="bill-edit-cell-input bill-edit-payment-add-field"
                          value={paymentAddMode}
                          onChange={(e) => setPaymentAddMode(e.target.value)}
                          disabled={paymentSubmitting || editSaving || !canAddMorePayments}
                        >
                          <option value="CASH">Cash</option>
                          <option value="UPI">UPI</option>
                          <option value="BANK_TRANSFER">Bank transfer</option>
                          <option value="CHEQUE">Cheque</option>
                          <option value="OTHER">Other</option>
                        </select>
                        <input
                          type="date"
                          className="bill-edit-cell-input bill-edit-payment-add-field"
                          value={paymentAddDate}
                          onChange={(e) => setPaymentAddDate(e.target.value)}
                          disabled={paymentSubmitting || editSaving || !canAddMorePayments}
                        />
                        <button
                          type="button"
                          className="btn btn-primary"
                          disabled={paymentSubmitting || editSaving || !canAddMorePayments}
                          onClick={handleAddPaymentToBill}
                        >
                          {paymentSubmitting ? 'Saving…' : '+ Add payment'}
                        </button>
                        {!canAddMorePayments && selectedBill && !billDetailLoading ? (
                          <p className="bill-edit-payment-add-hint">
                            Add payment is only available when status is Due, Pending, or Partially paid and there is a
                            balance due.
                          </p>
                        ) : null}
                      </div>
                    </section>
                  </div>

                  <aside className="bill-edit-sidebar">
                    <div className="bill-edit-summary-card">
                      <h4 className="bill-edit-summary-title">Bill summary</h4>
                      <dl className="bill-edit-summary-dl">
                        <div className="bill-edit-summary-row">
                          <dt>Subtotal (items)</dt>
                          <dd>₹ {editBillTotals.itemsSubtotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</dd>
                        </div>
                        <div className="bill-edit-summary-row bill-edit-summary-row--input">
                          <dt>
                            <i className="pi pi-pencil bill-edit-inline-icon" aria-hidden />
                            Discount
                          </dt>
                          <dd>
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              className="bill-edit-summary-input"
                              value={editDraft.discountAmount ?? 0}
                              onChange={(e) =>
                                setEditDraft((p) => ({ ...p, discountAmount: Number(e.target.value || 0) }))
                              }
                            />
                          </dd>
                        </div>
                        <div className="bill-edit-summary-row">
                          <dt>After discount</dt>
                          <dd>₹ {editBillTotals.afterDisc.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</dd>
                        </div>
                        {selectedBill.isGST ? (
                          <div className="bill-edit-summary-row bill-edit-summary-row--input">
                            <dt>
                              <i className="pi pi-pencil bill-edit-inline-icon" aria-hidden />
                              GST ({editBillTotals.taxPct}%)
                            </dt>
                            <dd>
                              <div className="bill-edit-summary-split">
                                <input
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  className="bill-edit-summary-input bill-edit-summary-input--narrow"
                                  value={editDraft.taxPercentage ?? 0}
                                  onChange={(e) =>
                                    setEditDraft((p) => ({ ...p, taxPercentage: Number(e.target.value || 0) }))
                                  }
                                  title="Tax %"
                                />
                                <span className="bill-edit-summary-derived">
                                  ₹ {editBillTotals.gstAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                </span>
                              </div>
                            </dd>
                          </div>
                        ) : null}
                        <div className="bill-edit-summary-row bill-edit-summary-row--input">
                          <dt>
                            <i className="pi pi-pencil bill-edit-inline-icon" aria-hidden />
                            Labour
                          </dt>
                          <dd>
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              className="bill-edit-summary-input"
                              value={editDraft.labourCharge ?? 0}
                              onChange={(e) =>
                                setEditDraft((p) => ({ ...p, labourCharge: Number(e.target.value || 0) }))
                              }
                            />
                          </dd>
                        </div>
                        <div className="bill-edit-summary-row bill-edit-summary-row--input">
                          <dt>
                            <i className="pi pi-pencil bill-edit-inline-icon" aria-hidden />
                            Transport
                          </dt>
                          <dd>
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              className="bill-edit-summary-input"
                              value={editDraft.transportationCharge ?? 0}
                              onChange={(e) =>
                                setEditDraft((p) => ({ ...p, transportationCharge: Number(e.target.value || 0) }))
                              }
                            />
                          </dd>
                        </div>
                        <div className="bill-edit-summary-row bill-edit-summary-row--input">
                          <dt>
                            <i className="pi pi-pencil bill-edit-inline-icon" aria-hidden />
                            Other expense
                          </dt>
                          <dd>
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              className="bill-edit-summary-input"
                              value={editDraft.otherExpenses ?? 0}
                              onChange={(e) =>
                                setEditDraft((p) => ({ ...p, otherExpenses: Number(e.target.value || 0) }))
                              }
                            />
                          </dd>
                        </div>
                      </dl>
                      <div className="bill-edit-final">
                        <span className="bill-edit-final-label">Final amount</span>
                        <span className="bill-edit-final-value">
                          ₹ {editBillTotals.finalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                      <div className="bill-edit-paystatus">
                        <div className="bill-edit-paystatus-row">
                          <span>Total paid</span>
                          <span>₹ {editBillTotals.totalPaid.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                        </div>
                        <div className="bill-edit-paystatus-row bill-edit-paystatus-row--due">
                          <span>Balance due</span>
                          <span>₹ {editBillTotals.balanceDue.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                        </div>
                        {editBillTotals.advanceUsed > 0 ? (
                          <div className="bill-edit-paystatus-row bill-edit-paystatus-row--muted">
                            <span>Advance used</span>
                            <span>₹ {editBillTotals.advanceUsed.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                          </div>
                        ) : null}
                      </div>
                      <p className="bill-edit-summary-note">
                        <i className="pi pi-info-circle" aria-hidden /> Summary updates as you edit lines and charges (GST is
                        estimated on subtotal after discount).
                      </p>
                    </div>
                  </aside>
                </div>

                <footer className="bill-edit-footer">
                  <button type="button" className="btn btn-secondary" disabled={editSaving} onClick={handleCancelBillEdit}>
                    Cancel
                  </button>
                  <div className="bill-edit-footer-warn">
                    <i className="pi pi-exclamation-triangle" aria-hidden />
                    You have unsaved changes
                  </div>
                  <div className="bill-edit-footer-actions">
                    <Button
                      type="button"
                      label="Preview bill"
                      icon="pi pi-eye"
                      outlined
                      disabled={editSaving}
                      onClick={handlePreviewBillInDialog}
                    />
                    <Button
                      type="button"
                      label={editSaving ? 'Saving…' : 'Save changes'}
                      icon="pi pi-save"
                      disabled={editSaving}
                      onClick={handleSaveBillEdit}
                    />
                  </div>
                </footer>

                {!billIsReadOnlyInSalesList(selectedBill) ? (
                <div className="bill-edit-danger bill-edit-danger--in-shell">
                  <p className="bill-edit-danger-title">Danger zone</p>
                  <button
                    type="button"
                    className="btn btn-danger"
                    disabled={paymentSubmitting}
                    onClick={() => handleOpenCancelBill(selectedBill)}
                  >
                    Cancel bill…
                  </button>
                  <p className="bill-edit-danger-hint">
                    Preview refund, stock restore, and advance impact before confirming cancellation.
                  </p>
                </div>
                ) : null}
              </div>
            )}

            {!editMode && (
              <>
            <div className="bill-summary" style={{ marginBottom: '12px' }}>
              <p style={{ margin: '0 0 6px' }}>
                <strong>Add payment to this bill</strong>
              </p>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={paymentAddAmount}
                  onChange={(e) => setPaymentAddAmount(e.target.value)}
                  placeholder="Amount"
                  disabled={paymentSubmitting || !canAddMorePayments}
                  style={{ padding: '8px', minWidth: '140px' }}
                />
                <select
                  value={paymentAddMode}
                  onChange={(e) => setPaymentAddMode(e.target.value)}
                  disabled={paymentSubmitting || !canAddMorePayments}
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
                  disabled={paymentSubmitting || !canAddMorePayments}
                  style={{ padding: '8px', minWidth: '160px' }}
                />
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={paymentSubmitting || !canAddMorePayments}
                  onClick={handleAddPaymentToBill}
                >
                  {paymentSubmitting ? 'Saving...' : 'Add payment'}
                </button>
              </div>
              {!canAddMorePayments && selectedBill && !billDetailLoading ? (
                <p style={{ margin: '8px 0 0', fontSize: '12px', color: '#64748b', maxWidth: '520px' }}>
                  Add payment is only available when the bill is Due, Pending, or Partially paid and there is a balance
                  due.
                </p>
              ) : null}
              <div style={{ marginTop: '10px' }}>
                <p style={{ margin: '0 0 6px', fontWeight: 600, fontSize: '13px' }}>Payment timeline</p>
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
              <p>
                <strong>Discount Amount:</strong> ₹{' '}
                {Number(
                  selectedBill.originalSale?.discountAmount ?? selectedBill.discountAmount ?? 0
                ).toLocaleString('en-IN')}
              </p>
              <p>
                <strong>Labour Charge:</strong> ₹{' '}
                {Number(
                  selectedBill.originalSale?.labourCharge ?? selectedBill.labourCharge ?? 0
                ).toLocaleString('en-IN')}
              </p>
              <p>
                <strong>Transportation Charge:</strong> ₹{' '}
                {Number(
                  selectedBill.originalSale?.transportationCharge ??
                    selectedBill.transportationCharge ??
                    0
                ).toLocaleString('en-IN')}
              </p>
              <p>
                <strong>Other Expense:</strong> ₹{' '}
                {Number(
                  selectedBill.originalSale?.otherExpenses ??
                    selectedBill.originalSale?.otherExpense ??
                    selectedBill.otherExpenses ??
                    selectedBill.otherExpense ??
                    0
                ).toLocaleString('en-IN')}
              </p>
              {selectedBill.isGST ? (() => {
                const totalTax = Number(
                  selectedBill.gstAmount ?? selectedBill.originalSale?.taxAmount ?? 0
                ) || 0;
                const ratePct = Number(
                  selectedBill.originalSale?.taxPercentage ??
                    selectedBill.taxPercentage ??
                    selectedBill.gstRate ??
                    18
                ) || 0;
                const deliveryState = resolveDeliveryState({
                  deliveryState:
                    selectedBill.originalSale?.placeOfSupplyState ??
                    selectedBill.placeOfSupplyState,
                  deliveryAddress:
                    selectedBill.originalSale?.deliveryAddress ?? selectedBill.deliveryAddress,
                  customerState:
                    selectedBill.originalSale?.customerState ?? selectedBill.customerState,
                  customerAddress:
                    selectedBill.originalSale?.address ??
                    selectedBill.address ??
                    selectedBill.originalSale?.customerAddress,
                });
                const split = computeGstSplit({
                  taxAmount: totalTax,
                  taxRatePct: ratePct,
                  deliveryState,
                });
                return (
                  <>
                    {split.isInterState ? (
                      <p>
                        <strong>IGST ({split.igstRate}%):</strong> ₹{' '}
                        {split.igstAmount.toLocaleString('en-IN', {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </p>
                    ) : (
                      <>
                        <p>
                          <strong>CGST ({split.cgstRate}%):</strong> ₹{' '}
                          {split.cgstAmount.toLocaleString('en-IN', {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </p>
                        <p>
                          <strong>SGST ({split.sgstRate}%):</strong> ₹{' '}
                          {split.sgstAmount.toLocaleString('en-IN', {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </p>
                      </>
                    )}
                    <p>
                      <strong>
                        Total GST ({ratePct}%
                        {split.isInterState ? ', inter-state' : ', intra-state'}
                        ):
                      </strong>{' '}
                      ₹{' '}
                      {totalTax.toLocaleString('en-IN', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </p>
                    <p style={{ fontSize: '0.75rem', color: '#64748b' }}>
                      Place of supply: {split.resolvedState || 'unknown'} (seller: {SELLER_STATE})
                    </p>
                  </>
                );
              })() : (
                <p><strong>GST Value:</strong> ₹ 0.00</p>
              )}
              <p><strong>Final Amount:</strong> ₹ {(Number(selectedBill.totalAmount) || 0).toLocaleString('en-IN')}</p>
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

            {!billIsReadOnlyInSalesList(selectedBill) ? (
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
                onClick={() => handleOpenCancelBill(selectedBill)}
              >
                Cancel bill…
              </button>
              <p style={{ margin: '8px 0 0', fontSize: '12px', color: '#64748b', maxWidth: '520px' }}>
                Opens cancellation preview with total payback to customer before you confirm.
              </p>
            </div>
            ) : null}
            </>
            )}
          </div>
        ) : (
          <p>No bill details available.</p>
        )}
      </Dialog>

      <CancelBillModal
        visible={cancelBillOpen}
        bill={cancelBillTarget}
        onClose={() => {
          setCancelBillOpen(false);
          setCancelBillTarget(null);
        }}
        onSuccess={() => void handleCancelBillSuccess()}
        onError={(msg) => setToast({ message: msg, type: 'error' })}
      />

      <AdjustmentExchangeDialog
        visible={adjustExchangeOpen}
        bill={adjustExchangeBill}
        adjustmentSession={adjustExchangeSession}
        loading={adjustExchangeLoading}
        canReturn={adjustExchangeBill ? billAllowsStockReturn(adjustExchangeBill) : false}
        onHide={() => {
          setAdjustExchangeOpen(false);
          setAdjustExchangeBill(null);
          setAdjustExchangeSession(null);
        }}
        onSuccess={() => void refreshSales()}
        onToast={setToast}
      />

      <Dialog
        header={
          selectedBill?.billNumber ? `Return items · ${selectedBill.billNumber}` : 'Return items'
        }
        visible={stockReturnOpen}
        style={{ width: 'min(760px, 94vw)' }}
        onHide={() => {
          if (!stockReturnSubmitting) setStockReturnOpen(false);
        }}
        className="sales-stock-return-dialog"
      >
        {billDetailLoading ? (
          <p style={{ color: '#64748b', margin: 0 }}>Loading bill lines…</p>
        ) : stockReturnableItems.length === 0 ? (
          <p style={{ margin: 0 }}>
            No returnable quantity remains on this bill (fully returned or missing line ids).
          </p>
        ) : (
          <>
            <p style={{ margin: '0 0 10px', fontSize: '13px', color: '#475569' }}>
              Enter quantities to restore to inventory. Return value is proportional to line amounts
              {selectedBill?.isGST ? ', GST, ' : ' and '}bill discount (server is authoritative).
            </p>
            <div style={{ overflowX: 'auto', marginBottom: '12px' }}>
              <table className="bill-table" style={{ marginBottom: 0 }}>
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>Sold</th>
                    <th>Returned before</th>
                    <th>Can return</th>
                    <th style={{ minWidth: '130px' }}>Return now</th>
                  </tr>
                </thead>
                <tbody>
                  {stockReturnableItems.map((it) => {
                    const id = Number(it.itemId);
                    const sold = Number(it.quantity) || 0;
                    const rtd = Number(it.quantityReturnedToDate) || 0;
                    const max = Number(it.quantityReturnable ?? it.quantity) || 0;
                    return (
                      <tr key={id}>
                        <td>{it.itemName || it.description || '—'}</td>
                        <td>
                          {sold} {it.unit || 'unit'}
                        </td>
                        <td>{rtd}</td>
                        <td>{max}</td>
                        <td>
                          <input
                            type="number"
                            min={0}
                            max={max}
                            step="0.01"
                            className="bill-edit-cell-input"
                            style={{ width: '100%', maxWidth: '120px' }}
                            value={stockReturnQtyById[id] ?? ''}
                            placeholder="0"
                            onChange={(e) =>
                              setStockReturnQtyById((prev) => ({
                                ...prev,
                                [id]: e.target.value
                              }))
                            }
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div style={{ marginBottom: '10px', fontWeight: 600 }}>
              Estimated return value: ₹{' '}
              {stockReturnPreviewTotal.toLocaleString('en-IN', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
              })}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center', marginBottom: '10px' }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '13px' }}>
                Refund / settlement
                <select
                  className="bill-edit-cell-input"
                  style={{ minWidth: '220px' }}
                  value={stockReturnRefundMode}
                  onChange={(e) => setStockReturnRefundMode(e.target.value)}
                  disabled={stockReturnSubmitting}
                >
                  <option value="NO_REFUND">No refund (stock only)</option>
                  <option value="CASH_REFUND">Cash / UPI out (ledger refund)</option>
                  <option value="BANK_REFUND">Bank / transfer out</option>
                  <option value="WALLET_CREDIT">Wallet credit</option>
                  <option value="ADVANCE_RESTORE">Restore surplus to advance wallet</option>
                </select>
              </label>
              {stockReturnRefundMode === 'CASH_REFUND' ? (
                <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '13px' }}>
                  Rail
                  <select
                    className="bill-edit-cell-input"
                    value={stockReturnCashRail}
                    onChange={(e) => setStockReturnCashRail(e.target.value)}
                    disabled={stockReturnSubmitting}
                  >
                    <option value="CASH">Cash</option>
                    <option value="UPI">UPI</option>
                  </select>
                </label>
              ) : null}
            </div>
            <label style={{ display: 'block', marginBottom: '12px', fontSize: '13px' }}>
              Notes (optional)
              <textarea
                className="bill-edit-cell-input"
                rows={2}
                style={{ width: '100%', marginTop: '4px', resize: 'vertical' }}
                value={stockReturnNotes}
                onChange={(e) => setStockReturnNotes(e.target.value)}
                disabled={stockReturnSubmitting}
                placeholder="Reason / reference…"
              />
            </label>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button
                type="button"
                className="btn btn-secondary"
                disabled={stockReturnSubmitting}
                onClick={() => setStockReturnOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={stockReturnSubmitting}
                onClick={handleSubmitStockReturn}
              >
                {stockReturnSubmitting ? 'Saving…' : 'Save return'}
              </button>
            </div>
          </>
        )}
      </Dialog>
    </div>
  );
};

export default Sales;

