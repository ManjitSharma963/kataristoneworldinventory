import { useEffect, useState } from 'react';
import { getBalanceSummary } from '../utils/api';

export const useLedgerSummary = (activeNav) => {
  const [ledgerSummary, setLedgerSummary] = useState({ inHand: 0, bank: 0, total: 0 });

  useEffect(() => {
    if (activeNav !== 'dashboard') return undefined;
    let cancelled = false;
    (async () => {
      try {
        const raw = await getBalanceSummary();
        const d = raw?.data && typeof raw.data === 'object' && !Array.isArray(raw.data) ? raw.data : raw;
        const inh = Number(d?.inHand ?? d?.in_hand);
        const bnk = Number(d?.bank);
        const tot = Number(d?.total);
        if (!cancelled) {
          setLedgerSummary({
            inHand: Number.isFinite(inh) ? inh : 0,
            bank: Number.isFinite(bnk) ? bnk : 0,
            total: Number.isFinite(tot) ? tot : 0,
          });
        }
      } catch {
        if (!cancelled) setLedgerSummary({ inHand: 0, bank: 0, total: 0 });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activeNav]);

  return ledgerSummary;
};
