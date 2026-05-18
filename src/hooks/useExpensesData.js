import { useCallback, useState } from 'react';

const getLocalDateString = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export const useExpensesData = ({ apiFetchExpenses, apiGetLedgerTransactions }) => {
  const [expenses, setExpenses] = useState([]);
  const [loadingExpenses, setLoadingExpenses] = useState(false);
  const [apiError, setApiError] = useState(false);
  const [clientLedgerFeedRows, setClientLedgerFeedRows] = useState([]);

  const loadExpenses = useCallback(async () => {
    setLoadingExpenses(true);
    setApiError(false);
    try {
      const allExpenses = await apiFetchExpenses();
      const list = Array.isArray(allExpenses)
        ? allExpenses
        : Array.isArray(allExpenses?.data)
          ? allExpenses.data
          : [];
      setExpenses(list);
    } catch (error) {
      console.error('Error loading expenses from API:', error);
      setApiError(true);
      setExpenses([]);
    }
    try {
      const from = new Date();
      from.setDate(from.getDate() - 400);
      const fromStr = from.toISOString().slice(0, 10);
      const toStr = getLocalDateString();
      const raw = await apiGetLedgerTransactions({ from: fromStr, to: toStr, limit: 1000 });
      const arr = Array.isArray(raw) ? raw : Array.isArray(raw?.data) ? raw.data : [];
      const clientOut = arr.filter((r) => {
        const tt = String(r?.txnType ?? r?.txn_type ?? '').toUpperCase();
        const src = String(r?.source ?? '').toUpperCase();
        const isOutflow = tt === 'DEBIT' || tt === 'OUT';
        const isClientPayment =
          src === 'CLIENT_OUT' ||
          src === 'CLIENT' ||
          src === 'CLIENT_PAYMENT' ||
          src.includes('CLIENT');
        return isOutflow && isClientPayment;
      });
      setClientLedgerFeedRows(clientOut);
    } catch (e) {
      console.warn('Could not load unified ledger for expense feed:', e);
      setClientLedgerFeedRows([]);
    } finally {
      setLoadingExpenses(false);
    }
  }, [apiFetchExpenses, apiGetLedgerTransactions]);

  return {
    expenses,
    setExpenses,
    loadingExpenses,
    apiError,
    setApiError,
    clientLedgerFeedRows,
    loadExpenses
  };
};

