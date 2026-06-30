import React, { useCallback, useEffect, useMemo, useState } from 'react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import Loading from '../Loading';
import DdMmYyCalendar from '../DdMmYyCalendar';
import { formatDdMmYy, localISODate } from '../../utils/dateFormat';
import { ensurePdfUnicodeFont } from '../../utils/pdfFonts';
import { accountChannelLabel, normalizeAccountChannel } from '../../utils/clientAccountChannel';

const money = (n) =>
  `₹${(Number(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const RUPEE = '\u20B9';
const AMOUNT_GAP = '\u202f';

function pdfSafeText(value) {
  return String(value ?? '')
    .replace(/\u2014/g, '-')
    .replace(/\u2013/g, '-');
}

function pdfAmount(n) {
  const num = Number(n) || 0;
  const negative = num < 0;
  const abs = Math.abs(num);
  const [intPart, decPart] = abs.toFixed(2).split('.');
  let grouped = intPart;
  if (intPart.length > 3) {
    const last3 = intPart.slice(-3);
    let rest = intPart.slice(0, -3);
    const chunks = [];
    while (rest.length > 2) {
      chunks.unshift(rest.slice(-2));
      rest = rest.slice(0, -2);
    }
    if (rest) chunks.unshift(rest);
    grouped = `${chunks.join(',')},${last3}`;
  }
  return `${negative ? '-' : ''}${RUPEE}${AMOUNT_GAP}${grouped}.${decPart}`;
}

const PDF_MARGIN = 36;
const PDF_AMOUNT_COL = 84;
const PDF_HEAD = { fillColor: [0, 77, 77], textColor: 255, fontStyle: 'bold' };

function pdfTableBase(fontName) {
  return {
    styles: {
      font: fontName,
      fontSize: 9,
      cellPadding: 5,
      overflow: 'linebreak',
      textColor: [30, 41, 59],
    },
    headStyles: { ...PDF_HEAD, font: fontName },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    margin: { left: PDF_MARGIN, right: PDF_MARGIN },
  };
}

function pdfAmountColumn(width = PDF_AMOUNT_COL) {
  return { cellWidth: width, halign: 'right', overflow: 'visible', minCellWidth: width };
}

function addPdfSectionTitle(doc, fontName, title, y) {
  doc.setFont(fontName, 'bold');
  doc.setFontSize(11);
  doc.setTextColor(0, 77, 77);
  doc.text(title, PDF_MARGIN, y);
  doc.setFont(fontName, 'normal');
  doc.setTextColor(0, 0, 0);
  return y + 14;
}

function addPdfSectionSubtitle(doc, fontName, text, y) {
  doc.setFont(fontName, 'normal');
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  const lines = doc.splitTextToSize(text, doc.internal.pageSize.getWidth() - PDF_MARGIN * 2);
  doc.text(lines, PDF_MARGIN, y);
  doc.setTextColor(0, 0, 0);
  return y + lines.length * 11 + 6;
}

function ensureSpace(doc, y, needed = 70) {
  const pageH = doc.internal.pageSize.getHeight();
  if (y > pageH - needed) {
    doc.addPage();
    return PDF_MARGIN + 20;
  }
  return y;
}

function addPdfFooter(doc, fontName) {
  const total = doc.getNumberOfPages();
  for (let i = 1; i <= total; i += 1) {
    doc.setPage(i);
    doc.setFont(fontName, 'normal');
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    doc.text(`Page ${i} of ${total}`, pageW - PDF_MARGIN, pageH - 18, { align: 'right' });
  }
  doc.setTextColor(0, 0, 0);
}

const SECTION_HELP = {
  ledger:
    'Every money movement in the accounts ledger for this client (purchases and payments), with a running balance after each row.',
  purchases:
    'Each credit purchase you recorded (what was bought and how much is owed). One row per purchase — shows total bill, paid so far, and pending balance.',
};

function txnTypeLabel(type) {
  const t = String(type || '').toUpperCase();
  if (t === 'PURCHASE') return 'Purchase';
  if (t === 'PAYMENT_OUT') return 'Payment out';
  if (t === 'PAYMENT_IN') return 'Payment in';
  return type || '—';
}

function buildClientSummaries(clientPayments, accounts, getClientPurchasePaid, getClientPurchasePending) {
  const map = new Map();

  for (const acc of accounts || []) {
    const name = String(acc?.displayName || acc?.clientKey || '').trim();
    if (!name) continue;
    const key = name.toLowerCase();
    map.set(key, {
      key,
      name,
      purchaseCount: 0,
      totalAmount: 0,
      paidAmount: 0,
      pendingAmount: 0,
      lastPurchaseDate: null,
    });
  }

  for (const purchase of clientPayments || []) {
    const name = String(purchase?.clientName || '').trim();
    if (!name) continue;
    const key = name.toLowerCase();
    const row = map.get(key) || {
      key,
      name,
      purchaseCount: 0,
      totalAmount: 0,
      paidAmount: 0,
      pendingAmount: 0,
      lastPurchaseDate: null,
    };
    row.purchaseCount += 1;
    row.totalAmount += Number(parseFloat(purchase?.totalAmount || 0) || 0);
    row.paidAmount += getClientPurchasePaid(purchase);
    row.pendingAmount += getClientPurchasePending(purchase);
    const pd = purchase?.purchaseDate ? String(purchase.purchaseDate).slice(0, 10) : null;
    if (pd && (!row.lastPurchaseDate || pd > row.lastPurchaseDate)) {
      row.lastPurchaseDate = pd;
    }
    map.set(key, row);
  }

  return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, 'en-IN'));
}

function safeFilePart(name) {
  return String(name || 'client')
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .slice(0, 60) || 'client';
}

function channelSummaryNumbers(dto) {
  if (!dto) {
    return { purchaseCount: 0, totalAmount: 0, paidAmount: 0, pendingAmount: 0, runningBalance: null };
  }
  return {
    purchaseCount: Number(dto.purchaseCount ?? 0) || 0,
    totalAmount: Number(dto.totalAmount ?? 0) || 0,
    paidAmount: Number(dto.paidAmount ?? 0) || 0,
    pendingAmount: Number(dto.pendingAmount ?? 0) || 0,
    runningBalance: dto.runningBalance != null ? Number(dto.runningBalance) : null,
  };
}

function purchaseChannel(purchase) {
  return accountChannelLabel(purchase?.accountChannel ?? purchase?.account_channel);
}

const ACCOUNT_CHANNELS = [
  { id: 'GST', title: 'GST account' },
  { id: 'NON_GST', title: 'Non-GST account' },
];

function emptyIncreaseForm() {
  return { amount: '', description: '' };
}

function emptySimplePayForm() {
  return { amount: '', date: localISODate(), paymentMethod: 'cash' };
}

function emptyNewClientForm() {
  return {
    name: '',
    gstAmount: '',
    gstDescription: '',
    nonGstAmount: '',
    nonGstDescription: '',
  };
}

function AccountOverviewCard({
  channel,
  title,
  summary,
  showSetupHint,
  increaseForm,
  onIncreaseFormChange,
  onIncrease,
  increasing,
  payForm,
  onPayFormChange,
  onPay,
  paying,
}) {
  const isGst = channel === 'GST';
  const variant = isGst ? 'gst' : 'nongst';

  return (
    <div className={`client-account-card client-account-card--${variant}`}>
      <div className="client-account-card__head">
        <h3 className="client-account-card__title">{title}</h3>
        <span className={`client-account-card__status client-account-card__status--${variant}`}>
          <span className="client-account-card__status-dot" aria-hidden />
          Active
        </span>
      </div>

      <div className="client-account-card__stats">
        <div className="client-account-card__stat">
          <span className="client-account-card__stat-label">Pending</span>
          <span className="client-account-card__stat-value client-account-card__stat-value--pending">
            {money(summary.pendingAmount)}
          </span>
        </div>
        <div className="client-account-card__stat">
          <span className="client-account-card__stat-label">Paid</span>
          <span className="client-account-card__stat-value client-account-card__stat-value--paid">
            {money(summary.paidAmount)}
          </span>
        </div>
      </div>

      {showSetupHint && (
        <div className={`client-account-card__notice client-account-card__notice--${variant}`}>
          Not set up yet — add an amount below to start this account.
        </div>
      )}

      <div className="client-account-card__block">
        <h4 className="client-account-card__block-title">Add purchase on credit</h4>
        <form
          className="client-account-card__form client-account-card__form--inline"
          onSubmit={(e) => {
            e.preventDefault();
            onIncrease();
          }}
        >
          <div className="client-account-card__form-fields">
            <label className="client-account-card__field">
              <span>Amount (₹)</span>
              <input
                type="number"
                min="0.01"
                step="0.01"
                placeholder="0.00"
                value={increaseForm.amount}
                onChange={(e) => onIncreaseFormChange({ ...increaseForm, amount: e.target.value })}
                required
              />
            </label>
            <label className="client-account-card__field">
              <span>Description</span>
              <input
                type="text"
                placeholder="What you bought"
                value={increaseForm.description}
                onChange={(e) => onIncreaseFormChange({ ...increaseForm, description: e.target.value })}
                required
              />
            </label>
          </div>
          <button
            type="submit"
            className={`client-account-card__btn client-account-card__btn--${variant}`}
            disabled={increasing}
          >
            {increasing ? 'Adding…' : `Add to ${title}`}
          </button>
        </form>
      </div>

      <div className="client-account-card__block">
        <h4 className="client-account-card__block-title">Make payment</h4>
        <form
          className="client-account-card__form client-account-card__form--pay"
          onSubmit={(e) => {
            e.preventDefault();
            onPay();
          }}
        >
          <div className="client-account-card__form-fields">
            <label className="client-account-card__field">
              <span>Amount (₹)</span>
              <input
                type="number"
                min="0.01"
                step="0.01"
                placeholder="0.00"
                value={payForm.amount}
                onChange={(e) => onPayFormChange({ ...payForm, amount: e.target.value })}
                required
              />
            </label>
            <label className="client-account-card__field">
              <span>Payment date</span>
              <DdMmYyCalendar value={payForm.date} onChange={(v) => onPayFormChange({ ...payForm, date: v })} />
            </label>
            <label className="client-account-card__field">
              <span>Payment method</span>
              <select
                value={payForm.paymentMethod}
                onChange={(e) => onPayFormChange({ ...payForm, paymentMethod: e.target.value })}
              >
                <option value="cash">Cash</option>
                <option value="bank">Bank</option>
                <option value="upi">UPI</option>
                <option value="cheque">Cheque</option>
              </select>
            </label>
          </div>
          <button
            type="submit"
            className={`client-account-card__btn client-account-card__btn--${variant}`}
            disabled={paying}
          >
            {paying ? 'Paying…' : `Pay ${title}`}
          </button>
        </form>
      </div>
    </div>
  );
}

/** @deprecated Renamed to AccountOverviewCard; kept for older render paths. */
function SimpleChannelCard(props) {
  return <AccountOverviewCard {...props} />;
}

function AccountTypeBadge({ channel }) {
  const isGst = normalizeAccountChannel(channel) === 'GST';
  return (
    <span className={`client-account-type-badge client-account-type-badge--${isGst ? 'gst' : 'nongst'}`}>
      {accountChannelLabel(channel)}
    </span>
  );
}

async function downloadClientHistoryPdf({
  client,
  ledgerRows,
  clientPurchases,
  accountSummary,
  getClientPurchasePaid,
  getClientPurchasePending,
}) {
  if (!client) return false;

  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const fontName = await ensurePdfUnicodeFont(doc);
  const tableOpts = pdfTableBase(fontName);
  const pageW = doc.internal.pageSize.getWidth();
  const contentW = pageW - PDF_MARGIN * 2;
  const clientName = pdfSafeText(client.name);
  const generatedOn = formatDdMmYy(localISODate());

  doc.setFillColor(0, 77, 77);
  doc.rect(0, 0, pageW, 72, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont(fontName, 'bold');
  doc.setFontSize(17);
  doc.text('CLIENT ACCOUNT STATEMENT', PDF_MARGIN, 32);
  doc.setFont(fontName, 'normal');
  doc.setFontSize(11);
  doc.text(clientName, PDF_MARGIN, 52);
  doc.setFontSize(9);
  doc.text(`Generated: ${generatedOn}`, pageW - PDF_MARGIN, 32, { align: 'right' });
  doc.text(`Purchases: ${client.purchaseCount}`, pageW - PDF_MARGIN, 46, { align: 'right' });
  doc.text(`Pending: ${pdfAmount(client.pendingAmount)}`, pageW - PDF_MARGIN, 60, { align: 'right' });

  doc.setTextColor(0, 0, 0);
  let y = 92;

  y = addPdfSectionTitle(doc, fontName, 'Summary', y);
  const combined = channelSummaryNumbers(accountSummary?.combined);
  const gst = channelSummaryNumbers(accountSummary?.gst);
  const nonGst = channelSummaryNumbers(accountSummary?.nonGst);
  autoTable(doc, {
    ...tableOpts,
    startY: y,
    tableWidth: contentW,
    head: [['Metric', 'Combined', 'GST account', 'Non-GST account']],
    body: [
      ['Purchases', String(combined.purchaseCount), String(gst.purchaseCount), String(nonGst.purchaseCount)],
      ['Total amount', pdfAmount(combined.totalAmount), pdfAmount(gst.totalAmount), pdfAmount(nonGst.totalAmount)],
      ['Total paid', pdfAmount(combined.paidAmount), pdfAmount(gst.paidAmount), pdfAmount(nonGst.paidAmount)],
      ['Total pending', pdfAmount(combined.pendingAmount), pdfAmount(gst.pendingAmount), pdfAmount(nonGst.pendingAmount)],
      [
        'Running balance',
        combined.runningBalance != null ? pdfAmount(combined.runningBalance) : '-',
        gst.runningBalance != null ? pdfAmount(gst.runningBalance) : '-',
        nonGst.runningBalance != null ? pdfAmount(nonGst.runningBalance) : '-',
      ],
    ],
    columnStyles: {
      0: { cellWidth: contentW * 0.28, fontStyle: 'bold' },
      1: pdfAmountColumn(contentW * 0.24),
      2: pdfAmountColumn(contentW * 0.24),
      3: pdfAmountColumn(contentW * 0.24),
    },
  });
  y = doc.lastAutoTable.finalY + 22;

  y = ensureSpace(doc, y);
  y = addPdfSectionTitle(doc, fontName, 'Full transaction history (ledger)', y);
  y = addPdfSectionSubtitle(doc, fontName, SECTION_HELP.ledger, y);
  if (ledgerRows.length === 0) {
    doc.setFont(fontName, 'normal');
    doc.setFontSize(10);
    doc.setTextColor(100, 116, 139);
    doc.text('No ledger transactions recorded for this client.', PDF_MARGIN, y + 4);
    doc.setTextColor(0, 0, 0);
    y += 22;
  } else {
    const amtW = PDF_AMOUNT_COL;
    autoTable(doc, {
      ...tableOpts,
      startY: y,
      tableWidth: contentW,
      head: [['Date', 'Account', 'Type', 'Mode', 'Notes', 'Amount', 'Balance']],
      body: ledgerRows.map((row) => [
        formatDdMmYy(row.transactionDate),
        pdfSafeText(accountChannelLabel(row.accountChannel)),
        pdfSafeText(txnTypeLabel(row.transactionType)),
        pdfSafeText(row.paymentMode || '-'),
        pdfSafeText(row.notes || '-'),
        pdfAmount(row.amount),
        row.runningBalanceAfter != null ? pdfAmount(row.runningBalanceAfter) : '-',
      ]),
      columnStyles: {
        0: { cellWidth: 44 },
        1: { cellWidth: 44 },
        2: { cellWidth: 48 },
        3: { cellWidth: 36 },
        4: { cellWidth: contentW - 44 - 44 - 48 - 36 - amtW - amtW },
        5: pdfAmountColumn(amtW),
        6: { ...pdfAmountColumn(amtW), fontStyle: 'bold' },
      },
      styles: { ...tableOpts.styles, fontSize: 8, cellPadding: 4 },
    });
    y = doc.lastAutoTable.finalY + 22;
  }

  if (clientPurchases.length > 0) {
    y = ensureSpace(doc, y);
    y = addPdfSectionTitle(doc, fontName, 'Purchase records', y);
    y = addPdfSectionSubtitle(doc, fontName, SECTION_HELP.purchases, y);
    const amtW = PDF_AMOUNT_COL;
    const descW = contentW - 44 - 44 - amtW * 3 - 42;
    autoTable(doc, {
      ...tableOpts,
      startY: y,
      tableWidth: contentW,
      head: [['Date', 'Account', 'Description', 'Total', 'Paid', 'Pending', 'Status']],
      body: clientPurchases.map((purchase) => {
        const paid = getClientPurchasePaid(purchase);
        const pending = getClientPurchasePending(purchase);
        const total = Number(parseFloat(purchase?.totalAmount || 0) || 0);
        return [
          formatDdMmYy(purchase.purchaseDate),
          pdfSafeText(purchaseChannel(purchase)),
          pdfSafeText(purchase.purchaseDescription || '-'),
          pdfAmount(total),
          pdfAmount(paid),
          pdfAmount(pending),
          pending <= 0 ? 'Paid' : 'Pending',
        ];
      }),
      columnStyles: {
        0: { cellWidth: 44 },
        1: { cellWidth: 44 },
        2: { cellWidth: Math.max(descW, 80) },
        3: pdfAmountColumn(amtW),
        4: pdfAmountColumn(amtW),
        5: pdfAmountColumn(amtW),
        6: { cellWidth: 42, halign: 'center' },
      },
      styles: { ...tableOpts.styles, fontSize: 8, cellPadding: 4 },
    });
    y = doc.lastAutoTable.finalY + 22;
  }

  addPdfFooter(doc, fontName);
  doc.save(`${safeFilePart(client.name)}-history-${localISODate()}.pdf`);
  return true;
}
export default function ClientListSection({
  clientPayments,
  allPayments = [],
  getClientPurchasePaid,
  getClientPurchasePending,
  fetchClientRunningLedger,
  fetchClientAccountSummary,
  fetchClientSupplierAccounts,
  createClientSupplierAccount,
  createClientPurchase,
  addClientPayment,
  onClientDataRefresh,
  notify,
  searchQuery = '',
}) {
  const [accounts, setAccounts] = useState([]);
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [selectedClient, setSelectedClient] = useState(null);
  const [accountSummary, setAccountSummary] = useState(null);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [showNewClientModal, setShowNewClientModal] = useState(false);
  const [newClientForm, setNewClientForm] = useState(emptyNewClientForm());
  const [creatingClient, setCreatingClient] = useState(false);
  const [increaseForms, setIncreaseForms] = useState({
    GST: emptyIncreaseForm(),
    NON_GST: emptyIncreaseForm(),
  });
  const [simplePayForms, setSimplePayForms] = useState({
    GST: emptySimplePayForm(),
    NON_GST: emptySimplePayForm(),
  });
  const [increasingChannel, setIncreasingChannel] = useState(null);
  const [payingChannel, setPayingChannel] = useState(null);
  const [paymentsFilter, setPaymentsFilter] = useState('ALL');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingAccounts(true);
      try {
        const rows = await fetchClientSupplierAccounts();
        if (!cancelled) setAccounts(Array.isArray(rows) ? rows : []);
      } catch {
        if (!cancelled) setAccounts([]);
      } finally {
        if (!cancelled) setLoadingAccounts(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchClientSupplierAccounts]);

  const reloadAccounts = useCallback(async () => {
    try {
      const rows = await fetchClientSupplierAccounts();
      setAccounts(Array.isArray(rows) ? rows : []);
    } catch {
      setAccounts([]);
    }
  }, [fetchClientSupplierAccounts]);

  const clients = useMemo(
    () => buildClientSummaries(clientPayments, accounts, getClientPurchasePaid, getClientPurchasePending),
    [clientPayments, accounts, getClientPurchasePaid, getClientPurchasePending]
  );

  const filteredClients = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return clients;
    return clients.filter((c) => c.name.toLowerCase().includes(q));
  }, [clients, searchQuery]);

  const clientPurchases = useMemo(() => {
    if (!selectedClient) return [];
    const key = selectedClient.key;
    return (clientPayments || [])
      .filter((p) => String(p?.clientName || '').trim().toLowerCase() === key)
      .sort((a, b) => {
        const da = String(a?.purchaseDate || '').slice(0, 10);
        const db = String(b?.purchaseDate || '').slice(0, 10);
        return db.localeCompare(da);
      });
  }, [clientPayments, selectedClient]);

  const clientAccountRows = useMemo(() => {
    if (!selectedClient) return { GST: null, NON_GST: null };
    const key = selectedClient.key;
    const rows = (accounts || []).filter((row) => {
      const rowKey = String(row?.clientKey ?? row?.client_key ?? '').toLowerCase();
      const display = String(row?.displayName ?? row?.display_name ?? '').trim().toLowerCase();
      return rowKey === key || display === key;
    });
    return {
      GST: rows.find((r) => normalizeAccountChannel(r?.accountChannel ?? r?.account_channel) === 'GST') || null,
      NON_GST:
        rows.find((r) => normalizeAccountChannel(r?.accountChannel ?? r?.account_channel) === 'NON_GST') || null,
    };
  }, [accounts, selectedClient]);

  const pendingPurchasesByChannel = useMemo(() => {
    if (!selectedClient) return { GST: [], NON_GST: [] };
    const key = selectedClient.key;
    const mine = (clientPayments || []).filter(
      (p) => String(p?.clientName || '').trim().toLowerCase() === key
    );
    const forChannel = (channel) =>
      mine
        .filter((p) => normalizeAccountChannel(p?.accountChannel ?? p?.account_channel) === channel)
        .sort((a, b) => {
          const pendingDiff = getClientPurchasePending(b) - getClientPurchasePending(a);
          if (pendingDiff !== 0) return pendingDiff;
          return String(a?.purchaseDate || '').localeCompare(String(b?.purchaseDate || ''));
        });
    return {
      GST: forChannel('GST'),
      NON_GST: forChannel('NON_GST'),
    };
  }, [clientPayments, selectedClient, getClientPurchasePending]);

  const clientPaymentsHistory = useMemo(() => {
    if (!selectedClient) return [];
    const key = selectedClient.key;
    let rows = (allPayments || [])
      .map((payment) => {
        const purchase = (clientPayments || []).find(
          (p) =>
            String(p.id) === String(payment.clientPurchaseId || payment.purchaseId)
        );
        const clientKey = String(payment.clientName || payment.clientId || purchase?.clientName || '')
          .trim()
          .toLowerCase();
        const channel = normalizeAccountChannel(
          payment.accountChannel ?? payment.account_channel ?? purchase?.accountChannel ?? purchase?.account_channel
        );
        return { ...payment, accountChannel: channel, clientKey, purchase };
      })
      .filter((p) => p.clientKey === key);

    if (paymentsFilter === 'GST') {
      rows = rows.filter((p) => normalizeAccountChannel(p.accountChannel) === 'GST');
    } else if (paymentsFilter === 'NON_GST') {
      rows = rows.filter((p) => normalizeAccountChannel(p.accountChannel) === 'NON_GST');
    }

    return rows.sort((a, b) => {
      const da = new Date(a.date || a.createdAt || 0).getTime();
      const db = new Date(b.date || b.createdAt || 0).getTime();
      return db - da;
    });
  }, [allPayments, clientPayments, selectedClient, paymentsFilter]);

  const pickPayTarget = useCallback(
    (channel) => {
      const list = pendingPurchasesByChannel[channel] || [];
      const withPending = list
        .filter((p) => getClientPurchasePending(p) > 0)
        .sort((a, b) => String(a?.purchaseDate || '').localeCompare(String(b?.purchaseDate || '')));
      return withPending[0] || list[0] || null;
    },
    [pendingPurchasesByChannel, getClientPurchasePending]
  );

  const reloadClientDetail = useCallback(async () => {
    if (!selectedClient) return;
    try {
      const summary = fetchClientAccountSummary
        ? await fetchClientAccountSummary(selectedClient.name)
        : null;
      setAccountSummary(summary && typeof summary === 'object' ? summary : null);
      await reloadAccounts();
      if (onClientDataRefresh) await onClientDataRefresh();
    } catch {
      /* keep current view */
    }
  }, [selectedClient, fetchClientAccountSummary, reloadAccounts, onClientDataRefresh]);

  const ensureChannelAccount = useCallback(
    async (clientName, channel) => {
      if (!createClientSupplierAccount) return;
      try {
        await createClientSupplierAccount({
          clientName: clientName.trim(),
          displayName: clientName.trim(),
          accountChannel: channel,
        });
        await reloadAccounts();
      } catch {
        /* account may already exist */
      }
    },
    [createClientSupplierAccount, reloadAccounts]
  );

  const handleIncreaseChannel = useCallback(
    async (channel) => {
      if (!selectedClient || !createClientPurchase) return;
      const form = increaseForms[channel] || emptyIncreaseForm();
      const amount = Number(parseFloat(form.amount) || 0);
      const description = String(form.description || '').trim();
      if (!amount || amount <= 0) {
        notify?.('Enter a valid amount.', 'error');
        return;
      }
      if (!description) {
        notify?.('Enter what you bought.', 'error');
        return;
      }
      setIncreasingChannel(channel);
      try {
        await ensureChannelAccount(selectedClient.name, channel);
        await createClientPurchase({
          clientName: selectedClient.name,
          purchaseDescription: description,
          totalAmount: amount,
          purchaseDate: localISODate(),
          accountChannel: channel,
        });
        setIncreaseForms((prev) => ({ ...prev, [channel]: emptyIncreaseForm() }));
        await reloadClientDetail();
        notify?.(`Added ${money(amount)} to ${accountChannelLabel(channel)} account.`, 'success');
      } catch (err) {
        notify?.(err?.message || 'Could not add amount.', 'error');
      } finally {
        setIncreasingChannel(null);
      }
    },
    [
      selectedClient,
      increaseForms,
      createClientPurchase,
      ensureChannelAccount,
      reloadClientDetail,
      notify,
    ]
  );

  const handlePayChannel = useCallback(
    async (channel) => {
      if (!selectedClient || !addClientPayment) return;
      const form = simplePayForms[channel] || emptySimplePayForm();
      const amount = Number(parseFloat(form.amount) || 0);
      if (!amount || amount <= 0) {
        notify?.('Enter a valid payment amount.', 'error');
        return;
      }
      const purchase = pickPayTarget(channel);
      if (!purchase) {
        notify?.(`No ${accountChannelLabel(channel)} purchase yet. Add an amount first.`, 'error');
        return;
      }
      setPayingChannel(channel);
      try {
        await addClientPayment(purchase.id, {
          clientId: purchase.clientId || purchase.clientName,
          amount,
          date: form.date,
          paymentMethod: String(form.paymentMethod || 'cash').toLowerCase(),
          notes: '',
        });
        setSimplePayForms((prev) => ({
          ...prev,
          [channel]: { ...emptySimplePayForm(), amount: '' },
        }));
        await reloadClientDetail();
        notify?.(`Payment of ${money(amount)} recorded on ${accountChannelLabel(channel)} account.`, 'success');
      } catch (err) {
        notify?.(err?.message || 'Payment failed.', 'error');
      } finally {
        setPayingChannel(null);
      }
    },
    [selectedClient, simplePayForms, addClientPayment, pickPayTarget, reloadClientDetail, notify]
  );

  const handleCreateClient = useCallback(async () => {
    const name = String(newClientForm.name || '').trim();
    if (!name) {
      notify?.('Enter client name.', 'error');
      return;
    }
    if (!createClientSupplierAccount || !createClientPurchase) {
      notify?.('Client setup is not available.', 'error');
      return;
    }
    setCreatingClient(true);
    try {
      for (const channel of ['GST', 'NON_GST']) {
        try {
          await createClientSupplierAccount({
            clientName: name,
            displayName: name,
            accountChannel: channel,
          });
        } catch {
          /* may already exist */
        }
      }
      const setups = [
        { channel: 'GST', amount: newClientForm.gstAmount, description: newClientForm.gstDescription },
        {
          channel: 'NON_GST',
          amount: newClientForm.nonGstAmount,
          description: newClientForm.nonGstDescription,
        },
      ];
      for (const { channel, amount, description } of setups) {
        const amt = Number(parseFloat(amount) || 0);
        if (amt > 0) {
          await createClientPurchase({
            clientName: name,
            purchaseDescription:
              String(description || '').trim() ||
              `${accountChannelLabel(channel)} opening balance`,
            totalAmount: amt,
            purchaseDate: localISODate(),
            accountChannel: channel,
          });
        }
      }
      await reloadAccounts();
      if (onClientDataRefresh) await onClientDataRefresh();
      setShowNewClientModal(false);
      setNewClientForm(emptyNewClientForm());
      const client = {
        key: name.toLowerCase(),
        name,
        purchaseCount: 0,
        totalAmount: 0,
        paidAmount: 0,
        pendingAmount: 0,
        lastPurchaseDate: null,
      };
      setSelectedClient(client);
      setPaymentsFilter('ALL');
      setIncreaseForms({ GST: emptyIncreaseForm(), NON_GST: emptyIncreaseForm() });
      setSimplePayForms({ GST: emptySimplePayForm(), NON_GST: emptySimplePayForm() });
      try {
        const summary = fetchClientAccountSummary ? await fetchClientAccountSummary(name) : null;
        setAccountSummary(summary && typeof summary === 'object' ? summary : null);
      } catch {
        setAccountSummary(null);
      }
      notify?.(`Client "${name}" created with GST and Non-GST accounts.`, 'success');
    } catch (err) {
      notify?.(err?.message || 'Could not create client.', 'error');
    } finally {
      setCreatingClient(false);
    }
  }, [
    newClientForm,
    createClientSupplierAccount,
    createClientPurchase,
    reloadAccounts,
    onClientDataRefresh,
    fetchClientAccountSummary,
    notify,
  ]);

  const openClient = useCallback(
    async (client) => {
      setSelectedClient(client);
      setAccountSummary(null);
      setPaymentsFilter('ALL');
      setIncreaseForms({ GST: emptyIncreaseForm(), NON_GST: emptyIncreaseForm() });
      setSimplePayForms({ GST: emptySimplePayForm(), NON_GST: emptySimplePayForm() });
      try {
        const summary = fetchClientAccountSummary
          ? await fetchClientAccountSummary(client.name)
          : null;
        setAccountSummary(summary && typeof summary === 'object' ? summary : null);
      } catch {
        setAccountSummary(null);
      }
    },
    [fetchClientAccountSummary]
  );

  const closeClient = () => {
    setSelectedClient(null);
    setAccountSummary(null);
    setPaymentsFilter('ALL');
  };

  const handleDownloadClientHistory = useCallback(async () => {
    if (!selectedClient || downloadingPdf || !fetchClientRunningLedger) return;
    setDownloadingPdf(true);
    try {
      const ledgerRows = await fetchClientRunningLedger(selectedClient.name);
      await downloadClientHistoryPdf({
        client: selectedClient,
        ledgerRows: Array.isArray(ledgerRows) ? ledgerRows : [],
        clientPurchases,
        accountSummary,
        getClientPurchasePaid,
        getClientPurchasePending,
      });
    } catch (err) {
      console.error('Client PDF download failed', err);
      notify?.('Could not download PDF.', 'error');
    } finally {
      setDownloadingPdf(false);
    }
  }, [
    selectedClient,
    downloadingPdf,
    fetchClientRunningLedger,
    clientPurchases,
    accountSummary,
    getClientPurchasePaid,
    getClientPurchasePending,
    notify,
  ]);

  if (selectedClient) {
    return (
      <div className="client-accounts-overview">
        <div className="client-accounts-overview__header">
          <button type="button" className="secondary-button client-list-back-btn" onClick={closeClient}>
            ← All clients
          </button>
          <div className="client-accounts-overview__heading">
            <p className="client-accounts-overview__crumb">
              Clients &gt; {selectedClient.name} &gt; Accounts
            </p>
            <h2 className="client-accounts-overview__title">Accounts Overview</h2>
            <p className="client-accounts-overview__subtitle">
              Manage GST and Non-GST accounts, add purchases on credit, and record payments.
            </p>
          </div>
          <button
            type="button"
            className="primary-button client-list-download-btn"
            onClick={handleDownloadClientHistory}
            disabled={downloadingPdf}
            title="Download statement as PDF"
          >
            {downloadingPdf ? 'Preparing PDF…' : '⬇ Download PDF'}
          </button>
        </div>

        <div className="client-accounts-overview__cards">
          {ACCOUNT_CHANNELS.map(({ id, title }) => {
            const summary = channelSummaryNumbers(
              id === 'GST' ? accountSummary?.gst : accountSummary?.nonGst
            );
            const hasActivity =
              summary.purchaseCount > 0 ||
              summary.pendingAmount > 0 ||
              summary.paidAmount > 0 ||
              (pendingPurchasesByChannel[id] || []).length > 0;
            const showSetupHint = !hasActivity;
            return (
              <SimpleChannelCard
                key={id}
                channel={id}
                title={title}
                summary={summary}
                showSetupHint={showSetupHint}
                increaseForm={increaseForms[id] || emptyIncreaseForm()}
                onIncreaseFormChange={(next) => setIncreaseForms((prev) => ({ ...prev, [id]: next }))}
                onIncrease={() => handleIncreaseChannel(id)}
                increasing={increasingChannel === id}
                payForm={simplePayForms[id] || emptySimplePayForm()}
                onPayFormChange={(next) => setSimplePayForms((prev) => ({ ...prev, [id]: next }))}
                onPay={() => handlePayChannel(id)}
                paying={payingChannel === id}
              />
            );
          })}
        </div>

        <section className="client-accounts-payments">
          <div className="client-accounts-payments__head">
            <h3>Payments for this client</h3>
            <div className="client-accounts-payments__filters" role="tablist" aria-label="Payment type filter">
              {[
                { id: 'ALL', label: 'All' },
                { id: 'GST', label: 'GST' },
                { id: 'NON_GST', label: 'Non-GST' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={paymentsFilter === tab.id}
                  className={`client-accounts-payments__filter${paymentsFilter === tab.id ? ' client-accounts-payments__filter--active' : ''}`}
                  onClick={() => setPaymentsFilter(tab.id)}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {clientPaymentsHistory.length === 0 ? (
            <p className="empty-state client-list-empty">No payments recorded for this client yet.</p>
          ) : (
            <div className="client-accounts-payments__table-wrap">
              <table className="client-accounts-payments__table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Type</th>
                    <th>Amount</th>
                    <th>Method</th>
                    <th>Purchase</th>
                    <th>Notes</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {clientPaymentsHistory.map((payment) => {
                    const amt = Number(parseFloat(payment?.amount || 0) || 0);
                    const purchaseLabel =
                      payment.purchase?.purchaseDescription ||
                      payment.purchaseDescription ||
                      'Client Payment';
                    return (
                      <tr key={payment.id || `${payment.clientPurchaseId}-${payment.date}-${amt}`}>
                        <td>{formatDdMmYy(payment.date || payment.createdAt)}</td>
                        <td>
                          <AccountTypeBadge channel={payment.accountChannel} />
                        </td>
                        <td className="client-accounts-payments__amount">{money(amt)}</td>
                        <td className="client-accounts-payments__method">
                          {String(payment.paymentMethod || 'cash').replace(/^\w/, (c) => c.toUpperCase())}
                        </td>
                        <td className="client-accounts-payments__purchase">{purchaseLabel}</td>
                        <td className="client-accounts-payments__notes">{payment.notes || '—'}</td>
                        <td className="client-accounts-payments__action">—</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    );
  }

  return (
    <div className="client-list-panel">
      <div className="client-list-panel__toolbar">
        <button
          type="button"
          className="primary-button"
          onClick={() => {
            setNewClientForm(emptyNewClientForm());
            setShowNewClientModal(true);
          }}
        >
          + New client
        </button>
      </div>

      {showNewClientModal && (
        <div
          className="modal-overlay"
          onClick={() => {
            if (!creatingClient) setShowNewClientModal(false);
          }}
        >
          <div className="modal-content client-new-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>New client</h3>
              <button
                type="button"
                className="modal-close"
                disabled={creatingClient}
                onClick={() => setShowNewClientModal(false)}
              >
                ×
              </button>
            </div>
            <div className="modal-body">
              <p className="client-new-modal__intro">
                Set up both <strong>GST</strong> and <strong>Non-GST</strong> accounts. You can leave amounts blank
                and add them later from the client page.
              </p>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleCreateClient();
                }}
              >
                <div className="form-group">
                  <label>Client name *</label>
                  <input
                    type="text"
                    value={newClientForm.name}
                    onChange={(e) => setNewClientForm({ ...newClientForm, name: e.target.value })}
                    placeholder="Supplier or client name"
                    required
                  />
                </div>
                <div className="client-new-modal__section">
                  <h4>GST account</h4>
                  <div className="form-row">
                    <div className="form-group">
                      <label>Opening amount (₹)</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={newClientForm.gstAmount}
                        onChange={(e) => setNewClientForm({ ...newClientForm, gstAmount: e.target.value })}
                        placeholder="Optional"
                      />
                    </div>
                    <div className="form-group">
                      <label>Description</label>
                      <input
                        type="text"
                        value={newClientForm.gstDescription}
                        onChange={(e) => setNewClientForm({ ...newClientForm, gstDescription: e.target.value })}
                        placeholder="What you bought (GST)"
                      />
                    </div>
                  </div>
                </div>
                <div className="client-new-modal__section">
                  <h4>Non-GST account</h4>
                  <div className="form-row">
                    <div className="form-group">
                      <label>Opening amount (₹)</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={newClientForm.nonGstAmount}
                        onChange={(e) => setNewClientForm({ ...newClientForm, nonGstAmount: e.target.value })}
                        placeholder="Optional"
                      />
                    </div>
                    <div className="form-group">
                      <label>Description</label>
                      <input
                        type="text"
                        value={newClientForm.nonGstDescription}
                        onChange={(e) => setNewClientForm({ ...newClientForm, nonGstDescription: e.target.value })}
                        placeholder="What you bought (Non-GST)"
                      />
                    </div>
                  </div>
                </div>
                <div className="form-actions">
                  <button
                    type="button"
                    className="secondary-button"
                    disabled={creatingClient}
                    onClick={() => setShowNewClientModal(false)}
                  >
                    Cancel
                  </button>
                  <button type="submit" className="primary-button" disabled={creatingClient}>
                    {creatingClient ? 'Creating…' : 'Create client'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {loadingAccounts && clients.length === 0 ? (
        <Loading message="Loading clients…" />
      ) : filteredClients.length === 0 ? (
        <p className="empty-state client-list-empty">
          {searchQuery
            ? 'No clients match your search.'
            : 'No clients yet. Click "+ New client" to set up GST and Non-GST accounts.'}
        </p>
      ) : (
        <div className="expenses-table-container client-purchases-table-wrap">
          <div className="sales-table-wrapper client-purchases-scroll-wrap">
            <table className="data-table expenses-table client-purchases-table client-list-table">
              <thead>
                <tr>
                  <th>Client name</th>
                  <th>Purchases</th>
                  <th>Last purchase</th>
                  <th>Total amount</th>
                  <th>Paid</th>
                  <th>Pending</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filteredClients.map((client) => (
                  <tr
                    key={client.key}
                    className="client-list-row"
                    onClick={() => openClient(client)}
                    tabIndex={0}
                    role="button"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        openClient(client);
                      }
                    }}
                  >
                    <td className="client-purchase-client-cell client-list-name">{client.name}</td>
                    <td>{client.purchaseCount}</td>
                    <td>{client.lastPurchaseDate ? formatDdMmYy(client.lastPurchaseDate) : '—'}</td>
                    <td className="amount-cell">{money(client.totalAmount)}</td>
                    <td className="amount-cell" style={{ color: '#28a745' }}>{money(client.paidAmount)}</td>
                    <td className="amount-cell" style={{ color: client.pendingAmount > 0 ? '#dc3545' : '#28a745' }}>
                      {money(client.pendingAmount)}
                    </td>
                    <td className="client-list-view-cell">
                      <span className="client-list-view-link">View history →</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
