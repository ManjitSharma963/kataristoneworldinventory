import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Dialog } from 'primereact/dialog';
import { AutoComplete } from 'primereact/autocomplete';
import { fetchProductsCatalog } from '../../api/productsApi';
import { finalizeBillAdjustment } from '../../utils/api';
import { mergeAddressFromSources } from '../../utils/addressUtils';
import {
  computeReturnSettlementPreview,
  getReturnableBillLines,
} from './billReturnUtils';
import './AdjustmentExchangeDialog.css';

const SETTLEMENT_COLLECT = 'COLLECT';
const SETTLEMENT_REFUND = 'REFUND';
const SETTLEMENT_ADVANCE = 'ADVANCE';

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function formatMoney(n) {
  return `₹${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatBillDate(dateString) {
  if (!dateString) return '—';
  const d = new Date(dateString);
  if (Number.isNaN(d.getTime())) return String(dateString);
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function lineBatchLabel(it) {
  return (
    it.batchNo ||
    it.lotNumber ||
    it.lot ||
    it.color ||
    it.category ||
    it.type ||
    '—'
  );
}

function newRowKey() {
  return `new-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function mapPaymentModeToRefundRail(mode) {
  const m = String(mode || 'CASH').toUpperCase();
  if (m === 'UPI') return 'UPI';
  return 'CASH';
}

function mapSettlementToReturnRefundMode(settlement, paymentMode) {
  if (settlement === SETTLEMENT_REFUND) {
    const m = String(paymentMode || 'CASH').toUpperCase();
    if (m === 'BANK_TRANSFER' || m === 'BANK') {
      return { refundMode: 'BANK_REFUND' };
    }
    const rail = mapPaymentModeToRefundRail(paymentMode);
    return rail === 'UPI'
      ? { refundMode: 'CASH_REFUND', refundPaymentMode: 'UPI' }
      : { refundMode: 'CASH_REFUND', refundPaymentMode: 'CASH' };
  }
  if (settlement === SETTLEMENT_ADVANCE) {
    return { refundMode: 'WALLET_CREDIT' };
  }
  return { refundMode: 'NO_REFUND' };
}

function buildSupplementaryPayload(bill, newRows, { payments, notes, supplementaryReason, taxPct }) {
  const orig = bill.originalSale || {};
  const phoneRaw = String(orig.customerMobileNumber || bill.customerNumber || '').replace(/\D/g, '');
  const phone = phoneRaw.length >= 10 ? phoneRaw.slice(-10) : phoneRaw;
  const addrMerged = mergeAddressFromSources({
    storedAddress: orig.address,
    city: orig.city,
    state: orig.state,
    pincode: orig.pincode,
  });
  const address =
    orig.address && String(orig.address).includes(',')
      ? String(orig.address).trim()
      : [
          addrMerged.line1,
          addrMerged.city,
          addrMerged.state,
          addrMerged.pincode ? ` - ${addrMerged.pincode}` : '',
        ]
          .filter(Boolean)
          .join(', ')
          .replace(/\s+-\s*$/, '');

  const items = newRows.map((r) => ({
    itemName: r.productName,
    category: r.category || '',
    pricePerUnit: Number(r.rate) || 0,
    quantity: Number(r.qty) || 0,
    ...(r.productId ? { productId: r.productId } : {}),
  }));

  const subtotal = round2(newRows.reduce((s, r) => s + (Number(r.qty) || 0) * (Number(r.rate) || 0), 0));
  const rate = Number(taxPct) || 0;
  const isGst = Boolean(bill.isGST);
  const taxAmount = isGst ? round2((subtotal * rate) / 100) : 0;
  const grandTotal = round2(subtotal + taxAmount);

  return {
    billType: isGst ? 'GST' : 'NON-GST',
    customerMobileNumber: phone,
    customerName: String(orig.customerName || bill.customerName || '').trim(),
    address: address || addrMerged.line1 || '—',
    gstin: isGst ? (orig.gstin ? String(orig.gstin).trim() : null) : null,
    customerEmail: orig.customerEmail ? String(orig.customerEmail).trim() : null,
    items,
    taxPercentage: rate,
    discountAmount: 0,
    totalAmount: subtotal,
    labourCharge: 0,
    transportationCharge: 0,
    otherExpenses: 0,
    grandTotal,
    payments: payments || [],
    supplementaryReason: supplementaryReason || `Adjustment for bill ${bill.billNumber || bill.id}`,
    ...(notes ? { notes: notes.slice(0, 2000) } : {}),
  };
}

export default function AdjustmentExchangeDialog({
  visible,
  bill,
  adjustmentSession = null,
  loading,
  onHide,
  onSuccess,
  onToast,
  canReturn = true,
}) {
  const [returnQtyById, setReturnQtyById] = useState({});
  const [newRows, setNewRows] = useState([]);
  const [settlement, setSettlement] = useState(SETTLEMENT_COLLECT);
  const [collectAmount, setCollectAmount] = useState('');
  const [refundAmount, setRefundAmount] = useState('');
  const [paymentMode, setPaymentMode] = useState('CASH');
  const [paymentReference, setPaymentReference] = useState('');
  const [transactionDate, setTransactionDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState('');
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewTimeline, setPreviewTimeline] = useState([]);
  const [adjustmentGroupId, setAdjustmentGroupId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [catalog, setCatalog] = useState([]);
  const [productSuggestions, setProductSuggestions] = useState([]);
  const billNumber = bill?.billNumber || bill?.billId || bill?.id || '—';
  const isGst = Boolean(bill?.isGST);
  const taxPct =
    bill?.originalSale?.taxPercentage != null
      ? Number(bill.originalSale.taxPercentage)
      : isGst
        ? 18
        : 0;

  const returnableLines = useMemo(() => getReturnableBillLines(bill), [bill]);

  const returnTotal = useMemo(() => {
    if (!bill) return 0;
    return computeReturnSettlementPreview(bill, returnQtyById, isGst);
  }, [bill, returnQtyById, isGst]);

  const newItemsTotal = useMemo(
    () => round2(newRows.reduce((s, r) => s + (Number(r.qty) || 0) * (Number(r.rate) || 0), 0)),
    [newRows]
  );

  const newItemsGrandTotal = useMemo(() => {
    const tax = isGst ? round2((newItemsTotal * taxPct) / 100) : 0;
    return round2(newItemsTotal + tax);
  }, [newItemsTotal, isGst, taxPct]);

  const difference = useMemo(() => round2(newItemsGrandTotal - returnTotal), [newItemsGrandTotal, returnTotal]);

  useEffect(() => {
    if (!visible || !bill) return;
    setReturnQtyById({});
    setNewRows([]);
    setSettlement(SETTLEMENT_COLLECT);
    setCollectAmount('');
    setRefundAmount('');
    setPaymentMode('CASH');
    setPaymentReference(
      bill?.billNumber ? `Adjustment for Bill ${bill.billNumber} (Return + New Items)` : ''
    );
    setTransactionDate(new Date().toISOString().slice(0, 10));
    setNotes('');
    setPreviewOpen(false);
    setPreviewTimeline([]);
    if (adjustmentSession?.adjustmentGroupId) {
      setAdjustmentGroupId(String(adjustmentSession.adjustmentGroupId));
    } else {
      setAdjustmentGroupId('');
    }
  }, [visible, bill?.id, adjustmentSession?.adjustmentGroupId]);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    fetchProductsCatalog()
      .then((list) => {
        if (!cancelled) setCatalog(Array.isArray(list) ? list : []);
      })
      .catch(() => {
        if (!cancelled) setCatalog([]);
      });
    return () => {
      cancelled = true;
    };
  }, [visible]);

  useEffect(() => {
    if (difference > 0.005) {
      setSettlement(SETTLEMENT_COLLECT);
      setCollectAmount(String(difference));
    } else if (difference < -0.005) {
      setSettlement(SETTLEMENT_REFUND);
      setRefundAmount(String(Math.abs(difference)));
    } else {
      setCollectAmount('');
      setRefundAmount('');
    }
  }, [difference]);

  const paidDisplay =
    Number(bill?.totalPaid ?? bill?.paidDisplay ?? bill?.paidAmount ?? bill?.originalSale?.totalPaid) || 0;
  const originalAmount = Number(bill?.totalAmount ?? bill?.originalSale?.totalAmount) || 0;
  const lifecycle = String(
    bill?.billLifecycleStatus || bill?.originalSale?.billLifecycleStatus || 'ACTIVE'
  ).toUpperCase();
  const customerName =
    bill?.originalSale?.customerName || bill?.customerName || '—';

  const hasReturnInput = useMemo(() => {
    return Object.values(returnQtyById).some((q) => Number(q) > 0);
  }, [returnQtyById]);

  const hasNewItems = newRows.length > 0 && newRows.some((r) => Number(r.qty) > 0 && Number(r.rate) > 0);

  const settlementAlert = useMemo(() => {
    if (Math.abs(difference) < 0.01) {
      return { type: 'neutral', text: 'Return and new items balance — no extra collection or refund.' };
    }
    if (difference > 0) {
      return {
        type: 'collect',
        text: `Customer needs to pay ${formatMoney(difference)} more.`,
      };
    }
    return {
      type: 'refund',
      text: `Customer should receive ${formatMoney(Math.abs(difference))} back (via refund or advance).`,
    };
  }, [difference]);

  const searchProducts = (event) => {
    const q = String(event.query || '')
      .trim()
      .toLowerCase();
    if (!q) {
      setProductSuggestions(catalog.slice(0, 20));
      return;
    }
    setProductSuggestions(
      catalog
        .filter((p) => {
          const name = String(p.name || p.title || '').toLowerCase();
          const type = String(p.productType || p.type || '').toLowerCase();
          return name.includes(q) || type.includes(q);
        })
        .slice(0, 20)
    );
  };

  const addReturnLineFromBill = () => {
    const first = returnableLines.find((it) => {
      const id = Number(it.itemId);
      const max = Number(it.quantityReturnable ?? it.quantity) || 0;
      const cur = Number(returnQtyById[id]) || 0;
      return max > cur;
    });
    if (first) {
      const id = Number(first.itemId);
      setReturnQtyById((prev) => ({ ...prev, [id]: Number(first.quantityReturnable ?? first.quantity) || 0 }));
    }
  };

  const addNewItemRow = () => {
    setNewRows((prev) => [
      ...prev,
      {
        key: newRowKey(),
        productId: null,
        productName: '',
        category: '',
        batchLabel: '—',
        unit: 'sq.ft',
        qty: '',
        rate: '',
      },
    ]);
  };

  const applyProductToRow = (rowKey, product) => {
    if (!product) return;
    const name = product.name || product.title || 'Product';
    const rate =
      Number(product.pricePerSqftAfter ?? product.pricePerSqft ?? product.price) || 0;
    const category = product.productType || product.type || product.category || '';
    setNewRows((prev) =>
      prev.map((r) =>
        r.key === rowKey
          ? {
              ...r,
              productId: product.id ?? product.productId,
              productName: name,
              category,
              batchLabel: product.color || category || '—',
              unit: product.unit || 'sq.ft',
              rate: rate > 0 ? String(rate) : r.rate,
            }
          : r
      )
    );
  };

  const buildReturnLines = useCallback(() => {
    const lines = [];
    for (const it of returnableLines) {
      const id = Number(it.itemId);
      const max = Number(it.quantityReturnable ?? it.quantity) || 0;
      const q = Number(returnQtyById[id]);
      if (!Number.isFinite(q) || q <= 0) continue;
      if (q > max + 1e-6) {
        throw new Error(
          `Return qty cannot exceed ${max} for ${it.itemName || it.description || 'line'}.`
        );
      }
      lines.push({ billItemId: id, quantity: q });
    }
    return lines;
  }, [returnableLines, returnQtyById]);

  const handleConfirm = async () => {
    if (!bill?.id || !bill?.billType) return;
    if (bill.isGST) {
      onToast?.({ message: 'Adjustment / exchange workflow is NON-GST only.', type: 'error' });
      return;
    }
    if (!hasReturnInput && !hasNewItems) {
      onToast?.({ message: 'Add return quantities and/or new items before confirming.', type: 'error' });
      return;
    }

    let returnLines = [];
    try {
      returnLines = hasReturnInput ? buildReturnLines() : [];
    } catch (e) {
      onToast?.({ message: e.message, type: 'error' });
      return;
    }

    if (hasReturnInput && returnLines.length === 0) {
      onToast?.({ message: 'Enter return quantity on at least one line.', type: 'error' });
      return;
    }

    for (const r of newRows) {
      if (!r.productName?.trim()) {
        onToast?.({ message: 'Select a product for each new item row.', type: 'error' });
        return;
      }
      if (!(Number(r.qty) > 0) || !(Number(r.rate) > 0)) {
        onToast?.({ message: 'New items need quantity and rate greater than zero.', type: 'error' });
        return;
      }
    }

    setSubmitting(true);

    try {
      if (hasReturnInput && !canReturn) {
        throw new Error('Stock return is not allowed for this bill status.');
      }

      const validRows = newRows.filter((r) => Number(r.qty) > 0 && Number(r.rate) > 0);
      const payments = [];
      if (settlement === SETTLEMENT_COLLECT) {
        const amt = round2(Number(collectAmount) || Math.max(0, difference));
        if (amt > 0.005) {
          payments.push({
            amount: amt,
            paymentMode:
              paymentMode === 'UPI' ? 'UPI' : paymentMode === 'BANK_TRANSFER' ? 'BANK_TRANSFER' : 'CASH',
          });
        }
      }

      const payload = {
        adjustmentGroupId: adjustmentGroupId || undefined,
        adjustmentType:
          hasReturnInput && hasNewItems ? 'EXCHANGE' : hasReturnInput ? 'RETURN_ONLY' : 'ITEM_REPLACEMENT',
        adjustmentReason: paymentReference || `Adjustment for bill ${billNumber}`,
        settlementMethod: settlement,
        settlementAmount:
          settlement === SETTLEMENT_COLLECT
            ? round2(Number(collectAmount) || Math.max(0, difference))
            : settlement === SETTLEMENT_REFUND
              ? round2(Number(refundAmount) || Math.abs(difference))
              : 0,
        paymentMode,
        transactionDate,
        reference: paymentReference,
        notes: notes.trim() || undefined,
        stockReturn: hasReturnInput
          ? {
              lines: returnLines,
              adjustmentGroupId: adjustmentGroupId || undefined,
              notes: [notes, paymentReference].filter(Boolean).join(' | ').trim() || undefined,
              ...mapSettlementToReturnRefundMode(settlement, paymentMode),
            }
          : undefined,
        supplementaryBill: hasNewItems
          ? buildSupplementaryPayload(bill, validRows, {
              payments,
              notes: notes.trim() || undefined,
              supplementaryReason: `Exchange / adjustment linked to bill ${billNumber}`,
              taxPct: 0,
            })
          : undefined,
      };

      const res = await finalizeBillAdjustment(bill.id, payload);
      const out = res?.data ?? res;
      setPreviewTimeline(Array.isArray(out?.timeline) ? out.timeline : []);

      const parts = [];
      if (out?.stockReturn?.returnId) {
        parts.push(`Return #${out.stockReturn.returnId}`);
      }
      if (out?.supplementaryBill?.billNumber) {
        parts.push(`Supplementary ${out.supplementaryBill.billNumber}`);
      }
      if (out?.adjustmentGroupId) {
        parts.push(`Group ${out.adjustmentGroupId}`);
      }

      window.dispatchEvent(new CustomEvent('kataria-ledger-refresh'));
      setPreviewOpen(false);
      onHide?.();
      onSuccess?.();
      onToast?.({
        message: parts.length ? parts.join(' · ') : 'Adjustment saved.',
        type: 'success',
      });
    } catch (e) {
      onToast?.({ message: e?.message || 'Adjustment could not be saved.', type: 'error' });
    } finally {
      setSubmitting(false);
    }
  };

  const previewSteps = useMemo(() => {
    const steps = [];
    if (hasReturnInput) {
      steps.push(
        `Record stock return worth ~${formatMoney(returnTotal)} (${settlement === SETTLEMENT_REFUND ? 'with refund' : settlement === SETTLEMENT_ADVANCE ? 'credit to advance/wallet' : 'no refund on return'})`
      );
    }
    if (hasNewItems) {
      steps.push(
        `Create supplementary bill for new items (${formatMoney(newItemsGrandTotal)} incl. tax)`
      );
      if (settlement === SETTLEMENT_COLLECT && Number(collectAmount) > 0) {
        steps.push(`Collect ${formatMoney(collectAmount)} via ${paymentMode}`);
      }
    }
    return steps;
  }, [
    hasReturnInput,
    hasNewItems,
    returnTotal,
    settlement,
    newItemsGrandTotal,
    collectAmount,
    paymentMode,
  ]);

  return (
    <>
      <Dialog
        visible={visible}
        onHide={() => {
          if (!submitting && !loading) onHide?.();
        }}
        className="adj-exchange-dialog"
        style={{ width: 'min(1180px, 98vw)' }}
        modal
        dismissableMask={!submitting}
        closable={!submitting}
        showHeader={false}
        blockScroll
      >
        {loading ? (
          <div className="adj-exchange-loading">
            <i className="pi pi-spin pi-spinner" style={{ marginRight: 8 }} />
            Loading bill…
          </div>
        ) : !bill ? (
          <div className="adj-exchange-loading">No bill selected.</div>
        ) : (
          <div className="adj-exchange-shell">
            <header className="adj-exchange-hero">
              <h2>Adjustment / Exchange — Bill: {billNumber}</h2>
              <p>
                Make returns and add new items. The system will calculate the difference and help you settle
                with the customer.
              </p>
            </header>

            <div className="adj-exchange-cards">
              <div className="adj-exchange-card">
                <i className="pi pi-user" />
                <div>
                  <span className="adj-exchange-card-label">Customer</span>
                  <span className="adj-exchange-card-value">{customerName}</span>
                </div>
              </div>
              <div className="adj-exchange-card">
                <i className="pi pi-file" />
                <div>
                  <span className="adj-exchange-card-label">Original Bill</span>
                  <span className="adj-exchange-card-value">{billNumber}</span>
                </div>
              </div>
              <div className="adj-exchange-card">
                <i className="pi pi-calendar" />
                <div>
                  <span className="adj-exchange-card-label">Bill Date</span>
                  <span className="adj-exchange-card-value">
                    {formatBillDate(bill.originalSale?.billDate || bill.billDate)}
                  </span>
                </div>
              </div>
              <div className="adj-exchange-card">
                <i className="pi pi-wallet" />
                <div>
                  <span className="adj-exchange-card-label">Original Amount</span>
                  <span className="adj-exchange-card-value">{formatMoney(originalAmount)}</span>
                </div>
              </div>
              <div className="adj-exchange-card">
                <i className="pi pi-check-circle" />
                <div>
                  <span className="adj-exchange-card-label">Paid Amount</span>
                  <span className="adj-exchange-card-value adj-exchange-card-value--green">
                    {formatMoney(paidDisplay)}
                  </span>
                </div>
              </div>
              <div className="adj-exchange-card">
                <i className="pi pi-map-marker" />
                <div>
                  <span className="adj-exchange-card-label">Bill Status</span>
                  <span className="adj-exchange-card-value adj-exchange-card-value--status">{lifecycle}</span>
                </div>
              </div>
            </div>

            <div className="adj-exchange-body">
              <div className="adj-exchange-panels-row">
              <section className="adj-exchange-panel">
                <div className="adj-exchange-panel-head">
                  <h3>1. Items to Return (From this bill)</h3>
                  {returnableLines.length > 0 ? (
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={addReturnLineFromBill}
                      disabled={!canReturn}
                    >
                      + Add Return Item
                    </button>
                  ) : null}
                </div>
                {!canReturn ? (
                  <p className="adj-exchange-empty">Returns are not available for this bill status.</p>
                ) : returnableLines.length === 0 ? (
                  <p className="adj-exchange-empty">No returnable quantity remains on this bill.</p>
                ) : (
                  <div className="adj-exchange-table-wrap">
                    <table className="adj-exchange-table">
                      <thead>
                        <tr>
                          <th>Product</th>
                          <th>Sold Qty</th>
                          <th>Returned Already</th>
                          <th>Return Now</th>
                          <th>Rate (₹)</th>
                          <th>Value (₹)</th>
                          <th />
                        </tr>
                      </thead>
                      <tbody>
                        {returnableLines.map((it) => {
                          const id = Number(it.itemId);
                          const sold = Number(it.quantity) || 0;
                          const max = Number(it.quantityReturnable ?? it.quantity) || 0;
                          const rtd = Number(it.quantityReturnedToDate) || 0;
                          const rate = Number(it.pricePerUnit) || 0;
                          const ret = Number(returnQtyById[id]) || 0;
                          const amt =
                            ret > 0
                              ? computeReturnSettlementPreview(
                                  bill,
                                  { [id]: ret },
                                  false
                                )
                              : 0;
                          return (
                            <tr key={id}>
                              <td>{it.itemName || it.description || '—'}</td>
                              <td>{sold}</td>
                              <td>{rtd}</td>
                              <td>
                                <input
                                  type="number"
                                  min={0}
                                  max={max}
                                  step="0.01"
                                  value={returnQtyById[id] ?? ''}
                                  placeholder="0"
                                  onChange={(e) =>
                                    setReturnQtyById((prev) => ({
                                      ...prev,
                                      [id]: e.target.value,
                                    }))
                                  }
                                />
                              </td>
                              <td>{rate.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</td>
                              <td className="adj-exchange-amt--neg">
                                {ret > 0 ? formatMoney(amt).replace('₹', '') : '—'}
                              </td>
                              <td>
                                <button
                                  type="button"
                                  className="adj-exchange-icon-btn"
                                  title="Clear"
                                  onClick={() =>
                                    setReturnQtyById((prev) => {
                                      const next = { ...prev };
                                      delete next[id];
                                      return next;
                                    })
                                  }
                                >
                                  <i className="pi pi-trash" />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot>
                        <tr>
                          <td colSpan={5} style={{ textAlign: 'right' }}>
                            Total Return Value
                          </td>
                          <td colSpan={2} className="adj-exchange-amt--neg">
                            {formatMoney(returnTotal)}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </section>

              <section className="adj-exchange-panel">
                <div className="adj-exchange-panel-head">
                  <h3>2. New Items (Add to this bill)</h3>
                  <button type="button" className="btn btn-secondary" onClick={addNewItemRow}>
                    + Add New Item
                  </button>
                </div>
                {newRows.length === 0 ? (
                  <p className="adj-exchange-empty">
                    Click <strong>+ Add New Item</strong> to bill exchange material (creates a supplementary
                    invoice).
                  </p>
                ) : (
                  <div className="adj-exchange-table-wrap">
                    <table className="adj-exchange-table">
                      <thead>
                        <tr>
                          <th>Product</th>
                          <th>Batch / Lot</th>
                          <th>Unit</th>
                          <th>Qty</th>
                          <th>Rate (₹)</th>
                          <th>Amount (₹)</th>
                          <th />
                        </tr>
                      </thead>
                      <tbody>
                        {newRows.map((row) => {
                          const lineAmt = round2((Number(row.qty) || 0) * (Number(row.rate) || 0));
                          return (
                            <tr key={row.key}>
                              <td>
                                <AutoComplete
                                  value={row.productName}
                                  suggestions={productSuggestions}
                                  completeMethod={searchProducts}
                                  field="name"
                                  placeholder="Search product…"
                                  className="adj-exchange-product-select"
                                  inputStyle={{ width: '100%', fontSize: '0.8125rem' }}
                                  onChange={(e) =>
                                    setNewRows((prev) =>
                                      prev.map((r) =>
                                        r.key === row.key ? { ...r, productName: e.value } : r
                                      )
                                    )
                                  }
                                  onSelect={(e) => applyProductToRow(row.key, e.value)}
                                  itemTemplate={(item) => (
                                    <span>
                                      {item.name || item.title}
                                      {item.color ? ` · ${item.color}` : ''}
                                    </span>
                                  )}
                                />
                              </td>
                              <td>{row.batchLabel || '—'}</td>
                              <td>{row.unit || 'sq.ft'}</td>
                              <td>
                                <input
                                  type="number"
                                  min={0}
                                  step="0.01"
                                  value={row.qty}
                                  onChange={(e) =>
                                    setNewRows((prev) =>
                                      prev.map((r) =>
                                        r.key === row.key ? { ...r, qty: e.target.value } : r
                                      )
                                    )
                                  }
                                />
                              </td>
                              <td>
                                <input
                                  type="number"
                                  min={0}
                                  step="0.01"
                                  value={row.rate}
                                  onChange={(e) =>
                                    setNewRows((prev) =>
                                      prev.map((r) =>
                                        r.key === row.key ? { ...r, rate: e.target.value } : r
                                      )
                                    )
                                  }
                                />
                              </td>
                              <td className="adj-exchange-amt--pos">
                                {lineAmt > 0 ? formatMoney(lineAmt).replace('₹', '') : '—'}
                              </td>
                              <td>
                                <button
                                  type="button"
                                  className="adj-exchange-icon-btn"
                                  onClick={() =>
                                    setNewRows((prev) => prev.filter((r) => r.key !== row.key))
                                  }
                                >
                                  <i className="pi pi-trash" />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot>
                        <tr>
                          <td colSpan={5} style={{ textAlign: 'right' }}>
                            Total New Items Value
                            {isGst ? ` (+ ${taxPct}% tax → ${formatMoney(newItemsGrandTotal)})` : ''}
                          </td>
                          <td colSpan={2} className="adj-exchange-amt--pos">
                            {formatMoney(newItemsTotal)}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </section>
              </div>

              <div className="adj-exchange-settlement-row">
                <section className="adj-exchange-panel adj-exchange-settlement-panel">
                  <h4>3. Settlement Summary</h4>
                  <div className="adj-exchange-summary-line">
                    <span>Return Value (A)</span>
                    <strong className="adj-exchange-amt--neg">{formatMoney(returnTotal)}</strong>
                  </div>
                  <div className="adj-exchange-summary-line">
                    <span>New Items Value (B)</span>
                    <strong className="adj-exchange-amt--pos">{formatMoney(newItemsGrandTotal)}</strong>
                  </div>
                  <div className="adj-exchange-summary-line">
                    <span>Difference (B − A)</span>
                    <strong className={difference >= 0 ? 'adj-exchange-amt--pos' : 'adj-exchange-amt--neg'}>
                      {formatMoney(difference)}
                    </strong>
                  </div>
                  <div
                    className={`adj-exchange-alert adj-exchange-alert--${settlementAlert.type}`}
                  >
                    {settlementAlert.text}
                  </div>
                </section>

                <section className="adj-exchange-panel adj-exchange-settlement-panel">
                  <h4>4. Settlement Method</h4>
                  <div className="adj-exchange-radio">
                    <label>
                      <input
                        type="radio"
                        name="adj-settlement"
                        checked={settlement === SETTLEMENT_COLLECT}
                        onChange={() => setSettlement(SETTLEMENT_COLLECT)}
                      />
                      <span>
                        <strong>Collect Payment from Customer</strong>
                        {settlement === SETTLEMENT_COLLECT ? (
                          <span className="adj-exchange-field">
                            Amount to Collect (₹)
                            <input
                              type="number"
                              min={0}
                              step="0.01"
                              value={collectAmount}
                              onChange={(e) => setCollectAmount(e.target.value)}
                            />
                          </span>
                        ) : null}
                      </span>
                    </label>
                    <label>
                      <input
                        type="radio"
                        name="adj-settlement"
                        checked={settlement === SETTLEMENT_REFUND}
                        onChange={() => setSettlement(SETTLEMENT_REFUND)}
                      />
                      <span>
                        <strong>Refund to Customer</strong>
                        {settlement === SETTLEMENT_REFUND ? (
                          <span className="adj-exchange-field">
                            Refund Amount (₹)
                            <input
                              type="number"
                              min={0}
                              step="0.01"
                              value={refundAmount}
                              onChange={(e) => setRefundAmount(e.target.value)}
                            />
                          </span>
                        ) : null}
                      </span>
                    </label>
                    <label>
                      <input
                        type="radio"
                        name="adj-settlement"
                        checked={settlement === SETTLEMENT_ADVANCE}
                        onChange={() => setSettlement(SETTLEMENT_ADVANCE)}
                      />
                      <span>
                        <strong>Adjust in Advance</strong> — credit customer wallet / advance ledger
                      </span>
                    </label>
                  </div>
                </section>

                <section className="adj-exchange-panel adj-exchange-settlement-panel">
                  <h4>5. Payment Mode (For Collection / Refund)</h4>
                  <label className="adj-exchange-field">
                    Payment Mode
                    <select value={paymentMode} onChange={(e) => setPaymentMode(e.target.value)}>
                      <option value="CASH">CASH</option>
                      <option value="UPI">UPI</option>
                      <option value="BANK_TRANSFER">BANK TRANSFER</option>
                      <option value="CHEQUE">CHEQUE</option>
                    </select>
                  </label>
                  <label className="adj-exchange-field">
                    Reference / Notes
                    <input
                      type="text"
                      value={paymentReference}
                      onChange={(e) => setPaymentReference(e.target.value)}
                      placeholder="Adjustment reference…"
                    />
                  </label>
                  <label className="adj-exchange-field">
                    Transaction Date
                    <input
                      type="date"
                      value={transactionDate}
                      onChange={(e) => setTransactionDate(e.target.value)}
                    />
                  </label>
                </section>
              </div>

              <section className="adj-exchange-notes">
                <h4 style={{ margin: '0 0 8px', fontSize: '0.875rem' }}>6. Notes (Optional)</h4>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Internal notes for this adjustment…"
                />
              </section>
            </div>

            <footer className="adj-exchange-footer">
              <button type="button" className="btn btn-secondary" disabled={submitting} onClick={onHide}>
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={submitting}
                onClick={() => setPreviewOpen(true)}
              >
                Preview &amp; Confirm Adjustment
              </button>
            </footer>
          </div>
        )}
      </Dialog>

      <Dialog
        header="Confirm adjustment"
        visible={previewOpen}
        style={{ width: 'min(480px, 94vw)' }}
        onHide={() => !submitting && setPreviewOpen(false)}
        modal
        footer={
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={submitting}
              onClick={() => setPreviewOpen(false)}
            >
              Back
            </button>
            <button type="button" className="btn btn-primary" disabled={submitting} onClick={handleConfirm}>
              {submitting ? 'Saving…' : 'Confirm'}
            </button>
          </div>
        }
      >
        <div className="adj-exchange-timeline-flow" aria-label="Adjustment flow">
          <div className="step">
            <i className="pi pi-file" /> Original Bill — {billNumber}
          </div>
          {hasReturnInput ? (
            <>
              <div className="arrow">↓</div>
              <div className="step">
                <i className="pi pi-undo" /> Return Entry + Inventory Restored
              </div>
            </>
          ) : null}
          {hasNewItems ? (
            <>
              <div className="arrow">↓</div>
              <div className="step">
                <i className="pi pi-plus-circle" /> Supplementary Bill (new items)
              </div>
            </>
          ) : null}
          {(settlement === SETTLEMENT_COLLECT ||
            settlement === SETTLEMENT_REFUND ||
            settlement === SETTLEMENT_ADVANCE) && (
            <>
              <div className="arrow">↓</div>
              <div className="step">
                <i className="pi pi-wallet" /> Settlement Transaction ({settlement})
              </div>
            </>
          )}
        </div>
        <ul className="adj-exchange-preview-list">
          {previewSteps.length === 0 ? (
            <li>Add return lines or new items first.</li>
          ) : (
            previewSteps.map((s, i) => <li key={i}>{s}</li>)
          )}
        </ul>
        <p style={{ margin: '12px 0 0', fontSize: '0.8125rem', color: '#64748b' }}>
          Net difference: <strong>{formatMoney(difference)}</strong>. Original bill lines are not rewritten.
        </p>
        {adjustmentGroupId ? (
          <p style={{ margin: '8px 0 0', fontSize: '0.8125rem', color: '#64748b' }}>
            Adjustment group: <strong>{adjustmentGroupId}</strong>
          </p>
        ) : null}
      </Dialog>
    </>
  );
}
