/**
 * Client-side estimate for stock return settlement (mirrors Sales proportional logic).
 * @param {Record<number, number|string>} qtyByItemId
 */
export function computeReturnSettlementPreview(bill, qtyByItemId, isGst) {
  const items = bill?.originalSale?.items;
  if (!Array.isArray(items) || !qtyByItemId) return 0;
  const subtotal = Number(bill.originalSale?.subtotal ?? bill.subtotal ?? 0) || 0;
  const discount = Number(bill.originalSale?.discountAmount ?? 0) || 0;
  const tax = Number(bill.originalSale?.taxAmount ?? bill?.gstAmount ?? 0) || 0;
  let lineReturn = 0;
  for (const it of items) {
    const id = Number(it.itemId);
    if (!Number.isFinite(id) || id <= 0) continue;
    const ret = Number(qtyByItemId[id]);
    if (!Number.isFinite(ret) || ret <= 0) continue;
    const sold = Number(it.quantity) || 0;
    if (sold <= 0) continue;
    const lineTotal = (Number(it.pricePerUnit) || 0) * sold;
    lineReturn += (lineTotal * ret) / sold;
  }
  if (subtotal <= 0.005) {
    return Math.max(0, Math.round(lineReturn * 100) / 100);
  }
  const discShare = (discount * lineReturn) / subtotal;
  if (isGst) {
    const taxShare = (tax * lineReturn) / subtotal;
    return Math.max(0, Math.round((lineReturn + taxShare - discShare) * 100) / 100);
  }
  return Math.max(0, Math.round((lineReturn - discShare) * 100) / 100);
}

export function getReturnableBillLines(bill) {
  const items = bill?.originalSale?.items;
  if (!Array.isArray(items)) return [];
  return items.filter((it) => {
    const id = Number(it.itemId);
    if (!Number.isFinite(id) || id <= 0) return false;
    const max = Number(it.quantityReturnable ?? it.quantity);
    return Number.isFinite(max) && max > 0;
  });
}
