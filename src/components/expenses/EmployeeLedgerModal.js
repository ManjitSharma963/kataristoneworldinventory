import React from 'react';
import Loading from '../Loading';

function formatEmployeeLedgerPaymentMode(row) {
  const raw = row?.paymentMode ?? row?.payment_mode;
  if (raw == null || raw === '') return '—';
  const m = String(raw).toUpperCase().trim();
  const labels = {
    CASH: 'Cash',
    UPI: 'UPI',
    BANK_TRANSFER: 'Bank transfer',
    CHEQUE: 'Cheque',
    WALLET: 'Wallet',
    OTHER: 'Other',
  };
  return labels[m] || String(raw).replace(/_/g, ' ');
}

const EmployeeLedgerModal = ({
  open,
  selectedEmployee,
  onClose,
  employeeLedgerRange,
  setEmployeeLedgerRange,
  loadEmployeeLedger,
  employeeLedgerLoading,
  computeLedgerView,
  employeeLedgerRows,
  payrollSummaryByEmpId,
  countMonthsInRangeInclusive,
  getLedgerEventLabel
}) => {
  if (!open || !selectedEmployee) return null;

  const ledger = computeLedgerView(employeeLedgerRows);
  const summary = payrollSummaryByEmpId[String(selectedEmployee.id)] || null;
  const pending = Number(summary?.salaryRemaining ?? 0) || 0;
  const currentMonthPending = Math.max(0, pending);
  const currentMonthOverpaid = Math.max(0, -pending);
  const monthlySalary = Number(parseFloat(selectedEmployee?.salaryAmount || 0) || 0) || 0;
  const rangeMonths = countMonthsInRangeInclusive(employeeLedgerRange.from, employeeLedgerRange.to);
  const salaryDeservedInRange = monthlySalary * rangeMonths;
  const salaryCoveredInRange = (Number(ledger.advanceApplied) || 0) + (Number(ledger.salaryPaid) || 0);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content employee-ledger-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Employee Ledger - {selectedEmployee.employeeName}</h3>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <div className="form-row">
            <div className="form-group">
              <label>From</label>
              <input
                type="date"
                value={employeeLedgerRange.from}
                onChange={(e) => setEmployeeLedgerRange((prev) => ({ ...prev, from: e.target.value }))}
              />
            </div>
            <div className="form-group">
              <label>To</label>
              <input
                type="date"
                value={employeeLedgerRange.to}
                onChange={(e) => setEmployeeLedgerRange((prev) => ({ ...prev, to: e.target.value }))}
              />
            </div>
            <div className="form-group ledger-filter-actions">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => loadEmployeeLedger(selectedEmployee.id, employeeLedgerRange)}
                disabled={employeeLedgerLoading}
              >
                {employeeLedgerLoading ? 'Loading...' : 'Load Ledger'}
              </button>
            </div>
          </div>

          <div className="employee-ledger-kpis">
            <div className="employee-ledger-kpi-card">
              <h3>Total Taken (Advance)</h3>
              <p className="kpi-value">₹{ledger.advanceGiven.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
            </div>
            <div className="employee-ledger-kpi-card">
              <h3>Salary Deserved (Range)</h3>
              <p className="kpi-value">₹{salaryDeservedInRange.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
              <p className="kpi-hint">{rangeMonths} month(s) × ₹{monthlySalary.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
            </div>
            <div className="employee-ledger-kpi-card">
              <h3>Covered In Range</h3>
              <p className="kpi-value">₹{salaryCoveredInRange.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
              <p className="kpi-hint">Advance applied + salary paid</p>
            </div>
            <div className="employee-ledger-kpi-card">
              <h3>Left (Current Month)</h3>
              <p className="kpi-value kpi-danger">₹{currentMonthPending.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
            </div>
            <div className="employee-ledger-kpi-card">
              <h3>Overpaid / Extra Advance</h3>
              <p className="kpi-value kpi-warn">₹{currentMonthOverpaid.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
              <p className="kpi-hint">Carries to next month</p>
            </div>
            <div className="employee-ledger-kpi-card">
              <h3>Advance Balance</h3>
              <p className="kpi-value">₹{ledger.netAdvanceBalance.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
              <p className="kpi-hint">Given - applied</p>
            </div>
          </div>

          {employeeLedgerLoading ? (
            <Loading message="Loading employee ledger..." />
          ) : ledger.lines.length === 0 ? (
            <div className="empty-state-wrapper">
              <span className="empty-icon">📒</span>
              <p className="empty-state">No ledger entries found for selected range.</p>
            </div>
          ) : (
            <div className="sales-table-wrapper employee-ledger-table-wrap">
              <table className="data-table expenses-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Month</th>
                    <th>Type</th>
                    <th>Paid Via</th>
                    <th>Amount</th>
                    <th>Running Advance Balance</th>
                    <th>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {ledger.lines.map((row) => (
                    <tr key={row.id}>
                      <td>{row.eventDate ? new Date(row.eventDate).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '-'}</td>
                      <td>{row.month || '-'}</td>
                      <td>{getLedgerEventLabel(row.eventType)}</td>
                      <td>{formatEmployeeLedgerPaymentMode(row)}</td>
                      <td>₹{(Number(row._amount) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                      <td>₹{(Number(row._runningAdvanceBalance) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                      <td>{row.notes || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default EmployeeLedgerModal;

