import { ApiError } from '@esmart/api-client';
import { api } from './api';

/**
 * A GSTIN's record on the GST portal: its legal and trade names, registered
 * address and status. Null when the register has no such taxpayer; a portal
 * that can't be reached (or no provider on this server) throws.
 */
export async function lookupGstin(gstin: string) {
  try {
    const { data } = await api.GET('/reference/gstin/{gstin}', { params: { path: { gstin } } });
    return data ?? null;
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  }
}

export type GstinDetails = NonNullable<Awaited<ReturnType<typeof lookupGstin>>>;

/** HSN/SAC codes from the master list whose code starts with, or description holds, `q`, each with its usual GST rate. */
export async function searchHsn(q: string) {
  if (!q.trim()) return [];
  const { data } = await api.GET('/reference/hsn', { params: { query: { q: q.trim() } } });
  return data?.data ?? [];
}

export type HsnMatch = Awaited<ReturnType<typeof searchHsn>>[number];
