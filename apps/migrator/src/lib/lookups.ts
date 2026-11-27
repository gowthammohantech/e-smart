import { normalizeGstin } from '@esmart/core/domain/gstin';
import { api } from './api';
import { norm, type Env } from './kit';

export type PartyRef = { id: string; name: string; taxId?: string; kind: string };
export type ItemRef = { id: string; sku: string; name: string; unit: string; taxCategoryId: string; hsnCode?: string };
export type AccountRef = { id: string; name: string; type: string };
export type CategoryRef = { id: string; name: string };

type Page<T> = { data?: T[]; nextCursor?: string | null };

/** Every page of a list the server hands out in pages. */
async function all<T>(get: (cursor: string | undefined) => Promise<Page<T> | undefined>): Promise<T[]> {
  const out: T[] = [];
  let cursor: string | undefined;
  for (let guard = 0; guard < 500; guard++) {
    const page = await get(cursor);
    out.push(...(page?.data ?? []));
    if (!page?.nextCursor) break;
    cursor = page.nextCursor;
  }
  return out;
}

export async function loadParties(companyId: string): Promise<PartyRef[]> {
  const rows = await all<PartyRef>(async (cursor) => (await api().GET('/companies/{companyId}/parties', { params: { path: { companyId }, query: { limit: 200, cursor } } })).data as Page<PartyRef> | undefined);
  return rows.map((p) => ({ id: p.id, name: p.name, taxId: p.taxId, kind: p.kind }));
}

export async function loadItems(companyId: string): Promise<ItemRef[]> {
  const rows = await all<ItemRef>(async (cursor) => (await api().GET('/companies/{companyId}/items', { params: { path: { companyId }, query: { limit: 200, cursor } } })).data as Page<ItemRef> | undefined);
  return rows.map((i) => ({ id: i.id, sku: i.sku, name: i.name, unit: i.unit, taxCategoryId: i.taxCategoryId, hsnCode: i.hsnCode }));
}

export async function loadAccounts(companyId: string): Promise<AccountRef[]> {
  const res = await api().GET('/companies/{companyId}/payment-accounts', { params: { path: { companyId } } });
  return ((res.data as { data?: AccountRef[] } | undefined)?.data ?? []).map((a) => ({ id: a.id, name: a.name, type: a.type }));
}

export async function loadCategories(companyId: string): Promise<CategoryRef[]> {
  const res = await api().GET('/companies/{companyId}/expense-categories', { params: { path: { companyId } } });
  return ((res.data as { data?: CategoryRef[] } | undefined)?.data ?? []).map((c) => ({ id: c.id, name: c.name }));
}

/** The supplier's own numbers on bills already saved for a supplier: a bill with the same one is the same bill. */
export async function loadSupplierBillNumbers(companyId: string, partyId: string): Promise<Set<string>> {
  const rows = await all<{ supplierDocNumber?: string; status?: string }>(
    async (cursor) =>
      (await api().GET('/companies/{companyId}/documents', { params: { path: { companyId }, query: { kind: ['purchaseBill'], partyId, limit: 200, cursor } as never } })).data as Page<{ supplierDocNumber?: string; status?: string }> | undefined,
  );
  return new Set(rows.filter((r) => r.status !== 'cancelled' && r.supplierDocNumber).map((r) => norm(r.supplierDocNumber!)));
}

/** A name or GSTIN in a sheet, found among the business's contacts. A GSTIN wins; a name must match only one. */
export function findParty(parties: PartyRef[], name: string, gstin?: string): { party?: PartyRef; problem?: string } {
  const g = gstin ? normalizeGstin(gstin) : '';
  if (g) {
    const hit = parties.find((p) => p.taxId && normalizeGstin(p.taxId) === g);
    if (hit) return { party: hit };
  }
  const n = name.trim().toLowerCase();
  if (!n) return { problem: 'No customer or supplier named' };
  const named = parties.filter((p) => p.name.trim().toLowerCase() === n);
  if (named.length === 1) return { party: named[0] };
  if (named.length > 1) return { problem: `More than one contact is called ${name}. Add the GSTIN column to tell them apart` };
  return { problem: `No contact called ${name}` };
}

/** What the run adds, in the form lookups compare: lower-case names and upper-case GSTINs. */
export const partyKey = (name: string) => name.trim().toLowerCase();

/**
 * Why a contact a sheet refers to could not be found. If the same file's contacts sheet tried to add it
 * and was refused, that is the reason; otherwise the plain "no contact called".
 */
export function missingParty(env: Env, name: string, gstin: string | undefined, problem: string | undefined): string {
  const why = env.rejected.parties.get(partyKey(name)) ?? (gstin ? env.rejected.parties.get(normalizeGstin(gstin)) : undefined);
  if (why) return `${name || gstin} was not added from the Contacts sheet: ${why}`;
  return problem ?? 'The contact was not found';
}
