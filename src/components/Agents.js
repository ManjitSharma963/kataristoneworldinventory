import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Toast } from 'primereact/toast';
import { isAdmin } from '../utils/api';
import {
  assignBillAgentCommission,
  createSalesAgent,
  deleteSalesAgent,
  fetchAgentCommissionHistory,
  fetchSalesAgents,
  updateAgentCommissionStatus,
  updateSalesAgent,
} from '../api/salesAgentsApi';
import './Agents.css';

const RUPEE = '\u20B9';
const AGENTS_PAGE_SIZE = 6;
const DEALS_PAGE_SIZE = 5;

const emptyForm = {
  name: '',
  phone: '',
  notes: '',
  active: true,
};

const emptyLinkBillForm = {
  billNumber: '',
  billType: 'GST',
  commissionType: 'PERCENTAGE',
  commissionValue: '',
  notes: '',
};

const normalizeBillNumberInput = (raw) => {
  let s = String(raw || '').trim();
  if (/^bill-/i.test(s)) s = s.replace(/^bill-/i, '');
  return s;
};

/** Digits only, max 10 (Indian mobile). */
const sanitizeAgentPhoneInput = (raw) => String(raw || '').replace(/\D/g, '').slice(0, 10);

const normalizeAgentPhoneForSave = (raw) => {
  const digits = sanitizeAgentPhoneInput(raw);
  return digits || null;
};

const AVATAR_COLORS = ['#2563eb', '#7c3aed', '#0891b2', '#059669', '#d97706', '#dc2626', '#4f46e5'];

const formatMoney = (n) =>
  `${RUPEE}${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

const formatMoneyPrecise = (n) =>
  `${RUPEE}${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const getInitials = (name) => {
  const parts = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
};

const avatarColor = (name) => {
  let hash = 0;
  for (let i = 0; i < String(name || '').length; i += 1) {
    hash = String(name).charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
};

const formatDisplayDate = (value) => {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

const statusClass = (status) => {
  const s = String(status || '').toUpperCase();
  if (s === 'PAID') return 'agents-badge agents-badge--paid';
  if (s === 'CANCELLED') return 'agents-badge agents-badge--cancelled';
  return 'agents-badge agents-badge--pending';
};

const agentActiveClass = (active) =>
  active !== false ? 'agents-badge agents-badge--active' : 'agents-badge agents-badge--inactive';

function KpiIcon({ type }) {
  const common = { width: 22, height: 22, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2 };
  if (type === 'agents') {
    return (
      <svg {...common}>
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    );
  }
  if (type === 'deals') {
    return (
      <svg {...common}>
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M22 21v-2a4 4 0 0 0-3-3.87M15 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    );
  }
  if (type === 'commission') {
    return (
      <svg {...common}>
        <line x1="12" y1="1" x2="12" y2="23" />
        <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
      </svg>
    );
  }
  if (type === 'paid') {
    return (
      <svg {...common}>
        <rect x="2" y="5" width="20" height="14" rx="2" />
        <line x1="2" y1="10" x2="22" y2="10" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

function DealHistoryTable({ rows, loading, onMarkPaid, showActions }) {
  if (loading) return <p className="agents-muted">Loading deal history…</p>;
  if (!rows.length) return <p className="agents-muted">No deals linked to this agent yet.</p>;

  return (
    <div className="table-scroll agents-table-wrap">
      <table className="agents-table">
        <thead>
          <tr>
            <th>Bill No.</th>
            <th>Date</th>
            <th>Customer</th>
            <th>Bill Total</th>
            <th>Commission</th>
            <th>Paid</th>
            <th>Status</th>
            <th>Notes</th>
            {showActions ? <th /> : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const isPaid = String(row.commissionStatus || '').toUpperCase() === 'PAID';
            const commissionLabel =
              row.commissionType === 'FIXED'
                ? formatMoneyPrecise(row.commissionAmount)
                : `${formatMoneyPrecise(row.commissionAmount)} (${row.commissionValue ?? 0}%)`;
            return (
              <tr key={`${row.billType}-${row.billId}`}>
                <td>
                  <span className="agents-bill-link">BILL-{row.billNumber}</span>
                </td>
                <td>{formatDisplayDate(row.billDate)}</td>
                <td>{row.customerName || '—'}</td>
                <td>{formatMoneyPrecise(row.billTotalAmount)}</td>
                <td>{commissionLabel}</td>
                <td>{isPaid ? formatMoneyPrecise(row.commissionAmount) : `${RUPEE}0.00`}</td>
                <td>
                  <span className={statusClass(row.commissionStatus)}>
                    {row.commissionStatus || 'PENDING'}
                  </span>
                </td>
                <td className="agents-notes-cell">{row.commissionNotes || '—'}</td>
                {showActions ? (
                  <td>
                    {String(row.commissionStatus || '').toUpperCase() === 'PENDING' ? (
                      <button type="button" className="agents-link-btn" onClick={() => onMarkPaid(row)}>
                        Mark paid
                      </button>
                    ) : null}
                  </td>
                ) : null}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function Agents() {
  const toast = React.useRef(null);
  const [agents, setAgents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState(null);
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [showFormModal, setShowFormModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [agentPage, setAgentPage] = useState(1);
  const [detailTab, setDetailTab] = useState('deal-history');
  const [dealsPage, setDealsPage] = useState(1);
  const [viewAllDeals, setViewAllDeals] = useState(false);
  const [showLinkBillModal, setShowLinkBillModal] = useState(false);
  const [linkBillForm, setLinkBillForm] = useState(emptyLinkBillForm);
  const [linkBillSubmitting, setLinkBillSubmitting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletingAgent, setDeletingAgent] = useState(false);

  const selectedAgent = useMemo(
    () => agents.find((a) => a.id === selectedId) || null,
    [agents, selectedId]
  );

  const globalStats = useMemo(() => {
    const activeAgents = agents.filter((a) => a.active !== false);
    return {
      totalAgents: activeAgents.length,
      totalDeals: agents.reduce((sum, a) => sum + (Number(a.totalDeals) || 0), 0),
      totalCommission: agents.reduce(
        (sum, a) => sum + (Number(a.totalCommissionPending) || 0) + (Number(a.totalCommissionPaid) || 0),
        0
      ),
      totalPaid: agents.reduce((sum, a) => sum + (Number(a.totalCommissionPaid) || 0), 0),
      pendingCommission: agents.reduce((sum, a) => sum + (Number(a.totalCommissionPending) || 0), 0),
    };
  }, [agents]);

  const filteredAgents = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return agents.filter((agent) => {
      if (statusFilter === 'ACTIVE' && agent.active === false) return false;
      if (statusFilter === 'INACTIVE' && agent.active !== false) return false;
      if (!q) return true;
      const hay = `${agent.name || ''} ${agent.phone || ''}`.toLowerCase();
      return hay.includes(q);
    });
  }, [agents, searchQuery, statusFilter]);

  const agentPageCount = Math.max(1, Math.ceil(filteredAgents.length / AGENTS_PAGE_SIZE));
  const pagedAgents = useMemo(() => {
    const start = (agentPage - 1) * AGENTS_PAGE_SIZE;
    return filteredAgents.slice(start, start + AGENTS_PAGE_SIZE);
  }, [filteredAgents, agentPage]);

  const paidHistory = useMemo(
    () => history.filter((row) => String(row.commissionStatus || '').toUpperCase() === 'PAID'),
    [history]
  );

  const visibleDeals = useMemo(() => {
    if (detailTab === 'payments') return paidHistory;
    return history;
  }, [detailTab, history, paidHistory]);

  const pagedDeals = useMemo(() => {
    if (viewAllDeals) return visibleDeals;
    const start = (dealsPage - 1) * DEALS_PAGE_SIZE;
    return visibleDeals.slice(start, start + DEALS_PAGE_SIZE);
  }, [visibleDeals, dealsPage, viewAllDeals]);

  const agentTotalCommission = selectedAgent
    ? (Number(selectedAgent.totalCommissionPending) || 0) + (Number(selectedAgent.totalCommissionPaid) || 0)
    : 0;

  const loadAgents = useCallback(async () => {
    try {
      setLoading(true);
      const list = await fetchSalesAgents(false);
      setAgents(list);
      setSelectedId((prev) => {
        if (prev != null && list.some((a) => a.id === prev)) return prev;
        return list[0]?.id ?? null;
      });
    } catch (e) {
      toast.current?.show({ severity: 'error', summary: 'Error', detail: e.message, life: 4000 });
    } finally {
      setLoading(false);
    }
  }, []);

  const loadHistory = useCallback(async (agentId) => {
    if (!agentId) {
      setHistory([]);
      return;
    }
    try {
      setHistoryLoading(true);
      const rows = await fetchAgentCommissionHistory(agentId);
      setHistory(rows);
    } catch (e) {
      toast.current?.show({ severity: 'error', summary: 'Error', detail: e.message, life: 4000 });
      setHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAgents();
  }, [loadAgents]);

  useEffect(() => {
    loadHistory(selectedId);
    setDealsPage(1);
    setViewAllDeals(false);
  }, [selectedId, loadHistory]);

  useEffect(() => {
    setAgentPage(1);
  }, [searchQuery, statusFilter]);

  const resetForm = () => {
    setForm(emptyForm);
    setEditingId(null);
  };

  const openAddModal = () => {
    resetForm();
    setShowFormModal(true);
  };

  const startEdit = (agent) => {
    setEditingId(agent.id);
    setForm({
      name: agent.name || '',
      phone: sanitizeAgentPhoneInput(agent.phone || ''),
      notes: agent.notes || '',
      active: agent.active !== false,
    });
    setShowFormModal(true);
  };

  const closeFormModal = () => {
    setShowFormModal(false);
    resetForm();
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) {
      toast.current?.show({ severity: 'warn', summary: 'Validation', detail: 'Agent name is required', life: 3000 });
      return;
    }
    const phone = normalizeAgentPhoneForSave(form.phone);
    if (form.phone.trim() && phone && phone.length !== 10) {
      toast.current?.show({
        severity: 'warn',
        summary: 'Validation',
        detail: 'Phone must be exactly 10 digits',
        life: 3000,
      });
      return;
    }
    const payload = {
      name: form.name.trim(),
      phone,
      notes: form.notes.trim() || null,
      active: form.active,
    };
    try {
      setSaving(true);
      if (editingId) {
        await updateSalesAgent(editingId, payload);
        toast.current?.show({ severity: 'success', summary: 'Updated', detail: 'Agent updated', life: 2500 });
      } else {
        const created = await createSalesAgent(payload);
        toast.current?.show({ severity: 'success', summary: 'Created', detail: 'Agent added', life: 2500 });
        setSelectedId(created.id);
      }
      closeFormModal();
      await loadAgents();
      if (selectedId || editingId) {
        await loadHistory(editingId || selectedId);
      }
    } catch (err) {
      toast.current?.show({ severity: 'error', summary: 'Error', detail: err.message, life: 5000 });
    } finally {
      setSaving(false);
    }
  };

  const markCommissionPaid = async (row) => {
    try {
      const result = await updateAgentCommissionStatus({
        billType: row.billType,
        billId: row.billId,
        status: 'PAID',
      });
      const detail = result?.expenseCreated
        ? `Commission marked paid — expense #${result.expenseId} posted`
        : result?.expenseId
          ? `Commission marked paid (expense #${result.expenseId} already existed)`
          : 'Commission marked as paid';
      toast.current?.show({ severity: 'success', summary: 'Paid', detail, life: 3500 });
      await loadHistory(selectedId);
      await loadAgents();
    } catch (err) {
      toast.current?.show({ severity: 'error', summary: 'Error', detail: err.message, life: 5000 });
    }
  };

  const openLinkBillModal = () => {
    if (!selectedAgent) return;
    setLinkBillForm({
      billNumber: '',
      billType: 'GST',
      commissionType: 'PERCENTAGE',
      commissionValue: '',
      notes: '',
    });
    setShowLinkBillModal(true);
  };

  const handleLinkBill = async (e) => {
    e.preventDefault();
    if (!selectedAgent) return;
    const billNumber = normalizeBillNumberInput(linkBillForm.billNumber);
    if (!billNumber) {
      toast.current?.show({
        severity: 'warn',
        summary: 'Validation',
        detail: 'Enter a bill number',
        life: 3000,
      });
      return;
    }
    const val = Number(parseFloat(linkBillForm.commissionValue));
    if (!Number.isFinite(val) || val <= 0) {
      toast.current?.show({
        severity: 'warn',
        summary: 'Validation',
        detail: 'Enter a valid commission value',
        life: 3000,
      });
      return;
    }
    try {
      setLinkBillSubmitting(true);
      await assignBillAgentCommission({
        billType: linkBillForm.billType,
        billNumber,
        agentId: selectedAgent.id,
        agentCommissionType: linkBillForm.commissionType,
        agentCommissionValue: val,
        agentCommissionNotes: linkBillForm.notes.trim().slice(0, 2000) || null,
        clearAgent: false,
      });
      toast.current?.show({
        severity: 'success',
        summary: 'Linked',
        detail: `Bill linked to ${selectedAgent.name}`,
        life: 3000,
      });
      setShowLinkBillModal(false);
      setDetailTab('deal-history');
      await loadHistory(selectedId);
      await loadAgents();
    } catch (err) {
      toast.current?.show({ severity: 'error', summary: 'Error', detail: err.message, life: 5000 });
    } finally {
      setLinkBillSubmitting(false);
    }
  };

  const handleDeleteAgent = async () => {
    if (!selectedAgent) return;
    const name = selectedAgent.name;
    try {
      setDeletingAgent(true);
      await deleteSalesAgent(selectedAgent.id);
      setShowDeleteConfirm(false);
      await loadAgents();
      toast.current?.show({
        severity: 'success',
        summary: 'Deleted',
        detail: `${name} removed`,
        life: 3000,
      });
    } catch (err) {
      toast.current?.show({ severity: 'error', summary: 'Error', detail: err.message, life: 5000 });
    } finally {
      setDeletingAgent(false);
    }
  };

  const dealsFrom = visibleDeals.length === 0 ? 0 : viewAllDeals ? 1 : (dealsPage - 1) * DEALS_PAGE_SIZE + 1;
  const dealsTo = viewAllDeals
    ? visibleDeals.length
    : Math.min(dealsPage * DEALS_PAGE_SIZE, visibleDeals.length);

  return (
    <div className="page-container page-container--full agents-page">
      <Toast ref={toast} />

      <header className="page-header agents-page-header">
        <div>
          <h1 className="page-title">Sales Agents</h1>
          <p className="page-subtitle agents-subtitle">
            Manage your sales agents and track their deals and commission payouts.
          </p>
        </div>
        {isAdmin() ? (
          <button type="button" className="primary-button agents-add-btn" onClick={openAddModal}>
            + Add New Agent
          </button>
        ) : null}
      </header>

      <div className="summary-card-grid agents-kpi-row">
        <div className="summary-card agents-kpi-card">
          <div className="agents-kpi-icon agents-kpi-icon--blue">
            <KpiIcon type="agents" />
          </div>
          <div>
            <div className="summary-card__label agents-kpi-label">Total Agents</div>
            <div className="summary-card__value agents-kpi-value">{globalStats.totalAgents}</div>
            <div className="summary-card__hint agents-kpi-hint">Active agents</div>
          </div>
        </div>
        <div className="summary-card agents-kpi-card">
          <div className="agents-kpi-icon agents-kpi-icon--purple">
            <KpiIcon type="deals" />
          </div>
          <div>
            <div className="summary-card__label agents-kpi-label">Total Deals</div>
            <div className="summary-card__value agents-kpi-value">{globalStats.totalDeals}</div>
            <div className="summary-card__hint agents-kpi-hint">All time deals</div>
          </div>
        </div>
        <div className="summary-card agents-kpi-card">
          <div className="agents-kpi-icon agents-kpi-icon--green">
            <KpiIcon type="commission" />
          </div>
          <div>
            <div className="summary-card__label agents-kpi-label">Total Commission</div>
            <div className="summary-card__value agents-kpi-value">{formatMoney(globalStats.totalCommission)}</div>
            <div className="summary-card__hint agents-kpi-hint">All time earned</div>
          </div>
        </div>
        <div className="summary-card agents-kpi-card">
          <div className="agents-kpi-icon agents-kpi-icon--teal">
            <KpiIcon type="paid" />
          </div>
          <div>
            <div className="summary-card__label agents-kpi-label">Total Paid</div>
            <div className="summary-card__value agents-kpi-value">{formatMoney(globalStats.totalPaid)}</div>
            <div className="summary-card__hint agents-kpi-hint">Total paid to agents</div>
          </div>
        </div>
        <div className="summary-card agents-kpi-card">
          <div className="agents-kpi-icon agents-kpi-icon--amber">
            <KpiIcon type="pending" />
          </div>
          <div>
            <div className="summary-card__label agents-kpi-label">Pending Commission</div>
            <div className="summary-card__value agents-kpi-value agents-kpi-value--amber">
              {formatMoney(globalStats.pendingCommission)}
            </div>
            <div className="summary-card__hint agents-kpi-hint">Awaiting payment</div>
          </div>
        </div>
      </div>

      <div className="agents-main-layout">
        <aside className="section-card agents-sidebar">
          <h3 className="agents-sidebar-title">Agents</h3>
          <div className="agents-sidebar-controls">
            <input
              type="search"
              className="agents-search"
              placeholder="Search agents by name or phone…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <select
              className="agents-filter"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="ALL">All Status</option>
              <option value="ACTIVE">Active</option>
              <option value="INACTIVE">Inactive</option>
            </select>
          </div>

          {loading ? <p className="agents-muted">Loading agents…</p> : null}
          <ul className="agents-sidebar-list">
            {pagedAgents.map((agent) => (
              <li key={agent.id}>
                <button
                  type="button"
                  className={`agents-sidebar-item ${selectedId === agent.id ? 'active' : ''}`}
                  onClick={() => setSelectedId(agent.id)}
                >
                  <span
                    className="agents-avatar agents-avatar--sm"
                    style={{ backgroundColor: avatarColor(agent.name) }}
                  >
                    {getInitials(agent.name)}
                  </span>
                  <span className="agents-sidebar-item-body">
                    <span className="agents-sidebar-item-top">
                      <span className="agents-sidebar-name">{agent.name}</span>
                      <span className={agentActiveClass(agent.active)}>
                        {agent.active !== false ? 'Active' : 'Inactive'}
                      </span>
                    </span>
                    <span className="agents-sidebar-phone">{agent.phone || '—'}</span>
                    <span className="agents-sidebar-item-bottom">
                      <span className="agents-sidebar-pending">
                        Pending {formatMoney(agent.totalCommissionPending)}
                      </span>
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {!loading && filteredAgents.length === 0 ? (
            <p className="agents-muted">No agents match your search.</p>
          ) : null}

          {filteredAgents.length > 0 ? (
            <div className="agents-pagination">
              <span className="agents-pagination-info">
                Showing {(agentPage - 1) * AGENTS_PAGE_SIZE + 1} to{' '}
                {Math.min(agentPage * AGENTS_PAGE_SIZE, filteredAgents.length)} of {filteredAgents.length}{' '}
                agents
              </span>
              <div className="agents-pagination-btns">
                <button
                  type="button"
                  className="agents-page-btn"
                  disabled={agentPage <= 1}
                  onClick={() => setAgentPage((p) => Math.max(1, p - 1))}
                >
                  ‹
                </button>
                <button
                  type="button"
                  className="agents-page-btn"
                  disabled={agentPage >= agentPageCount}
                  onClick={() => setAgentPage((p) => Math.min(agentPageCount, p + 1))}
                >
                  ›
                </button>
              </div>
            </div>
          ) : null}
        </aside>

        <main className="section-card agents-detail">
          {!selectedAgent ? (
            <div className="agents-empty-detail">
              <p>Select an agent from the list or add a new one to get started.</p>
            </div>
          ) : (
            <>
              <div className="agents-profile-header">
                <div className="agents-profile-left">
                  <span
                    className="agents-avatar agents-avatar--lg"
                    style={{ backgroundColor: avatarColor(selectedAgent.name) }}
                  >
                    {getInitials(selectedAgent.name)}
                  </span>
                  <div>
                    <div className="agents-profile-name-row">
                      <h3>{selectedAgent.name}</h3>
                      <span className={agentActiveClass(selectedAgent.active)}>
                        {selectedAgent.active !== false ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                    <div className="agents-profile-contact">
                      {selectedAgent.phone ? (
                        <span>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
                          </svg>
                          {selectedAgent.phone}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>
                <div className="agents-profile-actions">
                  <span className="agents-member-since">
                    Member since {formatDisplayDate(selectedAgent.createdAt)}
                  </span>
                  <div className="agents-profile-actions-row">
                    <button type="button" className="primary-button agents-link-bill-btn" onClick={openLinkBillModal}>
                      + Link Bill
                    </button>
                    {isAdmin() ? (
                      <>
                        <button type="button" className="agents-edit-btn" onClick={() => startEdit(selectedAgent)}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                          </svg>
                          Edit Agent
                        </button>
                        <button
                          type="button"
                          className="agents-delete-btn"
                          onClick={() => setShowDeleteConfirm(true)}
                        >
                          Delete Agent
                        </button>
                      </>
                    ) : null}
                  </div>
                </div>
              </div>

              <div className="agents-agent-kpi-row agents-agent-kpi-row--4">
                <div className="agents-agent-kpi">
                  <span>Total Deals</span>
                  <strong>{selectedAgent.totalDeals || 0}</strong>
                </div>
                <div className="agents-agent-kpi">
                  <span>Total Commission</span>
                  <strong>{formatMoney(agentTotalCommission)}</strong>
                </div>
                <div className="agents-agent-kpi">
                  <span>Total Paid</span>
                  <strong>{formatMoney(selectedAgent.totalCommissionPaid)}</strong>
                </div>
                <div className="agents-agent-kpi agents-agent-kpi--pending">
                  <span>Pending</span>
                  <strong>{formatMoney(selectedAgent.totalCommissionPending)}</strong>
                </div>
              </div>

              <div className="agents-tabs">
                {[
                  { id: 'deal-history', label: 'Deal History' },
                  { id: 'payments', label: 'Payments' },
                  { id: 'summary', label: 'Summary' },
                  { id: 'notes', label: 'Notes' },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    className={`agents-tab ${detailTab === tab.id ? 'active' : ''}`}
                    onClick={() => {
                      setDetailTab(tab.id);
                      setDealsPage(1);
                      setViewAllDeals(false);
                    }}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <div className="agents-tab-panel">
                {detailTab === 'deal-history' || detailTab === 'payments' ? (
                  <>
                    <DealHistoryTable
                      rows={pagedDeals}
                      loading={historyLoading}
                      onMarkPaid={markCommissionPaid}
                      showActions={detailTab === 'deal-history'}
                    />
                    {!historyLoading && visibleDeals.length > 0 ? (
                      <div className="agents-table-footer">
                        <span>
                          Showing {dealsFrom} to {dealsTo} of {visibleDeals.length} deals
                        </span>
                        {!viewAllDeals && visibleDeals.length > DEALS_PAGE_SIZE ? (
                          <button
                            type="button"
                            className="agents-view-all-btn"
                            onClick={() => setViewAllDeals(true)}
                          >
                            View All Deals
                          </button>
                        ) : viewAllDeals ? (
                          <button
                            type="button"
                            className="agents-view-all-btn"
                            onClick={() => {
                              setViewAllDeals(false);
                              setDealsPage(1);
                            }}
                          >
                            Show Less
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                  </>
                ) : null}

                {detailTab === 'summary' ? (
                  <div className="agents-summary-panel">
                    <div className="agents-summary-grid">
                      <div>
                        <span className="agents-summary-label">Total deals</span>
                        <strong>{selectedAgent.totalDeals || 0}</strong>
                      </div>
                      <div>
                        <span className="agents-summary-label">Commission earned</span>
                        <strong>{formatMoneyPrecise(agentTotalCommission)}</strong>
                      </div>
                      <div>
                        <span className="agents-summary-label">Paid to agent</span>
                        <strong>{formatMoneyPrecise(selectedAgent.totalCommissionPaid)}</strong>
                      </div>
                      <div>
                        <span className="agents-summary-label">Still pending</span>
                        <strong className="agents-text-amber">
                          {formatMoneyPrecise(selectedAgent.totalCommissionPending)}
                        </strong>
                      </div>
                      <div>
                        <span className="agents-summary-label">Paid deals</span>
                        <strong>{paidHistory.length}</strong>
                      </div>
                      <div>
                        <span className="agents-summary-label">Pending deals</span>
                        <strong>
                          {history.filter((r) => String(r.commissionStatus).toUpperCase() === 'PENDING').length}
                        </strong>
                      </div>
                    </div>
                  </div>
                ) : null}

                {detailTab === 'notes' ? (
                  <div className="agents-notes-panel">
                    {selectedAgent.notes ? (
                      <p>{selectedAgent.notes}</p>
                    ) : (
                      <p className="agents-muted">No notes for this agent.</p>
                    )}
                    {isAdmin() ? (
                      <button type="button" className="agents-edit-btn" onClick={() => startEdit(selectedAgent)}>
                        {selectedAgent.notes ? 'Edit notes' : 'Add notes'}
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </>
          )}
        </main>
      </div>

      {showFormModal && isAdmin() ? (
        <div className="agents-modal-overlay" onClick={closeFormModal}>
          <div className="agents-modal" onClick={(e) => e.stopPropagation()}>
            <div className="agents-modal-header">
              <h3>{editingId ? 'Edit Agent' : 'Add New Agent'}</h3>
              <button type="button" className="agents-modal-close" onClick={closeFormModal} aria-label="Close">
                ×
              </button>
            </div>
            <form className="agents-form" onSubmit={handleSave}>
              <label>
                Name *
                <input
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="Rajesh Kumar"
                />
              </label>
              <label>
                Phone
                <input
                  type="tel"
                  inputMode="numeric"
                  maxLength={10}
                  value={form.phone}
                  onChange={(e) => setForm((f) => ({ ...f, phone: sanitizeAgentPhoneInput(e.target.value) }))}
                  placeholder="10-digit mobile"
                />
              </label>
              <label>
                Notes
                <textarea
                  rows={3}
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  placeholder="Optional notes about this agent…"
                />
              </label>
              <label className="agents-checkbox">
                <input
                  type="checkbox"
                  checked={form.active}
                  onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))}
                />
                Active
              </label>
              <div className="agents-form-actions">
                <button type="button" className="secondary-button" onClick={closeFormModal}>
                  Cancel
                </button>
                <button type="submit" className="primary-button" disabled={saving}>
                  {saving ? 'Saving…' : editingId ? 'Update Agent' : 'Add Agent'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {showLinkBillModal && selectedAgent ? (
        <div className="agents-modal-overlay" onClick={() => setShowLinkBillModal(false)}>
          <div className="agents-modal" onClick={(e) => e.stopPropagation()}>
            <div className="agents-modal-header">
              <h3>Link Bill to {selectedAgent.name}</h3>
              <button
                type="button"
                className="agents-modal-close"
                onClick={() => setShowLinkBillModal(false)}
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <form className="agents-form" onSubmit={handleLinkBill}>
              <p className="agents-modal-hint">
                Link an existing bill that was created without an agent. Commission is calculated on the bill total.
              </p>
              <div className="agents-form-row">
                <label>
                  Bill number *
                  <input
                    value={linkBillForm.billNumber}
                    onChange={(e) => setLinkBillForm((f) => ({ ...f, billNumber: e.target.value }))}
                    placeholder="e.g. 1025"
                    autoFocus
                  />
                </label>
                <label>
                  Bill type *
                  <select
                    value={linkBillForm.billType}
                    onChange={(e) => setLinkBillForm((f) => ({ ...f, billType: e.target.value }))}
                  >
                    <option value="GST">GST</option>
                    <option value="NON_GST">Non-GST</option>
                  </select>
                </label>
              </div>
              <div className="agents-form-row">
                <label>
                  Commission type
                  <select
                    value={linkBillForm.commissionType}
                    onChange={(e) => setLinkBillForm((f) => ({ ...f, commissionType: e.target.value }))}
                  >
                    <option value="PERCENTAGE">Percentage</option>
                    <option value="FIXED">Fixed amount</option>
                  </select>
                </label>
                <label>
                  Commission {linkBillForm.commissionType === 'FIXED' ? `( ${RUPEE} )` : '( % )'}
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={linkBillForm.commissionValue}
                    onChange={(e) => setLinkBillForm((f) => ({ ...f, commissionValue: e.target.value }))}
                  />
                </label>
              </div>
              <label>
                Notes
                <textarea
                  rows={2}
                  value={linkBillForm.notes}
                  onChange={(e) => setLinkBillForm((f) => ({ ...f, notes: e.target.value }))}
                  placeholder="Customer brought by agent…"
                />
              </label>
              <div className="agents-form-actions">
                <button type="button" className="secondary-button" onClick={() => setShowLinkBillModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="primary-button" disabled={linkBillSubmitting}>
                  {linkBillSubmitting ? 'Linking…' : 'Link Bill'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {showDeleteConfirm && selectedAgent && isAdmin() ? (
        <div className="agents-modal-overlay" onClick={() => setShowDeleteConfirm(false)}>
          <div className="agents-modal agents-modal--sm" onClick={(e) => e.stopPropagation()}>
            <div className="agents-modal-header">
              <h3>Delete Agent</h3>
              <button
                type="button"
                className="agents-modal-close"
                onClick={() => setShowDeleteConfirm(false)}
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <div className="agents-delete-body">
              <p>
                Delete <strong>{selectedAgent.name}</strong>? This cannot be undone.
              </p>
              {Number(selectedAgent.totalDeals) > 0 ? (
                <p className="agents-delete-warning">
                  This agent has {selectedAgent.totalDeals} linked bill(s). Remove bill assignments first, or set
                  the agent inactive instead.
                </p>
              ) : (
                <p className="agents-muted">No bills are linked to this agent.</p>
              )}
              <div className="agents-form-actions">
                <button type="button" className="secondary-button" onClick={() => setShowDeleteConfirm(false)}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-danger"
                  disabled={deletingAgent || Number(selectedAgent.totalDeals) > 0}
                  onClick={handleDeleteAgent}
                >
                  {deletingAgent ? 'Deleting…' : 'Delete Agent'}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
