import { ApiError } from '@esmart/api-client';
import { useAppStore } from '../store/appStore';
import { api } from './api';

/**
 * A GSTIN's record on the GST portal: its legal and trade names, registered
 * address and status. Null when the register has no such taxpayer; a portal
 * that can't be reached (or no provider on this server) throws.
 */
export async function lookupGstin(gstin: string) {
  try {
    // The active company, so a company set up with its own GSP is answered by it. Signup has none.
    const companyId = useAppStore.getState().activeCompanyId || undefined;
    const { data } = await api.GET('/reference/gstin/{gstin}', { params: { path: { gstin }, query: { companyId } } });
    return data ?? null;
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  }
}

export type GstinDetails = NonNullable<Awaited<ReturnType<typeof lookupGstin>>>;

/** HSN/SAC codes from the master list whose code starts with, or description holds, `q` (all of them, from the start, for an empty one), each with its usual GST rate. */
export async function searchHsn(q: string, after?: string) {
  const { data } = await api.GET('/reference/hsn', { params: { query: { ...(q.trim() && { q: q.trim() }), ...(after && { after }) } } });
  // A page at a time: `nextCursor` asks for the one after it, null on the last.
  return { rows: data?.data ?? [], nextCursor: data?.nextCursor ?? null };
}

export type HsnMatch = Awaited<ReturnType<typeof searchHsn>>['rows'][number];
