import React from 'react';

const ExpensesHeader = ({ budgetInHand, onOpenBudgetModal, onAddExpense }) => {
  return (
    <header className="page-header expenses-header">
      <div>
        <h1 className="page-title">Daily Expenses Management</h1>
        <p className="page-subtitle">Track expenses, payroll, loans, and client ledger</p>
      </div>
      <div className="page-actions expenses-header-actions">
        <button type="button" className="secondary-button" onClick={() => onOpenBudgetModal(budgetInHand)}>
          Add daily budget
        </button>
        <button type="button" className="primary-button" onClick={onAddExpense}>
          + Add Expense
        </button>
      </div>
    </header>
  );
};

export default ExpensesHeader;

