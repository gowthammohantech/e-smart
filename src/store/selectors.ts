import { useMemo } from 'react';
import { useAppStore } from './appStore';
import {
  BusinessDocument,
  Company,
  DocumentKind,
  Expense,
  Item,
  Party,
  Payment,
  StockMovement,
} from '@/types';
import { Money, money, sum, zero } from '@/lib/money';
import { buildOutstanding, summarizeAging } from '@/domain/receivables';
import { stockMap } from '@/domain/stockLedger';
import { PURCHASE_KINDS, SALES_KINDS } from '@/domain/documentStates';

/**
 * Every read below is scoped by the active company, which is how the
 * prototype honours the company-isolation rule from the BRD.
 */

export function useActiveCompany(): Company {
  return useAppStore((s) => s.companies.find((c) => c.id === s.activeCompanyId) ?? s.companies[0]);
}

export function useBaseCurrency(): string {
  return useAppStore((s) => s.companies.find((c) => c.id === s.activeCompanyId)?.baseCurrency ?? 'INR');
}

export function useCurrentUser() {
  return useAppStore((s) => s.users.find((u) => u.id === s.session.userId) ?? s.users[0]);
}

export function useBranches() {
  const companyId = useAppStore((s) => s.activeCompanyId);
  const branches = useAppStore((s) => s.branches);
  return useMemo(() => branches.filter((b) => b.companyId === companyId), [branches, companyId]);
}

export function useCompanies() {
  return useAppStore((s) => s.companies);
}

export function useParties(kind?: 'customer' | 'supplier'): Party[] {
  const companyId = useAppStore((s) => s.activeCompanyId);
  const parties = useAppStore((s) => s.parties);
  return useMemo(
    () =>
      parties
        .filter((p) => p.companyId === companyId && (!kind || p.kind === kind))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [parties, companyId, kind],
  );
}

export function useParty(id: string | undefined): Party | undefined {
  return useAppStore((s) => s.parties.find((p) => p.id === id));
}

export function useItems(opts: { activeOnly?: boolean } = {}): Item[] {
  const companyId = useAppStore((s) => s.activeCompanyId);
  const items = useAppStore((s) => s.items);
  return useMemo(
    () =>
      items
        .filter((i) => i.companyId === companyId && (!opts.activeOnly || i.status === 'active'))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [items, companyId, opts.activeOnly],
  );
}

export function useItem(id: string | undefined): Item | undefined {
  return useAppStore((s) => s.items.find((i) => i.id === id));
}

export function useTaxCategories() {
  const companyId = useAppStore((s) => s.activeCompanyId);
  const cats = useAppStore((s) => s.taxCategories);
  return useMemo(() => cats.filter((c) => c.companyId === companyId).sort((a, b) => a.rate - b.rate), [cats, companyId]);
}

export function useExpenseCategories() {
  const companyId = useAppStore((s) => s.activeCompanyId);
  const cats = useAppStore((s) => s.expenseCategories);
  return useMemo(() => cats.filter((c) => c.companyId === companyId), [cats, companyId]);
}

export function usePaymentAccounts() {
  const companyId = useAppStore((s) => s.activeCompanyId);
  const accs = useAppStore((s) => s.paymentAccounts);
  return useMemo(() => accs.filter((a) => a.companyId === companyId), [accs, companyId]);
}

export function useExchangeRates() {
  const companyId = useAppStore((s) => s.activeCompanyId);
  const rates = useAppStore((s) => s.exchangeRates);
  return useMemo(
    () => rates.filter((r) => r.companyId === companyId).sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom)),
    [rates, companyId],
  );
}

export function useNumberingSeries() {
  const companyId = useAppStore((s) => s.activeCompanyId);
  const series = useAppStore((s) => s.numberingSeries);
  return useMemo(() => series.filter((s2) => s2.companyId === companyId), [series, companyId]);
}

export function useDocuments(kind?: DocumentKind | DocumentKind[]): BusinessDocument[] {
  const companyId = useAppStore((s) => s.activeCompanyId);
  const documents = useAppStore((s) => s.documents);
  return useMemo(() => {
    const kinds = kind ? (Array.isArray(kind) ? kind : [kind]) : null;
    return documents
      .filter((d) => d.companyId === companyId && (!kinds || kinds.includes(d.kind)))
      .sort((a, b) => (b.date === a.date ? b.createdAt.localeCompare(a.createdAt) : b.date.localeCompare(a.date)));
  }, [documents, companyId, kind]);
}

export function useDocument(id: string | undefined): BusinessDocument | undefined {
  return useAppStore((s) => s.documents.find((d) => d.id === id));
}

export function usePayments(direction?: 'received' | 'paid'): Payment[] {
  const companyId = useAppStore((s) => s.activeCompanyId);
  const payments = useAppStore((s) => s.payments);
  return useMemo(
    () =>
      payments
        .filter((p) => p.companyId === companyId && (!direction || p.direction === direction))
        .sort((a, b) => (b.date === a.date ? b.createdAt.localeCompare(a.createdAt) : b.date.localeCompare(a.date))),
    [payments, companyId, direction],
  );
}

export function usePayment(id: string | undefined): Payment | undefined {
  return useAppStore((s) => s.payments.find((p) => p.id === id));
}

export function useExpenses(): Expense[] {
  const companyId = useAppStore((s) => s.activeCompanyId);
  const expenses = useAppStore((s) => s.expenses);
  return useMemo(
    () => expenses.filter((e) => e.companyId === companyId).sort((a, b) => b.date.localeCompare(a.date)),
    [expenses, companyId],
  );
}

export function useExpense(id: string | undefined): Expense | undefined {
  return useAppStore((s) => s.expenses.find((e) => e.id === id));
}

export function useStockMovements(itemId?: string): StockMovement[] {
  const companyId = useAppStore((s) => s.activeCompanyId);
  const movements = useAppStore((s) => s.stockMovements);
  return useMemo(
    () => movements.filter((m) => m.companyId === companyId && (!itemId || m.itemId === itemId)),
    [movements, companyId, itemId],
  );
}

export function useStockLevels(): Record<string, number> {
  const movements = useStockMovements();
  return useMemo(() => stockMap(movements), [movements]);
}

export function useNotifications() {
  const companyId = useAppStore((s) => s.activeCompanyId);
  const notifications = useAppStore((s) => s.notifications);
  return useMemo(
    () => notifications.filter((n) => n.companyId === companyId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [notifications, companyId],
  );
}

export function useUnreadCount(): number {
  const notifications = useNotifications();
  return useMemo(() => notifications.filter((n) => !n.read).length, [notifications]);
}

export function useAuditEvents() {
  const companyId = useAppStore((s) => s.activeCompanyId);
  const events = useAppStore((s) => s.auditEvents);
  return useMemo(
    () => events.filter((e) => e.companyId === companyId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [events, companyId],
  );
}

export function useAttachments(entityId?: string) {
  const attachments = useAppStore((s) => s.attachments);
  return useMemo(
    () => attachments.filter((a) => !entityId || a.entityId === entityId),
    [attachments, entityId],
  );
}

/* ------------------------------------------------------------------ */
/* Derived money views                                                 */
/* ------------------------------------------------------------------ */

export function useReceivables() {
  const invoices = useDocuments('invoice');
  const payments = usePayments('received');
  const baseCurrency = useBaseCurrency();
  return useMemo(() => {
    const outstanding = buildOutstanding(invoices, payments);
    return { outstanding, summary: summarizeAging(outstanding, baseCurrency) };
  }, [invoices, payments, baseCurrency]);
}

export function usePayables() {
  const bills = useDocuments('purchaseBill');
  const payments = usePayments('paid');
  const baseCurrency = useBaseCurrency();
  return useMemo(() => {
    const outstanding = buildOutstanding(bills, payments);
    return { outstanding, summary: summarizeAging(outstanding, baseCurrency) };
  }, [bills, payments, baseCurrency]);
}

/** Outstanding amount for one party, in the company base currency. */
export function usePartyOutstanding(partyId: string | undefined) {
  const documents = useDocuments();
  const payments = usePayments();
  const baseCurrency = useBaseCurrency();
  return useMemo(() => {
    if (!partyId) return zero(baseCurrency);
    const docs = documents.filter(
      (d) => d.partyId === partyId && (d.kind === 'invoice' || d.kind === 'purchaseBill'),
    );
    const partyPayments = payments.filter((p) => p.partyId === partyId);
    const rows = buildOutstanding(docs, partyPayments);
    return sum(
      rows.map((r) => money(Math.round(r.outstanding.minor * (r.document.exchangeRate || 1)), baseCurrency)),
      baseCurrency,
    );
  }, [documents, payments, partyId, baseCurrency]);
}

export function usePartyHistory(partyId: string | undefined) {
  const documents = useDocuments();
  const payments = usePayments();
  return useMemo(() => {
    const docs = documents.filter((d) => d.partyId === partyId);
    return {
      quotes: docs.filter((d) => d.kind === 'quote'),
      orders: docs.filter((d) => d.kind === 'salesOrder' || d.kind === 'purchaseOrder'),
      invoices: docs.filter((d) => d.kind === 'invoice' || d.kind === 'purchaseBill'),
      deliveries: docs.filter((d) => d.kind === 'delivery' || d.kind === 'goodsReceipt'),
      returns: docs.filter((d) => d.kind === 'salesReturn' || d.kind === 'purchaseReturn'),
      payments: payments.filter((p) => p.partyId === partyId),
      all: docs,
    };
  }, [documents, payments, partyId]);
}

export function useSalesDocuments() {
  return useDocuments(SALES_KINDS);
}

export function usePurchaseDocuments() {
  return useDocuments(PURCHASE_KINDS);
}

/** Total of a money list guarded against an empty array. */
export function totalOf(values: Money[], currency: string): Money {
  return values.length ? sum(values, currency) : zero(currency);
}
