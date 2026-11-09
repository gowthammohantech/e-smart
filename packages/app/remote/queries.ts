import { useEffect, useMemo } from 'react';
import { keepWithin } from './keepWithin';
import { QueryClient, useInfiniteQuery, useQuery } from '@tanstack/react-query';
import type { Schema } from '@esmart/api-client';
import type { AuditEvent, DocStatus, DocumentKind, EInvoiceStatus, EwayBill, EwayBillStatus, Expense, Item, Voucher } from '@esmart/core/types';
import type { Account, Book } from '@esmart/core/domain/ledger/accounts';
import { today } from '@esmart/core/lib/date';
import { fifoAllocate } from '@esmart/core/domain/receivables';
import { refreshSoon } from './refresh';
import { useAppStore } from '../store/appStore';
import type { DashboardPeriod } from '../store/uiStore';
import { api } from './api';
import { applyChanges } from './apply';
import { COLLECTIONS } from './collections';
import { resolveId, useRemoteMeta } from './meta';
import { ApiError } from '@esmart/api-client';
import { useDebounced } from '../components/useDebounced';

/**
 * Reading straight from the server, a page at a time, instead of from the whole book on the device.
 * Screens move here area by area (Sales first); the rest still read the store until they do.
 *
 * Every save and every sync passes through the store, so a change there marks the matching server
 * reads stale (`watchStoreForQueries`): an invoice saved here, or by someone else, shows on the next
 * render of any list it belongs to.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // A list just loaded is good for half a minute; going back to it doesn't refetch.
      staleTime: 30_000,
      retry: 1,
      // The store's refresh-on-focus covers coming back to the app.
      refetchOnWindowFocus: false,
    },
  },
});

export type DocumentSummary = Schema<'DocumentSummary'>;
/** A summary as a list row: the server always sends these. */
export type ListedDocument = DocumentSummary & Required<Pick<DocumentSummary, 'id' | 'kind' | 'number' | 'date' | 'partyId' | 'grandTotal'>>;

/** A document list's filters, as the server takes them. */
export type DocumentQuery = {
  kinds: DocumentKind[];
  statuses?: DocStatus[];
  partyId?: string;
  branchId?: string;
  from?: string;
  to?: string;
  q?: string;
  /** Only documents with something left to pay. */
  outstanding?: boolean;
  sort?: 'date' | '-date' | 'number' | '-number' | 'total' | '-total';
};

const PAGE = 50;

/** What a filter sends: empty values left out, so equal filters make equal cache keys. */
function documentParams(companyId: string, f: DocumentQuery) {
  const query = {
    kind: f.kinds.length ? f.kinds : undefined,
    status: f.statuses?.length ? f.statuses : undefined,
    partyId: f.partyId || undefined,
    branchId: f.branchId || undefined,
    from: f.from || undefined,
    to: f.to || undefined,
    q: f.q?.trim() || undefined,
    outstanding: f.outstanding || undefined,
  };
  return { path: { companyId }, query };
}

export const documentKeys = {
  all: (companyId: string) => ['documents', companyId] as const,
  pages: (companyId: string, f: DocumentQuery) => ['documents', companyId, 'pages', f] as const,
  summary: (companyId: string, f: Omit<DocumentQuery, 'sort'>) => ['documents', companyId, 'summary', f] as const,
};

/** One kind's documents (or several), 50 at a time, newest first unless sorted otherwise. */
export function useDocumentPages(f: DocumentQuery, enabled = true) {
  const companyId = useAppStore((s) => s.activeCompanyId);
  const query = useInfiniteQuery({
    queryKey: documentKeys.pages(companyId, f),
    enabled: enabled && !!companyId,
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam, signal }) => {
      const p = documentParams(companyId, f);
      const { data } = await api.GET('/companies/{companyId}/documents', {
        params: { path: p.path, query: { ...p.query, sort: f.sort ?? '-date', limit: PAGE, cursor: pageParam } },
        signal,
      });
      return data!;
    },
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    // A new filter keeps showing the old rows until its first page lands, rather than flashing empty.
    placeholderData: keepWithin(companyId),
  });
  const rows = query.data?.pages.flatMap((p) => p.data ?? []) ?? [];
  return { ...query, rows };
}

/** How many documents the filters match, their total, and the count in each status (for the chips). */
export function useDocumentSummary(f: Omit<DocumentQuery, 'sort'>) {
  const companyId = useAppStore((s) => s.activeCompanyId);
  return useQuery({
    queryKey: documentKeys.summary(companyId, f),
    enabled: !!companyId,
    queryFn: async ({ signal }) => {
      const p = documentParams(companyId, f);
      const { data } = await api.GET('/companies/{companyId}/documents/summary', { params: p, signal });
      return data!;
    },
    placeholderData: keepWithin(companyId),
  });
}

/**
 * Records a picker found on the server, kept in the store as sync would keep them: the editor then
 * looks a picked party or item up there for its tax, prices and stock like any other.
 */
export function keep(entityType: keyof typeof COLLECTIONS, companyId: string, rows: ({ id?: string; version?: number } | undefined)[]) {
  const { versions } = useRemoteMeta.getState();
  const { collection } = COLLECTIONS[entityType];
  const have = new Set((useAppStore.getState()[collection] as { id: string }[]).map((r) => r.id));
  // A record the store already holds at this version is left alone: rewriting it would mark every
  // read of that collection stale, and a detail read would then fetch itself again, for ever.
  const changed = rows.filter((r): r is { id: string; version?: number } => !!r?.id && !(have.has(r.id) && r.version !== undefined && versions[r.id] === r.version));
  applyChanges(changed.map((r) => ({ companyId, entityType, entityId: r.id, op: 'upsert', data: r })));
}

/** Customers or suppliers matching what's typed (name, code, GSTIN, phone, email), 50 at most. */
export function usePartySearch(kind: 'customer' | 'supplier' | undefined, q: string, enabled = true) {
  const companyId = useAppStore((s) => s.activeCompanyId);
  return useQuery({
    queryKey: ['parties', companyId, 'search', kind ?? '', q.trim()],
    enabled: enabled && !!companyId,
    queryFn: async ({ signal }) => {
      const { data } = await api.GET('/companies/{companyId}/parties', { params: { path: { companyId }, query: { kind, q: q.trim() || undefined, limit: PAGE } }, signal });
      const rows = data?.data ?? [];
      keep('party', companyId, rows);
      return rows;
    },
    // Asked again each time the picker opens: keeping results in the store marks nothing stale.
    staleTime: 0,
    placeholderData: keepWithin(companyId),
  });
}

/** Active items matching what's typed (name, SKU, barcode, HSN), 50 at most. */
export function useItemSearch(q: string, enabled = true) {
  const companyId = useAppStore((s) => s.activeCompanyId);
  return useQuery({
    queryKey: ['items', companyId, 'search', q.trim()],
    enabled: enabled && !!companyId,
    queryFn: async ({ signal }) => {
      const { data } = await api.GET('/companies/{companyId}/items', { params: { path: { companyId }, query: { status: 'active', q: q.trim() || undefined, limit: PAGE } }, signal });
      const rows = data?.data ?? [];
      keep('item', companyId, rows);
      return rows;
    },
    staleTime: 0,
    placeholderData: keepWithin(companyId),
  });
}

/**
 * The TDS a supplier's bill would keep back, worked out by the server from the deductee's year so
 * far. Undefined until it answers (or offline): the editor then falls back to the device's figure.
 */
export function useTdsPreview(input: { partyId?: string; date: string; taxableMinor: number; currency: string; section?: string; documentId?: string } | null) {
  const companyId = useAppStore((s) => s.activeCompanyId);
  const taxable = useDebounced(input?.taxableMinor ?? 0, 400);
  return useQuery({
    queryKey: ['tds', companyId, input?.partyId, input?.date, taxable, input?.section, input?.documentId],
    enabled: !!companyId && !!input?.partyId,
    queryFn: async ({ signal }) => {
      const { data } = await api.POST('/companies/{companyId}/tds/preview', {
        params: { path: { companyId } },
        body: {
          partyId: input!.partyId!,
          date: input!.date,
          taxable: { minor: taxable, currency: input!.currency },
          section: input!.section as never,
          documentId: input!.documentId || undefined,
        },
        signal,
      });
      return data!;
    },
    placeholderData: keepWithin(companyId),
  });
}

/**
 * Opens a document from the server: it, its payments and its party are kept in the store as sync
 * would keep them, so the detail and edit screens find them there even when the book on the device
 * doesn't hold them. Asked again on every opening, so what someone else changed shows. A document
 * made on this device and not yet sent isn't on the server; the store already has it.
 */
export function useDocumentRecord(id: string | undefined) {
  const companyId = useAppStore((s) => s.activeCompanyId);
  const aliases = useRemoteMeta((m) => m.idAliases);
  const current = id ? resolveId(id, aliases) : undefined;
  return useQuery({
    // Not under documentKeys.all: keeping the document in the store marks those stale, not this.
    queryKey: ['document', companyId, current],
    enabled: !!companyId && !!current,
    staleTime: 0,
    retry: (count, err) => !(err instanceof ApiError && (err.status === 404 || err.status === 403)) && count < 1,
    queryFn: ({ signal }) => fetchDocumentRecord(companyId, current!, signal),
  });
}

/** One document from the server, kept in the store with its payments and party (see useDocumentRecord). */
export async function fetchDocumentRecord(companyId: string, id: string, signal?: AbortSignal) {
  const { data } = await api.GET('/companies/{companyId}/documents/{id}', { params: { path: { companyId, id } }, signal });
  const doc = data!;
  keep('party', companyId, [doc.party]);
  keep('payment', companyId, doc.payments ?? []);
  keep('document', companyId, [doc]);
  return doc;
}

/**
 * Every open document of `kinds` for a party, oldest first, with what each still owes as the server
 * counts it (the figure it checks an allocation against). Empty until a party is picked.
 */
export function useOpenDocuments(partyId: string | null | undefined, kinds: DocumentKind[]) {
  const companyId = useAppStore((s) => s.activeCompanyId);
  return useQuery({
    queryKey: [...documentKeys.all(companyId), 'open', partyId, kinds],
    enabled: !!companyId && !!partyId,
    queryFn: async ({ signal }) => {
      const rows: ListedDocument[] = [];
      let cursor: string | undefined;
      for (let page = 0; page < 20; page++) {
        const p = documentParams(companyId, { kinds, partyId: partyId!, outstanding: true });
        const { data } = await api.GET('/companies/{companyId}/documents', { params: { path: p.path, query: { ...p.query, sort: 'date', limit: 200, cursor } }, signal });
        rows.push(...((data?.data ?? []) as ListedDocument[]));
        cursor = data?.nextCursor ?? undefined;
        if (!cursor) break;
      }
      return rows;
    },
  });
}

/**
 * Brings a party's payments and the open documents named into the store, so a rule that works on
 * the device (adjusting held advances) sees all of them, not just what happened to be opened.
 */
export async function loadForAdvances(companyId: string, partyId: string, direction: 'received' | 'paid', documentIds: string[]) {
  let cursor: string | undefined;
  for (let page = 0; page < 20; page++) {
    const { data } = await api.GET('/companies/{companyId}/payments', { params: { path: { companyId }, query: { partyId, direction, limit: 200, cursor } } });
    keep('payment', companyId, data?.data ?? []);
    cursor = data?.nextCursor ?? undefined;
    if (!cursor) break;
  }
  await Promise.all(documentIds.map((id) => fetchDocumentRecord(companyId, id)));
}

/** Each payment account's balance in base minor units, as the server works it out from everything. */
export function useServerAccountBalances() {
  const companyId = useAppStore((s) => s.activeCompanyId);
  const q = useQuery({
    queryKey: [...paymentKeys.all(companyId), 'balances'],
    enabled: !!companyId,
    staleTime: 0,
    queryFn: async ({ signal }) => {
      const { data } = await api.GET('/companies/{companyId}/payment-accounts', { params: { path: { companyId } }, signal });
      return Object.fromEntries((data?.data ?? []).map((a) => [a.id!, a.currentBalance?.minor ?? 0])) as Record<string, number>;
    },
  });
  return q.data;
}

export type PaymentQuery = { direction: 'received' | 'paid'; from?: string; to?: string; q?: string; partyId?: string; branchId?: string };
const paymentKeys = {
  all: (companyId: string) => ['payments', companyId] as const,
};
function paymentParams(f: PaymentQuery) {
  return { direction: f.direction, from: f.from || undefined, to: f.to || undefined, q: f.q?.trim() || undefined, partyId: f.partyId || undefined, branchId: f.branchId || undefined };
}

/** Payments one way, newest first, 50 at a time. Each row carries its party's name. */
export function usePaymentPages(f: PaymentQuery) {
  const companyId = useAppStore((s) => s.activeCompanyId);
  const query = useInfiniteQuery({
    queryKey: [...paymentKeys.all(companyId), 'pages', f],
    enabled: !!companyId,
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam, signal }) => {
      const { data } = await api.GET('/companies/{companyId}/payments', { params: { path: { companyId }, query: { ...paymentParams(f), limit: PAGE, cursor: pageParam } }, signal });
      return data!;
    },
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    placeholderData: keepWithin(companyId),
  });
  return { ...query, rows: query.data?.pages.flatMap((p) => p.data ?? []) ?? [] };
}

/** How many payments the filters match, and their total in base currency. */
export function usePaymentSummary(f: PaymentQuery) {
  const companyId = useAppStore((s) => s.activeCompanyId);
  return useQuery({
    queryKey: [...paymentKeys.all(companyId), 'summary', f],
    enabled: !!companyId,
    queryFn: async ({ signal }) => {
      const { data } = await api.GET('/companies/{companyId}/payments/summary', { params: { path: { companyId }, query: paymentParams(f) }, signal });
      return data!;
    },
    placeholderData: keepWithin(companyId),
  });
}

/** Opens a payment from the server, kept in the store with its party (see useDocumentRecord). */
export function usePaymentRecord(id: string | undefined) {
  const companyId = useAppStore((s) => s.activeCompanyId);
  const aliases = useRemoteMeta((m) => m.idAliases);
  const current = id ? resolveId(id, aliases) : undefined;
  return useQuery({
    queryKey: ['payment', companyId, current],
    enabled: !!companyId && !!current,
    staleTime: 0,
    retry: (count, err) => !(err instanceof ApiError && (err.status === 404 || err.status === 403)) && count < 1,
    queryFn: async ({ signal }) => {
      const { data } = await api.GET('/companies/{companyId}/payments/{id}', { params: { path: { companyId, id: current! } }, signal });
      const payment = data!;
      if (payment.partyId && !useAppStore.getState().parties.some((p) => p.id === payment.partyId)) {
        const party = await api.GET('/companies/{companyId}/parties/{id}', { params: { path: { companyId, id: payment.partyId } }, signal });
        keep('party', companyId, [party.data]);
      }
      keep('payment', companyId, [payment]);
      return payment;
    },
  });
}

export type ExpenseQuery = { from?: string; to?: string; q?: string; categoryId?: string; branchId?: string };
const expenseKeys = {
  all: (companyId: string) => ['expenses', companyId] as const,
};
function expenseParams(f: ExpenseQuery) {
  return { from: f.from || undefined, to: f.to || undefined, q: f.q?.trim() || undefined, categoryId: f.categoryId || undefined, branchId: f.branchId || undefined };
}

/** Expenses, newest first, 50 at a time. */
export function useExpensePages(f: ExpenseQuery) {
  const companyId = useAppStore((s) => s.activeCompanyId);
  const query = useInfiniteQuery({
    queryKey: [...expenseKeys.all(companyId), 'pages', f],
    enabled: !!companyId,
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam, signal }) => {
      const { data } = await api.GET('/companies/{companyId}/expenses', { params: { path: { companyId }, query: { ...expenseParams(f), limit: PAGE, cursor: pageParam } }, signal });
      return data!;
    },
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    placeholderData: keepWithin(companyId),
  });
  return { ...query, rows: query.data?.pages.flatMap((p) => p.data ?? []) ?? [] };
}

/** How many expenses the filters match, their total and tax, and the split by category. */
export function useExpenseSummary(f: ExpenseQuery) {
  const companyId = useAppStore((s) => s.activeCompanyId);
  return useQuery({
    queryKey: [...expenseKeys.all(companyId), 'summary', f],
    enabled: !!companyId,
    queryFn: async ({ signal }) => {
      const { data } = await api.GET('/companies/{companyId}/expenses/summary', { params: { path: { companyId }, query: expenseParams(f) }, signal });
      return data!;
    },
    placeholderData: keepWithin(companyId),
  });
}

/** Opens an expense from the server, kept in the store (see useDocumentRecord). */
export function useExpenseRecord(id: string | undefined) {
  const companyId = useAppStore((s) => s.activeCompanyId);
  const aliases = useRemoteMeta((m) => m.idAliases);
  const current = id ? resolveId(id, aliases) : undefined;
  return useQuery({
    queryKey: ['expense', companyId, current],
    enabled: !!companyId && !!current,
    staleTime: 0,
    retry: (count, err) => !(err instanceof ApiError && (err.status === 404 || err.status === 403)) && count < 1,
    queryFn: async ({ signal }) => {
      const { data } = await api.GET('/companies/{companyId}/expenses/{id}', { params: { path: { companyId, id: current! } }, signal });
      keep('expense', companyId, [data]);
      return data!;
    },
  });
}

export type PartyQuery = { kind: 'customer' | 'supplier' | 'general'; q?: string };
const partyKeys = {
  all: (companyId: string) => ['parties', companyId] as const,
};

/** Customers or suppliers by name, 50 at a time, each with what it owes or is owed. */
export function usePartyPages(f: PartyQuery) {
  const companyId = useAppStore((s) => s.activeCompanyId);
  const query = useInfiniteQuery({
    queryKey: [...partyKeys.all(companyId), 'pages', f],
    enabled: !!companyId,
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam, signal }) => {
      const { data } = await api.GET('/companies/{companyId}/parties', { params: { path: { companyId }, query: { kind: f.kind, q: f.q?.trim() || undefined, limit: PAGE, cursor: pageParam } }, signal });
      return data!;
    },
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    placeholderData: keepWithin(companyId),
  });
  return { ...query, rows: query.data?.pages.flatMap((p) => p.data ?? []) ?? [] };
}

/** How many parties match, and what they owe or are owed, in base currency. */
export function usePartySummary(f: PartyQuery) {
  const companyId = useAppStore((s) => s.activeCompanyId);
  return useQuery({
    queryKey: [...partyKeys.all(companyId), 'summary', f],
    enabled: !!companyId,
    queryFn: async ({ signal }) => {
      const { data } = await api.GET('/companies/{companyId}/parties/summary', { params: { path: { companyId }, query: { kind: f.kind, q: f.q?.trim() || undefined } }, signal });
      return data!;
    },
    placeholderData: keepWithin(companyId),
  });
}

/** Opens a customer or supplier from the server, with its balance, kept in the store. */
export function usePartyRecord(id: string | undefined) {
  const companyId = useAppStore((s) => s.activeCompanyId);
  const aliases = useRemoteMeta((m) => m.idAliases);
  const current = id ? resolveId(id, aliases) : undefined;
  return useQuery({
    queryKey: ['party', companyId, current],
    enabled: !!companyId && !!current,
    staleTime: 0,
    retry: (count, err) => !(err instanceof ApiError && (err.status === 404 || err.status === 403)) && count < 1,
    queryFn: async ({ signal }) => {
      const { data } = await api.GET('/companies/{companyId}/parties/{id}', { params: { path: { companyId, id: current! } }, signal });
      keep('party', companyId, [data]);
      return data!;
    },
  });
}

/**
 * What's still open with one party, oldest first, as the receivables (or payables) aging works it out:
 * the documents a reminder lists and the party screen shows.
 */
export function usePartyAging(partyId: string | undefined, kind: 'customer' | 'supplier') {
  const companyId = useAppStore((s) => s.activeCompanyId);
  return useQuery({
    queryKey: ['documents', companyId, 'aging', kind, partyId],
    enabled: !!companyId && !!partyId,
    queryFn: async ({ signal }) => {
      const params = { path: { companyId }, query: { partyId } };
      const { data } = kind === 'customer' ? await api.GET('/companies/{companyId}/receivables', { params, signal }) : await api.GET('/companies/{companyId}/payables', { params, signal });
      return data!;
    },
  });
}

type ReportKey = 'sales-summary' | 'purchase-summary' | 'expense-summary' | 'receivables' | 'payables' | 'stock' | 'tax-summary' | 'payments' | 'profit' | 'tds-register' | 'trial-balance' | 'msme-payables';

/**
 * One of the server's reports, built from its whole book with the same core functions the app used
 * to run on the device. The shape depends on the key (see getReport in the contract).
 */
export function useServerReport<T = unknown>(key: ReportKey, scope: { from: string; to: string; branchId?: string; partyId?: string }, enabled = true) {
  const companyId = useAppStore((s) => s.activeCompanyId);
  return useQuery({
    queryKey: ['reports', companyId, key, scope],
    enabled: enabled && !!companyId,
    queryFn: async ({ signal }) => {
      const { data } = await api.GET('/companies/{companyId}/reports/{reportKey}', {
        params: { path: { companyId, reportKey: key }, query: { from: scope.from, to: scope.to, branchId: scope.branchId || undefined, partyId: scope.partyId || undefined } },
        signal,
      });
      return data as T;
    },
    placeholderData: keepWithin(companyId),
  });
}

export type ItemQuery = { q?: string; type?: 'goods' | 'service'; stock?: 'low' | 'out' | 'tracked' | 'untracked'; branchId?: string; status?: 'active' | 'inactive'; barcode?: string; categoryId?: string; brandId?: string };
const itemKeys = {
  all: (companyId: string) => ['items', companyId] as const,
};

/** Items by name, 50 at a time, each with what's on hand (at a branch, when given). */
export function useItemPages(f: ItemQuery, enabled = true) {
  const companyId = useAppStore((s) => s.activeCompanyId);
  const query = useInfiniteQuery({
    queryKey: [...itemKeys.all(companyId), 'pages', f],
    enabled: enabled && !!companyId,
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam, signal }) => {
      const { data } = await api.GET('/companies/{companyId}/items', {
        params: { path: { companyId }, query: { q: f.q?.trim() || undefined, type: f.type, stock: f.stock, branchId: f.branchId || undefined, status: f.status, barcode: f.barcode || undefined, categoryId: f.categoryId || undefined, brandId: f.brandId || undefined, limit: PAGE, cursor: pageParam } },
        signal,
      });
      return data!;
    },
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    placeholderData: keepWithin(companyId),
  });
  return { ...query, rows: query.data?.pages.flatMap((p) => p.data ?? []) ?? [] };
}

/**
 * Every item that keeps stock, with what's on hand at the active branch: the stock screens (adjust,
 * opening stock, transfer) list them all. Kept in the store, where the stock actions look them up.
 */
export function useTrackedItems() {
  const companyId = useAppStore((s) => s.activeCompanyId);
  const branchId = useAppStore((s) => s.activeBranchId) || undefined;
  const query = useQuery({
    queryKey: [...itemKeys.all(companyId), 'tracked', branchId ?? ''],
    enabled: !!companyId,
    queryFn: async ({ signal }) => {
      const rows: (Item & { stockOnHand?: number })[] = [];
      let cursor: string | undefined;
      // Far past any real catalogue at 200 a page; only a server paging in a loop reaches it.
      for (let page = 0; page < 100; page++) {
        const { data } = await api.GET('/companies/{companyId}/items', { params: { path: { companyId }, query: { stock: 'tracked', branchId, limit: 200, cursor } }, signal });
        rows.push(...((data?.data ?? []) as unknown as (Item & { stockOnHand?: number })[]));
        cursor = data?.nextCursor ?? undefined;
        if (!cursor) break;
      }
      keep('item', companyId, rows);
      return rows;
    },
  });
  const items = useMemo(() => (query.data ?? []) as Item[], [query.data]);
  const stock = useMemo(() => Object.fromEntries((query.data ?? []).map((i) => [i.id, i.stockOnHand ?? 0])) as Record<string, number>, [query.data]);
  return { ...query, items, stock };
}

/** Opens an item from the server, kept in the store. */
export function useItemRecord(id: string | undefined) {
  const companyId = useAppStore((s) => s.activeCompanyId);
  const aliases = useRemoteMeta((m) => m.idAliases);
  const current = id ? resolveId(id, aliases) : undefined;
  return useQuery({
    queryKey: ['item', companyId, current],
    enabled: !!companyId && !!current,
    staleTime: 0,
    retry: (count, err) => !(err instanceof ApiError && (err.status === 404 || err.status === 403)) && count < 1,
    queryFn: async ({ signal }) => {
      const { data } = await api.GET('/companies/{companyId}/items/{id}', { params: { path: { companyId, id: current! } }, signal });
      keep('item', companyId, [data]);
      return data!;
    },
  });
}

/** One item's on hand, value, quantity sold and movements with a running balance. */
export function useItemLedger(id: string | undefined, branchId?: string, enabled = true) {
  const companyId = useAppStore((s) => s.activeCompanyId);
  return useQuery({
    queryKey: [...itemKeys.all(companyId), 'ledger', id, branchId ?? ''],
    enabled: enabled && !!companyId && !!id,
    queryFn: async ({ signal }) => {
      const { data } = await api.GET('/companies/{companyId}/items/{id}/ledger', { params: { path: { companyId, id: id! }, query: { branchId: branchId || undefined } }, signal });
      return data!;
    },
  });
}

/** What's on hand of every tracked item at a branch (or across the ones the user sees): item id → quantity. */
export function useServerStockLevels(branchId?: string, enabled = true) {
  const companyId = useAppStore((s) => s.activeCompanyId);
  return useQuery({
    queryKey: [...itemKeys.all(companyId), 'levels', branchId ?? ''],
    enabled: enabled && !!companyId,
    queryFn: async ({ signal }) => {
      const { data } = await api.GET('/companies/{companyId}/stock/levels', { params: { path: { companyId }, query: { branchId: branchId || undefined } }, signal });
      const out: Record<string, number> = {};
      for (const l of data?.data ?? []) if (l.itemId) out[l.itemId] = (out[l.itemId] ?? 0) + (l.onHand ?? 0);
      return out;
    },
  });
}

/** What a document dated `asOf` at a branch can take out of each item, as finalising will check it. */
export function useStockAvailable(branchId: string | undefined, asOf: string, enabled = true) {
  const companyId = useAppStore((s) => s.activeCompanyId);
  return useQuery({
    queryKey: [...itemKeys.all(companyId), 'levels', branchId ?? '', asOf],
    enabled: enabled && !!companyId && !!branchId,
    queryFn: async ({ signal }) => {
      const { data } = await api.GET('/companies/{companyId}/stock/levels', { params: { path: { companyId }, query: { branchId, asOf } }, signal });
      const out: Record<string, number> = {};
      for (const l of data?.data ?? []) if (l.itemId) out[l.itemId] = l.onHand ?? 0;
      return out;
    },
    placeholderData: keepWithin(companyId),
  });
}

/** Whether a document has already moved stock (an invoice made from a delivery, say). */
export function useStockMovedBy(referenceId: string | undefined) {
  const companyId = useAppStore((s) => s.activeCompanyId);
  return useQuery({
    queryKey: [...itemKeys.all(companyId), 'movements', 'by', referenceId],
    enabled: !!companyId && !!referenceId,
    queryFn: async ({ signal }) => {
      const { data } = await api.GET('/companies/{companyId}/stock/movements', { params: { path: { companyId }, query: { referenceId, limit: 1 } }, signal });
      return (data?.data ?? []).length > 0;
    },
  });
}

/** Stock movements, newest first, 50 at a time; each names its item. */
export function useMovementPages(f: { branchId?: string; itemId?: string; type?: string; from?: string; to?: string; q?: string }) {
  const companyId = useAppStore((s) => s.activeCompanyId);
  const query = useInfiniteQuery({
    queryKey: [...itemKeys.all(companyId), 'movements', f],
    enabled: !!companyId,
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam, signal }) => {
      const { data } = await api.GET('/companies/{companyId}/stock/movements', {
        params: { path: { companyId }, query: { branchId: f.branchId || undefined, itemId: f.itemId, type: f.type as never, from: f.from, to: f.to, q: f.q?.trim() || undefined, limit: PAGE, cursor: pageParam } },
        signal,
      });
      return data!;
    },
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    placeholderData: keepWithin(companyId),
  });
  return { ...query, rows: query.data?.pages.flatMap((p) => p.data ?? []) ?? [] };
}

type BooksView = 'trial-balance' | 'profit-loss' | 'balance-sheet' | 'ledger' | 'day-book' | 'cost-centres' | 'accounts' | 'integrity';

/**
 * One of the books' statements from the server: the same core ledger functions, run on its whole
 * book, so the device needn't hold every posting. Shaped as core returns them (amounts in paise).
 */
export function useBooksView<T>(
  view: BooksView,
  scope: { from?: string; to: string; account?: string; breakdown?: 'month' | 'quarter'; compare?: 'previousPeriod' | 'previousYear' },
  enabled = true,
) {
  const companyId = useAppStore((s) => s.activeCompanyId);
  return useQuery({
    queryKey: ['books', companyId, view, scope],
    enabled: enabled && !!companyId,
    queryFn: async ({ signal }) => {
      const { data } = await api.GET('/companies/{companyId}/books/{view}', { params: { path: { companyId, view }, query: { from: scope.from, to: scope.to, account: scope.account, breakdown: scope.breakdown, compare: scope.compare } }, signal });
      return data as T;
    },
    placeholderData: keepWithin(companyId),
  });
}

const EMPTY_BOOK: Book = { parties: [], paymentAccounts: [], expenseCategories: [], ledgerAccounts: [] };

/** The chart of accounts as the server names it, and each account's balance today. */
export function useServerBook() {
  const q = useBooksView<{ book: Book; accounts: Account[]; balances: Record<string, number> }>('accounts', { to: today() });
  const data = q.data;
  // `loaded`: the chart is in, or it failed (no access, no connection) and screens go on without names
  // rather than shimmer for good.
  return { book: data?.book ?? EMPTY_BOOK, accounts: data?.accounts ?? [], balances: data?.balances ?? {}, loaded: !!data || q.isError };
}

export type VoucherQuery = { kind?: 'journal' | 'contra' | 'gstJournal' | 'tdsChallan' | 'receipt' | 'gstChallan'; status?: 'draft' | 'posted'; from?: string; to?: string; q?: string; partyId?: string };
const voucherParams = (f: VoucherQuery) => ({ kind: f.kind, status: f.status, from: f.from || undefined, to: f.to || undefined, q: f.q?.trim() || undefined, partyId: f.partyId || undefined });
const voucherKeys = {
  all: (companyId: string) => ['vouchers', companyId] as const,
};

/** Vouchers, newest first, 50 at a time. */
export function useVoucherPages(f: VoucherQuery) {
  const companyId = useAppStore((s) => s.activeCompanyId);
  const query = useInfiniteQuery({
    queryKey: [...voucherKeys.all(companyId), 'pages', f],
    enabled: !!companyId,
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam, signal }) => {
      const { data } = await api.GET('/companies/{companyId}/vouchers', { params: { path: { companyId }, query: { ...voucherParams(f), limit: PAGE, cursor: pageParam } }, signal });
      return data!;
    },
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    placeholderData: keepWithin(companyId),
  });
  return { ...query, rows: (query.data?.pages.flatMap((p) => p.data ?? []) ?? []) as unknown as Voucher[] };
}

/** A party's unadjusted advances and direct notes, and its open documents, from the server (the adjustment entry). */
export function useAdjustable(partyId: string | undefined, side: 'customer' | 'supplier' = 'customer') {
  const companyId = useAppStore((s) => s.activeCompanyId);
  return useQuery({
    queryKey: ['adjustable', companyId, partyId, side],
    enabled: !!companyId && !!partyId,
    staleTime: 0,
    queryFn: async ({ signal }) => {
      const { data } = await api.GET('/companies/{companyId}/payments/adjust', { params: { path: { companyId }, query: { partyId: partyId!, side } }, signal });
      return data!;
    },
  });
}

export type AdjustmentAllocation = Schema<'AdjustmentAllocation'>;

/**
 * Applies advances and direct notes on the server (all of them oldest first when `allocations` is
 * left out), then marks what it changed stale. Needs a connection.
 */
export async function adjustOnServer(partyId: string, side: 'customer' | 'supplier', allocations?: AdjustmentAllocation[]) {
  const companyId = useAppStore.getState().activeCompanyId;
  const { data } = await api.POST('/companies/{companyId}/payments/adjust', { params: { path: { companyId } }, body: { partyId, side, allocations } });
  for (const key of [['adjustable', companyId], documentKeys.all(companyId), paymentKeys.all(companyId), partyKeys.all(companyId), ['reports', companyId], ['books', companyId]]) {
    void queryClient.invalidateQueries({ queryKey: key });
  }
  return data!;
}

/**
 * "Adjust advances" from a payment screen, on the server: it applies direct credit notes too and
 * brings a service advance's GST back on the invoice's date (RULES 8.13). `documentIds` limits it to those documents,
 * oldest credit first, notes before payments on the same day. Returns what was applied, by currency.
 */
export async function adjustAdvancesFor(
  partyId: string,
  direction: 'received' | 'paid',
  documentIds: string[] | undefined,
): Promise<{ minor: number; currency: string }[]> {
  const side = direction === 'received' ? 'customer' : 'supplier';
  const companyId = useAppStore.getState().activeCompanyId;
  let allocations: AdjustmentAllocation[] | undefined;
  if (documentIds) {
    const { data } = await api.GET('/companies/{companyId}/payments/adjust', { params: { path: { companyId }, query: { partyId, side } } });
    const credits = [...(data?.credits ?? [])].sort((a, b) => a.date.localeCompare(b.date) || (a.sourceType === b.sourceType ? 0 : a.sourceType === 'note' ? -1 : 1));
    const open = (data?.open ?? []).filter((o) => documentIds.includes(o.documentId));
    allocations = fifoAllocate(
      credits.map((c) => ({ id: `${c.sourceType}:${c.id}`, date: c.date, left: c.left.minor })),
      open.map((o) => ({ id: o.documentId, date: o.date, outstanding: o.outstanding.minor })),
    ).map((m) => ({
      sourceType: m.creditId.startsWith('note:') ? 'note' : 'payment',
      sourceId: m.creditId.split(':').slice(1).join(':'),
      documentId: m.documentId,
      amount: { minor: m.amount, currency: open[0]?.outstanding.currency ?? '' },
    }));
    if (!allocations.length) return [];
  }
  const res = await adjustOnServer(partyId, side, allocations);
  // The payments it rewrote reach the device's book on the next pull.
  refreshSoon();
  const total = res.applied.reduce((a, x) => a + x.amount.minor, 0);
  return total > 0 ? [{ minor: total, currency: res.applied[0].amount.currency }] : [];
}

/** How many vouchers the filters match, their total, and (for receipts) the split by what they were for. */
export function useVoucherSummary(f: VoucherQuery) {
  const companyId = useAppStore((s) => s.activeCompanyId);
  return useQuery({
    queryKey: [...voucherKeys.all(companyId), 'summary', f],
    enabled: !!companyId,
    queryFn: async ({ signal }) => {
      const { data } = await api.GET('/companies/{companyId}/vouchers/summary', { params: { path: { companyId }, query: voucherParams(f) }, signal });
      return data!;
    },
    placeholderData: keepWithin(companyId),
  });
}

/** Every voucher of a kind in a range, for screens that total them (Receipts, the TDS reports). */
export function useAllVouchers(f: VoucherQuery, enabled = true) {
  const companyId = useAppStore((s) => s.activeCompanyId);
  return useQuery({
    queryKey: [...voucherKeys.all(companyId), 'all', f],
    enabled: enabled && !!companyId,
    queryFn: async ({ signal }) => {
      const rows: Voucher[] = [];
      let cursor: string | undefined;
      for (let page = 0; page < 100; page++) {
        const { data } = await api.GET('/companies/{companyId}/vouchers', { params: { path: { companyId }, query: { kind: f.kind, from: f.from, to: f.to, limit: 200, cursor } }, signal });
        rows.push(...((data?.data ?? []) as unknown as Voucher[]));
        cursor = data?.nextCursor ?? undefined;
        if (!cursor) break;
      }
      return rows;
    },
    placeholderData: keepWithin(companyId),
  });
}

/** Opens a voucher from the server, kept in the store. */
export function useVoucherRecord(id: string | undefined) {
  const companyId = useAppStore((s) => s.activeCompanyId);
  const aliases = useRemoteMeta((m) => m.idAliases);
  const current = id ? resolveId(id, aliases) : undefined;
  return useQuery({
    queryKey: ['voucher', companyId, current],
    enabled: !!companyId && !!current,
    staleTime: 0,
    retry: (count, err) => !(err instanceof ApiError && (err.status === 404 || err.status === 403)) && count < 1,
    queryFn: async ({ signal }) => {
      const { data } = await api.GET('/companies/{companyId}/vouchers/{id}', { params: { path: { companyId, id: current! } }, signal });
      keep('voucher', companyId, [data]);
      return data!;
    },
  });
}

export type ReportDataKey =
  | 'sales-summary' | 'purchase-summary' | 'expense-summary' | 'receivables' | 'payables' | 'stock' | 'tax-summary'
  | 'payments' | 'advances' | 'profit' | 'tds-register' | 'tds-payable' | 'tds-receivable' | 'tds-26q' | 'tds-challans' | 'tcs-register' | 'tcs-payable' | 'msme-payables' | 'gstr1';

/** A report as the app shows it, worked out on the server by the same core function (see getReportData). */
export function useReportData<T>(key: ReportDataKey | null, scope: { from: string; to: string; branchId?: string | null; partyId?: string | null }) {
  const companyId = useAppStore((s) => s.activeCompanyId);
  return useQuery({
    queryKey: ['reports', companyId, 'data', key, scope],
    enabled: !!companyId && !!key,
    queryFn: async ({ signal }) => {
      const { data } = await api.GET('/companies/{companyId}/report-data/{reportKey}', {
        params: { path: { companyId, reportKey: key! }, query: { from: scope.from, to: scope.to, branchId: scope.branchId || undefined, partyId: scope.partyId || undefined } },
        signal,
      });
      return data as T;
    },
    placeholderData: keepWithin(companyId),
  });
}

/** What a dashboard hub is asked for: the branch (undefined for all) and the period bar's period. */
export type HubScope = { branchId?: string; period: DashboardPeriod };

/** The period as the hubs' query string has it. */
function periodQuery(p: DashboardPeriod) {
  return {
    range: p.range,
    ...(p.range === 'custom' ? { from: p.from, to: p.to } : {}),
    grain: p.grain,
    compare: p.compare ? ('previous' as const) : ('none' as const),
  };
}
const periodKey = (p: DashboardPeriod) => [p.range, p.range === 'custom' ? `${p.from}..${p.to}` : '', p.grain, p.compare ? 'cmp' : ''].join('|');

export const hubKeys = {
  all: (companyId: string) => ['hubs', companyId] as const,
  sales: (companyId: string, s: HubScope) => ['hubs', companyId, 'sales', s.branchId ?? '', periodKey(s.period)] as const,
  purchases: (companyId: string, s: HubScope) => ['hubs', companyId, 'purchases', s.branchId ?? '', periodKey(s.period)] as const,
  home: (companyId: string, s: HubScope) => ['hubs', companyId, 'home', s.branchId ?? '', periodKey(s.period)] as const,
  accounts: (companyId: string, s: HubScope) => ['hubs', companyId, 'accounts', s.branchId ?? '', periodKey(s.period)] as const,
  filings: (companyId: string, branchId?: string) => ['hubs', companyId, 'filings', branchId ?? ''] as const,
  compliance: (companyId: string, branchId?: string) => ['compliance', companyId, branchId ?? ''] as const,
};

/**
 * The Home tab's figures for the period: sales, collections, expenses and profit, trends, invoice
 * status, cash, stock health, money movement, what's owed both ways, what needs attention. The
 * previous answer stays up while a new period loads, so the cards don't blank on every change.
 */
export function useHomeHub(scope: HubScope) {
  const companyId = useAppStore((s) => s.activeCompanyId);
  return useQuery({
    queryKey: hubKeys.home(companyId, scope),
    enabled: !!companyId,
    placeholderData: keepWithin(companyId),
    queryFn: async ({ signal }) => {
      const { data } = await api.GET('/companies/{companyId}/hubs/home', { params: { path: { companyId }, query: { branchId: scope.branchId, ...periodQuery(scope.period) } }, signal });
      return data!;
    },
  });
}

/** The Accounts & P&L tab: profit, cash movement, tax position, and the books for a user who sees them. */
export function useAccountsHub(scope: HubScope, enabled = true) {
  const companyId = useAppStore((s) => s.activeCompanyId);
  return useQuery({
    queryKey: hubKeys.accounts(companyId, scope),
    enabled: enabled && !!companyId,
    placeholderData: keepWithin(companyId),
    queryFn: async ({ signal }) => {
      const { data } = await api.GET('/companies/{companyId}/hubs/accounts', { params: { path: { companyId }, query: { branchId: scope.branchId, ...periodQuery(scope.period) } }, signal });
      return data!;
    },
  });
}

/** Returns and deposits falling due, GSTR-2B against the books, and TDS still to deposit. */
export function useFilingsHub(branchId?: string, enabled = true) {
  const companyId = useAppStore((s) => s.activeCompanyId);
  return useQuery({
    queryKey: hubKeys.filings(companyId, branchId),
    enabled: enabled && !!companyId,
    // Due dates move by the day; no need to ask on every visit.
    staleTime: 5 * 60_000,
    queryFn: async ({ signal }) => {
      const { data } = await api.GET('/companies/{companyId}/hubs/compliance', { params: { path: { companyId }, query: { branchId } }, signal });
      return data!;
    },
  });
}

export type ComplianceCounts = {
  eInvoice: Record<EInvoiceStatus, number>;
  eway: Record<EwayBillStatus, number>;
  expiringSoon: number;
  /** Documents that need a bill and do not yet have a live one. */
  ewayOutstanding: number;
};

const NO_COMPLIANCE: ComplianceCounts = {
  eInvoice: { notApplicable: 0, pending: 0, generated: 0, cancelled: 0, failed: 0 },
  eway: { active: 0, expired: 0, cancelled: 0 },
  expiringSoon: 0,
  ewayOutstanding: 0,
};

/**
 * E-invoice and e-way bill counts for badges, the GST tab and the compliance hub. Zero until the
 * first answer, so a badge never shows a stale guess; the same query serves every caller.
 */
export function useComplianceCounts(enabled = true): ComplianceCounts & { loaded: boolean } {
  const companyId = useAppStore((s) => s.activeCompanyId);
  const branchId = useAppStore((s) => s.activeBranchId) || undefined;
  const q = useQuery({
    queryKey: hubKeys.compliance(companyId, branchId),
    enabled: enabled && !!companyId,
    queryFn: async ({ signal }) => {
      const { data } = await api.GET('/companies/{companyId}/compliance/summary', { params: { path: { companyId }, query: { branchId } }, signal });
      return data!;
    },
  });
  // `loaded`: the answer is in (or failed), so the zeros are real. Until then a tile shows its shimmer, not "0".
  const loaded = !!q.data || q.isError;
  return useMemo(() => ({ ...(q.data ?? NO_COMPLIANCE), loaded }), [q.data, loaded]);
}

/** The Purchases tab's figures for the period: bills, expenses and the Expenses tab, what's owed, counts, latest bills. */
export function usePurchasesHub(scope: HubScope) {
  const companyId = useAppStore((s) => s.activeCompanyId);
  return useQuery({
    queryKey: hubKeys.purchases(companyId, scope),
    enabled: !!companyId,
    placeholderData: keepWithin(companyId),
    queryFn: async ({ signal }) => {
      const { data } = await api.GET('/companies/{companyId}/hubs/purchases', { params: { path: { companyId }, query: { branchId: scope.branchId, ...periodQuery(scope.period) } }, signal });
      return data!;
    },
  });
}

/** The Sales tab's figures for the period: invoicing, collections, the trend, what customers owe, counts, top customers, latest invoices. */
export function useSalesHub(scope: HubScope) {
  const companyId = useAppStore((s) => s.activeCompanyId);
  return useQuery({
    queryKey: hubKeys.sales(companyId, scope),
    enabled: !!companyId,
    placeholderData: keepWithin(companyId),
    queryFn: async ({ signal }) => {
      const { data } = await api.GET('/companies/{companyId}/hubs/sales', { params: { path: { companyId }, query: { branchId: scope.branchId, ...periodQuery(scope.period) } }, signal });
      return data!;
    },
  });
}

/**
 * Search across the business on the server: parties, items with stock, documents and payments from
 * `search`, and expenses from the expense list's own search. Only for two characters or more.
 */
export function useServerSearch(query: string, withExpenses: boolean) {
  const companyId = useAppStore((s) => s.activeCompanyId);
  const q = query.trim();
  const enabled = !!companyId && q.length >= 2;
  const found = useQuery({
    queryKey: ['search', companyId, q],
    enabled,
    queryFn: async ({ signal }) => {
      const { data } = await api.GET('/companies/{companyId}/search', { params: { path: { companyId }, query: { q, limit: 10 } }, signal });
      return data!;
    },
    placeholderData: keepWithin(companyId),
  });
  const expenses = useQuery({
    queryKey: [...expenseKeys.all(companyId), 'search', q],
    enabled: enabled && withExpenses,
    queryFn: async ({ signal }) => {
      const { data } = await api.GET('/companies/{companyId}/expenses', { params: { path: { companyId }, query: { q, limit: 10 } }, signal });
      return data!.data ?? [];
    },
    placeholderData: keepWithin(companyId),
  });
  return {
    found: enabled ? found.data : undefined,
    expenses: enabled && withExpenses ? (expenses.data ?? []) : [],
    isFetching: found.isFetching || expenses.isFetching,
    // The search itself failing is not "no matches".
    isError: enabled && found.isError,
    refetch: () => {
      void found.refetch();
      if (withExpenses) void expenses.refetch();
    },
  };
}

/** Record counts and what the setup is used by, for the settings screens. Refreshed on every visit. */
/** This month's AI actions against the allowance (Lixi messages and provider bill scans). */
export function useAiUsage() {
  const companyId = useAppStore((s) => s.activeCompanyId);
  return useQuery({
    queryKey: ['aiUsage', companyId],
    enabled: !!companyId,
    staleTime: 0,
    queryFn: async ({ signal }) => {
      const { data } = await api.GET('/companies/{companyId}/ai-usage', { params: { path: { companyId } }, signal });
      return data!;
    },
  });
}

export function useCompanyUsage() {
  const companyId = useAppStore((s) => s.activeCompanyId);
  return useQuery({
    queryKey: ['usage', companyId],
    enabled: !!companyId,
    staleTime: 0,
    queryFn: async ({ signal }) => {
      const { data } = await api.GET('/companies/{companyId}/usage', { params: { path: { companyId } }, signal });
      return data!;
    },
  });
}

/**
 * A customer's billable expenses that no live invoice has recovered yet, in `currency`; the
 * document being edited (`documentId`) doesn't count as recovering its own.
 */
export function useBillableExpenses(partyId: string | undefined, currency: string, documentId?: string) {
  const companyId = useAppStore((s) => s.activeCompanyId);
  return useQuery({
    queryKey: [...expenseKeys.all(companyId), 'billable', partyId, documentId],
    enabled: !!companyId && !!partyId,
    queryFn: async ({ signal }) => {
      const { data } = await api.GET('/companies/{companyId}/expenses', {
        params: { path: { companyId }, query: { unrecovered: true, forCustomer: partyId, exceptDocumentId: documentId, limit: 200 } },
        signal,
      });
      return (data?.data ?? []) as unknown as Expense[];
    },
    select: (rows) => rows.filter((e) => e.currency === currency),
  });
}

/** One e-way bill from the server, kept in the store, for its page. */
export function useEwayBillRecord(id: string | undefined) {
  const companyId = useAppStore((s) => s.activeCompanyId);
  return useQuery({
    queryKey: ['ewayBill', companyId, id],
    enabled: !!companyId && !!id,
    staleTime: 0,
    retry: (count, err) => !(err instanceof ApiError && (err.status === 404 || err.status === 403)) && count < 1,
    queryFn: async ({ signal }) => {
      const { data } = await api.GET('/companies/{companyId}/eway-bills/{id}', { params: { path: { companyId, id: id! } }, signal });
      keep('eway_bill', companyId, [data]);
      return data!;
    },
  });
}

/** The audit trail, newest first, 50 at a time, searched on the server. */
export function useAuditPages(q: string) {
  const companyId = useAppStore((s) => s.activeCompanyId);
  const query = useInfiniteQuery({
    queryKey: ['audit', companyId, q.trim()],
    enabled: !!companyId,
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam, signal }) => {
      const { data } = await api.GET('/companies/{companyId}/audit-events', { params: { path: { companyId }, query: { q: q.trim() || undefined, limit: PAGE, cursor: pageParam } }, signal });
      return data!;
    },
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    placeholderData: keepWithin(companyId),
  });
  return { ...query, rows: (query.data?.pages.flatMap((p) => p.data ?? []) ?? []) as unknown as AuditEvent[] };
}

/** The compliance register's documents: by e-invoice status, or those still needing an e-way bill. */
export function useComplianceDocuments(f: { need: 'eInvoice' | 'ewayBill'; status?: EInvoiceStatus; q?: string }, enabled = true) {
  const companyId = useAppStore((s) => s.activeCompanyId);
  const branchId = useAppStore((s) => s.activeBranchId) || undefined;
  const query = useQuery({
    queryKey: [...hubKeys.compliance(companyId, branchId), 'documents', f],
    enabled: enabled && !!companyId,
    queryFn: async ({ signal }) => {
      const { data } = await api.GET('/companies/{companyId}/compliance/documents', { params: { path: { companyId }, query: { ...f, branchId, limit: 200 } }, signal });
      return data!.data;
    },
    placeholderData: keepWithin(companyId),
  });
  return { ...query, rows: (query.data ?? []) as ListedDocument[] };
}

/** E-way bills, newest first, 50 at a time; status and search are filtered on the server. */
export function useEwayBillPages(f: { status?: EwayBillStatus; q?: string }, enabled = true) {
  const companyId = useAppStore((s) => s.activeCompanyId);
  const branchId = useAppStore((s) => s.activeBranchId) || undefined;
  const query = useInfiniteQuery({
    queryKey: [...hubKeys.compliance(companyId, branchId), 'eway', f],
    enabled: enabled && !!companyId,
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam, signal }) => {
      const { data } = await api.GET('/companies/{companyId}/eway-bills', { params: { path: { companyId }, query: { ...f, branchId, limit: PAGE, cursor: pageParam } }, signal });
      return data!;
    },
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    placeholderData: keepWithin(companyId),
  });
  return { ...query, rows: (query.data?.pages.flatMap((p) => p.data ?? []) ?? []) as unknown as EwayBill[] };
}

// ------------------------------------------------------------------ banking

export type BankLine = Schema<'BankStatementLine'>;
export type BankLineStatus = Schema<'BankLineStatus'>;
export type BankReconciliation = Schema<'BankReconciliation'>;
export type BankLineSummary = Schema<'BankLineSummary'>;
/** Statement lines, their counts and reconciliations: server only, invalidated by remote/banking.ts. */
export const bankingKeys = {
  all: (companyId: string) => ['banking', companyId] as const,
  account: (companyId: string, accountId: string) => ['banking', companyId, accountId] as const,
};

/** A bank account's statement lines in one state (or all), newest first, 50 at a time. */
export function useBankLines(accountId: string | undefined, status?: BankLineStatus) {
  const companyId = useAppStore((s) => s.activeCompanyId);
  const query = useInfiniteQuery({
    queryKey: [...bankingKeys.account(companyId, accountId ?? ''), 'lines', status ?? 'all'],
    enabled: !!companyId && !!accountId,
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam, signal }) => {
      const { data } = await api.GET('/companies/{companyId}/payment-accounts/{id}/bank-lines', {
        params: { path: { companyId, id: accountId! }, query: { status, limit: PAGE, cursor: pageParam } },
        signal,
      });
      return data!;
    },
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    placeholderData: keepWithin(companyId),
  });
  return { ...query, rows: (query.data?.pages.flatMap((p) => p.data ?? []) ?? []) as BankLine[] };
}

/** How many of a bank account's lines are waiting, matched and excluded, and its latest statement balance. */
export function useBankLineSummary(accountId: string | undefined) {
  const companyId = useAppStore((s) => s.activeCompanyId);
  return useQuery({
    queryKey: [...bankingKeys.account(companyId, accountId ?? ''), 'summary'],
    enabled: !!companyId && !!accountId,
    queryFn: async ({ signal }) => {
      const { data } = await api.GET('/companies/{companyId}/payment-accounts/{id}/bank-lines/summary', { params: { path: { companyId, id: accountId! } }, signal });
      return data!;
    },
    placeholderData: keepWithin(companyId),
  });
}

/** The bank reconciliation statement of an account as of a day. */
export function useBankReconciliation(accountId: string | undefined, asOf: string) {
  const companyId = useAppStore((s) => s.activeCompanyId);
  return useQuery({
    queryKey: [...bankingKeys.account(companyId, accountId ?? ''), 'reconciliation', asOf],
    enabled: !!companyId && !!accountId && !!asOf,
    queryFn: async ({ signal }) => {
      const { data } = await api.GET('/companies/{companyId}/payment-accounts/{id}/reconciliation', { params: { path: { companyId, id: accountId! }, query: { asOf } }, signal });
      return data!;
    },
    placeholderData: keepWithin(companyId),
  });
}

/**
 * Marks server reads stale when what they show changes on the device: a save here (optimistic, then
 * confirmed) or a change pulled by sync. Batched, so a sync page of 500 changes refetches once.
 * Signing out or switching business drops everything cached for the old one.
 */
export function watchStoreForQueries(): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const stale = new Set<string>();
  const flush = () => {
    timer = undefined;
    const companyId = useAppStore.getState().activeCompanyId;
    if (stale.has('stock')) {
      // Item lists, levels, ledgers and movements; searches and records are keyed apart and refetch on open.
      for (const part of ['pages', 'ledger', 'levels', 'movements', 'tracked']) void queryClient.invalidateQueries({ queryKey: [...itemKeys.all(companyId), part] });
      void queryClient.invalidateQueries({ queryKey: ['hubs', companyId, 'home'] });
    }
    if (stale.has('vouchers')) {
      void queryClient.invalidateQueries({ queryKey: [...voucherKeys.all(companyId), 'pages'] });
      void queryClient.invalidateQueries({ queryKey: [...voucherKeys.all(companyId), 'all'] });
      void queryClient.invalidateQueries({ queryKey: [...voucherKeys.all(companyId), 'summary'] });
      void queryClient.invalidateQueries({ queryKey: ['books', companyId] });
      // Contra and journal lines move money between accounts.
      void queryClient.invalidateQueries({ queryKey: [...paymentKeys.all(companyId), 'balances'] });
      // A voucher matched to a bank line, or one no longer there.
      void queryClient.invalidateQueries({ queryKey: bankingKeys.all(companyId) });
    }
    if (stale.has('documents')) {
      void queryClient.invalidateQueries({ queryKey: documentKeys.all(companyId) });
      void queryClient.invalidateQueries({ queryKey: paymentKeys.all(companyId) });
      void queryClient.invalidateQueries({ queryKey: expenseKeys.all(companyId) });
      void queryClient.invalidateQueries({ queryKey: [...partyKeys.all(companyId), 'pages'] });
      void queryClient.invalidateQueries({ queryKey: ['reports', companyId] });
      void queryClient.invalidateQueries({ queryKey: ['books', companyId] });
      void queryClient.invalidateQueries({ queryKey: [...partyKeys.all(companyId), 'summary'] });
      // The hubs add up documents and payments.
      void queryClient.invalidateQueries({ queryKey: hubKeys.all(companyId) });
      // Payments and expenses are what bank lines match; one edited or deleted changes the reconciliation.
      void queryClient.invalidateQueries({ queryKey: bankingKeys.all(companyId) });
    }
    if (stale.has('documents') || stale.has('eway')) void queryClient.invalidateQueries({ queryKey: ['compliance', companyId] });
    stale.clear();
  };
  const mark = (what: string) => {
    stale.add(what);
    timer ??= setTimeout(flush, 250);
  };
  const unsubscribe = useAppStore.subscribe((s, prev) => {
    if (s.session.userId !== prev.session.userId || s.activeCompanyId !== prev.activeCompanyId) {
      // Signed out, or someone else took over without signing out (accepting an invite): nothing cached is theirs.
      if (!s.session.authenticated || (prev.session.userId && s.session.userId !== prev.session.userId)) queryClient.clear();
      return;
    }
    // A payment changes what an invoice still owes, and so its status.
    if (s.documents !== prev.documents || s.payments !== prev.payments || s.expenses !== prev.expenses) mark('documents');
    if (s.stockMovements !== prev.stockMovements || s.documents !== prev.documents) mark('stock');
    if (s.vouchers !== prev.vouchers) mark('vouchers');
    if (s.ewayBills !== prev.ewayBills) mark('eway');
  });
  return () => {
    unsubscribe();
    if (timer) clearTimeout(timer);
  };
}

/** Wires the store watcher for the life of the app; mount once near the root. */
export function useQueryStoreWatch() {
  useEffect(() => watchStoreForQueries(), []);
}
