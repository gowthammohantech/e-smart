import { ApiError } from '@esmart/api-client';
import type { CancelReasonCode, ComplianceIssue, EwayBillPartBUpdate } from '@esmart/core/types';
import { useAppStore, type ComplianceResult, type ExtendEwayBillInput, type NewEwayBillInput } from '../store/appStore';
import { api, isNetworkError } from './api';
import { applyEntity } from './apply';
import { syncNow } from './sync';

/**
 * E-invoicing and e-way bills. The GST portals are only reachable online, so
 * these go straight to the API (which talks to the portal) instead of through
 * the outbox, and report "needs a connection" when there is none. The screen
 * gets a ComplianceResult either way.
 */
const OFFLINE: ComplianceResult = {
  ok: false,
  issues: [{ code: 'OFFLINE', message: 'Connect to the internet to reach the GST portal, then try again.', severity: 'blocking' } as ComplianceIssue],
};

async function call<T>(run: () => Promise<{ data?: T }>, after?: (data: T) => void): Promise<ComplianceResult & { data?: T }> {
  try {
    const { data } = await run();
    if (data) after?.(data);
    // The document's compliance fields changed on the server; bring them in.
    void syncNow();
    const r = (data ?? {}) as { ok?: boolean; issues?: ComplianceIssue[] };
    return { ok: r.ok ?? true, issues: r.issues ?? [], data };
  } catch (err) {
    if (isNetworkError(err)) return OFFLINE;
    if (err instanceof ApiError) {
      return { ok: false, issues: (err.problem.issues as ComplianceIssue[] | undefined) ?? [{ code: err.code, message: err.message, severity: 'blocking' } as ComplianceIssue] };
    }
    throw err;
  }
}

const docCompany = (documentId: string) => useAppStore.getState().documents.find((d) => d.id === documentId)?.companyId ?? useAppStore.getState().activeCompanyId;
const billCompany = (id: string) => useAppStore.getState().ewayBills.find((b) => b.id === id)?.companyId ?? useAppStore.getState().activeCompanyId;
const p = (companyId: string) => ({ companyId });

export async function generateEInvoice(documentId: string): Promise<ComplianceResult> {
  return call(() => api.POST('/companies/{companyId}/documents/{id}/e-invoice', { params: { path: { ...p(docCompany(documentId)), id: documentId } } }));
}

export async function cancelEInvoice(documentId: string, reasonCode: CancelReasonCode, remark?: string): Promise<ComplianceResult> {
  return call(() =>
    api.POST('/companies/{companyId}/documents/{id}/e-invoice/cancel', { params: { path: { ...p(docCompany(documentId)), id: documentId } }, body: { reasonCode, remark } as never }),
  );
}

export async function generateEwayBill(input: NewEwayBillInput): Promise<ComplianceResult & { ewayBillId?: string }> {
  const r = await call(
    () => api.POST('/companies/{companyId}/eway-bills', { params: { path: p(docCompany(input.documentId)) }, body: input as never }),
    (data) => applyEntity('eway_bill', (data as { ewayBill?: unknown }).ewayBill),
  );
  return { ok: r.ok, issues: r.issues, ewayBillId: (r.data as { ewayBill?: { id?: string } } | undefined)?.ewayBill?.id };
}

export async function updateEwayBillPartB(id: string, update: Omit<EwayBillPartBUpdate, 'id' | 'updatedAt' | 'updatedBy'>): Promise<ComplianceResult> {
  return call(
    () => api.POST('/companies/{companyId}/eway-bills/{id}/part-b', { params: { path: { ...p(billCompany(id)), id } }, body: update as never }),
    (data) => applyEntity('eway_bill', (data as { ewayBill?: unknown }).ewayBill),
  );
}

export async function extendEwayBill(id: string, args: ExtendEwayBillInput): Promise<ComplianceResult> {
  return call(
    () => api.POST('/companies/{companyId}/eway-bills/{id}/extend', { params: { path: { ...p(billCompany(id)), id } }, body: args as never }),
    (data) => applyEntity('eway_bill', (data as { ewayBill?: unknown }).ewayBill),
  );
}

export async function cancelEwayBill(id: string, reasonCode: CancelReasonCode, remark?: string): Promise<ComplianceResult> {
  return call(() => api.POST('/companies/{companyId}/eway-bills/{id}/cancel', { params: { path: { ...p(billCompany(id)), id } }, body: { reasonCode, remark } as never }));
}

export type PortalCredentials = {
  /** Which portal the login is for; `both` stores the same login for each. */
  portal?: 'einvoice' | 'ewaybill' | 'both';
  username: string;
  password: string;
};

/** Stores the IRP / EWB credentials on the server, which encrypts them and never returns them. */
export async function saveCredentials(companyId: string, input: PortalCredentials): Promise<void> {
  await api.PUT('/companies/{companyId}/compliance-settings/credentials', { params: { path: p(companyId) }, body: input });
  void syncNow();
}

export type ConnectionResult = { irp?: { ok?: boolean; message?: string }; ewb?: { ok?: boolean; message?: string } };

/** Signs in to the IRP and the EWB portal with the stored credentials. */
export async function testConnection(companyId: string): Promise<ConnectionResult> {
  const { data } = await api.POST('/companies/{companyId}/compliance-settings/test-connection', { params: { path: p(companyId) } });
  return data ?? {};
}
