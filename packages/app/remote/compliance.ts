import { ApiError } from '@esmart/api-client';
import type { CancelReasonCode, ComplianceIssue, EwayBillPartBUpdate } from '@esmart/core/types';
import { useAppStore, type ComplianceResult, type ExtendEwayBillInput, type NewEwayBillInput } from '../store/appStore';
import type { IrpSimulation } from '@esmart/core/domain/irpAdapter';
import { api, isNetworkError } from './api';
import { applyEntity } from './apply';
import { isRemote } from './config';
import { syncNow } from './sync';

/**
 * E-invoicing and e-way bills. The GST portals are only reachable online, so
 * in remote mode these go straight to the API (which talks to the portal)
 * instead of through the outbox, and report "needs a connection" when there
 * is none. In demo mode they run the store's in-process simulator as before.
 * Either way the screen gets a ComplianceResult.
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

export async function generateEInvoice(documentId: string, opts?: { simulation?: IrpSimulation }): Promise<ComplianceResult> {
  if (!isRemote()) return useAppStore.getState().generateEInvoice(documentId, opts);
  return call(() => api.POST('/companies/{companyId}/documents/{id}/e-invoice', { params: { path: { ...p(docCompany(documentId)), id: documentId } } }));
}

export async function cancelEInvoice(documentId: string, reasonCode: CancelReasonCode, remark?: string): Promise<ComplianceResult> {
  if (!isRemote()) return useAppStore.getState().cancelEInvoice(documentId, reasonCode, remark);
  return call(() =>
    api.POST('/companies/{companyId}/documents/{id}/e-invoice/cancel', { params: { path: { ...p(docCompany(documentId)), id: documentId } }, body: { reasonCode, remark } as never }),
  );
}

export async function generateEwayBill(input: NewEwayBillInput): Promise<ComplianceResult & { ewayBillId?: string }> {
  if (!isRemote()) return useAppStore.getState().generateEwayBill(input);
  const r = await call(
    () => api.POST('/companies/{companyId}/eway-bills', { params: { path: p(docCompany(input.documentId)) }, body: input as never }),
    (data) => applyEntity('eway_bill', (data as { ewayBill?: unknown }).ewayBill),
  );
  return { ok: r.ok, issues: r.issues, ewayBillId: (r.data as { ewayBill?: { id?: string } } | undefined)?.ewayBill?.id };
}

export async function updateEwayBillPartB(id: string, update: Omit<EwayBillPartBUpdate, 'id' | 'updatedAt' | 'updatedBy'>): Promise<ComplianceResult> {
  if (!isRemote()) return useAppStore.getState().updateEwayBillPartB(id, update);
  return call(
    () => api.POST('/companies/{companyId}/eway-bills/{id}/part-b', { params: { path: { ...p(billCompany(id)), id } }, body: update as never }),
    (data) => applyEntity('eway_bill', (data as { ewayBill?: unknown }).ewayBill),
  );
}

export async function extendEwayBill(id: string, args: ExtendEwayBillInput): Promise<ComplianceResult> {
  if (!isRemote()) return useAppStore.getState().extendEwayBill(id, args);
  return call(
    () => api.POST('/companies/{companyId}/eway-bills/{id}/extend', { params: { path: { ...p(billCompany(id)), id } }, body: args as never }),
    (data) => applyEntity('eway_bill', (data as { ewayBill?: unknown }).ewayBill),
  );
}

export async function cancelEwayBill(id: string, reasonCode: CancelReasonCode, remark?: string): Promise<ComplianceResult> {
  if (!isRemote()) return useAppStore.getState().cancelEwayBill(id, reasonCode, remark);
  return call(() => api.POST('/companies/{companyId}/eway-bills/{id}/cancel', { params: { path: { ...p(billCompany(id)), id } }, body: { reasonCode, remark } as never }));
}
