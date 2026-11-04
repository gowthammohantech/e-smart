import { useEffect, useMemo } from 'react';
import { QueryClient, keepPreviousData, useInfiniteQuery, useQuery } from '@tanstack/react-query';
import type { Schema } from '@esmart/api-client';
import type { DocStatus, DocumentKind, Item, Voucher } from '@esmart/core/types';
import type { Account, Book } from '@esmart/core/domain/ledger/accounts';
import { today } from '@esmart/core/lib/date';
import { useAppStore } from '../store/appStore';
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

/** A document list's filters, as the server takes them. */
export type DocumentQuery = {
  kinds: DocumentKind[];
  statuses?: DocStatus[];
  partyId?: string;
  branchId?: string;
  from?: string;
  to?: string;
  q?: string;
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
  };
  return { path: { companyId }, query };
}

export const documentKeys = {
  all: (companyId: string) => ['documents', companyId] as const,
  pages: (companyId: string, f: DocumentQuery) => ['documents', companyId, 'pages', f] as const,
  summary: (companyId: string, f: Omit<DocumentQuery, 'sort'>) => ['documents', companyId, 'summary', f] as const,
};

/** One kind's documents (or several), 50 at a time, newest first unless sorted otherwise. */
export function useDocumentPages(f: DocumentQuery) {
  const companyId = useAppStore((s) => s.activeCompanyId);
  const query = useInfiniteQuery({
    queryKey: documentKeys.pages(companyId, f),
    enabled: !!companyId,
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
    placeholderData: keepPreviousData,
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
    placeholderData: keepPreviousData,
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
export function usePartySearch(kind: 'customer' | 'supplier', q: string, enabled = true) {
  const companyId = useAppStore((s) => s.activeCompanyId);
  return useQuery({
    queryKey: ['parties', companyId, 'search', kind, q.trim()],
    enabled: enabled && !!companyId,
    queryFn: async ({ signal }) => {
      const { data } = await api.GET('/companies/{companyId}/parties', { params: { path: { companyId }, query: { kind, q: q.trim() || undefined, limit: PAGE } }, signal });
      const rows = data?.data ?? [];
      keep('party', companyId, rows);
      return rows;
    },
    // Asked again each time the picker opens: keeping results in the store marks nothing stale.
    staleTime: 0,
    placeholderData: keepPreviousData,
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
    placeholderData: keepPreviousData,
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
    placeholderData: keepPreviousData,
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

export type PaymentQuery = { direction: 'received' | 'paid'; from?: string; to?: string; q?: string; partyId?: string };
const paymentKeys = {
  all: (companyId: string) => ['payments', companyId] as const,
};
function paymentParams(f: PaymentQuery) {
  return { direction: f.direction, from: f.from || undefined, to: f.to || undefined, q: f.q?.trim() || undefined, partyId: f.partyId || undefined };
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
    placeholderData: keepPreviousData,
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
    placeholderData: keepPreviousData,
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

export type ExpenseQuery = { from?: string; to?: string; q?: string; categoryId?: string };
const expenseKeys = {
  all: (companyId: string) => ['expenses', companyId] as const,
};
function expenseParams(f: ExpenseQuery) {
  return { from: f.from || undefined, to: f.to || undefined, q: f.q?.trim() || undefined, categoryId: f.categoryId || undefined };
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
    placeholderData: keepPreviousData,
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
    placeholderData: keepPreviousData,
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

export type PartyQuery = { kind: 'customer' | 'supplier'; q?: string };
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
    placeholderData: keepPreviousData,
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
    placeholderData: keepPreviousData,
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
    placeholderData: keepPreviousData,
  });
}

export type ItemQuery = { q?: string; type?: 'goods' | 'service'; stock?: 'low' | 'out' | 'tracked' | 'untracked'; branchId?: string; status?: 'active' | 'inactive'; barcode?: string };
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
        params: { path: { companyId }, query: { q: f.q?.trim() || undefined, type: f.type, stock: f.stock, branchId: f.branchId || undefined, status: f.status, barcode: f.barcode || undefined, limit: PAGE, cursor: pageParam } },
        signal,
      });
      return data!;
    },
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    placeholderData: keepPreviousData,
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
    placeholderData: keepPreviousData,
  });
  return { ...query, rows: query.data?.pages.flatMap((p) => p.data ?? []) ?? [] };
}

type BooksView = 'trial-balance' | 'profit-loss' | 'balance-sheet' | 'ledger' | 'day-book' | 'cost-centres' | 'accounts';

/**
 * One of the books' statements from the server: the same core ledger functions, run on its whole
 * book, so the device needn't hold every posting. Shaped as core returns them (amounts in paise).
 */
export function useBooksView<T>(view: BooksView, scope: { from?: string; to: string; account?: string }, enabled = true) {
  const companyId = useAppStore((s) => s.activeCompanyId);
  return useQuery({
    queryKey: ['books', companyId, view, scope],
    enabled: enabled && !!companyId,
    queryFn: async ({ signal }) => {
      const { data } = await api.GET('/companies/{companyId}/books/{view}', { params: { path: { companyId, view }, query: { from: scope.from, to: scope.to, account: scope.account } }, signal });
      return data as T;
    },
    placeholderData: keepPreviousData,
  });
}

const EMPTY_BOOK: Book = { parties: [], paymentAccounts: [], expenseCategories: [], ledgerAccounts: [] };

/** The chart of accounts as the server names it, and each account's balance today. */
export function useServerBook() {
  const data = useBooksView<{ book: Book; accounts: Account[]; balances: Record<string, number> }>('accounts', { to: today() }).data;
  return { book: data?.book ?? EMPTY_BOOK, accounts: data?.accounts ?? [], balances: data?.balances ?? {}, loaded: !!data };
}

export type VoucherQuery = { kind?: 'journal' | 'contra' | 'gstJournal' | 'tdsChallan' | 'receipt'; from?: string; to?: string };
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
      const { data } = await api.GET('/companies/{companyId}/vouchers', { params: { path: { companyId }, query: { kind: f.kind, from: f.from, to: f.to, limit: PAGE, cursor: pageParam } }, signal });
      return data!;
    },
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    placeholderData: keepPreviousData,
  });
  return { ...query, rows: (query.data?.pages.flatMap((p) => p.data ?? []) ?? []) as unknown as Voucher[] };
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
    placeholderData: keepPreviousData,
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

export const hubKeys = {
  all: (companyId: string) => ['hubs', companyId] as const,
  sales: (companyId: string, branchId?: string) => ['hubs', companyId, 'sales', branchId ?? ''] as const,
  purchases: (companyId: string, branchId?: string) => ['hubs', companyId, 'purchases', branchId ?? ''] as const,
};

/** The Purchases tab's figures: this month's bills and expenses, what's owed, counts, latest bills. */
export function usePurchasesHub(branchId?: string) {
  const companyId = useAppStore((s) => s.activeCompanyId);
  return useQuery({
    queryKey: hubKeys.purchases(companyId, branchId),
    enabled: !!companyId,
    queryFn: async ({ signal }) => {
      const { data } = await api.GET('/companies/{companyId}/hubs/purchases', { params: { path: { companyId }, query: { branchId } }, signal });
      return data!;
    },
  });
}

/** The Sales tab's figures: this month, what customers owe, counts, top customers, latest invoices. */
export function useSalesHub(branchId?: string) {
  const companyId = useAppStore((s) => s.activeCompanyId);
  return useQuery({
    queryKey: hubKeys.sales(companyId, branchId),
    enabled: !!companyId,
    queryFn: async ({ signal }) => {
      const { data } = await api.GET('/companies/{companyId}/hubs/sales', { params: { path: { companyId }, query: { branchId } }, signal });
      return data!;
    },
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
    }
    if (stale.has('vouchers')) {
      void queryClient.invalidateQueries({ queryKey: [...voucherKeys.all(companyId), 'pages'] });
      void queryClient.invalidateQueries({ queryKey: [...voucherKeys.all(companyId), 'all'] });
      void queryClient.invalidateQueries({ queryKey: ['books', companyId] });
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
    }
    stale.clear();
  };
  const mark = (what: string) => {
    stale.add(what);
    timer ??= setTimeout(flush, 250);
  };
  const unsubscribe = useAppStore.subscribe((s, prev) => {
    if (s.session.userId !== prev.session.userId || s.activeCompanyId !== prev.activeCompanyId) {
      if (!s.session.authenticated) queryClient.clear();
      return;
    }
    // A payment changes what an invoice still owes, and so its status.
    if (s.documents !== prev.documents || s.payments !== prev.payments || s.expenses !== prev.expenses) mark('documents');
    if (s.stockMovements !== prev.stockMovements || s.documents !== prev.documents) mark('stock');
    if (s.vouchers !== prev.vouchers) mark('vouchers');
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
