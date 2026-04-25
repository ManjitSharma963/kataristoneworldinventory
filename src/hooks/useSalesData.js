import { useCallback, useEffect, useState } from 'react';
import { fetchSalesBills } from '../api/salesApi';
import { fetchSalesPaymentModeSummary } from '../utils/api';

const toIsoDate = (value) => {
  const d = value instanceof Date ? value : (value ? new Date(value) : null);
  if (!d || Number.isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

export const useSalesData = (dateFrom, dateTo) => {
  const [sales, setSales] = useState([]);
  const [loading, setLoading] = useState(true);
  const [paymentBandTotals, setPaymentBandTotals] = useState({
    upi: 0,
    cash: 0,
    bankTransfer: 0,
    cheque: 0,
    other: 0
  });

  const refreshSales = useCallback(async () => {
    try {
      setLoading(true);
      const raw = await fetchSalesBills();
      const allBills = Array.isArray(raw)
        ? raw
        : Array.isArray(raw?.data)
          ? raw.data
          : [];
      setSales(allBills);
    } catch (error) {
      console.error('Error loading sales data:', error);
      setSales([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshSales();
  }, [refreshSales]);

  useEffect(() => {
    const today = toIsoDate(new Date());
    const fromIso = toIsoDate(dateFrom) || today;
    const toIso = toIsoDate(dateTo) || fromIso;
    fetchSalesPaymentModeSummary({ date: fromIso, dateTo: toIso })
      .then((raw) => {
        const res = raw && typeof raw === 'object' && raw.data && typeof raw.data === 'object'
          ? raw.data
          : raw;
        setPaymentBandTotals({
          upi: Number(res?.upi) || 0,
          cash: Number(res?.cash) || 0,
          bankTransfer: Number(res?.bankTransfer) || 0,
          cheque: Number(res?.cheque) || 0,
          other: Number(res?.other) || 0
        });
      })
      .catch((e) => {
        console.error('Failed to load payment mode totals', e);
      });
  }, [dateFrom, dateTo]);

  return { sales, setSales, loading, paymentBandTotals, refreshSales };
};

