import React from 'react';

const ExpensesHeader = ({ budgetInHand, onOpenBudgetModal, onAddExpense }) => {
  return (
    <div className="expenses-header">
      <h2>Daily Expenses Management</h2>
      <div className="expenses-header-actions">
        <button type="button" className="btn btn-secondary" onClick={() => onOpenBudgetModal(budgetInHand)}>
          Add daily budget
        </button>
        <button className="btn btn-primary" onClick={onAddExpense}>
          + Add Expense
        </button>
      </div>
    </div>
  );
};

export default ExpensesHeader;

