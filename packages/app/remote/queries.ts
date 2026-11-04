import { useEffect } from 'react';
import { QueryClient, keepPreviousData, useInfiniteQuery, useQuery } from '@tanstack/react-query';
import type { Schema } from '@esmart/api-client';
import type { DocStatus, DocumentKind } from '@esmart/core/types';
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
function keep(entityType: keyof typeof COLLECTIONS, companyId: string, rows: ({ id?: string; version?: number } | undefined)[]) {
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
    if (stale.has('documents')) {
      void queryClient.invalidateQueries({ queryKey: documentKeys.all(companyId) });
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
