import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { fetchDailyClosingReport, downloadBillPDF, getDailyBudgetEvents, getDailyBudgetCalculatedSummary } from '../utils/api';
import Loading from './Loading';
import './Reports.css';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import DejaVuSansTtf from 'dejavu-fonts-ttf/ttf/DejaVuSans.ttf';
import DejaVuSansBoldTtf from 'dejavu-fonts-ttf/ttf/DejaVuSans-Bold.ttf';

/** Today in local timezone (avoids UTC off-by-one from toISOString). */
function localISODate(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const money = (n) =>
  `₹${(Number(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const resolveInHand = (data) => Number(data?.inHandAmount ?? data?.cashInHand ?? 0);

let cachedPdfFontsPromise = null;
let cachedPdfFonts = null;

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

async function ensurePdfFontsLoaded() {
  if (cachedPdfFonts) return cachedPdfFonts;
  if (cachedPdfFontsPromise) return cachedPdfFontsPromise;

  cachedPdfFontsPromise = (async () => {
    const [regRes, boldRes] = await Promise.all([fetch(DejaVuSansTtf), fetch(DejaVuSansBoldTtf)]);
    const [regBuf, boldBuf] = await Promise.all([regRes.arrayBuffer(), boldRes.arrayBuffer()]);
    cachedPdfFonts = {
      regularBase64: arrayBufferToBase64(regBuf),
      boldBase64: arrayBufferToBase64(boldBuf)
    };
    return cachedPdfFonts;
  })();

  return cachedPdfFontsPromise;
}

function registerPdfFonts(doc, fonts) {
  // Use a Unicode font so ₹ renders correctly and spacing/kerning is stable.
  doc.addFileToVFS('DejaVuSans.ttf', fonts.regularBase64);
  doc.addFont('DejaVuSans.ttf', 'DejaVuSans', 'normal');
  doc.addFileToVFS('DejaVuSans-Bold.ttf', fonts.boldBase64);
  doc.addFont('DejaVuSans-Bold.ttf', 'DejaVuSans', 'bold');
  doc.setFont('DejaVuSans', 'normal');
}

function pickOldestEventForDate(events, isoDate) {
  if (!Array.isArray(events) || !isoDate) return null;
  const day = String(isoDate).slice(0, 10);
  const filtered = events
    .filter((e) => String(e?.date || '').slice(0, 10) === day)
    .filter((e) => e != null);
  if (filtered.length === 0) return null;
  // Oldest first by createdAt (fallback: 0).
  const sorted = [...filtered].sort((a, b) => {
    const tA = new Date(a?.createdAt || 0).getTime();
    const tB = new Date(b?.createdAt || 0).getTime();
    return tA - tB;
  });
  return sorted[0] || null;
}

function pct(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return '0.0%';
  return `${v.toLocaleString('en-IN', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}

function buildDailyClosingPdf({
  closingData,
  dateFrom,
  dateTo,
  openingBudget,
  budgetEvents,
  pdfFonts,
  /** When one day: server summary so PDF matches Expenses / daily_budget. */
  singleDayBudgetSync = null
}) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  if (pdfFonts) {
    registerPdfFonts(doc, pdfFonts);
  }
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 36;
  const contentW = pageWidth - marginX * 2;
  let y = 34;

  const COLORS = {
    ink: [20, 24, 31],
    muted: [88, 96, 105],
    line: [218, 225, 235],
    headerBg: [241, 246, 252],
    sectionBg: [250, 252, 255],
    green: [22, 163, 74],
    red: [220, 38, 38],
    amber: [245, 158, 11]
  };

  const setText = (rgb) => {
    doc.setTextColor(rgb[0], rgb[1], rgb[2]);
  };

  const moneyPlain = (n) =>
    `₹${(Number(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const safeY = (need = 0) => {
    const bottom = pageHeight - 36;
    if (y + need <= bottom) return;
    doc.addPage();
    y = 36;
  };

  const hLine = (gapTop = 10, gapBottom = 10) => {
    y += gapTop;
    doc.setDrawColor(COLORS.line[0], COLORS.line[1], COLORS.line[2]);
    doc.setLineWidth(1);
    doc.line(marginX, y, marginX + contentW, y);
    y += gapBottom;
  };

  const text = (t, x, yy, opts = {}) => {
    doc.setFont('DejaVuSans', opts.bold ? 'bold' : 'normal');
    doc.setFontSize(opts.size ?? 10);
    if (opts.color) setText(opts.color);
    else setText(COLORS.ink);
    doc.text(String(t ?? ''), x, yy, { align: opts.align ?? 'left' });
  };

  const wrapText = (t, x, yy, maxW, opts = {}) => {
    doc.setFont('DejaVuSans', opts.bold ? 'bold' : 'normal');
    doc.setFontSize(opts.size ?? 10);
    if (opts.color) setText(opts.color);
    else setText(COLORS.ink);
    const lines = doc.splitTextToSize(String(t ?? ''), maxW);
    doc.text(lines, x, yy);
    return yy + lines.length * ((opts.size ?? 10) + 3);
  };

  const sectionTitle = (title) => {
    safeY(52);
    doc.setFillColor(COLORS.sectionBg[0], COLORS.sectionBg[1], COLORS.sectionBg[2]);
    doc.setDrawColor(COLORS.line[0], COLORS.line[1], COLORS.line[2]);
    doc.roundedRect(marginX, y, contentW, 26, 6, 6, 'FD');
    text(title, marginX + 12, y + 18, { bold: true, size: 11 });
    y += 36;
  };

  const kvRow = (label, value, opts = {}) => {
    const leftX = marginX + 10;
    const rightX = marginX + contentW - 10;
    text(label, leftX, y, { size: 10, color: opts.labelColor ?? COLORS.muted });
    text(value, rightX, y, { size: 10, bold: opts.boldValue, color: opts.valueColor ?? COLORS.ink, align: 'right' });
    y += 16;
  };

  const paySummary = closingData?.paymentSummary || {};
  const cash = Number(paySummary.CASH) || 0;
  const upi = Number(paySummary.UPI) || 0;
  const bank = Number(paySummary.BANK_TRANSFER) || 0;
  const cheque = Number(paySummary.CHEQUE) || 0;
  const other = Number(paySummary.OTHER) || 0;
  const totalSales = Number(closingData?.totalSales) || 0;
  const totalCollected = Number(closingData?.totalCollected) || 0;
  const totalDue = Number(closingData?.totalDueOnBills ?? closingData?.pendingAmount) || 0;
  const totalExpenses = Number(closingData?.totalExpenses) || 0;
  const cashUpiCollected = cash + upi;
  const cashInHandDelta = Number(resolveInHand(closingData)) || 0;
  const oneDay = dateFrom === dateTo;
  const sync = oneDay && singleDayBudgetSync && typeof singleDayBudgetSync === 'object' ? singleDayBudgetSync : null;
  const openingSync = sync != null ? Number(sync.openingBalanceForDay ?? sync.opening_balance) : NaN;
  const closingSync = sync != null ? Number(sync.remainingAmount ?? sync.remaining_amount) : NaN;
  const opening = Number.isFinite(openingSync) ? openingSync : (Number(openingBudget) || 0);
  const closing = Number.isFinite(closingSync) ? closingSync : (opening + cashInHandDelta);
  const efficiency = totalSales > 0 ? (totalCollected / totalSales) * 100 : 0;

  // Header band
  safeY(110);
  doc.setFillColor(COLORS.headerBg[0], COLORS.headerBg[1], COLORS.headerBg[2]);
  doc.rect(0, 0, pageWidth, 120, 'F');
  text('KATARIA STONE WORLD', pageWidth / 2, 44, { bold: true, size: 18, align: 'center' });
  text('Daily Closing Summary', pageWidth / 2, 64, { bold: true, size: 11, align: 'center', color: COLORS.muted });
  text(`Report Date: ${dateFrom} - ${dateTo}`, pageWidth / 2, 82, { size: 10, align: 'center', color: COLORS.muted });
  text('Generated By: System', pageWidth / 2, 98, { size: 10, align: 'center', color: COLORS.muted });
  y = 140;

  sectionTitle('Sales Overview');
  kvRow('Total Bills', String(closingData?.totalBills ?? 0));
  kvRow('Total Sales', moneyPlain(totalSales), { boldValue: true });
  kvRow('Total Paid Amount', moneyPlain(totalCollected));
  kvRow('Total Due Amount', moneyPlain(totalDue), { valueColor: totalDue > 0 ? COLORS.red : COLORS.ink, boldValue: true });
  hLine(6, 14);

  sectionTitle('Payment Breakdown');
  safeY(92);
  const colGap = 16;
  const colW = (contentW - colGap) / 2;
  const leftX = marginX;
  const rightX = marginX + colW + colGap;
  const rowH = 18;

  const payItem = (x, yy, label, val) => {
    text(label, x + 10, yy, { size: 10, color: COLORS.muted });
    text(moneyPlain(val), x + colW - 10, yy, { size: 10, align: 'right' });
  };

  payItem(leftX, y, 'Cash', cash);
  payItem(rightX, y, 'UPI', upi);
  y += rowH;
  payItem(leftX, y, 'Bank Transfer', bank);
  payItem(rightX, y, 'Cheque', cheque);
  y += rowH;
  payItem(leftX, y, 'Other', other);
  y += rowH + 6;
  kvRow('Total Collection (All Modes)', moneyPlain(totalCollected), { boldValue: true });
  hLine(6, 14);

  sectionTitle('Expense Summary');
  kvRow('Total Expenses', moneyPlain(totalExpenses), {
    valueColor: totalExpenses > 0 ? COLORS.red : COLORS.ink,
    boldValue: true
  });
  hLine(6, 14);

  // Cash Flow Summary (highlight closing)
  sectionTitle('Cash Flow Summary');
  kvRow('Opening Balance', moneyPlain(opening));
  kvRow('Cash + UPI Collected', moneyPlain(cashUpiCollected), { valueColor: cashUpiCollected > 0 ? COLORS.green : COLORS.ink });
  kvRow('Total Expenses', moneyPlain(totalExpenses), { valueColor: totalExpenses > 0 ? COLORS.red : COLORS.ink });

  safeY(70);
  doc.setDrawColor(COLORS.green[0], COLORS.green[1], COLORS.green[2]);
  doc.setLineWidth(1.2);
  doc.roundedRect(marginX, y, contentW, 46, 8, 8);
  text('Closing Balance', marginX + 12, y + 18, { size: 10, color: COLORS.muted });
  text(moneyPlain(closing), marginX + contentW - 12, y + 30, {
    size: 16,
    bold: true,
    align: 'right',
    color: closing >= 0 ? COLORS.green : COLORS.red
  });
  y += 58;

  hLine(2, 12);

  // Bill History Table
  sectionTitle('Bill History');
  const billRows = Array.isArray(closingData?.bills) ? closingData.bills : [];

  const paymentModesText = (b) => {
    const lines = [];
    const c = Number(b?.cashAmount) || 0;
    const u = Number(b?.upiAmount) || 0;
    const bt = Number(b?.bankTransferAmount) || 0;
    const ch = Number(b?.chequeAmount) || 0;
    const o = Number(b?.otherAmount) || 0;
    if (c) lines.push(`Cash: ${moneyPlain(c)}`);
    if (u) lines.push(`UPI: ${moneyPlain(u)}`);
    if (bt) lines.push(`Bank: ${moneyPlain(bt)}`);
    if (ch) lines.push(`Cheque: ${moneyPlain(ch)}`);
    if (o) lines.push(`Other: ${moneyPlain(o)}`);
    return lines.length ? lines.join('\n') : '—';
  };

  safeY(220);
  // Column widths must sum to contentW (~523pt on A4) or the table overflows and clips the last columns (Status).
  const billCol = {
    date: 58,
    billNo: 44,
    type: 40,
    total: 46,
    paid: 46,
    due: 46,
    modes: 180,
    status: 63
  };
  const billTableW =
    billCol.date +
    billCol.billNo +
    billCol.type +
    billCol.total +
    billCol.paid +
    billCol.due +
    billCol.modes +
    billCol.status;
  // Keep table width exactly within printable area (avoid horizontal clip).
  const billTableWidthFinal = Math.min(billTableW, contentW);

  autoTable(doc, {
    startY: y,
    margin: { left: marginX, right: marginX },
    tableWidth: billTableWidthFinal,
    theme: 'grid',
    tableLineColor: COLORS.line,
    tableLineWidth: 0.6,
    styles: {
      font: 'DejaVuSans',
      fontSize: 8,
      cellPadding: { top: 3, right: 3, bottom: 3, left: 3 },
      textColor: COLORS.ink,
      valign: 'middle',
      overflow: 'linebreak'
    },
    headStyles: {
      fillColor: [235, 242, 252],
      textColor: 20,
      fontStyle: 'bold',
      fontSize: 8,
      halign: 'center',
      valign: 'middle'
    },
    alternateRowStyles: { fillColor: [250, 252, 255] },
    columnStyles: {
      0: { cellWidth: billCol.date, halign: 'left' },
      1: { cellWidth: billCol.billNo, halign: 'left' },
      2: { cellWidth: billCol.type, halign: 'left' },
      3: { halign: 'right', cellWidth: billCol.total },
      4: { halign: 'right', cellWidth: billCol.paid },
      5: { halign: 'right', cellWidth: billCol.due },
      6: { cellWidth: billCol.modes, halign: 'left', valign: 'top' },
      7: { cellWidth: billCol.status, halign: 'center' }
    },
    head: [['Date', 'Bill No', 'Type', 'Total', 'Paid', 'Due', 'Payment Modes', 'Status']],
    body: billRows.map((b) => [
      b?.billDate ? String(b.billDate).slice(0, 10) : '',
      b?.billNumber ?? '',
      b?.billType === 'NON_GST' ? 'NON GST' : b?.billType ?? '',
      moneyPlain(b?.totalAmount),
      moneyPlain(b?.paidAmount),
      moneyPlain(b?.dueAmount),
      paymentModesText(b),
      b?.status ?? ''
    ]),
    didParseCell: (data) => {
      if (data.section === 'body' && data.column.index === 6) {
        data.cell.styles.valign = 'top';
      }
      if (data.section === 'body' && data.column.index === 7) {
        const v = String(data.cell.raw || '').toUpperCase();
        if (v === 'PAID') {
          data.cell.styles.textColor = COLORS.green;
          data.cell.styles.fontStyle = 'bold';
        } else if (v === 'PARTIAL') {
          data.cell.styles.textColor = COLORS.amber;
          data.cell.styles.fontStyle = 'bold';
        } else if (v === 'DUE' || v === 'UNPAID') {
          data.cell.styles.textColor = COLORS.red;
          data.cell.styles.fontStyle = 'bold';
        }
      }
      if (data.section === 'body' && data.column.index === 5) {
        const due = Number(String(data.cell.raw || '').replace(/[^\d.-]/g, '')) || 0;
        if (due > 0) data.cell.styles.textColor = COLORS.red;
      }
    }
  });
  y = doc.lastAutoTable.finalY + 14;

  // Expense History Table
  sectionTitle('Expense History');
  const expRows = Array.isArray(closingData?.expenseLines) ? closingData.expenseLines : [];
  safeY(220);
  autoTable(doc, {
    startY: y,
    margin: { left: marginX, right: marginX },
    theme: 'grid',
    tableLineColor: COLORS.line,
    tableLineWidth: 0.6,
    styles: {
      font: 'DejaVuSans',
      fontSize: 8.5,
      cellPadding: { top: 4, right: 4, bottom: 4, left: 4 },
      textColor: COLORS.ink,
      valign: 'middle',
      overflow: 'linebreak'
    },
    headStyles: {
      fillColor: [235, 242, 252],
      textColor: 20,
      fontStyle: 'bold',
      halign: 'center',
      valign: 'middle'
    },
    alternateRowStyles: { fillColor: [250, 252, 255] },
    columnStyles: {
      0: { cellWidth: 74 },
      1: { cellWidth: 120 },
      2: { cellWidth: 260 },
      3: { halign: 'right', cellWidth: 76 }
    },
    head: [['Date', 'Category', 'Description', 'Amount']],
    body: expRows.map((ex) => [
      String(ex?.date || '').slice(0, 10) || '—',
      [ex?.expenseType, ex?.category].filter(Boolean).join(' · ') || '—',
      ex?.description ?? '',
      moneyPlain(ex?.amount)
    ]),
    foot: [['', '', 'Total', moneyPlain(totalExpenses)]],
    didParseCell: (data) => {
      if (data.section === 'foot') {
        data.cell.styles.fillColor = [245, 247, 251];
        data.cell.styles.fontStyle = 'bold';
      }
      if (data.section === 'body' && data.column.index === 3) {
        const amt = Number(String(data.cell.raw || '').replace(/[^\d.-]/g, '')) || 0;
        if (amt > 0) data.cell.styles.textColor = COLORS.red;
      }
    }
  });
  y = doc.lastAutoTable.finalY + 14;

  // Budget History
  sectionTitle('Budget History');
  const budRows = Array.isArray(budgetEvents) ? budgetEvents : [];
  safeY(240);
  autoTable(doc, {
    startY: y,
    margin: { left: marginX, right: marginX },
    theme: 'grid',
    tableLineColor: COLORS.line,
    tableLineWidth: 0.6,
    styles: {
      font: 'DejaVuSans',
      fontSize: 8.5,
      cellPadding: { top: 4, right: 4, bottom: 4, left: 4 },
      textColor: COLORS.ink,
      valign: 'middle',
      overflow: 'linebreak'
    },
    headStyles: {
      fillColor: [235, 242, 252],
      textColor: 20,
      fontStyle: 'bold',
      halign: 'center',
      valign: 'middle'
    },
    alternateRowStyles: { fillColor: [250, 252, 255] },
    columnStyles: {
      0: { cellWidth: 84 },
      1: { cellWidth: 132 },
      2: { halign: 'right', cellWidth: 96 },
      3: { halign: 'right', cellWidth: 76 },
      4: { halign: 'right', cellWidth: 96 }
    },
    head: [['Date', 'Event', 'Opening', 'Delta', 'Closing']],
    body:
      budRows.length === 0
        ? [['—', 'No budget history available for selected period', '—', '—', '—']]
        : budRows.map((e) => {
            const d = String(e?.date || '').slice(0, 10) || '—';
            const openingB = moneyPlain(e?.openingBalance);
            const delta = Number(e?.delta) || 0;
            const deltaTxt = `${delta >= 0 ? '+' : '-'}${moneyPlain(Math.abs(delta))}`;
            const closingB = moneyPlain(e?.closingBalance);
            return [d, e?.eventType ?? '—', openingB, deltaTxt, closingB];
          }),
    didParseCell: (data) => {
      if (data.section === 'body' && data.column.index === 3) {
        const raw = String(data.cell.raw || '');
        if (raw.startsWith('+')) data.cell.styles.textColor = COLORS.green;
        if (raw.startsWith('-')) data.cell.styles.textColor = COLORS.red;
        data.cell.styles.fontStyle = 'bold';
      }
    }
  });
  y = doc.lastAutoTable.finalY + 18;

  // Footer
  safeY(40);
  doc.setDrawColor(COLORS.line[0], COLORS.line[1], COLORS.line[2]);
  doc.setLineWidth(1);
  doc.line(marginX, pageHeight - 44, marginX + contentW, pageHeight - 44);
  const now = new Date();
  const gen = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  text(`Generated On: ${gen}`, marginX, pageHeight - 26, { size: 9, color: COLORS.muted });
  text(`Collection Efficiency: ${pct(efficiency)}`, marginX + contentW, pageHeight - 26, {
    size: 9,
    color: COLORS.muted,
    align: 'right'
  });

  return doc;
}

function formatDayLabel(iso) {
  if (!iso) return '';
  const d = new Date(iso + 'T12:00:00');
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
}

/** Normalize API date (ISO string or Jackson [y,m,d]) for display. */
function toIsoDateString(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'string') {
    return v.length >= 10 ? v.slice(0, 10) : v;
  }
  if (Array.isArray(v) && v.length >= 3) {
    const y = v[0];
    const m = v[1];
    const d = v[2];
    return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }
  return null;
}

function formatShortDate(iso) {
  const raw = toIsoDateString(iso);
  if (!raw) return '—';
  const d = new Date(raw + 'T12:00:00');
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function parseReportError(err) {
  const raw = err?.message || String(err);
  const dash = raw.indexOf('- ');
  const tail = dash >= 0 ? raw.slice(dash + 2).trim() : raw;
  try {
    const j = JSON.parse(tail);
    if (j.message) return j.message;
    if (j.error) return typeof j.error === 'string' ? j.error : JSON.stringify(j.error);
  } catch {
    const m = tail.match(/\{[\s\S]*\}/);
    if (m) {
      try {
        const j = JSON.parse(m[0]);
        if (j.message) return j.message;
        if (j.error) return String(j.error);
      } catch (_) {
        /* ignore */
      }
    }
  }
  if (/\b403\b/.test(raw)) {
    return 'You do not have permission to view this report.';
  }
  return tail || 'Could not load report.';
}

/** User-facing message + optional server reference for ops (matches API `requestId`). */
function parseReportErrorMeta(err) {
  const requestId = err?.requestId || err?.responseBody?.requestId;
  if (err?.rawMessage) {
    return { message: parseReportError({ message: err.rawMessage }), requestId };
  }
  const raw = err?.message || String(err);
  if (raw === 'Failed to fetch' || /NetworkError|Load failed|network/i.test(String(raw))) {
    return { message: 'Network error. Check your connection and try again.', requestId };
  }
  return { message: raw || 'Could not load report.', requestId };
}

const PAGE_SIZE = 10;

function TablePagination({ page, pageCount, total, label, onPrev, onNext }) {
  if (total <= 0) return null;
  if (pageCount <= 1) return null;
  const from = (page - 1) * PAGE_SIZE + 1;
  const to = Math.min(page * PAGE_SIZE, total);
  return (
    <nav className="report-pagination" aria-label={label}>
      <button type="button" className="report-pagination-btn" disabled={page <= 1} onClick={onPrev}>
        Previous
      </button>
      <span className="report-pagination-meta">
        {from}–{to} of {total} · Page {page} / {pageCount}
      </span>
      <button type="button" className="report-pagination-btn" disabled={page >= pageCount} onClick={onNext}>
        Next
      </button>
    </nav>
  );
}

const Reports = () => {
  const defaultDay = useMemo(() => localISODate(), []);
  const [dateFrom, setDateFrom] = useState(defaultDay);
  const [dateTo, setDateTo] = useState(defaultDay);
  const [closingLoading, setClosingLoading] = useState(true);
  const [closingData, setClosingData] = useState(null);
  const [closingError, setClosingError] = useState('');
  const [closingErrorRequestId, setClosingErrorRequestId] = useState('');
  const [fetchedRange, setFetchedRange] = useState(null);
  const [openingBudget, setOpeningBudget] = useState(0);
  /** Single-day only: GET /budget/daily/summary — aligns Expenses card + report + daily_budget. */
  const [budgetSummarySync, setBudgetSummarySync] = useState(null);
  const [budgetEvents, setBudgetEvents] = useState([]);
  const [expensesPage, setExpensesPage] = useState(1);
  const [billsPage, setBillsPage] = useState(1);

  const isRange = dateFrom !== dateTo;

  const loadDailyClosing = useCallback(async (from, to) => {
    setClosingError('');
    setClosingErrorRequestId('');
    setClosingLoading(true);
    try {
      const data = await fetchDailyClosingReport({
        date: from,
        dateTo: to,
        backfillLegacy: false
      });
      setClosingData(data);
      setClosingError('');
      setFetchedRange({ from, to });

      // Opening budget for the selected period (start-of-day balance on dateFrom).
      // Uses daily_budget_events logged by DailyBudgetService.
      try {
        const events = await getDailyBudgetEvents({ from, to: from, limit: 200 });
        const oldest = pickOldestEventForDate(events, from);
        const ob = Number(oldest?.openingBalance ?? 0);
        setOpeningBudget(Number.isFinite(ob) ? ob : 0);
      } catch (e) {
        // Non-fatal: if events endpoint not ready, keep opening budget as 0.
        setOpeningBudget(0);
      }

      // Same source of truth as Expenses page (DailyBudgetService summary).
      if (from === to) {
        try {
          const sync = await getDailyBudgetCalculatedSummary({ from, to: from });
          setBudgetSummarySync(sync);
          const obSync = Number(sync?.openingBalanceForDay ?? sync?.opening_balance);
          if (Number.isFinite(obSync)) {
            setOpeningBudget(obSync);
          }
        } catch (e) {
          setBudgetSummarySync(null);
        }
      } else {
        setBudgetSummarySync(null);
      }

      // Budget history for selected date range (for PDF and quick reconciliation).
      try {
        const events = await getDailyBudgetEvents({ from, to, limit: 1000 });
        setBudgetEvents(Array.isArray(events) ? events : []);
      } catch (e) {
        setBudgetEvents([]);
      }
    } catch (e) {
      console.error(e);
      const meta = parseReportErrorMeta(e);
      setClosingError(meta.message);
      setClosingErrorRequestId(meta.requestId || '');
    } finally {
      setClosingLoading(false);
    }
  }, []);

  const handleDownloadPdf = useCallback(() => {
    if (!closingData) return;
    (async () => {
      const fonts = await ensurePdfFontsLoaded();
      cachedPdfFonts = fonts;
      const doc = buildDailyClosingPdf({
        closingData,
        dateFrom,
        dateTo,
        openingBudget,
        budgetEvents,
        pdfFonts: fonts,
        singleDayBudgetSync: dateFrom === dateTo ? budgetSummarySync : null
      });
      doc.save(`daily-closing_${dateFrom}_${dateTo}.pdf`);
    })();
  }, [closingData, dateFrom, dateTo, openingBudget, budgetEvents, budgetSummarySync]);

  const initialLoadDone = useRef(false);
  useEffect(() => {
    if (initialLoadDone.current) return;
    initialLoadDone.current = true;
    loadDailyClosing(dateFrom, dateTo);
  }, [loadDailyClosing, dateFrom, dateTo]);

  const datesPendingSearch =
    fetchedRange != null && (fetchedRange.from !== dateFrom || fetchedRange.to !== dateTo);

  useEffect(() => {
    setExpensesPage(1);
    setBillsPage(1);
  }, [closingData]);

  const expenseLines = closingData?.expenseLines ?? [];
  const billsRows = closingData?.bills ?? [];

  const expensePageCount = Math.max(1, Math.ceil(expenseLines.length / PAGE_SIZE));
  const billsPageCount = Math.max(1, Math.ceil(billsRows.length / PAGE_SIZE));

  const expensePageSafe = Math.min(Math.max(1, expensesPage), expensePageCount);
  const billsPageSafe = Math.min(Math.max(1, billsPage), billsPageCount);

  useEffect(() => {
    setExpensesPage((p) => Math.min(p, expensePageCount));
  }, [expensePageCount]);

  useEffect(() => {
    setBillsPage((p) => Math.min(p, billsPageCount));
  }, [billsPageCount]);

  const paginatedExpenses = useMemo(() => {
    const start = (expensePageSafe - 1) * PAGE_SIZE;
    return expenseLines.slice(start, start + PAGE_SIZE);
  }, [expenseLines, expensePageSafe]);

  const paginatedBills = useMemo(() => {
    const start = (billsPageSafe - 1) * PAGE_SIZE;
    return billsRows.slice(start, start + PAGE_SIZE);
  }, [billsRows, billsPageSafe]);

  /** Single day: same as GET /budget/daily/summary (Expenses page). Range: opening + net in-hand from closing report. */
  const finalBudgetInHand = useMemo(() => {
    if (!isRange && budgetSummarySync != null) {
      const r = Number(budgetSummarySync?.remainingAmount ?? budgetSummarySync?.remaining_amount);
      if (Number.isFinite(r)) return r;
    }
    return (Number(openingBudget) || 0) + resolveInHand(closingData);
  }, [isRange, budgetSummarySync, openingBudget, closingData]);

  const onChangeFrom = (e) => {
    const v = e.target.value;
    setDateFrom(v);
    setDateTo((prev) => (prev < v ? v : prev));
  };

  const onChangeTo = (e) => {
    const v = e.target.value;
    setDateTo(v);
    setDateFrom((prev) => (v < prev ? v : prev));
  };

  const handleClearDates = () => {
    const t = localISODate();
    setDateFrom(t);
    setDateTo(t);
  };

  const periodLabel = useMemo(() => {
    if (!dateFrom || !dateTo) return '';
    if (dateFrom === dateTo) return formatDayLabel(dateFrom);
    return `${formatDayLabel(dateFrom)} – ${formatDayLabel(dateTo)}`;
  }, [dateFrom, dateTo]);

  const paySummary = closingData?.paymentSummary || {};
  const otherCollected =
    (Number(paySummary.CHEQUE) || 0) + (Number(paySummary.OTHER) || 0);

  const billsHeading = isRange ? 'Bills in this period' : "Today's bills";
  const expensesHeading = isRange ? 'Expenses in this period' : "Today's expenses";

  const handleBillPdf = async (row) => {
    try {
      await downloadBillPDF(row.billId, row.billType);
    } catch (e) {
      console.error(e);
      window.alert(parseReportError(e));
    }
  };

  if (closingLoading && !closingData) {
    return (
      <div className="reports-container reports-layout reports-daily-only">
        <Loading message="Loading report…" />
      </div>
    );
  }

  return (
    <div className="reports-container reports-layout reports-daily-only">
      <header className="reports-top">
        <div>
          <h2 className="reports-title">Daily Closing Report</h2>
        </div>
        <div className="reports-header-actions">
          <button
            type="button"
            className="reports-btn-export"
            onClick={handleDownloadPdf}
            disabled={!closingData || closingLoading}
          >
            Download PDF
          </button>
        </div>
      </header>

      <section className="report-filters report-filters-bar" aria-label="Report period">
        <div className="report-filters-inner daily-closing-date-row daily-closing-daterange-row">
          <div className="form-group">
            <label htmlFor="closing-date-from">From (bill date &amp; period start)</label>
            <input id="closing-date-from" type="date" value={dateFrom} onChange={onChangeFrom} />
          </div>
          <div className="form-group">
            <label htmlFor="closing-date-to">To (inclusive)</label>
            <input id="closing-date-to" type="date" value={dateTo} onChange={onChangeTo} />
          </div>
          <div className="form-group daily-filter-actions">
            <label className="daily-filter-actions-label">Find on date</label>
            <div className="daily-filter-buttons">
              <button
                type="button"
                className="btn-clear-dates"
                onClick={handleClearDates}
                title="Reset From and To to today"
              >
                Clear
              </button>
              <button
                type="button"
                className="btn-primary-soft"
                onClick={() => loadDailyClosing(dateFrom, dateTo)}
                disabled={closingLoading}
              >
                {closingLoading ? 'Loading…' : 'Search'}
              </button>
            </div>
          </div>
        </div>
      </section>

      {closingError && (
        <div className="report-error-banner report-error-banner--with-actions" role="alert">
          <div className="report-error-banner-text">
            <p className="report-error-message">{closingError}</p>
            {closingErrorRequestId ? (
              <p className="report-error-ref">
                Reference for support: <code>{closingErrorRequestId}</code>
              </p>
            ) : null}
          </div>
          <button
            type="button"
            className="report-error-retry"
            onClick={() => loadDailyClosing(dateFrom, dateTo)}
            disabled={closingLoading}
          >
            Retry
          </button>
        </div>
      )}
      {datesPendingSearch && !closingError && (
        <div className="report-stale-dates-banner" role="status">
          Dates changed — click <strong>Search</strong> to load the report for the new range.
        </div>
      )}
      {closingLoading && closingData && (
        <div className="report-info-banner" role="status">
          Updating report…
        </div>
      )}
      {closingData && Array.isArray(closingData.warnings) && closingData.warnings.length > 0 && (
        <div className="report-warnings-banner" role="status">
          <ul className="report-warnings-list">
            {closingData.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      {closingData ? (
        <>
          <div className="daily-closing-header daily-closing-header-inline">
            <span className="daily-closing-date-badge" role="status">
              {periodLabel}
            </span>
          </div>

          <div className="daily-summary-grid">
            <div className="daily-summary-card">
              <span className="daily-summary-label">Total bills</span>
              <span className="daily-summary-value">{closingData.totalBills ?? 0}</span>
              <span className="daily-summary-hint">
                Invoices with bill date in the selected {isRange ? 'range' : 'day'}
              </span>
            </div>
            <div className="daily-summary-card">
              <span className="daily-summary-label">Total sales</span>
              <span className="daily-summary-value">{money(closingData.totalSales)}</span>
              <span className="daily-summary-hint">Sum of bill totals for those invoices</span>
            </div>
            <div className="daily-summary-card">
              <span className="daily-summary-label">Total paid</span>
              <span className="daily-summary-value">{money(closingData.totalPaidOnBills)}</span>
              <span className="daily-summary-hint">Allocated on those bills (split payments)</span>
            </div>
            <div className="daily-summary-card">
              <span className="daily-summary-label">Total due</span>
              <span className="daily-summary-value">{money(closingData.totalDueOnBills)}</span>
              <span className="daily-summary-hint">Still unpaid on those bills</span>
            </div>
            <div className="daily-summary-card daily-summary-card--advance">
              <span className="daily-summary-label">Advance Available</span>
              <span className="daily-summary-value" title="Prepaid amount from customer">
                {money(
                  Number(
                    closingData.totalAdvanceAvailable ??
                    (Number(closingData.totalAdvanceDeposits) || 0) - (Number(closingData.totalAdvanceAppliedOnBills) || 0)
                  )
                )}
              </span>
              <span className="daily-summary-hint">
                Recorded {money(closingData.totalAdvanceDeposits)} · Applied to bills {money(closingData.totalAdvanceAppliedOnBills)}
              </span>
            </div>
          </div>

          <div className="daily-paymode-grid daily-paymode-grid--tight-top" aria-label="Collections by payment mode">
            <div className="daily-paymode cash">
              <span>Cash</span>
              <strong>{money(paySummary.CASH)}</strong>
            </div>
            <div className="daily-paymode upi">
              <span>UPI</span>
              <strong>{money(paySummary.UPI)}</strong>
            </div>
            <div className="daily-paymode bank">
              <span>Bank transfer</span>
              <strong>{money(paySummary.BANK_TRANSFER)}</strong>
            </div>
            <div className="daily-paymode other">
              <span>Other (cheque, etc.)</span>
              <strong>{money(otherCollected)}</strong>
            </div>
          </div>
          <p className="report-muted daily-microcopy daily-total-collected-line">
            <strong>Total collected</strong> (all modes, payment date in period): {money(closingData.totalCollected)}
            {closingData.collectionsReconciliationOk === false && (
              <span className="daily-recon-warn">
                {' '}
                · Modes vs total Δ {money(closingData.collectionsReconciliationDelta)}
              </span>
            )}
          </p>
          {(Number(closingData.totalCollected) || 0) === 0 && (
            <p className="report-muted">No payments recorded yet for selected date range.</p>
          )}

          <h4 className="daily-subheading">{billsHeading}</h4>
          <p className="report-table-scroll-hint">Scroll sideways to see all columns.</p>
          <div className="daily-bills-table-block">
            <div
              className="report-table-wrap report-table-scroll-region"
              role="region"
              aria-label="Bills in period. Scroll horizontally if columns are cut off."
              tabIndex={0}
            >
              <table className="report-data-table daily-bills-table">
                <thead>
                  <tr>
                    <th>Bill date</th>
                    <th>Bill</th>
                    <th>Type</th>
                    <th>Total</th>
                    <th>Paid</th>
                    <th>Due</th>
                    <th>Cash</th>
                    <th>UPI</th>
                    <th>Bank</th>
                    <th>Other</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {billsRows.length === 0 ? (
                    <tr>
                      <td colSpan={11} className="report-muted">
                        No bills in this period.
                      </td>
                    </tr>
                  ) : (
                    paginatedBills.map((row) => (
                      <tr key={`${row.billType}-${row.billId}`}>
                        <td>{formatShortDate(row.billDate)}</td>
                        <td>
                          <button
                            type="button"
                            className="report-bill-link"
                            onClick={() => handleBillPdf(row)}
                            title="Download bill PDF"
                          >
                            {row.billNumber}
                          </button>
                        </td>
                        <td>
                          <span className="bill-type-pill">{row.billType}</span>
                        </td>
                        <td>{money(row.totalAmount)}</td>
                        <td>{money(row.paidAmount)}</td>
                        <td>{money(row.dueAmount)}</td>
                        <td>{money(row.cashAmount)}</td>
                        <td>{money(row.upiAmount)}</td>
                        <td>{money(row.bankTransferAmount)}</td>
                        <td>{money(row.otherAmount)}</td>
                        <td>
                          <span className="report-status-cell">
                            <span
                              className={`status-pill status-${(row.status || '').toLowerCase()}`}
                              title={row.status === 'PARTIAL' ? 'Bill not fully paid yet' : undefined}
                            >
                              {row.status}
                            </span>
                            {(row.overpaidAmount || 0) > 0.005 && (
                              <span className="report-overpaid-tag" title="Payments exceed bill total">
                                +{money(row.overpaidAmount)}
                              </span>
                            )}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <TablePagination
              page={billsPageSafe}
              pageCount={billsPageCount}
              total={billsRows.length}
              label="Bills pages"
              onPrev={() => setBillsPage((p) => Math.max(1, p - 1))}
              onNext={() => setBillsPage((p) => Math.min(billsPageCount, p + 1))}
            />
          </div>

          <div className="daily-bottom-grid">
            <div className="daily-expenses-panel">
              <h4 className="daily-subheading">{expensesHeading}</h4>
              <p className="report-table-scroll-hint">Scroll sideways to see all columns.</p>
              <div
                className={`report-table-wrap report-table-scroll-region daily-expenses-body-wrap${expenseLines.length > 0 ? ' daily-expenses-body-wrap--fill' : ''}`}
                role="region"
                aria-label="Expenses in period. Scroll horizontally if columns are cut off."
                tabIndex={0}
              >
                <table className="report-data-table daily-expenses-table">
                  <colgroup>
                    <col className="col-exp-id" />
                    <col className="col-exp-cat" />
                    <col className="col-exp-amt" />
                  </colgroup>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Type / category</th>
                      <th>Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {expenseLines.length === 0 ? (
                      <tr>
                        <td colSpan={3} className="report-muted">
                          No expenses in this period.
                        </td>
                      </tr>
                    ) : (
                      paginatedExpenses.map((ex) => (
                        <tr key={ex.id}>
                          <td>{ex.id}</td>
                          <td>{[ex.expenseType, ex.category].filter(Boolean).join(' · ')}</td>
                          <td>{money(ex.amount)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              <TablePagination
                page={expensePageSafe}
                pageCount={expensePageCount}
                total={expenseLines.length}
                label="Expense pages"
                onPrev={() => setExpensesPage((p) => Math.max(1, p - 1))}
                onNext={() => setExpensesPage((p) => Math.min(expensePageCount, p + 1))}
              />
              <div className="report-table-wrap daily-expenses-tfoot-wrap">
                <table className="report-data-table daily-expenses-table">
                  <colgroup>
                    <col className="col-exp-id" />
                    <col className="col-exp-cat" />
                    <col className="col-exp-amt" />
                  </colgroup>
                  <tfoot>
                    <tr className="report-row-strong">
                      <td colSpan={2}>Total expenses</td>
                      <td>{money(closingData.totalExpenses)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
            <div className="cash-summary-card">
              <h4 title="Cash + UPI available after expenses">Budget in hand summary</h4>
              <div className="report-row">
                <span>Cash + UPI collected {isRange ? 'in period' : '(today)'}</span>
                <span className="report-value positive">
                  {money((Number(paySummary.CASH) || 0) + (Number(paySummary.UPI) || 0))}
                </span>
              </div>
                <div className="report-row">
                  <span>Total opening budget {isRange ? '(period start)' : '(today)'}</span>
                  <span className="report-value positive">{money(openingBudget)}</span>
                </div>
              <div className="report-row">
                <span>Total expenses {isRange ? 'in period' : '(today)'}</span>
                <span className="report-value negative">{money(closingData.totalExpenses)}</span>
              </div>
                <div
                  className={`report-row report-row-strong cash-final ${
                    finalBudgetInHand < 0 ? 'negative' : 'positive'
                  }`}
                >
                  <span>Final budget in hand {isRange ? '(period)' : ''}</span>
                  <span className="report-value">{money(finalBudgetInHand)}</span>
                </div>
              <p className="report-muted daily-microcopy">
                {isRange ? (
                  <>
                    <strong>Cash + UPI collected</strong> in the selected range minus{' '}
                    <strong>expenses posted</strong> in the same range. Bank/Cheque are not in this number.
                  </>
                ) : (
                  <>
                    For a single day, <strong>opening</strong> and <strong>final</strong> match the daily budget ledger (same as the Expenses page).{' '}
                    Cash + UPI above is for reference; collections also feed the budget through the server.
                  </>
                )}
              </p>
            </div>
          </div>

          <Explainer title="How to read this report">
            <li>
              <strong>Search</strong>: Changing dates does not reload automatically — click <strong>Search</strong> to fetch
              the report for the selected range.
            </li>
            <li>
              <strong>From / To</strong>: Set both to the same date for one day, or choose a range. Defaults to today for
              both.
            </li>
            <li>
              <strong>Total bills / Total sales</strong>: Invoices whose <strong>bill date</strong> falls in the selected
              period.
            </li>
            <li>
              <strong>Total paid / Total due</strong>: On those invoices — allocated vs outstanding (split &amp; partial
              payments).
            </li>
            <li>
              <strong>Collections</strong>: Sums from stored payment lines whose <strong>payment date</strong> is in the
              period (can differ from bill dates if you collect old dues later). <strong>Total collected</strong> is the sum
              of all payment modes.
            </li>
            <li>
              <strong>Bill table</strong>: Each invoice&apos;s bill date and paid split (Cash / UPI / Bank / Other).
            </li>
            <li>
              <strong>Final budget in hand</strong>: Cash + UPI collected in the period minus expenses in the period.
            </li>
          </Explainer>
        </>
      ) : !closingError ? (
        <p className="report-muted">No data.</p>
      ) : null}
    </div>
  );
};

function Explainer({ title, children }) {
  return (
    <details className="report-explainer">
      <summary>{title}</summary>
      <ul className="report-explainer-list">{children}</ul>
    </details>
  );
}

export default Reports;
