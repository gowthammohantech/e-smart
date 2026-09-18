import { useMemo } from 'react';
import { useAppStore } from './appStore';
import {
  BusinessDocument,
  Company,
  DocumentKind,
  Item,
  Party,
  Payment,
  Transporter,
} from '@/types';
import { Money, money, sum, zero } from '@/lib/money';
import { buildOutstanding, summarizeAging } from '@/domain/receivables';
import { SALES_KINDS } from '@/domain/documentStates';
import { isExpired } from '@/domain/gst/eway/validity';
import { nowISO } from '@/lib/date';

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

export function useParties(): Party[] {
  const companyId = useAppStore((s) => s.activeCompanyId);
  const parties = useAppStore((s) => s.parties);
  return useMemo(
    () => parties.filter((p) => p.companyId === companyId).sort((a, b) => a.name.localeCompare(b.name)),
    [parties, companyId],
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

export function useTransporters(): Transporter[] {
  const companyId = useAppStore((s) => s.activeCompanyId);
  const transporters = useAppStore((s) => s.transporters);
  return useMemo(
    () => transporters.filter((t) => t.companyId === companyId).sort((a, b) => a.name.localeCompare(b.name)),
    [transporters, companyId],
  );
}

export function usePaymentAccounts() {
  const companyId = useAppStore((s) => s.activeCompanyId);
  const accs = useAppStore((s) => s.paymentAccounts);
  return useMemo(() => accs.filter((a) => a.companyId === companyId), [accs, companyId]);
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

export function usePayments(): Payment[] {
  const companyId = useAppStore((s) => s.activeCompanyId);
  const payments = useAppStore((s) => s.payments);
  return useMemo(
    () =>
      payments
        .filter((p) => p.companyId === companyId)
        .sort((a, b) => (b.date === a.date ? b.createdAt.localeCompare(a.createdAt) : b.date.localeCompare(a.date))),
    [payments, companyId],
  );
}

export function usePayment(id: string | undefined): Payment | undefined {
  return useAppStore((s) => s.payments.find((p) => p.id === id));
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
  const payments = usePayments();
  const baseCurrency = useBaseCurrency();
  return useMemo(() => {
    const outstanding = buildOutstanding(invoices, payments);
    return { outstanding, summary: summarizeAging(outstanding, baseCurrency) };
  }, [invoices, payments, baseCurrency]);
}

/** Outstanding amount for one party, in the company base currency. */
export function usePartyOutstanding(partyId: string | undefined) {
  const documents = useDocuments();
  const payments = usePayments();
  const baseCurrency = useBaseCurrency();
  return useMemo(() => {
    if (!partyId) return zero(baseCurrency);
    const docs = documents.filter((d) => d.partyId === partyId && d.kind === 'invoice');
    const partyPayments = payments.filter((p) => p.partyId === partyId);
    const rows = buildOutstanding(docs, partyPayments);
    return sum(rows.map((r) => money(r.outstanding.minor, baseCurrency)), baseCurrency);
  }, [documents, payments, partyId, baseCurrency]);
}

export function usePartyHistory(partyId: string | undefined) {
  const documents = useDocuments();
  const payments = usePayments();
  return useMemo(() => {
    const docs = documents.filter((d) => d.partyId === partyId);
    return {
      quotes: docs.filter((d) => d.kind === 'quote'),
      orders: docs.filter((d) => d.kind === 'salesOrder'),
      invoices: docs.filter((d) => d.kind === 'invoice'),
      deliveries: docs.filter((d) => d.kind === 'delivery'),
      returns: docs.filter((d) => d.kind === 'salesReturn'),
      payments: payments.filter((p) => p.partyId === partyId),
      all: docs,
    };
  }, [documents, payments, partyId]);
}

export function useSalesDocuments() {
  return useDocuments(SALES_KINDS);
}

/* ------------------------------------------------------------------ */
/* GST compliance views                                                */
/* ------------------------------------------------------------------ */

/** The e-invoice queue, grouped the way the register screen shows it. */
export function useEInvoiceQueue() {
  const documents = useDocuments(['invoice', 'salesReturn']);
  return useMemo(() => {
    const statusOf = (d: BusinessDocument) => d.compliance?.eInvoice?.status ?? 'notApplicable';
    return {
      pending: documents.filter((d) => statusOf(d) === 'pending'),
      generated: documents.filter((d) => statusOf(d) === 'generated'),
      failed: documents.filter((d) => statusOf(d) === 'failed'),
      cancelled: documents.filter((d) => statusOf(d) === 'cancelled'),
      notApplicable: documents.filter((d) => statusOf(d) === 'notApplicable'),
      all: documents,
    };
  }, [documents]);
}

/** The e-way bill queue. Expiry is derived on read, never stored stale. */
export function useEWayBillQueue() {
  const documents = useDocuments(SALES_KINDS);
  return useMemo(() => {
    const now = nowISO();
    const withBill = documents.filter((d) => d.compliance?.eWayBill?.ewbNo);
    const live = withBill.filter(
      (d) =>
        d.compliance!.eWayBill!.status === 'generated' &&
        !isExpired(d.compliance!.eWayBill!.validUpto, now),
    );
    return {
      active: live,
      expiringToday: live.filter(
        (d) => (d.compliance!.eWayBill!.validUpto ?? '').slice(0, 10) === now.slice(0, 10),
      ),
      expired: withBill.filter(
        (d) =>
          d.compliance!.eWayBill!.status === 'generated' &&
          isExpired(d.compliance!.eWayBill!.validUpto, now),
      ),
      cancelled: withBill.filter((d) => d.compliance!.eWayBill!.status === 'cancelled'),
      all: withBill,
    };
  }, [documents]);
}

/** Headline counts for the GST hub and the Home dashboard. */
export function useComplianceSummary() {
  const eInvoices = useEInvoiceQueue();
  const eWayBills = useEWayBillQueue();
  return useMemo(
    () => ({
      registered: eInvoices.generated.length,
      failed: eInvoices.failed.length,
      cancelled: eInvoices.cancelled.length,
      ewbActive: eWayBills.active.length,
      ewbExpiringToday: eWayBills.expiringToday.length,
      ewbExpired: eWayBills.expired.length,
    }),
    [eInvoices, eWayBills],
  );
}

/** Total of a money list guarded against an empty array. */
export function totalOf(values: Money[], currency: string): Money {
  return values.length ? sum(values, currency) : zero(currency);
}
