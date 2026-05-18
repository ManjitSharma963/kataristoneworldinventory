import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  addBillPayment,
  fetchBillByTypeAndId,
  fetchBillRevisionPreview,
  fetchCustomerAdvanceSummary,
  updateBill,
} from '../../utils/api';
import { fetchProductsCatalog } from '../../api/productsApi';
import './BillEditPage.css';

/** §16 bill-edit UX (original vs draft, stock/payment/advance previews). React Native can mirror this screen 1:1. */

function toIsoDate(v) {
  if (!v) return '';
  const d = v instanceof Date ? v : new Date(v);
  if (Number.isNaN(d.getTime())) return '';
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

function toNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** Cash-like payments only — wallet/token rows are counted under advance, not here. */
function sumNonAdvancePayments(payments) {
  return (payments || []).reduce((s, p) => {
    const mode = String(p.paymentMode ?? p.payment_mode ?? '').toUpperCase();
    if (mode === 'WALLET') return s;
    return s + toNum(p.amount);
  }, 0);
}

function stockForItem(item, catalog) {
  if (!item || !Array.isArray(catalog) || !catalog.length) return 0;
  const byId = item.productId != null
    ? catalog.find((p) => Number(p.id) === Number(item.productId))
    : null;
  const byName = !byId
    ? catalog.find((p) => String(p.name || '').trim().toLowerCase() === String(item.itemName || '').trim().toLowerCase())
    : null;
  const match = byId || byName;
  if (!match) return 0;
  return toNum(match.quantity ?? match.stock ?? 0);
}

function formatInr(amount) {
  const n = Number(amount);
  if (!Number.isFinite(n)) return '0.00';
  return n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Δ qty vs saved bill line: positive = more stock OUT, negative = IN / return toward stock. */
function lineQuantityDelta(it) {
  return toNum(it.quantity) - toNum(it.oldQuantity);
}

function buildDraft(raw, fallback) {
  const detail = raw?.data && typeof raw.data === 'object' ? raw.data : raw;
  const items = Array.isArray(detail?.items) ? detail.items : [];
  return {
    customerName: String(detail?.customerName || fallback?.customerName || '').trim(),
    customerMobileNumber: String(detail?.customerMobileNumber || fallback?.customerNumber || '').trim(),
    address: String(detail?.address || '').trim(),
    billDate: toIsoDate(detail?.billDate || fallback?.billDate),
    gstin: String(detail?.gstin || '').trim(),
    customerEmail: String(detail?.customerEmail || '').trim(),
    discountAmount: toNum(detail?.discountAmount),
    labourCharge: toNum(detail?.labourCharge),
    transportationCharge: toNum(detail?.transportationCharge),
    otherExpenses: toNum(detail?.otherExpenses),
    taxPercentage: toNum(detail?.taxPercentage),
    items: items.map((it, idx) => {
      const q0 = toNum(it.quantity);
      const r0 = toNum(it.pricePerUnit);
      return {
        rowId: `${it.itemId || it.id || idx}-${idx}`,
        itemId: it.itemId != null ? Number(it.itemId) : null,
        productId: it.productId != null ? Number(it.productId) : null,
        itemName: String(it.itemName || '').trim(),
        category: String(it.category || 'General').trim(),
        unit: String(it.unit || 'piece').trim(),
        quantity: q0,
        oldQuantity: q0,
        pricePerUnit: r0,
        oldPricePerUnit: r0,
        /** Line total when the editor opened (saved bill snapshot). */
        initialLineAmount: q0 * r0,
      };
    }),
    payments: Array.isArray(detail?.payments) ? detail.payments : [],
    originalTotal: toNum(detail?.totalAmount || fallback?.totalAmount),
    originalPaid: toNum(detail?.paidAmount || fallback?.paidAmount),
    customerId:
      detail?.customerId != null
        ? Number(detail.customerId)
        : fallback?.customerId != null
          ? Number(fallback.customerId)
          : null,
    advanceUsed: toNum(detail?.advanceUsed ?? fallback?.advanceUsed),
    notes: String(detail?.notes || '').trim(),
  };
}

/** Same shape as sent to `updateBill` (PUT replace). Used for save + “no changes” detection (excludes one-off lifecycle note). */
function buildBillUpdatePayloadFromDraft(draft, options = {}) {
  if (!draft) return null;
  const items = (draft.items || [])
    .filter((it) => String(it.itemName || '').trim() && toNum(it.quantity) > 0 && toNum(it.pricePerUnit) >= 0)
    .map((it) => ({
      itemId: it.itemId != null ? Number(it.itemId) : undefined,
      productId: it.productId != null ? Number(it.productId) : undefined,
      itemName: String(it.itemName || '').trim(),
      category: String(it.category || 'General').trim(),
      quantity: toNum(it.quantity),
      pricePerUnit: toNum(it.pricePerUnit),
      unit: String(it.unit || 'piece').trim(),
    }));
  if (!items.length) return null;
  const payload = {
    customerMobileNumber: String(draft.customerMobileNumber || '').trim(),
    customerName: String(draft.customerName || '').trim() || undefined,
    address: String(draft.address || '').trim() || undefined,
    gstin: String(draft.gstin || '').trim() || undefined,
    customerEmail: String(draft.customerEmail || '').trim() || undefined,
    taxPercentage: toNum(draft.taxPercentage),
    discountAmount: toNum(draft.discountAmount),
    labourCharge: toNum(draft.labourCharge),
    transportationCharge: toNum(draft.transportationCharge),
    otherExpenses: toNum(draft.otherExpenses),
    billDate: draft.billDate || undefined,
    items,
  };
  const lifecycle = options.lifecycleNote != null ? String(options.lifecycleNote).trim() : '';
  if (lifecycle) {
    payload.notes = lifecycle.slice(0, 2000);
  }
  if (Array.isArray(options.payments) && options.payments.length) {
    payload.payments = options.payments;
  }
  return payload;
}

function billUpdatePayloadsEqual(a, b) {
  if (a == null || b == null) return a === b;
  return JSON.stringify(a) === JSON.stringify(b);
}

const PAYMENT_MODES = ['UPI', 'CASH', 'BANK_TRANSFER', 'CHEQUE', 'CARD'];

export default function BillEditPage({ bill, onBack, onSaved, onPaymentsRecorded }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [updatingPayments, setUpdatingPayments] = useState(false);
  const [draft, setDraft] = useState(null);
  const [catalog, setCatalog] = useState([]);
  const [toast, setToast] = useState('');
  const [paymentDraftByMode, setPaymentDraftByMode] = useState({
    UPI: '',
    CASH: '',
    BANK_TRANSFER: '',
    CHEQUE: '',
    CARD: '',
  });
  const [advanceSummary, setAdvanceSummary] = useState(null);
  const [advanceSummaryLoading, setAdvanceSummaryLoading] = useState(false);
  const [updateNote, setUpdateNote] = useState('');
  const [serverPreview, setServerPreview] = useState(null);
  const [serverPreviewLoading, setServerPreviewLoading] = useState(false);
  const initialBillUpdatePayloadRef = useRef(null);
  const previewDebounceRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!bill?.id || !bill?.billType) return;
      setLoading(true);
      initialBillUpdatePayloadRef.current = null;
      try {
        const [detail, products] = await Promise.all([
          fetchBillByTypeAndId(bill.id, bill.billType),
          fetchProductsCatalog().catch(() => []),
        ]);
        if (cancelled) return;
        const nextDraft = buildDraft(detail, bill);
        initialBillUpdatePayloadRef.current = buildBillUpdatePayloadFromDraft(nextDraft);
        setDraft(nextDraft);
        setUpdateNote('');
        setCatalog(Array.isArray(products) ? products : []);
        setPaymentDraftByMode({
          UPI: '',
          CASH: '',
          BANK_TRANSFER: '',
          CHEQUE: '',
          CARD: '',
        });
      } catch (e) {
        if (!cancelled) setToast(e?.message || 'Could not load bill details.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [bill]);

  useEffect(() => {
    const cid = draft?.customerId;
    if (cid == null || Number.isNaN(Number(cid))) {
      setAdvanceSummary(null);
      return;
    }
    let cancelled = false;
    (async () => {
      setAdvanceSummaryLoading(true);
      try {
        const raw = await fetchCustomerAdvanceSummary(Number(cid));
        const s = raw?.data && typeof raw.data === 'object' && !Array.isArray(raw.data) ? raw.data : raw;
        if (cancelled) return;
        setAdvanceSummary({
          totalAdvance: toNum(s?.totalAdvance),
          totalUsed: toNum(s?.totalUsed),
          remaining: toNum(s?.remaining),
        });
      } catch {
        if (!cancelled) setAdvanceSummary(null);
      } finally {
        if (!cancelled) setAdvanceSummaryLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [draft?.customerId]);

  useEffect(() => {
    if (!draft || !bill?.id || !bill?.billType || loading) return;
    const payload = buildBillUpdatePayloadFromDraft(draft);
    if (!payload) {
      setServerPreview(null);
      return;
    }
    if (previewDebounceRef.current) clearTimeout(previewDebounceRef.current);
    previewDebounceRef.current = setTimeout(async () => {
      setServerPreviewLoading(true);
      try {
        const raw = await fetchBillRevisionPreview(bill.id, bill.billType, payload);
        setServerPreview(raw?.data && typeof raw.data === 'object' ? raw.data : raw);
      } catch {
        setServerPreview(null);
      } finally {
        setServerPreviewLoading(false);
      }
    }, 500);
    return () => {
      if (previewDebounceRef.current) clearTimeout(previewDebounceRef.current);
    };
  }, [draft, bill, loading]);

  const computed = useMemo(() => {
    if (!draft) return null;
    const subtotal = (draft.items || []).reduce((s, it) => {
      const qty = toNum(it.quantity);
      const rate = toNum(it.pricePerUnit);
      return s + qty * rate;
    }, 0);
    const discount = toNum(draft.discountAmount);
    const taxable = Math.max(0, subtotal - discount);
    const taxAmount = (taxable * toNum(draft.taxPercentage)) / 100;
    const total = taxable + taxAmount + toNum(draft.labourCharge) + toNum(draft.transportationCharge) + toNum(draft.otherExpenses);
    const paidNonAdvance = sumNonAdvancePayments(draft.payments);
    const advanceOnBill = toNum(draft.advanceUsed);
    const due = Math.max(0, Number((total - paidNonAdvance - advanceOnBill).toFixed(2)));
    return { subtotal, taxAmount, total, paid: paidNonAdvance, advanceOnBill, due };
  }, [draft]);

  const hasUnsavedBillChanges = useMemo(() => {
    if (!draft || !initialBillUpdatePayloadRef.current) return false;
    const current = buildBillUpdatePayloadFromDraft(draft);
    return !billUpdatePayloadsEqual(current, initialBillUpdatePayloadRef.current);
  }, [draft]);

  /** Cash/UPI/bank still to collect after applying available wallet balance to current due. */
  const payableCashNow = useMemo(() => {
    if (!computed) return 0;
    const cid = draft?.customerId;
    if (cid == null || Number.isNaN(Number(cid)) || !advanceSummary) {
      return computed.due;
    }
    const fromWallet = Math.min(advanceSummary.remaining, computed.due);
    return Math.max(0, Number((computed.due - fromWallet).toFixed(2)));
  }, [computed, advanceSummary, draft?.customerId]);

  const walletSummaryReady =
    draft?.customerId == null ||
    Number.isNaN(Number(draft?.customerId)) ||
    !advanceSummaryLoading;

  const netImpact = computed ? computed.total - toNum(draft?.originalTotal) : 0;
  const payImpact = computed ? computed.paid - toNum(draft?.originalPaid) : 0;

  const isGstBill = String(bill?.billType || '').toUpperCase() === 'GST';

  /** Scenario A = total up, B = total down (matches billing “edit impact” docs). */
  const billAmountScenario = useMemo(() => {
    if (!computed || !draft) return null;
    const orig = toNum(draft.originalTotal);
    const next = computed.total;
    const delta = next - orig;
    const EPS = 0.005;
    if (Math.abs(delta) <= EPS) {
      return { kind: 'neutral', delta, orig, next, title: 'No material change to final amount' };
    }
    if (delta > EPS) {
      return {
        kind: 'a_increase',
        delta,
        orig,
        next,
        title: 'Scenario A — Bill total increased',
        subtitle: 'Extra amount is covered first by wallet (on save), then cash/UPI as needed.',
      };
    }
    return {
      kind: 'b_decrease',
      delta,
      orig,
      next,
      title: 'Scenario B — Bill total decreased',
      subtitle: 'Extra wallet use is re-credited on save; cash rows may scale down unless you send a new split.',
    };
  }, [computed, draft]);

  /** How much of current “still to pay” the wallet could absorb if you save (Non-GST server path). */
  const walletApplyPreview = useMemo(() => {
    if (!computed || draft?.customerId == null || Number.isNaN(Number(draft.customerId))) return null;
    if (!advanceSummary) return null;
    const cap = Math.min(Math.max(0, advanceSummary.remaining), Math.max(0, computed.due));
    return Number(cap.toFixed(2));
  }, [computed, advanceSummary, draft?.customerId]);

  /** Customer vs shop: overpaid on bill (return/credit) vs still owed (collect, after wallet for cash). */
  const settlementPreview = useMemo(() => {
    if (!computed) return null;
    const { total, paid, advanceOnBill, due } = computed;
    const covered = paid + advanceOnBill;
    const overage = Math.max(0, Number((covered - total).toFixed(2)));
    const EPS = 0.005;

    if (overage > EPS) {
      return {
        type: 'return',
        headline: 'Refund / store credit (preview)',
        displayAmount: overage,
        amount: overage,
        line: 'Return or credit to customer',
        detail:
          'Cash/UPI/bank and advance already on this bill are more than the new bill total. Refund cash or add to wallet as you prefer.',
      };
    }

    if (due > EPS) {
      if (!walletSummaryReady) {
        return {
          type: 'collect_pending_wallet',
          headline: 'Additional payment (preview)',
          displayAmount: due,
          amount: due,
          line: 'Customer should pay (before wallet)',
          detail: 'Loading wallet… cash amount may be lower once wallet is applied.',
        };
      }
      if (payableCashNow > EPS) {
        return {
          type: 'collect_cash',
          headline: 'Additional payment required',
          displayAmount: payableCashNow,
          amount: payableCashNow,
          line: 'Collect from customer (cash/UPI/bank)',
          detail:
            payableCashNow < due - EPS
              ? `Still due on bill: ₹ ${due.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} — wallet can cover part; collect the rest now or after Update bill.`
              : `Still due on bill: ₹ ${due.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}.`,
        };
      }
      return {
        type: 'collect_wallet',
        headline: 'Advance covers remainder (preview)',
        displayAmount: due,
        amount: 0,
        line: 'No cash to collect',
        detail: `Still due on bill (before wallet): ₹ ${due.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} — wallet can cover it. Click Update bill; customer does not need to pay cash for this gap.`,
      };
    }

    return {
      type: 'even',
      headline: null,
      displayAmount: 0,
      amount: 0,
      line: 'Settlement',
      detail: 'No extra collection or return on this preview — bill matches payments and advance on the bill.',
    };
  }, [computed, payableCashNow, walletSummaryReady]);

  /** Preview of inventory deltas vs saved bill lines (OUT = more sale, IN = toward stock). */
  const stockImpactPreview = useMemo(() => {
    if (!draft) return { lines: [], warnings: [] };
    const lines = [];
    const warnings = [];
    for (const it of draft.items || []) {
      const name = String(it.itemName || '').trim() || '(unnamed line)';
      const dq = lineQuantityDelta(it);
      const q = toNum(it.quantity);
      if (it.itemId == null && q > 0) {
        lines.push({
          key: it.rowId,
          name,
          delta: q,
          kind: 'NEW',
          unit: it.unit || 'unit',
        });
        const st = stockForItem(it, catalog);
        if (st < q - 0.0001) {
          warnings.push(`${name}: new line needs ${formatInr(q)} ${it.unit}; on-hand ≈ ${formatInr(st)}`);
        }
        continue;
      }
      if (Math.abs(dq) < 0.0001) continue;
      lines.push({
        key: it.rowId,
        name,
        delta: dq,
        kind: dq > 0 ? 'OUT' : 'IN',
        unit: it.unit || 'unit',
        stock: stockForItem(it, catalog),
      });
      if (dq > 0) {
        const st = stockForItem(it, catalog);
        if (st < dq - 0.0001) {
          warnings.push(`${name}: +${formatInr(dq)} ${it.unit} OUT vs on-hand ≈ ${formatInr(st)}`);
        }
      }
    }
    return { lines, warnings };
  }, [draft, catalog]);

  /**
   * Non-GST heuristic: on save the server reverses advance on the bill then reapplies FIFO up to (new total − cash paid).
   * GST: server rules only — no client estimate.
   */
  const advanceRecalcPreview = useMemo(() => {
    if (!computed || !draft) return null;
    const advanceOnBillNow = toNum(draft.advanceUsed);
    const gapAfterCash = Math.max(0, Number((computed.total - computed.paid).toFixed(2)));
    if (isGstBill) {
      return {
        isGst: true,
        advanceOnBillNow,
        note: 'GST bills: advance/wallet behaviour is determined on the server when you save.',
      };
    }
    const pool = (advanceSummary ? toNum(advanceSummary.remaining) : 0) + advanceOnBillNow;
    const estimatedOnBillAfterSave = Math.min(pool, gapAfterCash);
    const approxReleased = Math.max(0, Number((advanceOnBillNow - gapAfterCash).toFixed(2)));
    return {
      isGst: false,
      advanceOnBillNow,
      gapAfterCashPayments: gapAfterCash,
      walletPlusBillAdvancePreview: pool,
      estimatedAdvanceOnBillAfterSave: estimatedOnBillAfterSave,
      approxReturnedToWalletIfTotalDown: approxReleased,
      note: 'Approximation: server runs full FIFO reversal + re-apply. Use as staff guidance only.',
    };
  }, [computed, draft, advanceSummary, isGstBill]);

  const setField = (key, value) => setDraft((p) => ({ ...p, [key]: value }));
  const setItemField = (rowId, key, value) =>
    setDraft((p) => ({
      ...p,
      items: (p.items || []).map((it) => (it.rowId === rowId ? { ...it, [key]: value } : it)),
    }));

  const addItem = () =>
    setDraft((p) => ({
      ...p,
      items: [...(p.items || []), {
        rowId: `new-${Date.now()}`,
        itemId: null,
        productId: null,
        itemName: '',
        category: 'General',
        unit: 'piece',
        quantity: 1,
        oldQuantity: 0,
        pricePerUnit: 0,
        oldPricePerUnit: 0,
        initialLineAmount: 0,
      }],
    }));

  const removeItem = (rowId) =>
    setDraft((p) => ({ ...p, items: (p.items || []).filter((it) => it.rowId !== rowId) }));

  const handleUpdateBillPayments = async () => {
    if (!bill?.id || !bill?.billType) return;
    if (!computed) return;
    if (hasUnsavedBillChanges) {
      setToast(
        'Save bill changes first (Update bill). Record payments uses the saved bill total — your preview changes are not on the server yet.'
      );
      return;
    }
    if (!walletSummaryReady) {
      setToast('Still loading wallet summary…');
      return;
    }
    if (payableCashNow <= 0.005) {
      if (computed.due <= 0.005) {
        setToast('No balance due on this bill.');
      } else {
        setToast('Nothing to collect in cash — wallet can cover the balance. Use Update bill to save and apply advance.');
      }
      return;
    }
    const entries = PAYMENT_MODES
      .map((mode) => ({ mode, amount: toNum(paymentDraftByMode[mode]) }))
      .filter((entry) => entry.amount > 0);
    if (!entries.length) {
      setToast('Enter at least one payment amount greater than 0.');
      return;
    }
    const totalEntered = entries.reduce((s, e) => s + e.amount, 0);
    if (totalEntered > payableCashNow + 0.02) {
      setToast(
        `Total entered (₹${totalEntered.toFixed(2)}) cannot exceed payable now (₹${payableCashNow.toFixed(2)}).`
      );
      return;
    }
    setUpdatingPayments(true);
    try {
      for (const entry of entries) {
        await addBillPayment(bill.id, bill.billType, {
          amount: entry.amount,
          paymentMode: entry.mode,
          paymentDate: toIsoDate(new Date()),
        });
      }
      const fresh = await fetchBillByTypeAndId(bill.id, bill.billType);
      const refreshed = buildDraft(fresh, bill);
      initialBillUpdatePayloadRef.current = buildBillUpdatePayloadFromDraft(refreshed);
      setDraft(refreshed);
      setPaymentDraftByMode({
        UPI: '',
        CASH: '',
        BANK_TRANSFER: '',
        CHEQUE: '',
        CARD: '',
      });
      setToast('Payment recorded — transactions and daily budget updated.');
      onPaymentsRecorded?.();
    } catch (e) {
      const msg = String(e?.message || '');
      if (msg.includes('cannot exceed remaining')) {
        setToast(
          'Payment exceeds what the saved bill allows. Click Update bill first to apply quantity/charge changes, then record payment — or enter amounts below and use Update bill.'
        );
      } else {
        setToast(msg || 'Could not update bill payments.');
      }
    } finally {
      setUpdatingPayments(false);
    }
  };

  const applyProduct = (rowId, productName) => {
    const prod = catalog.find((p) => String(p.name || '').trim() === String(productName || '').trim());
    if (!prod) return;
    setDraft((p) => ({
      ...p,
      items: (p.items || []).map((it) =>
        it.rowId === rowId
          ? {
              ...it,
              itemName: String(prod.name || '').trim(),
              category: String(prod.productType || it.category || 'General'),
              productId: prod.id ?? null,
              unit: String(prod.unit || 'piece'),
              pricePerUnit: toNum(prod.pricePerSqftAfter ?? prod.pricePerUnit ?? prod.price),
            }
          : it
      ),
    }));
  };

  const handleSave = async () => {
    if (!draft || !bill?.id || !bill?.billType) return;
    if (!computed) return;
    const trimmedLifecycle = String(updateNote || '').trim();
    // Update bill = line items & charges only. Payments are NOT sent here (use Record payments).
    const payload = buildBillUpdatePayloadFromDraft(draft, { lifecycleNote: trimmedLifecycle });
    if (!payload) {
      setToast('Please keep at least one valid item.');
      return;
    }
    const fieldsOnly = buildBillUpdatePayloadFromDraft(draft);
    if (billUpdatePayloadsEqual(fieldsOnly, initialBillUpdatePayloadRef.current) && !trimmedLifecycle) {
      setToast('No changes.');
      return;
    }
    setSaving(true);
    try {
      await updateBill(bill.id, bill.billType, payload);
      setPaymentDraftByMode({
        UPI: '',
        CASH: '',
        BANK_TRANSFER: '',
        CHEQUE: '',
        CARD: '',
      });
      setToast('Bill saved. Any extra amount is pending until you record payment.');
      onSaved?.();
      onBack?.();
    } catch (e) {
      const msg = String(e?.message || '');
      if (msg.includes('cannot exceed')) {
        setToast(msg);
      } else {
        setToast(msg || 'Could not save bill changes.');
      }
    } finally {
      setSaving(false);
    }
  };

  if (!bill) return null;

  return (
    <div className="bill-edit-page">
      <div className="bill-edit-header">
        <div>
          <button type="button" className="btn btn-secondary" onClick={onBack}>← Back</button>
          <h2>{`Edit Bill: ${bill.billNumber || bill.id}`}</h2>
        </div>
        <div className="bill-edit-actions">
          <button type="button" className="btn btn-primary" onClick={handleSave} disabled={saving || loading}>
            {saving ? 'Saving…' : 'Update bill'}
          </button>
          <button type="button" className="btn btn-secondary" onClick={onBack} disabled={saving}>Cancel Edit</button>
        </div>
      </div>

      {toast ? <div className="bill-edit-toast">{toast}</div> : null}
      {loading || !draft || !computed ? <p>Loading bill...</p> : (
        <div className="bill-edit-grid">
          <div className="bill-edit-main">
            <section className="bill-card">
              <h3>Bill Details</h3>
              <div className="bill-fields">
                <label>Customer Name<input value={draft.customerName} onChange={(e) => setField('customerName', e.target.value)} /></label>
                <label>Bill Date<input type="date" value={draft.billDate} onChange={(e) => setField('billDate', e.target.value)} /></label>
                <label>Mobile Number<input value={draft.customerMobileNumber} onChange={(e) => setField('customerMobileNumber', e.target.value)} /></label>
                {draft.notes ? (
                  <label className="full">Saved bill notes
                    <textarea rows={3} readOnly value={draft.notes} style={{ opacity: 0.85 }} />
                  </label>
                ) : null}
                <label className="full">Note for this update (optional)
                  <textarea
                    rows={2}
                    maxLength={2000}
                    placeholder="Why you are saving these changes — appended to bill notes"
                    value={updateNote}
                    onChange={(e) => setUpdateNote(e.target.value)}
                  />
                </label>
                <label className="full">Address<textarea rows={2} value={draft.address} onChange={(e) => setField('address', e.target.value)} /></label>
              </div>
            </section>

            <section className="bill-card">
              <div className="bill-card-head"><h3>Items</h3><button type="button" className="btn btn-secondary" onClick={addItem}>+ Add Item</button></div>
              <p className="bill-edit-muted bill-edit-muted--small" style={{ marginTop: 0 }}>
                Grid shows <strong>saved</strong> vs <strong>draft</strong> values; line ₹ and stock Δ update as you edit (preview only until Update bill).
              </p>
              <div className="bill-table-scroll">
                <table className="bill-table bill-table--edit-grid">
                  <thead>
                    <tr>
                      <th>Sr.</th>
                      <th>Description</th>
                      <th>Unit</th>
                      <th>Saved qty / rate</th>
                      <th>Was line ₹</th>
                      <th>Qty</th>
                      <th>Rate</th>
                      <th>Now line ₹</th>
                      <th>Stock</th>
                      <th>Δ stock</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {draft.items.map((it, idx) => {
                      const lineNow = toNum(it.quantity) * toNum(it.pricePerUnit);
                      const wasLine = toNum(it.initialLineAmount);
                      const lineChanged = Math.abs(lineNow - wasLine) > 0.005;
                      const dq = lineQuantityDelta(it);
                      const stockQty = stockForItem(it, catalog);
                      const deltaLabel = it.itemId == null && toNum(it.quantity) > 0
                        ? `NEW +${formatInr(toNum(it.quantity))}`
                        : Math.abs(dq) < 0.0001
                          ? '—'
                          : `${dq > 0 ? 'OUT' : 'IN'} ${dq > 0 ? '+' : '−'}${formatInr(Math.abs(dq))}`;
                      return (
                        <tr key={it.rowId} className={lineChanged ? 'bill-table-row--changed' : ''}>
                          <td>{idx + 1}</td>
                          <td>
                            <input list={`catalog-${it.rowId}`} value={it.itemName} onChange={(e) => { setItemField(it.rowId, 'itemName', e.target.value); applyProduct(it.rowId, e.target.value); }} />
                            <datalist id={`catalog-${it.rowId}`}>{catalog.map((p) => <option key={p.id} value={p.name} />)}</datalist>
                          </td>
                          <td><input value={it.unit} onChange={(e) => setItemField(it.rowId, 'unit', e.target.value)} /></td>
                          <td className="bill-table-savedcell">
                            <span className="bill-table-savedcell__main">
                              {formatInr(toNum(it.oldQuantity))} × ₹{formatInr(toNum(it.oldPricePerUnit))}
                            </span>
                          </td>
                          <td className={lineChanged ? 'bill-table-num bill-table-num--was' : 'bill-table-num'}>₹ {formatInr(wasLine)}</td>
                          <td><input type="number" value={it.quantity} onChange={(e) => setItemField(it.rowId, 'quantity', e.target.value)} /></td>
                          <td><input type="number" value={it.pricePerUnit} onChange={(e) => setItemField(it.rowId, 'pricePerUnit', e.target.value)} /></td>
                          <td className={lineChanged ? 'bill-table-num bill-table-num--now' : 'bill-table-num'}>₹ {formatInr(lineNow)}</td>
                          <td className="bill-table-num">{formatInr(stockQty)}</td>
                          <td>
                            <span className={`bill-stock-delta bill-stock-delta--${it.itemId == null && toNum(it.quantity) > 0 ? 'new' : dq > 0 ? 'out' : dq < 0 ? 'in' : 'none'}`}>
                              {deltaLabel}
                            </span>
                          </td>
                          <td><button type="button" className="btn btn-secondary" onClick={() => removeItem(it.rowId)} aria-label="Remove line">🗑</button></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="bill-card bill-card--stock-preview">
              <h3>Stock impact (preview)</h3>
              {stockImpactPreview.lines.length === 0 ? (
                <p className="bill-edit-muted">No quantity changes vs saved bill — no extra stock movement from line edits.</p>
              ) : (
                <ul className="bill-stock-impact-list">
                  {stockImpactPreview.lines.map((row) => (
                    <li key={row.key}>
                      <span className="bill-stock-impact-list__name">{row.name}</span>
                      <span className={`bill-stock-impact-list__badge bill-stock-impact-list__badge--${row.kind.toLowerCase()}`}>
                        {row.kind === 'NEW' ? 'NEW line' : row.kind}
                        {' '}
                        {formatInr(Math.abs(row.delta))} {row.unit}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {stockImpactPreview.warnings.length > 0 ? (
                <div className="bill-stock-warn" role="alert">
                  {stockImpactPreview.warnings.map((w) => (
                    <p key={w}>{w}</p>
                  ))}
                </div>
              ) : null}
              <p className="bill-edit-muted bill-edit-muted--small">Final ledger entries are created on the server when you save; this grid uses catalog on-hand for a quick check only.</p>
            </section>

            <section className="bill-card">
              <h3>Charges & Summary</h3>
              {billAmountScenario && Math.abs(billAmountScenario.delta) > 0.005 ? (
                <div
                  className={`bill-scenario-strip bill-scenario-strip--${billAmountScenario.kind === 'neutral' ? 'neutral' : billAmountScenario.kind === 'a_increase' ? 'up' : 'down'}`}
                  role="region"
                  aria-label="Bill total change"
                >
                  <div className="bill-scenario-strip__title">{billAmountScenario.title}</div>
                  <div className="bill-scenario-strip__row">
                    <span>Previous final amount</span>
                    <b>₹ {billAmountScenario.orig.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</b>
                  </div>
                  <div className="bill-scenario-strip__row">
                    <span>New final amount (preview)</span>
                    <b>₹ {billAmountScenario.next.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</b>
                  </div>
                  <div className="bill-scenario-strip__row bill-scenario-strip__row--delta">
                    <span>Difference</span>
                    <b>
                      {billAmountScenario.delta >= 0 ? '+' : '−'}₹{' '}
                      {Math.abs(billAmountScenario.delta).toLocaleString('en-IN', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </b>
                  </div>
                  {billAmountScenario.subtitle ? (
                    <p className="bill-scenario-strip__hint">{billAmountScenario.subtitle}</p>
                  ) : null}
                </div>
              ) : null}
              <div className="summary-grid">
                <label>Discount <input type="number" value={draft.discountAmount} onChange={(e) => setField('discountAmount', e.target.value)} /></label>
                <label>Labour <input type="number" value={draft.labourCharge} onChange={(e) => setField('labourCharge', e.target.value)} /></label>
                <label>Transport <input type="number" value={draft.transportationCharge} onChange={(e) => setField('transportationCharge', e.target.value)} /></label>
                <label>Other <input type="number" value={draft.otherExpenses} onChange={(e) => setField('otherExpenses', e.target.value)} /></label>
                <label>GST % <input type="number" value={draft.taxPercentage} onChange={(e) => setField('taxPercentage', e.target.value)} /></label>
              </div>
              <div className="totals">
                <p><span>Subtotal</span><b>₹ {computed.subtotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</b></p>
                <p><span>Tax</span><b>₹ {computed.taxAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</b></p>
                <p><span>Final Amount</span><b>₹ {computed.total.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</b></p>
                <p><span>Paid (excl. wallet)</span><b>₹ {computed.paid.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</b></p>
                <p><span>Advance on this bill</span><b>₹ {computed.advanceOnBill.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</b></p>
                <p className="totals-due">
                  <span>Still to pay</span>
                  <b>₹ {computed.due.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</b>
                </p>
              </div>
            </section>
          </div>

          <aside className="bill-edit-side">
            {serverPreviewLoading ? (
              <p className="bill-edit-muted bill-edit-muted--small">Syncing server preview…</p>
            ) : null}
            {serverPreview?.settlementHeadline &&
            ((serverPreview.refundOrStoreCreditAmount ?? 0) > 0.005 ||
              (serverPreview.additionalPaymentRequired ?? 0) > 0.005) ? (
              <section
                className={`bill-primary-callout bill-primary-callout--${
                  (serverPreview.refundOrStoreCreditAmount ?? 0) > 0.005 ? 'refund' : 'pay'
                }`}
                aria-live="polite"
              >
                <div className="bill-primary-callout__label">{serverPreview.settlementHeadline}</div>
                <div className="bill-primary-callout__amount">
                  ₹{' '}
                  {formatInr(
                    (serverPreview.refundOrStoreCreditAmount ?? 0) > 0.005
                      ? serverPreview.refundOrStoreCreditAmount
                      : serverPreview.additionalPaymentRequired
                  )}
                </div>
                <p className="bill-primary-callout__hint">Authoritative preview from server (same rules as save).</p>
              </section>
            ) : null}
            {settlementPreview && settlementPreview.headline && settlementPreview.type !== 'even' ? (
              <section
                className={`bill-primary-callout bill-primary-callout--${
                  settlementPreview.type === 'return'
                    ? 'refund'
                    : settlementPreview.type === 'collect_cash'
                      ? 'pay'
                      : 'wallet'
                }`}
                aria-live="polite"
              >
                <div className="bill-primary-callout__label">{settlementPreview.headline}</div>
                <div className="bill-primary-callout__amount">₹ {formatInr(settlementPreview.displayAmount)}</div>
                <p className="bill-primary-callout__hint">{settlementPreview.detail}</p>
              </section>
            ) : null}
            {isGstBill ? (
              <section className="bill-card bill-card--gst-note" role="note">
                <h3>GST bill</h3>
                <p className="bill-edit-muted bill-edit-muted--small">
                  In current settings, customer wallet is <strong>not</strong> auto-applied on GST bill save the same way
                  as retail (Non-GST) bills. Totals and payments follow server rules for this invoice type.
                </p>
              </section>
            ) : null}
            <section className="bill-card bill-card--advance">
              <h3>Customer advance (wallet)</h3>
              {!draft.customerId ? (
                <p className="bill-edit-muted">No customer linked on this bill — wallet balance is unavailable.</p>
              ) : advanceSummaryLoading ? (
                <p className="bill-edit-muted">Loading wallet…</p>
              ) : advanceSummary ? (
                <>
                  <p>
                    <span>Total advance (deposits)</span>
                    <b>₹ {advanceSummary.totalAdvance.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</b>
                  </p>
                  <p>
                    <span>Used on bills</span>
                    <b>₹ {advanceSummary.totalUsed.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</b>
                  </p>
                  <p>
                    <span>Wallet balance now</span>
                    <b>₹ {advanceSummary.remaining.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</b>
                  </p>
                  {!isGstBill && walletApplyPreview != null && computed && computed.due > 0.005 ? (
                    <p className="bill-edit-wallet-preview">
                      <span>Wallet could cover (preview)</span>
                      <b>
                        ₹ {walletApplyPreview.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </b>
                    </p>
                  ) : null}
                  {advanceRecalcPreview && !advanceRecalcPreview.isGst ? (
                    <div className="bill-advance-recalc">
                      <h4 className="bill-advance-recalc__title">Advance recalculation (preview)</h4>
                      <p>
                        <span>Advance on bill (saved)</span>
                        <b>₹ {formatInr(advanceRecalcPreview.advanceOnBillNow)}</b>
                      </p>
                      <p>
                        <span>Gap after cash on bill vs new total</span>
                        <b>₹ {formatInr(advanceRecalcPreview.gapAfterCashPayments)}</b>
                      </p>
                      <p>
                        <span>Est. advance on bill after save</span>
                        <b>₹ {formatInr(advanceRecalcPreview.estimatedAdvanceOnBillAfterSave)}</b>
                      </p>
                      {advanceRecalcPreview.approxReturnedToWalletIfTotalDown > 0.005 ? (
                        <p className="bill-advance-recalc__release">
                          <span>Approx. returned to wallet if total drops</span>
                          <b>₹ {formatInr(advanceRecalcPreview.approxReturnedToWalletIfTotalDown)}</b>
                        </p>
                      ) : null}
                      <p className="bill-edit-muted bill-edit-muted--small">{advanceRecalcPreview.note}</p>
                    </div>
                  ) : advanceRecalcPreview?.isGst ? (
                    <p className="bill-edit-muted bill-edit-muted--small">{advanceRecalcPreview.note}</p>
                  ) : null}
                  <p className="bill-edit-muted bill-edit-muted--small">
                    {isGstBill
                      ? 'See GST note above for wallet behaviour on save.'
                      : 'On Non-GST bills, wallet is re-applied on the server when you click Update bill (up to the new total). Payable after wallet is shown under Payment Options.'}
                  </p>
                </>
              ) : (
                <p className="bill-edit-muted">Could not load wallet summary.</p>
              )}
            </section>
            <section className="bill-card">
              <h3>Bill update impact</h3>
              {billAmountScenario && billAmountScenario.kind !== 'neutral' ? (
                <ul className="bill-scenario-bullets">
                  {billAmountScenario.kind === 'a_increase' ? (
                    <>
                      <li>Available wallet is checked; up to the new total is applied automatically when you save.</li>
                      <li>
                        <strong>Still to pay</strong> (left) uses advance already on this bill from the server;{' '}
                        <strong>Payable now (after wallet)</strong> estimates extra cash/UPI you may collect.
                      </li>
                    </>
                    ) : (
                    <>
                      <li>Extra advance used on this bill is re-credited to the customer wallet when you save.</li>
                      <li>
                        If cash/UPI on the bill exceeded the new total, the server credits the excess to wallet as store
                        credit (<strong>BILL_EDIT_ADJUSTMENT</strong>) by default — send{' '}
                        <code>excessPaymentHandling: &quot;NONE&quot;</code> on the bill replace API only if you refund cash
                        offline instead.
                      </li>
                    </>
                  )}
                </ul>
              ) : null}
              {settlementPreview && settlementPreview.type === 'even' ? (
                <div className="bill-settlement-callout bill-settlement-callout--even" role="status">
                  <div className="bill-settlement-callout__line">{settlementPreview.line}</div>
                  <p className="bill-settlement-callout__detail">{settlementPreview.detail}</p>
                </div>
              ) : null}
              <p><span>Net Amount Impact</span><b className={netImpact >= 0 ? 'pos' : 'neg'}>{netImpact >= 0 ? '+' : '-'}₹ {Math.abs(netImpact).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</b></p>
              <p><span>Payment difference (cash on bill)</span><b className={payImpact >= 0 ? 'pos' : 'neg'}>{payImpact >= 0 ? '+' : '-'}₹ {Math.abs(payImpact).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</b></p>
              <p>
                <span>Stock impact (preview)</span>
                <b>
                  {stockImpactPreview.lines.length === 0
                    ? 'No line qty changes'
                    : `${stockImpactPreview.lines.length} movement(s)`}
                </b>
              </p>
            </section>
            <section className="bill-card">
              <h3>Payment Options</h3>
              <div className="bill-payable-banner" aria-live="polite">
                <div className="bill-payable-row">
                  <span className="bill-payable-label">Payable now (after wallet)</span>
                  <b
                    className={
                      payableCashNow <= 0.005 && walletSummaryReady
                        ? 'bill-payable-value bill-payable-value--zero'
                        : 'bill-payable-value'
                    }
                  >
                    ₹{' '}
                    {walletSummaryReady
                      ? payableCashNow.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                      : '—'}
                  </b>
                </div>
                {walletSummaryReady && payableCashNow <= 0.005 && computed.due > 0.005 ? (
                  <p className="bill-payable-hint bill-payable-hint--ok">
                    Wallet can cover the remaining balance. Click <strong>Update bill</strong> — no cash payment needed.
                  </p>
                ) : null}
                {walletSummaryReady && payableCashNow <= 0.005 && computed.due <= 0.005 ? (
                  <p className="bill-payable-hint">Nothing due. You can still Update bill to save line or charge changes.</p>
                ) : null}
                {!walletSummaryReady ? (
                  <p className="bill-payable-hint">Loading wallet… payable amount updates in a moment.</p>
                ) : null}
                {hasUnsavedBillChanges && payableCashNow > 0.005 ? (
                  <p className="bill-payable-hint bill-payable-hint--warn">
                    Save line/charge changes with <strong>Update bill</strong> first. Then use{' '}
                    <strong>Record payment</strong> to collect cash/UPI (updates transactions &amp; in-hand budget).
                  </p>
                ) : null}
                {!hasUnsavedBillChanges && payableCashNow > 0.005 ? (
                  <p className="bill-payable-hint">
                    <strong>Record payment</strong> when the customer pays. <strong>Update bill</strong> only saves
                    items/charges — it does not record new payments.
                  </p>
                ) : null}
              </div>
              <div className="payment-mode-list">
                {PAYMENT_MODES.map((mode) => (
                  <div className="payment-mode-row" key={mode}>
                    <span className="payment-mode-label">{mode}</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={paymentDraftByMode[mode] || ''}
                      onChange={(e) => setPaymentDraftByMode((prev) => ({ ...prev, [mode]: e.target.value }))}
                      placeholder="0.00"
                    />
                    <span />
                  </div>
                ))}
              </div>
              <div className="bill-edit-actions" style={{ marginTop: '10px' }}>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleUpdateBillPayments}
                  disabled={
                    updatingPayments ||
                    !computed ||
                    !walletSummaryReady ||
                    payableCashNow <= 0.005 ||
                    hasUnsavedBillChanges
                  }
                >
                  {updatingPayments ? 'Recording…' : 'Record payment'}
                </button>
              </div>
            </section>
          </aside>
        </div>
      )}
    </div>
  );
}

