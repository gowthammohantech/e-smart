import { useMemo } from 'react';
import { useAppStore } from './appStore';
import { useUiStore, type DashboardPeriod } from './uiStore';
import { resolveId, useRemoteMeta } from '../remote/meta';
import { useComplianceCounts, type ComplianceCounts } from '../remote/queries';
import {
  BusinessDocument,
  Company,
  ComplianceSettings,
  DocumentKind,
  EInvoiceStatus,
  EwayBill,
  EwayBillStatus,
  ExchangeRate,
  Expense,
  Item,
  Party,
  PartyKind,
  Payment,
  PlanTier,
  StockMovement,
  Transporter,
} from '@esmart/core/types';
import { Money, money, sum, zero } from '@esmart/core/lib/money';
import { applyOpening, availableAdvance, buildOutstanding, summarizeAging } from '@esmart/core/domain/receivables';
import { stockMap } from '@esmart/core/domain/stockLedger';
import { PURCHASE_KINDS, SALES_KINDS } from '@esmart/core/domain/documentStates';
import { ewayBillStatusAt, hoursUntilExpiry, isEwayBillRequired } from '@esmart/core/domain/ewayBill';
import { isEInvoiceApplicable } from '@esmart/core/domain/eInvoice';
import { defaultComplianceSettings } from '@esmart/core/domain/complianceDefaults';
import { nowISO, today } from '@esmart/core/lib/date';
import { resolveRate } from '@esmart/core/domain/fx';
import { Module, ModuleSet, canOpen, moduleSetFor, moduleEnabled } from '@esmart/core/domain/plan';

/**
 * Every read below is scoped by the active company, which is how the
 * prototype honours the company-isolation rule from the BRD.
 */

export function useActiveCompany(): Company {
  return useAppStore((s) => s.companies.find((c) => c.id === s.activeCompanyId) ?? s.companies[0]);
}

export function usePlan(): PlanTier {
  return useAppStore((s) => s.companies.find((c) => c.id === s.activeCompanyId)?.plan ?? 'pro');
}

export function useModuleSet(): ModuleSet {
  return moduleSetFor(usePlan());
}

/** Modules the owner switched off for the active company. */
export function useDisabledModules(): Module[] {
  return useAppStore((s) => s.companies.find((c) => c.id === s.activeCompanyId)?.disabledModules) ?? NO_MODULES;
}
const NO_MODULES: Module[] = [];

/** Whether a module is on for the active company: in its plan and not switched off. Data exists either way. */
export function useHasModule(module: Module): boolean {
  return moduleEnabled(usePlan(), useDisabledModules(), module);
}

/** A filter for lists of routes: keeps what the active plan can open and the owner hasn't switched off. */
export function useCanOpen(): (route: string) => boolean {
  const plan = usePlan();
  const disabled = useDisabledModules();
  return useMemo(() => (route: string) => canOpen(plan, route, disabled), [plan, disabled]);
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

/** The branch new entries default to: the company's primary, else the one picked in the header. */
export function usePrimaryBranchId(): string | undefined {
  const branches = useBranches();
  const activeBranchId = useAppStore((s) => s.activeBranchId);
  return branches.find((b) => b.isPrimary)?.id ?? activeBranchId ?? branches[0]?.id;
}

/** Where a new entry starts: the branch picked in the switcher, or the main one when all branches are showing. */
export function useDefaultBranchId(): string | undefined {
  const branches = useBranches();
  const activeBranchId = useAppStore((s) => s.activeBranchId);
  const primaryBranchId = usePrimaryBranchId();
  return activeBranchId && branches.some((b) => b.id === activeBranchId) ? activeBranchId : primaryBranchId;
}

export function useCompanies() {
  return useAppStore((s) => s.companies);
}

/** A company's parties; customers or suppliers include parties that are both, and the general contacts are asked for by name. */
export function useParties(kind?: PartyKind): Party[] {
  const companyId = useAppStore((s) => s.activeCompanyId);
  const parties = useAppStore((s) => s.parties);
  return useMemo(
    () =>
      parties
        .filter((p) => p.companyId === companyId && (!kind || p.kind === kind || ((kind === 'customer' || kind === 'supplier') && p.kind === 'both')))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [parties, companyId, kind],
  );
}

/** A route's id, following the server's rename of a record first saved on this device. */
function useCurrentId(id: string | undefined): string | undefined {
  const aliases = useRemoteMeta((m) => m.idAliases);
  return id ? resolveId(id, aliases) : id;
}

export function useParty(id: string | undefined): Party | undefined {
  const current = useCurrentId(id);
  return useAppStore((s) => s.parties.find((p) => p.id === current));
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
  const current = useCurrentId(id);
  return useAppStore((s) => s.items.find((i) => i.id === current));
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

/** The company's item categories and brands, by name. */
export function useItemCategories() {
  const companyId = useAppStore((s) => s.activeCompanyId);
  const cats = useAppStore((s) => s.itemCategories);
  return useMemo(() => (cats ?? []).filter((c) => c.companyId === companyId).sort((a, b) => a.name.localeCompare(b.name)), [cats, companyId]);
}

/** The active company's vehicles, by registration; inactive ones only when asked. */
export function useVehicles(includeInactive = false) {
  const companyId = useAppStore((s) => s.activeCompanyId);
  const vehicles = useAppStore((s) => s.vehicles);
  return useMemo(
    () => (vehicles ?? []).filter((v) => v.companyId === companyId && (includeInactive || v.status !== 'inactive')).sort((a, b) => a.registration.localeCompare(b.registration)),
    [vehicles, companyId, includeInactive],
  );
}

export function useBrands() {
  const companyId = useAppStore((s) => s.activeCompanyId);
  const brands = useAppStore((s) => s.brands);
  return useMemo(() => (brands ?? []).filter((b) => b.companyId === companyId).sort((a, b) => a.name.localeCompare(b.name)), [brands, companyId]);
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
  const current = useCurrentId(id);
  return useAppStore((s) => s.documents.find((d) => d.id === current));
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
  const current = useCurrentId(id);
  return useAppStore((s) => s.payments.find((p) => p.id === current));
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
  const current = useCurrentId(id);
  return useAppStore((s) => s.expenses.find((e) => e.id === current));
}

/**
 * What every dashboard hub is asked for: the branch picked in the header (undefined for all) and
 * the period bar's period, which the tabs share.
 */
export function useDashboardScope(): { branchId?: string; period: DashboardPeriod } {
  const branchId = useAppStore((s) => s.activeBranchId) || undefined;
  const period = useUiStore((s) => s.dashboardPeriod);
  return useMemo(() => ({ branchId, period }), [branchId, period]);
}

/** The branch picked in the header's switcher, or undefined when all branches are showing. */
export function useSwitcherBranchId(): string | undefined {
  const branches = useBranches();
  const activeBranchId = useAppStore((s) => s.activeBranchId);
  return activeBranchId && branches.some((b) => b.id === activeBranchId) ? activeBranchId : undefined;
}

/**
 * Stock movements of the active company. `branchScoped` keeps only the branch
 * picked in the switcher, for views of what is on hand; posting, transfers and
 * the books need every branch's.
 */
export function useStockMovements(itemId?: string, opts: { branchScoped?: boolean } = {}): StockMovement[] {
  const companyId = useAppStore((s) => s.activeCompanyId);
  const movements = useAppStore((s) => s.stockMovements);
  const switcherBranchId = useSwitcherBranchId();
  const branchId = opts.branchScoped ? switcherBranchId : undefined;
  return useMemo(
    () => movements.filter((m) => m.companyId === companyId && (!itemId || m.itemId === itemId) && (!branchId || m.branchId === branchId)),
    [movements, companyId, itemId, branchId],
  );
}

/** On hand per item, at the branch picked in the switcher (all branches when none is). */
export function useStockLevels(): Record<string, number> {
  const movements = useStockMovements(undefined, { branchScoped: true });
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
  const documents = useDocuments();
  const payments = usePayments('received');
  const baseCurrency = useBaseCurrency();
  return useMemo(() => {
    const invoices = documents.filter((d) => d.kind === 'invoice');
    const outstanding = buildOutstanding(invoices, payments, undefined, documents);
    return { outstanding, summary: summarizeAging(outstanding, baseCurrency) };
  }, [documents, payments, baseCurrency]);
}

export function usePayables() {
  const documents = useDocuments();
  const payments = usePayments('paid');
  const baseCurrency = useBaseCurrency();
  return useMemo(() => {
    const bills = documents.filter((d) => d.kind === 'purchaseBill');
    const outstanding = buildOutstanding(bills, payments, undefined, documents);
    return { outstanding, summary: summarizeAging(outstanding, baseCurrency) };
  }, [documents, payments, baseCurrency]);
}

/**
 * What is left of a party's opening balance once its advances settle it, in
 * the base currency. `partyPayments` are the party's payments in its direction.
 */
export function openingOwedInBase(
  party: Party,
  partyPayments: Payment[],
  rates: ExchangeRate[],
  baseCurrency: string,
): number {
  const { currency } = party.openingBalance;
  const { opening } = applyOpening(party.openingBalance.minor, availableAdvance(partyPayments, currency).minor);
  return Math.round(opening * resolveRate(rates, currency, baseCurrency, today()));
}

/** Outstanding amount for one party, in the company base currency, opening balance included. */
export function usePartyOutstanding(partyId: string | undefined) {
  const documents = useDocuments();
  const payments = usePayments();
  const party = useParty(partyId);
  const rates = useExchangeRates();
  const baseCurrency = useBaseCurrency();
  return useMemo(() => {
    if (!partyId) return zero(baseCurrency);
    const docs = documents.filter(
      (d) => d.partyId === partyId && (d.kind === 'invoice' || d.kind === 'purchaseBill'),
    );
    const partyPayments = payments.filter((p) => p.partyId === partyId);
    const rows = buildOutstanding(docs, partyPayments, undefined, documents);
    const opening = party
      ? openingOwedInBase(party, partyPayments.filter((p) => p.direction === (party.kind === 'supplier' ? 'paid' : 'received')), rates, baseCurrency)
      : 0;
    return sum(
      [
        ...rows.map((r) => money(Math.round(r.outstanding.minor * (r.document.exchangeRate || 1)), baseCurrency)),
        money(opening, baseCurrency),
      ],
      baseCurrency,
    );
  }, [documents, payments, party, rates, partyId, baseCurrency]);
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


/* ------------------------------------------------------------------ */
/* Compliance (FRD 16)                                                 */
/* ------------------------------------------------------------------ */

export function useTransporters(opts: { activeOnly?: boolean } = {}): Transporter[] {
  const companyId = useAppStore((s) => s.activeCompanyId);
  const rows = useAppStore((s) => s.transporters);
  return useMemo(
    () =>
      rows
        .filter((r) => r.companyId === companyId && (!opts.activeOnly || r.status === 'active'))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [rows, companyId, opts.activeOnly],
  );
}

export function useComplianceSettings(): ComplianceSettings {
  const companyId = useAppStore((s) => s.activeCompanyId);
  const rows = useAppStore((s) => s.complianceSettings);
  const baseCurrency = useBaseCurrency();
  return useMemo(
    () => rows.find((r) => r.companyId === companyId) ?? defaultComplianceSettings(companyId, baseCurrency),
    [rows, companyId, baseCurrency],
  );
}

/**
 * Company-scoped e-way bills, newest first.
 *
 * `expired` is derived here from a single reading of the clock, so a screen
 * left open across midnight keeps its last answer until something else makes
 * it render. That matches how the rest of the app treats "today" and is
 * deliberately not worth a timer.
 */
export function useEwayBills(filter?: { status?: EwayBillStatus; documentId?: string }): EwayBill[] {
  const companyId = useAppStore((s) => s.activeCompanyId);
  const bills = useAppStore((s) => s.ewayBills);
  const status = filter?.status;
  const documentId = filter?.documentId;

  return useMemo(() => {
    const now = nowISO();
    return bills
      .filter((b) => b.companyId === companyId)
      .filter((b) => (documentId ? b.documentId === documentId : true))
      .filter((b) => (status ? ewayBillStatusAt(b, now) === status : true))
      .sort((a, b) => b.generatedAt.localeCompare(a.generatedAt));
  }, [bills, companyId, status, documentId]);
}

export function useEwayBill(id: string | undefined): EwayBill | undefined {
  const current = useCurrentId(id);
  return useAppStore((s) => s.ewayBills.find((b) => b.id === current));
}

export function useEwayBillsForDocument(documentId: string | undefined): EwayBill[] {
  const companyId = useAppStore((s) => s.activeCompanyId);
  const bills = useAppStore((s) => s.ewayBills);
  return useMemo(
    () =>
      bills
        .filter((b) => b.companyId === companyId && b.documentId === documentId)
        .sort((a, b) => b.generatedAt.localeCompare(a.generatedAt)),
    [bills, companyId, documentId],
  );
}

/** The newest bill on a document that has not been cancelled. */
export function useActiveEwayBill(documentId: string | undefined): EwayBill | undefined {
  const bills = useEwayBillsForDocument(documentId);
  return useMemo(() => bills.find((b) => b.status !== 'cancelled'), [bills]);
}

/** Documents this company can report, with their current e-invoice state. */
export function useEInvoiceDocuments(status?: EInvoiceStatus): BusinessDocument[] {
  const documents = useDocuments(['invoice', 'salesReturn']);
  const company = useActiveCompany();
  const settings = useComplianceSettings();
  const parties = useAppStore((s) => s.parties);
  const items = useAppStore((s) => s.items);

  return useMemo(() => {
    const now = nowISO();
    return documents.filter((doc) => {
      const applicable = isEInvoiceApplicable({
        document: doc,
        company,
        buyer: parties.find((p) => p.id === doc.partyId),
        settings,
        items,
        now,
      }).applicable;
      const current = doc.compliance?.eInvoiceStatus ?? (applicable ? 'pending' : 'notApplicable');
      if (!applicable && current === 'notApplicable') return false;
      return status ? current === status : true;
    });
  }, [documents, company, settings, parties, items, status]);
}

export type ComplianceSummary = ComplianceCounts;

/** E-invoice and e-way bill counts, from the server: the device no longer holds every document. */
export function useComplianceSummary(): ComplianceSummary {
  return useComplianceCounts();
}

/** Documents that need an e-way bill and have no live one, newest first. */
function needingEwayBill(documents: BusinessDocument[], bills: EwayBill[], items: Item[], settings: ComplianceSettings, now: string) {
  const live = new Set(bills.filter((b) => ewayBillStatusAt(b, now) === 'active').map((b) => b.documentId));
  return documents.filter((d) => isEwayBillRequired({ document: d, items, settings }).required && !live.has(d.id));
}

/** The consignments still waiting for an e-way bill, for the compliance register. */
export function usePendingEwayDocuments(): BusinessDocument[] {
  const documents = useDocuments();
  const bills = useEwayBills();
  const settings = useComplianceSettings();
  const items = useAppStore((s) => s.items);
  return useMemo(() => needingEwayBill(documents, bills, items, settings, nowISO()), [documents, bills, items, settings]);
}

/** Live bills close to running out, for the hub's warning banner. */
export function useExpiringEwayBills(withinHours = 24): EwayBill[] {
  const bills = useEwayBills();
  return useMemo(() => {
    const now = nowISO();
    return bills
      .filter((b) => ewayBillStatusAt(b, now) === 'active' && hoursUntilExpiry(b, now) <= withinHours)
      .sort((a, b) => a.validUpto.localeCompare(b.validUpto));
  }, [bills, withinHours]);
}
