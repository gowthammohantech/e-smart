import type {
  Branch,
  BusinessDocument,
  Company,
  ComplianceSettings,
  DocStatus,
  DocumentKind,
  NumberingSeries,
  Payment,
  StockMovement,
  User,
} from '@esmart/core/types';
import type { AppState } from '../store/appStore';
import { companyPath as c } from './collections';
import { knownToServer } from './meta';
import * as outbox from './outbox';

/**
 * What each store action means to the API. The action has already run
 * against the local store; a builder reads what changed (`before`, `after`,
 * the arguments and the return value) and queues the matching request.
 *
 * Actions that aren't listed are local only: switching company, the demo
 * reset, notifications the app raises itself, previews.
 */
export type Call = { args: any[]; result: unknown; before: AppState; after: AppState };
type Builder = (call: Call) => void;

const byId = <T extends { id: string }>(list: T[], id: string) => list.find((x) => x.id === id);

/** Statuses the server derives from payments and dates; never sent. */
const DERIVED: DocStatus[] = ['paid', 'partiallyPaid', 'overdue'];

/** A document as the API takes it: the editable fields, not totals or compliance. */
function documentBody(d: BusinessDocument) {
  const { totals, compliance, number, id, companyId, createdAt, updatedAt, createdBy, ...rest } = d as BusinessDocument & Record<string, unknown>;
  void totals; void compliance; void number; void id; void companyId; void createdAt; void updatedAt; void createdBy;
  // Derived statuses and cancellation go through their own endpoints.
  const status = DERIVED.includes(d.status) || d.status === 'cancelled' ? undefined : d.status;
  return { ...rest, status };
}

/** Saves of a company-scoped master: parties, items, categories… */
function master(entityType: string, collection: keyof AppState, segment: string, label: (x: any) => string): Builder {
  return ({ args, result, after }) => {
    const id = typeof result === 'string' && result ? result : (args[0] as { id: string }).id;
    const saved = byId(after[collection] as any[], id);
    if (!saved) return;
    outbox.upsert({
      entityType,
      id,
      collectionPath: `${c(saved.companyId)}/${segment}`,
      itemPath: `${c(saved.companyId)}/${segment}/${id}`,
      body: saved,
      label: label(saved),
    });
  };
}

function removal(entityType: string, collection: keyof AppState, segment: string, label: (x: any) => string): Builder {
  return ({ args, before }) => {
    const id = args[0] as string;
    const gone = byId(before[collection] as any[], id);
    if (!gone) return;
    outbox.remove({ entityType, id, itemPath: `${c(gone.companyId)}/${segment}/${id}`, label: label(gone) });
  };
}

const named = (x: { name: string }) => x.name;

function documentSave(updateMethod?: 'PATCH'): Builder {
  return ({ args, result, after }) => {
    const id = typeof result === 'string' && result ? result : (args[0] as string);
    const doc = byId(after.documents, id);
    if (!doc) return;
    outbox.upsert({
      entityType: 'document',
      id,
      collectionPath: `${c(doc.companyId)}/documents`,
      itemPath: `${c(doc.companyId)}/documents/${id}`,
      body: documentBody(doc),
      label: doc.number,
      updateMethod,
    });
  };
}

function documentAction(path: (d: BusinessDocument) => string, body?: (call: Call) => unknown, newId?: (call: Call) => string): Builder {
  return (call) => {
    const doc = byId(call.before.documents, call.args[0] as string) ?? byId(call.after.documents, call.args[0] as string);
    if (!doc) return;
    const created = newId?.(call);
    outbox.action({
      method: 'POST',
      path: `${c(doc.companyId)}/documents/${doc.id}${path(doc)}`,
      body: body?.(call),
      entityType: 'document',
      entityId: created ?? doc.id,
      label: doc.number,
      clientEntityId: created,
    });
  };
}

export const MUTATIONS: Partial<Record<keyof AppState, Builder>> = {
  /* account */
  completeOnboarding: () => outbox.action({ method: 'POST', path: '/me/onboarding/complete', entityType: 'user', entityId: 'me', label: 'Onboarding complete' }),
  revokeDevice: ({ args, before }) => {
    const d = byId(before.devices, args[0]);
    outbox.action({ method: 'DELETE', path: `/me/devices/${args[0]}`, entityType: 'device', entityId: args[0], label: d?.label ?? 'Device' });
  },
  createCompany: ({ result, after }) => {
    const company = byId(after.companies, result as string);
    if (!company) return;
    const { id, accountId, createdAt, plan, ...body } = company as Company & Record<string, unknown>;
    void accountId; void createdAt; void plan;
    outbox.push({ method: 'POST', path: '/companies', body: { ...body, seedDefaults: true, numberingSeries: [] }, entityType: 'company', entityId: id, label: company.name, clientEntityId: id });
  },
  saveCompany: ({ args, after }) => {
    const company = byId(after.companies, (args[0] as Company).id);
    if (!company) return;
    outbox.upsert({ entityType: 'company', id: company.id, collectionPath: '/companies', itemPath: c(company.id), body: company, label: company.name });
  },
  saveBranch: ({ args, after }) => {
    const b = byId(after.branches, (args[0] as Branch).id);
    if (!b) return;
    outbox.upsert({ entityType: 'branch', id: b.id, collectionPath: `${c(b.companyId)}/branches`, itemPath: `${c(b.companyId)}/branches/${b.id}`, body: b, label: b.name });
  },
  removeBranch: removal('branch', 'branches', 'branches', named),
  saveUser: ({ args, after }) => {
    const u = byId(after.users, (args[0] as User).id);
    if (!u) return;
    const invite = { name: u.name, email: u.email, phone: u.phone, role: u.role, companyIds: u.companyIds, branchIds: u.branchIds };
    outbox.upsert({ entityType: 'user', id: u.id, collectionPath: '/users', itemPath: `/users/${u.id}`, body: knownToServer(u.id) ? u : invite, label: u.name });
  },
  removeUser: ({ args, before }) => {
    const u = byId(before.users, args[0]);
    outbox.remove({ entityType: 'user', id: args[0], itemPath: `/users/${args[0]}`, label: u?.name ?? 'User' });
  },

  /* masters */
  saveParty: master('party', 'parties', 'parties', named),
  removeParty: removal('party', 'parties', 'parties', named),
  saveItem: master('item', 'items', 'items', named),
  removeItem: removal('item', 'items', 'items', named),
  saveTaxCategory: master('tax_category', 'taxCategories', 'tax-categories', named),
  removeTaxCategory: removal('tax_category', 'taxCategories', 'tax-categories', named),
  saveExpenseCategory: master('expense_category', 'expenseCategories', 'expense-categories', named),
  removeExpenseCategory: removal('expense_category', 'expenseCategories', 'expense-categories', named),
  savePaymentAccount: master('payment_account', 'paymentAccounts', 'payment-accounts', named),
  removePaymentAccount: removal('payment_account', 'paymentAccounts', 'payment-accounts', named),
  saveExchangeRate: master('exchange_rate', 'exchangeRates', 'exchange-rates', (r) => `${r.currency} rate`),
  removeExchangeRate: removal('exchange_rate', 'exchangeRates', 'exchange-rates', (r) => `${r.currency} rate`),
  saveTransporter: master('transporter', 'transporters', 'transporters', named),
  removeTransporter: removal('transporter', 'transporters', 'transporters', named),
  saveNumberingSeries: ({ args, after }) => {
    const s = byId(after.numberingSeries, (args[0] as NumberingSeries).id);
    if (!s) return;
    if (knownToServer(s.id)) {
      outbox.upsert({ entityType: 'numbering_series', id: s.id, collectionPath: '', itemPath: `${c(s.companyId)}/numbering-series/${s.id}`, body: s, label: `${s.prefix} series` });
      return;
    }
    // A series of a company the server hasn't created yet rides along with its create.
    const create = outbox.pendingCreate(s.companyId);
    if (create) {
      const body = create.body as { numberingSeries?: NumberingSeries[] };
      const series = [...(body.numberingSeries ?? []).filter((x) => x.kind !== s.kind), { kind: s.kind, prefix: s.prefix, nextNumber: s.nextNumber, padding: s.padding, includeFiscalYear: s.includeFiscalYear, includeBranchCode: s.includeBranchCode, resetPolicy: s.resetPolicy }];
      outbox.update(create.id, { body: { ...body, numberingSeries: series } });
    }
  },
  saveComplianceSettings: ({ args }) => {
    const s = args[0] as ComplianceSettings;
    // One per company, always there: a plain PUT, the latest edit wins.
    outbox.action({ method: 'PUT', path: `${c(s.companyId)}/compliance-settings`, body: s, entityType: 'compliance_settings', entityId: s.companyId, label: 'Compliance settings' });
  },
  toggleIntegration: ({ args, after }) => {
    const i = byId(after.integrations, args[0]);
    if (!i) return;
    outbox.action({ method: 'POST', path: `${c(after.activeCompanyId)}/integrations/${i.id}/${i.connected ? 'connect' : 'disconnect'}`, body: {}, entityType: 'integration', entityId: i.id, label: i.name });
  },

  /* documents */
  createDocument: documentSave(),
  updateDocument: documentSave('PATCH'),
  setDocumentStatus: (call) => {
    const status = call.args[1] as DocStatus;
    if (DERIVED.includes(status)) return;
    const doc = byId(call.after.documents, call.args[0]);
    if (!doc) return;
    const override = (call.args[2] as { overrideCreditLimit?: boolean } | undefined)?.overrideCreditLimit ? { overrideCreditLimit: true } : {};
    // Not on the server yet: create it in its final state in one go.
    const create = outbox.pendingCreate(doc.id);
    if (create && status !== 'cancelled') return outbox.update(create.id, { body: { ...documentBody(doc), ...override } });
    outbox.action({ method: 'POST', path: `${c(doc.companyId)}/documents/${doc.id}/status`, body: { status, ...override }, entityType: 'document', entityId: doc.id, label: doc.number });
  },
  finalizeDocument: documentAction(() => '/finalize'),
  duplicateDocument: documentAction(() => '/duplicate', undefined, (call) => call.result as string),
  convertDocument: documentAction(() => '/convert', (call) => ({ targetKind: call.args[1] as DocumentKind }), (call) => call.result as string),
  removeDocument: removal('document', 'documents', 'documents', (d) => d.number),

  /* money */
  savePayment: master('payment', 'payments', 'payments', (p) => p.number || 'Payment'),
  removePayment: removal('payment', 'payments', 'payments', (p) => p.number || 'Payment'),
  applyAdvances: ({ before, after }) => {
    // No endpoint of its own: each payment whose allocations moved is saved.
    for (const p of after.payments) {
      const was = byId(before.payments, p.id);
      if (was && JSON.stringify(was.allocations) !== JSON.stringify(p.allocations)) {
        outbox.upsert({ entityType: 'payment', id: p.id, collectionPath: `${c(p.companyId)}/payments`, itemPath: `${c(p.companyId)}/payments/${p.id}`, body: p as Payment, label: p.number });
      }
    }
  },
  saveExpense: master('expense', 'expenses', 'expenses', (e) => e.number || 'Expense'),
  removeExpense: removal('expense', 'expenses', 'expenses', (e) => e.number || 'Expense'),

  /* stock */
  addStockMovement: ({ args }) => {
    const m = args[0] as Omit<StockMovement, 'id' | 'createdAt' | 'createdBy'>;
    if (m.type !== 'adjustment' && m.type !== 'opening') return;
    outbox.action({
      method: 'POST',
      path: `${c(m.companyId)}/stock/adjustments`,
      body: { branchId: m.branchId, date: m.date, type: m.type, notes: m.notes, lines: [{ itemId: m.itemId, quantity: m.quantity, unitCost: m.unitCost }] },
      entityType: 'item',
      entityId: m.itemId,
      label: m.type === 'opening' ? 'Opening stock' : 'Stock adjustment',
    });
  },
  transferStock: ({ args, before }) => {
    const a = args[0] as { itemId: string; fromBranchId: string; toBranchId: string; quantity: number; date: string; notes?: string };
    const item = byId(before.items, a.itemId);
    if (!item) return;
    outbox.action({ method: 'POST', path: `${c(item.companyId)}/stock/transfers`, body: a, entityType: 'item', entityId: a.itemId, label: `Transfer ${item.name}` });
  },

  /* notifications */
  markNotificationRead: ({ args, before }) => {
    const n = byId(before.notifications, args[0]);
    if (!n) return;
    outbox.action({ method: 'POST', path: `${c(n.companyId)}/notifications/${n.id}/read`, body: {}, entityType: 'notification', entityId: n.id, label: n.title });
  },
  markAllNotificationsRead: ({ before }) =>
    outbox.action({ method: 'POST', path: `${c(before.activeCompanyId)}/notifications/read-all`, body: {}, entityType: 'notification', entityId: before.activeCompanyId, label: 'Notifications read' }),
  clearNotifications: ({ before }) =>
    outbox.action({ method: 'DELETE', path: `${c(before.activeCompanyId)}/notifications`, entityType: 'notification', entityId: before.activeCompanyId, label: 'Notifications cleared' }),
};
