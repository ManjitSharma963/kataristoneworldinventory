import React, { useCallback, useEffect, useState } from 'react';
import { Dialog } from 'primereact/dialog';
import { cancelBill, getBillCancelPreview } from '../../utils/api';
import './CancelBillModal.css';

const REASON_OPTIONS = [
  { value: 'CUSTOMER_REQUEST', label: 'Customer request' },
  { value: 'DUPLICATE', label: 'Duplicate bill' },
  { value: 'WRONG_ENTRY', label: 'Wrong entry' },
  { value: 'STOCK_ISSUE', label: 'Stock issue' },
  { value: 'PRICING_MISTAKE', label: 'Pricing mistake' },
  { value: 'OTHER', label: 'Other' },
];

const REFUND_MODES = [
  { value: 'CASH_REFUND', label: 'Cash refund' },
  { value: 'BANK_TRANSFER', label: 'UPI / Bank transfer' },
  { value: 'ADJUST_TO_ADVANCE', label: 'Adjust to advance (wallet)' },
];

function formatMoney(n) {
  return `₹${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(raw) {
  if (!raw) return '—';
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return String(raw);
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function CancelBillModal({ visible, bill, onClose, onSuccess, onError }) {
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [reasonCode, setReasonCode] = useState('CUSTOMER_REQUEST');
  const [reasonDetail, setReasonDetail] = useState('');
  const [refundMode, setRefundMode] = useState('CASH_REFUND');
  const [cancelDate, setCancelDate] = useState(() => new Date().toISOString().slice(0, 10));

  const loadPreview = useCallback(async () => {
    if (!bill?.id || !bill?.billType) return;
    setLoading(true);
    try {
      const raw = await getBillCancelPreview(bill.id, bill.billType);
      const data = raw?.data ?? raw;
      setPreview(data);
      if (data?.draftBill) {
        setReasonCode('OTHER');
      }
    } catch (e) {
      setPreview(null);
      onError?.(e?.message || 'Could not load cancellation preview.');
    } finally {
      setLoading(false);
    }
  }, [bill, onError]);

  useEffect(() => {
    if (visible && bill?.id) {
      loadPreview();
      setCancelDate(new Date().toISOString().slice(0, 10));
    } else {
      setPreview(null);
      setReasonDetail('');
      setRefundMode('CASH_REFUND');
      setReasonCode('CUSTOMER_REQUEST');
    }
  }, [visible, bill?.id, loadPreview]);

  const handleConfirm = async () => {
    if (!bill?.id) return;
    setSubmitting(true);
    try {
      await cancelBill(bill.id, bill.billType, {
        reasonCode,
        reason: reasonDetail,
        refundMode,
      });
      onSuccess?.();
      onClose?.();
    } catch (e) {
      onError?.(e?.message || 'Cancellation failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const isDraft = preview?.draftBill === true;
  const title = isDraft
    ? `Delete draft bill · ${bill?.billNumber || ''}`
    : `Cancel / Delete Bill · Bill: ${bill?.billNumber || ''}`;

  const footer = (
    <div className="cancel-bill-footer">
      <button type="button" className="btn btn-secondary" disabled={submitting} onClick={onClose}>
        Close
      </button>
      <button
        type="button"
        className="btn btn-danger"
        disabled={submitting || loading || preview?.alreadyCancelled}
        onClick={handleConfirm}
      >
        {submitting ? 'Working…' : isDraft ? 'Delete draft' : 'Confirm cancellation'}
      </button>
    </div>
  );

  return (
    <Dialog
      header={title}
      visible={visible}
      onHide={onClose}
      className="cancel-bill-modal"
      style={{ width: 'min(920px, 96vw)' }}
      footer={footer}
      modal
      dismissableMask={!submitting}
    >
      {loading ? (
        <p style={{ padding: '24px 0', color: '#64748b' }}>Loading cancellation preview…</p>
      ) : preview?.alreadyCancelled ? (
        <div className="cancel-bill-alert cancel-bill-alert--warn">This bill is already cancelled.</div>
      ) : preview ? (
        <>
          {!isDraft ? (
            <div className="cancel-bill-alert cancel-bill-alert--danger">
              <strong>You are cancelling a finalized bill.</strong> This action will reverse stock, payments
              and advance usage. All history will be preserved.
            </div>
          ) : (
            <div className="cancel-bill-alert cancel-bill-alert--warn">
              Draft bill: no stock or payment reversals. The draft will be removed from active lists.
            </div>
          )}

          <div className="cancel-bill-summary-grid">
            <div>
              <span className="label">Customer</span>
              <span className="value">
                {preview.customerName || '—'}
                {preview.customerPhone ? ` (${preview.customerPhone})` : ''}
              </span>
            </div>
            <div>
              <span className="label">Bill date</span>
              <span className="value">{formatDate(preview.billDate)}</span>
            </div>
            <div>
              <span className="label">Bill amount</span>
              <span className="value">{formatMoney(preview.billAmount)}</span>
            </div>
            <div>
              <span className="label">Paid</span>
              <span className="value">
                {formatMoney(preview.paidAmountExcludingAdvance)}
                {preview.advanceUsed > 0 ? ` + ${formatMoney(preview.advanceUsed)} advance` : ''}
              </span>
            </div>
            <div>
              <span className="label">Status</span>
              <span className="value">
                <span className="cancel-bill-status-badge">{preview.billLifecycleStatus || 'FINALIZED'}</span>
              </span>
            </div>
          </div>

          {!isDraft && (
            <div className="cancel-bill-alert cancel-bill-alert--warn">
              Cancelling this bill will reverse it completely: stock restored, payments reversed, and any
              advance used on this bill restored to the customer wallet.
            </div>
          )}

          <section className="cancel-bill-section">
            <h4>1. Items in this bill</h4>
            <table className="cancel-bill-table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Batch</th>
                  <th className="num">Qty</th>
                  <th className="num">Rate</th>
                  <th className="num">Amount</th>
                </tr>
              </thead>
              <tbody>
                {(preview.items || []).map((it) => (
                  <tr key={it.billItemId}>
                    <td>{it.productName}</td>
                    <td>{it.batchOrLot || '—'}</td>
                    <td className="num">
                      {it.quantity} {it.unit || ''}
                    </td>
                    <td className="num">{formatMoney(it.rate)}</td>
                    <td className="num">{formatMoney(it.lineAmount)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={4} style={{ fontWeight: 700 }}>
                    Total bill amount
                  </td>
                  <td className="num" style={{ fontWeight: 700 }}>
                    {formatMoney(preview.billAmount)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </section>

          {!isDraft && (
            <>
              <section className="cancel-bill-section">
                <h4>2. Payments to reverse</h4>
                <table className="cancel-bill-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Mode</th>
                      <th>Source</th>
                      <th className="num">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(preview.payments || [])
                      .filter((p) => !p.advancePayment)
                      .map((p) => (
                        <tr key={p.paymentId ?? `${p.paymentDate}-${p.paymentMode}`}>
                          <td>{formatDate(p.paymentDate)}</td>
                          <td>{p.paymentMode}</td>
                          <td>{p.sourceType || '—'}</td>
                          <td className="num">{formatMoney(p.amount)}</td>
                        </tr>
                      ))}
                    {(preview.advanceUsed || 0) > 0 ? (
                      <tr>
                        <td>—</td>
                        <td>ADVANCE</td>
                        <td>Wallet applied</td>
                        <td className="num">{formatMoney(preview.advanceUsed)}</td>
                      </tr>
                    ) : null}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan={3} style={{ fontWeight: 700 }}>
                        Total pay back to customer
                      </td>
                      <td className="num" style={{ fontWeight: 700 }}>
                        {formatMoney(preview.totalRefundToCustomer)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </section>

              <section className="cancel-bill-section">
                <h4>Inventory impact (on cancellation)</h4>
                <table className="cancel-bill-table">
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th className="num">Qty to restore</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(preview.inventoryImpact || []).length === 0 ? (
                      <tr>
                        <td colSpan={2}>No remaining stock to restore (already fully returned).</td>
                      </tr>
                    ) : (
                      preview.inventoryImpact.map((row, i) => (
                        <tr key={i}>
                          <td>{row.productName}</td>
                          <td className="num">
                            {row.quantityToRestore} {row.unit || ''}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </section>

              <section className="cancel-bill-section">
                <h4>Advance impact (on cancellation)</h4>
                <table className="cancel-bill-table">
                  <tbody>
                    <tr>
                      <td>Advance used on bill</td>
                      <td className="num">{formatMoney(preview.advanceUsed)}</td>
                    </tr>
                    <tr>
                      <td>Advance to be restored</td>
                      <td className="num">{formatMoney(preview.advanceUsed)}</td>
                    </tr>
                    <tr>
                      <td>Customer advance balance (after cancellation)</td>
                      <td className="num">{formatMoney(preview.customerAdvanceBalanceAfter)}</td>
                    </tr>
                  </tbody>
                </table>
              </section>

              <section className="cancel-bill-section">
                <h4>3. Cancellation details</h4>
                <div className="cancel-bill-form-grid">
                  <div>
                    <label htmlFor="cancel-date">Cancellation date</label>
                    <input
                      id="cancel-date"
                      type="date"
                      value={cancelDate}
                      onChange={(e) => setCancelDate(e.target.value)}
                    />
                  </div>
                  <div>
                    <label htmlFor="cancel-reason-code">Reason for cancellation</label>
                    <select
                      id="cancel-reason-code"
                      value={reasonCode}
                      onChange={(e) => setReasonCode(e.target.value)}
                    >
                      {REASON_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="full">
                    <label htmlFor="cancel-reason-detail">Detailed reason / notes</label>
                    <textarea
                      id="cancel-reason-detail"
                      rows={3}
                      value={reasonDetail}
                      onChange={(e) => setReasonDetail(e.target.value)}
                      placeholder="Optional notes for audit log"
                    />
                  </div>
                  <div className="full">
                    <span style={{ fontSize: 12, fontWeight: 600, color: '#475569' }}>Refund mode (informational)</span>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '14px', marginTop: 8 }}>
                      {REFUND_MODES.map((m) => (
                        <label key={m.value} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                          <input
                            type="radio"
                            name="refundMode"
                            value={m.value}
                            checked={refundMode === m.value}
                            onChange={() => setRefundMode(m.value)}
                          />
                          {m.label}
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
                <p className="cancel-bill-refund-total">
                  Total refund / restore: {formatMoney(preview.totalRefundToCustomer)}
                </p>
                {(preview.balanceStillDue || 0) > 0.01 ? (
                  <p style={{ fontSize: 12, color: '#b45309', marginBottom: 12 }}>
                    Note: effective obligation after returns is {formatMoney(preview.effectiveBillTotalAfterReturns)}.
                    Customer still owed {formatMoney(preview.balanceStillDue)} on paper; cancellation will still reverse
                    all recorded payments per ledger rules.
                  </p>
                ) : null}
              </section>

              <section className="cancel-bill-section">
                <h4>4. What will happen on cancellation?</h4>
                <div className="cancel-bill-steps">
                  <div className="cancel-bill-step">
                    <strong>Stock restore</strong>
                    Remaining sold qty returned to inventory (RETURN / IN).
                  </div>
                  <div className="cancel-bill-step">
                    <strong>Payments reverse</strong>
                    Cash/UPI/bank OUT entries in transactions (BILL_REVERSAL).
                  </div>
                  <div className="cancel-bill-step">
                    <strong>Advance restore</strong>
                    Wallet credit {formatMoney(preview.advanceUsed)} when advance was used.
                  </div>
                  <div className="cancel-bill-step">
                    <strong>Ledger preserved</strong>
                    Original rows kept; reversal_of_id links audit trail.
                  </div>
                  <div className="cancel-bill-step">
                    <strong>Bill cancelled</strong>
                    Status → CANCELLED; excluded from sales KPIs.
                  </div>
                </div>
              </section>

              <div className="cancel-bill-alert cancel-bill-alert--warn">
                This action cannot be undone from the app. Please confirm carefully.
              </div>
            </>
          )}
        </>
      ) : (
        <p style={{ color: '#64748b' }}>No preview available.</p>
      )}
    </Dialog>
  );
}
