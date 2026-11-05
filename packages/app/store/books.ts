import { useMemo } from 'react';
import type { Book } from '@esmart/core/domain/ledger/accounts';
import { allPostings, type Posting } from '@esmart/core/domain/ledger/postings';
import { openingStockValue, type Stock } from '@esmart/core/domain/ledger/reports';
import type { CostCentre, LedgerAccount, Voucher } from '@esmart/core/types';
import { useAppStore } from './appStore';
import {
  useActiveCompany,
  useBaseCurrency,
  useBranches,
  useDocuments,
  useExpenseCategories,
  useExpenses,
  useItems,
  useParties,
  usePaymentAccounts,
  usePayments,
  useStockMovements,
  useTaxCategories,
} from './selectors';

export function useLedgerAccounts(): LedgerAccount[] {
  const companyId = useAppStore((s) => s.activeCompanyId);
  const accounts = useAppStore((s) => s.ledgerAccounts);
  return useMemo(() => accounts.filter((a) => a.companyId === companyId).sort((a, b) => a.name.localeCompare(b.name)), [accounts, companyId]);
}

/** The active company's cost centres, by name; inactive ones only when asked for. */
export function useCostCentres(includeInactive = false): CostCentre[] {
  const companyId = useAppStore((s) => s.activeCompanyId);
  const centres = useAppStore((s) => s.costCentres);
  return useMemo(() => (centres ?? []).filter((c) => c.companyId === companyId && (includeInactive || c.status !== 'inactive')).sort((a, b) => a.name.localeCompare(b.name)), [centres, companyId, includeInactive]);
}

export function useVouchers(): Voucher[] {
  const companyId = useAppStore((s) => s.activeCompanyId);
  const vouchers = useAppStore((s) => s.vouchers);
  return useMemo(() => vouchers.filter((v) => v.companyId === companyId).sort((a, b) => b.date.localeCompare(a.date) || b.number.localeCompare(a.number)), [vouchers, companyId]);
}

/**
 * The active company's books on this device: every posting, the chart they name, and stock to value.
 * The same `@esmart/core` functions the server runs, so the two agree once synced.
 */
export function useBooks(): { postings: Posting[]; book: Book; stock: Stock } {
  const company = useActiveCompany();
  const baseCurrency = useBaseCurrency();
  const documents = useDocuments();
  const payments = usePayments();
  const expenses = useExpenses();
  const vouchers = useVouchers();
  const parties = useParties();
  const paymentAccounts = usePaymentAccounts();
  const expenseCategories = useExpenseCategories();
  const ledgerAccounts = useLedgerAccounts();
  const branches = useBranches();
  const taxCategories = useTaxCategories();
  const items = useItems();
  const movements = useStockMovements();
  return useMemo(() => {
    const stock = { items, movements, baseCurrency };
    const postings = allPostings({
      baseCurrency,
      company,
      branches,
      taxCategories,
      documents,
      payments,
      expenses,
      vouchers,
      parties,
      paymentAccounts,
      ledgerAccounts,
      openingStockMinor: openingStockValue(items, movements, baseCurrency),
    });
    return { postings, book: { parties, paymentAccounts, expenseCategories, ledgerAccounts }, stock };
  }, [company, baseCurrency, documents, payments, expenses, vouchers, parties, paymentAccounts, expenseCategories, ledgerAccounts, branches, taxCategories, items, movements]);
}
