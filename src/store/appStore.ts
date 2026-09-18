import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import {
  Attachment,
  AuditEvent,
  AppNotification,
  Branch,
  BusinessDocument,
  Company,
  ComplianceInfo,
  DocStatus,
  DocumentKind,
  DocumentLine,
  EInvoiceCancelReason,
  EwbPartB,
  Integration,
  IrpError,
  Item,
  NotificationKind,
  NumberingSeries,
  Party,
  Payment,
  PaymentAccount,
  TaxCategory,
  Transporter,
  User,
} from '@/types';
import { Money, zero } from '@/lib/money';
import { nowISO, today } from '@/lib/date';
import { uid } from '@/lib/id';
import { calculateDocument } from '@/domain/lineCalc';
import { formatNumber } from '@/domain/numbering';
import { initialStatus, isFinalized } from '@/domain/documentStates';
import { eInvoiceApplicability } from '@/domain/gst/applicability';
import { buildEInvoicePayload } from '@/domain/gst/einvoice/buildPayload';
import { IrpAckRecord, createMockIrp } from '@/domain/gst/einvoice/mockIrp';
import { ewbApplicability } from '@/domain/gst/eway/applicability';
import { buildPartA } from '@/domain/gst/eway/buildPartA';
import { EwbRecord, createMockEwb } from '@/domain/gst/eway/mockEwb';
import { CargoType, isExpired } from '@/domain/gst/eway/validity';
import { INTEGRATIONS } from '@/data/masters';
import {
  ACCOUNT_ID,
  CURRENT_USER_ID,
  PRIMARY_COMPANY_ID,
  seedBranches,
  seedCompanies,
  seedItems,
  seedNumberingSeries,
  seedParties,
  seedPaymentAccounts,
  seedTaxCategories,
  seedTransporters,
  seedUsers,
} from '@/data/seed';
import {
  seedAttachments,
  seedAudit,
  seedDocuments,
  seedNotifications,
  seedPayments,
} from '@/data/seedTransactions';

export type AppData = {
  accountId: string;
  users: User[];
  companies: Company[];
  branches: Branch[];
  parties: Party[];
  items: Item[];
  taxCategories: TaxCategory[];
  paymentAccounts: PaymentAccount[];
  transporters: Transporter[];
  numberingSeries: NumberingSeries[];
  documents: BusinessDocument[];
  payments: Payment[];
  attachments: Attachment[];
  notifications: AppNotification[];
  auditEvents: AuditEvent[];
  integrations: Integration[];
};

export type Session = {
  userId: string | null;
  authenticated: boolean;
  onboardingComplete: boolean;
  signedInAt?: string;
};

export function buildSeedData(): AppData {
  const companies = seedCompanies();
  const branches = seedBranches();
  const users = seedUsers();
  const parties = seedParties();
  const items = seedItems();
  const taxCategories = seedTaxCategories();
  const series = seedNumberingSeries();
  const documents = seedDocuments({ items, parties, taxCategories, series, companies });
  const payments = seedPayments(documents, series);

  // Advance each series past the numbers the seed data already consumed.
  const advanced = series.map((s) => {
    const used =
      s.kind === 'payment'
        ? payments.filter((p) => p.companyId === s.companyId).length
        : documents.filter((d) => d.companyId === s.companyId && d.kind === s.kind).length;
    return { ...s, nextNumber: used + 1 };
  });

  return {
    accountId: ACCOUNT_ID,
    users,
    companies,
    branches,
    parties,
    items,
    taxCategories,
    paymentAccounts: seedPaymentAccounts(),
    transporters: seedTransporters(),
    numberingSeries: advanced,
    documents,
    payments,
    attachments: seedAttachments(),
    notifications: seedNotifications(documents, payments),
    auditEvents: seedAudit(documents, payments),
    integrations: INTEGRATIONS.map((i) => ({ ...i })),
  };
}

type Actions = {
  /* session */
  signIn: (email: string) => void;
  signInWithOtp: (phone: string) => void;
  signUp: (name: string, email: string) => void;
  signOut: () => void;
  completeOnboarding: () => void;

  /* company */
  setActiveCompany: (companyId: string) => void;
  setActiveBranch: (branchId: string) => void;
  saveCompany: (company: Company) => void;
  createCompany: (partial: Omit<Company, 'id' | 'accountId' | 'createdAt'>) => string;
  saveBranch: (branch: Branch) => void;
  removeBranch: (id: string) => void;
  saveUser: (user: User) => void;
  removeUser: (id: string) => void;

  /* masters */
  saveParty: (party: Party) => string;
  removeParty: (id: string) => void;
  saveItem: (item: Item) => string;
  removeItem: (id: string) => void;
  saveTaxCategory: (cat: TaxCategory) => void;
  removeTaxCategory: (id: string) => void;
  savePaymentAccount: (acc: PaymentAccount) => void;
  removePaymentAccount: (id: string) => void;
  saveTransporter: (t: Transporter) => string;
  removeTransporter: (id: string) => void;
  saveNumberingSeries: (series: NumberingSeries) => void;

  /* documents */
  nextNumberFor: (kind: NumberingSeries['kind']) => string;
  createDocument: (draft: NewDocumentInput) => string;
  updateDocument: (id: string, patch: Partial<BusinessDocument>) => void;
  recalculateDocument: (id: string) => void;
  setDocumentStatus: (id: string, status: DocStatus) => void;
  finalizeDocument: (id: string) => void;
  removeDocument: (id: string) => void;
  duplicateDocument: (id: string) => string;
  convertDocument: (id: string, target: DocumentKind) => string;

  /* GST compliance */
  generateEInvoice: (documentId: string) => ComplianceResult;
  cancelEInvoice: (documentId: string, reasonCode: EInvoiceCancelReason, remarks?: string) => ComplianceResult;
  generateEWayBill: (
    documentId: string,
    input: { partB: EwbPartB; distanceKm: number; cargo: CargoType },
  ) => ComplianceResult;
  updateEwbVehicle: (documentId: string, partB: EwbPartB) => ComplianceResult;
  extendEWayBill: (documentId: string, remainingDistanceKm: number) => ComplianceResult;
  cancelEWayBill: (documentId: string, reason: string) => ComplianceResult;

  /* payments */
  savePayment: (payment: Payment) => string;
  removePayment: (id: string) => void;

  /* supporting */
  addAttachment: (a: Omit<Attachment, 'id' | 'uploadedAt'>) => string;
  removeAttachment: (id: string) => void;
  pushNotification: (n: Omit<AppNotification, 'id' | 'createdAt' | 'read'>) => void;
  markNotificationRead: (id: string) => void;
  markAllNotificationsRead: () => void;
  clearNotifications: () => void;
  toggleIntegration: (id: string) => void;

  /* demo control */
  resetDemoData: () => void;
  hydrated: boolean;
  setHydrated: (v: boolean) => void;
};

/** What every compliance action hands back: success, or the portal's reasons. */
export type ComplianceResult = { ok: boolean; errors?: IrpError[] };

export type NewDocumentInput = {
  kind: DocumentKind;
  partyId: string;
  date: string;
  dueDate?: string;
  validUntil?: string;
  lines: DocumentLine[];
  documentDiscountMode?: 'percent' | 'amount';
  documentDiscountValue?: number;
  charges?: Money;
  applyRoundOff?: boolean;
  notes?: string;
  terms?: string;
  reference?: string;
  placeOfSupplyStateCode?: string;
  reverseCharge?: boolean;
  branchId?: string;
  attachmentIds?: string[];
  sourceDocumentId?: string;
  status?: DocStatus;
};

export type AppState = AppData & {
  session: Session;
  activeCompanyId: string;
  activeBranchId: string | null;
} & Actions;

const emptySession: Session = { userId: null, authenticated: false, onboardingComplete: false };

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => {
      /* -------------------------------------------------------------- */
      /* internal helpers                                               */
      /* -------------------------------------------------------------- */

      const audit = (
        action: string,
        entityType: string,
        entityId: string,
        entityLabel: string,
        extra?: { before?: string; after?: string },
      ) => {
        const s = get();
        const actor = s.users.find((u) => u.id === s.session.userId) ?? s.users[0];
        const event: AuditEvent = {
          id: uid('aud'),
          companyId: s.activeCompanyId,
          actorId: actor?.id ?? CURRENT_USER_ID,
          actorName: actor?.name ?? 'You',
          action,
          entityType,
          entityId,
          entityLabel,
          before: extra?.before,
          after: extra?.after,
          device: 'This device',
          createdAt: nowISO(),
        };
        set({ auditEvents: [event, ...get().auditEvents].slice(0, 500) });
      };

      const notify = (kind: NotificationKind, title: string, body: string, entityType?: string, entityId?: string) => {
        const n: AppNotification = {
          id: uid('ntf'),
          companyId: get().activeCompanyId,
          kind,
          title,
          body,
          entityType,
          entityId,
          read: false,
          createdAt: nowISO(),
        };
        set({ notifications: [n, ...get().notifications].slice(0, 200) });
      };

      const companyOf = (companyId: string) => get().companies.find((c) => c.id === companyId);

      const taxContextFor = (companyId: string, placeOfSupply?: string) => {
        const company = companyOf(companyId);
        const reg = company?.taxRegistration;
        return {
          regime: reg?.regime ?? ('NONE' as const),
          homeStateCode: reg?.placeOfSupplyStateCode,
          placeOfSupplyStateCode: placeOfSupply ?? reg?.placeOfSupplyStateCode,
          registered: !!reg?.registered,
        };
      };

      const computeTotals = (doc: BusinessDocument) => {
        const s = get();
        const company = companyOf(doc.companyId);
        return calculateDocument({
          lines: doc.lines,
          currency: company?.baseCurrency ?? 'INR',
          documentDiscountMode: doc.documentDiscountMode,
          documentDiscountValue: doc.documentDiscountValue,
          charges: doc.charges,
          applyRoundOff: doc.applyRoundOff,
          taxCategories: s.taxCategories.filter((t) => t.companyId === doc.companyId),
          taxContext: taxContextFor(doc.companyId, doc.placeOfSupplyStateCode),
        });
      };

      const consumeSeriesNumber = (kind: NumberingSeries['kind'], date: string): string => {
        const s = get();
        const companyId = s.activeCompanyId;
        const series = s.numberingSeries.find((x) => x.companyId === companyId && x.kind === kind);
        if (!series) return `${kind.toUpperCase()}-${Date.now()}`;
        const branch = s.branches.find((b) => b.id === (s.activeBranchId ?? ''));
        const number = formatNumber(series, { date, branchCode: branch?.code });
        set({
          numberingSeries: s.numberingSeries.map((x) =>
            x.id === series.id ? { ...x, nextNumber: x.nextNumber + 1 } : x,
          ),
        });
        return number;
      };

      const itemsOf = (companyId: string) => get().items.filter((i) => i.companyId === companyId);

      /** Everything a compliance action needs about one document. */
      const complianceContextFor = (documentId: string) => {
        const s = get();
        const doc = s.documents.find((d) => d.id === documentId);
        if (!doc) return null;
        const company = companyOf(doc.companyId);
        const party = s.parties.find((p) => p.id === doc.partyId);
        if (!company || !party) return null;
        return { doc, company, party };
      };

      const patchCompliance = (documentId: string, patch: ComplianceInfo) => {
        set({
          documents: get().documents.map((d) =>
            d.id === documentId
              ? { ...d, compliance: { ...d.compliance, ...patch }, updatedAt: nowISO() }
              : d,
          ),
        });
      };

      /**
       * The portals are built fresh on every call from the documents in the
       * store, so their registers can never drift from what the app holds —
       * including across a reload from AsyncStorage.
       */
      const irp = () => {
        const activeIrns = new Map<string, IrpAckRecord>();
        get().documents.forEach((d) => {
          const record = d.compliance?.eInvoice;
          if (!record?.irn || !record.ackDate) return;
          activeIrns.set(record.irn, {
            ackDate: record.ackDate,
            documentId: d.id,
            cancelled: record.status === 'cancelled',
          });
        });
        return createMockIrp({ now: () => new Date(), activeIrns });
      };

      const ewb = () => {
        const activeBills = new Map<string, EwbRecord>();
        get().documents.forEach((d) => {
          const record = d.compliance?.eWayBill;
          if (!record?.ewbNo || !record.ewbDate || !record.validUpto) return;
          activeBills.set(record.ewbNo, {
            ewbDate: record.ewbDate,
            validUpto: record.validUpto,
            documentId: d.id,
            cancelled: record.status === 'cancelled',
          });
        });
        return createMockEwb({ now: () => new Date(), activeBills });
      };

      const seed = buildSeedData();

      return {
        ...seed,
        session: emptySession,
        activeCompanyId: PRIMARY_COMPANY_ID,
        activeBranchId: 'brn_mum',
        hydrated: false,
        setHydrated: (hydrated) => set({ hydrated }),

        /* ------------------------------------------------------------ */
        /* session                                                      */
        /* ------------------------------------------------------------ */
        signIn: (email) => {
          const user = get().users.find((u) => u.email.toLowerCase() === email.toLowerCase()) ?? get().users[0];
          set({
            session: {
              userId: user.id,
              authenticated: true,
              onboardingComplete: true,
              signedInAt: nowISO(),
            },
          });
        },
        signInWithOtp: () => {
          const user = get().users[0];
          set({
            session: { userId: user.id, authenticated: true, onboardingComplete: true, signedInAt: nowISO() },
          });
        },
        signUp: (name, email) => {
          const user: User = {
            id: uid('usr'),
            accountId: get().accountId,
            name,
            email,
            role: 'owner',
            companyIds: [],
            branchIds: [],
            avatarColor: '#007AFF',
            status: 'active',
            lastActiveAt: nowISO(),
          };
          set({
            users: [user, ...get().users],
            session: { userId: user.id, authenticated: true, onboardingComplete: false, signedInAt: nowISO() },
          });
        },
        signOut: () => set({ session: emptySession }),
        completeOnboarding: () =>
          set({ session: { ...get().session, onboardingComplete: true } }),

        /* ------------------------------------------------------------ */
        /* company                                                      */
        /* ------------------------------------------------------------ */
        setActiveCompany: (companyId) => {
          const branch = get().branches.find((b) => b.companyId === companyId && b.isPrimary)
            ?? get().branches.find((b) => b.companyId === companyId);
          set({ activeCompanyId: companyId, activeBranchId: branch?.id ?? null });
        },
        setActiveBranch: (branchId) => set({ activeBranchId: branchId }),
        saveCompany: (company) => {
          set({ companies: get().companies.map((c) => (c.id === company.id ? company : c)) });
          audit('updated', 'company', company.id, company.name);
        },
        createCompany: (partial) => {
          const id = uid('cmp');
          const company: Company = { ...partial, id, accountId: get().accountId, createdAt: nowISO() };
          const branch: Branch = {
            id: uid('brn'),
            companyId: id,
            name: 'Head office',
            code: 'HO',
            address: partial.address,
            isPrimary: true,
          };
          const kinds: NumberingSeries['kind'][] = [
            'invoice', 'quote', 'salesOrder', 'delivery', 'salesReturn', 'payment',
          ];
          const prefixes: Record<string, string> = {
            invoice: 'INV', quote: 'QT', salesOrder: 'SO', delivery: 'DN', salesReturn: 'CRN',
            payment: 'PAY',
          };
          const series: NumberingSeries[] = kinds.map((kind) => ({
            id: uid('series'),
            companyId: id,
            kind,
            prefix: prefixes[kind],
            nextNumber: 1,
            padding: 4,
            includeFiscalYear: true,
            includeBranchCode: false,
            resetPolicy: 'yearly',
          }));
          const taxes: TaxCategory[] = [0, 5, 12, 18, 28].map((rate) => ({
            id: uid('tax'),
            companyId: id,
            name: rate === 0 ? 'GST 0% (Exempt)' : `GST ${rate}%`,
            rate,
            type: 'GST',
            effectiveFrom: today(),
          }));
          const account: PaymentAccount = {
            id: uid('acc'),
            companyId: id,
            name: 'Cash in hand',
            type: 'cash',
            openingBalance: zero(partial.baseCurrency),
            isDefault: true,
          };
          set({
            companies: [...get().companies, company],
            branches: [...get().branches, branch],
            numberingSeries: [...get().numberingSeries, ...series],
            taxCategories: [...get().taxCategories, ...taxes],
            paymentAccounts: [...get().paymentAccounts, account],
            activeCompanyId: id,
            activeBranchId: branch.id,
          });
          return id;
        },
        saveBranch: (branch) => {
          const exists = get().branches.some((b) => b.id === branch.id);
          set({
            branches: exists
              ? get().branches.map((b) => (b.id === branch.id ? branch : b))
              : [...get().branches, branch],
          });
          audit(exists ? 'updated' : 'created', 'branch', branch.id, branch.name);
        },
        removeBranch: (id) => {
          const b = get().branches.find((x) => x.id === id);
          set({ branches: get().branches.filter((x) => x.id !== id) });
          if (b) audit('deleted', 'branch', id, b.name);
        },
        saveUser: (user) => {
          const exists = get().users.some((u) => u.id === user.id);
          set({ users: exists ? get().users.map((u) => (u.id === user.id ? user : u)) : [...get().users, user] });
          audit(exists ? 'updated' : 'invited', 'user', user.id, user.name);
        },
        removeUser: (id) => set({ users: get().users.filter((u) => u.id !== id) }),

        /* ------------------------------------------------------------ */
        /* masters                                                      */
        /* ------------------------------------------------------------ */
        saveParty: (party) => {
          const exists = get().parties.some((p) => p.id === party.id);
          set({
            parties: exists ? get().parties.map((p) => (p.id === party.id ? party : p)) : [...get().parties, party],
          });
          audit(exists ? 'updated' : 'created', 'customer', party.id, party.name);
          return party.id;
        },
        removeParty: (id) => {
          const p = get().parties.find((x) => x.id === id);
          set({ parties: get().parties.filter((x) => x.id !== id) });
          if (p) audit('deleted', 'customer', id, p.name);
        },
        saveItem: (item) => {
          const exists = get().items.some((i) => i.id === item.id);
          set({ items: exists ? get().items.map((i) => (i.id === item.id ? item : i)) : [...get().items, item] });
          audit(exists ? 'updated' : 'created', 'item', item.id, item.name);
          return item.id;
        },
        removeItem: (id) => {
          const i = get().items.find((x) => x.id === id);
          set({ items: get().items.filter((x) => x.id !== id) });
          if (i) audit('deleted', 'item', id, i.name);
        },
        saveTaxCategory: (cat) => {
          const exists = get().taxCategories.some((c) => c.id === cat.id);
          set({
            taxCategories: exists
              ? get().taxCategories.map((c) => (c.id === cat.id ? cat : c))
              : [...get().taxCategories, cat],
          });
          audit(exists ? 'updated' : 'created', 'taxCategory', cat.id, cat.name);
        },
        removeTaxCategory: (id) => set({ taxCategories: get().taxCategories.filter((c) => c.id !== id) }),
        saveTransporter: (t) => {
          const exists = get().transporters.some((x) => x.id === t.id);
          set({
            transporters: exists
              ? get().transporters.map((x) => (x.id === t.id ? t : x))
              : [...get().transporters, t],
          });
          audit(exists ? 'updated' : 'created', 'transporter', t.id, t.name);
          return t.id;
        },
        removeTransporter: (id) => {
          const t = get().transporters.find((x) => x.id === id);
          set({ transporters: get().transporters.filter((x) => x.id !== id) });
          if (t) audit('deleted', 'transporter', id, t.name);
        },
        savePaymentAccount: (acc) => {
          const exists = get().paymentAccounts.some((a) => a.id === acc.id);
          const next = exists
            ? get().paymentAccounts.map((a) => (a.id === acc.id ? acc : a))
            : [...get().paymentAccounts, acc];
          set({
            paymentAccounts: acc.isDefault
              ? next.map((a) => (a.companyId === acc.companyId ? { ...a, isDefault: a.id === acc.id } : a))
              : next,
          });
        },
        removePaymentAccount: (id) => set({ paymentAccounts: get().paymentAccounts.filter((a) => a.id !== id) }),
        saveNumberingSeries: (series) => {
          set({ numberingSeries: get().numberingSeries.map((s) => (s.id === series.id ? series : s)) });
          audit('updated', 'numberingSeries', series.id, series.prefix);
        },

        /* ------------------------------------------------------------ */
        /* documents                                                    */
        /* ------------------------------------------------------------ */
        nextNumberFor: (kind) => {
          const s = get();
          const series = s.numberingSeries.find((x) => x.companyId === s.activeCompanyId && x.kind === kind);
          if (!series) return '—';
          const branch = s.branches.find((b) => b.id === (s.activeBranchId ?? ''));
          return formatNumber(series, { date: today(), branchCode: branch?.code });
        },

        createDocument: (draft) => {
          const s = get();
          const status = draft.status ?? initialStatus(draft.kind);
          const finalized = isFinalized(status);
          const number = finalized ? consumeSeriesNumber(draft.kind, draft.date) : `${draft.kind.toUpperCase()}-DRAFT`;
          const party = s.parties.find((p) => p.id === draft.partyId);
          const currency = companyOf(s.activeCompanyId)?.baseCurrency ?? 'INR';

          const doc: BusinessDocument = {
            id: uid(draft.kind),
            companyId: s.activeCompanyId,
            branchId: draft.branchId ?? s.activeBranchId ?? 'brn_mum',
            kind: draft.kind,
            number,
            status,
            partyId: draft.partyId,
            date: draft.date,
            dueDate: draft.dueDate,
            validUntil: draft.validUntil,
            reference: draft.reference,
            lines: draft.lines,
            documentDiscountMode: draft.documentDiscountMode ?? 'percent',
            documentDiscountValue: draft.documentDiscountValue ?? 0,
            charges: draft.charges ?? zero(currency),
            applyRoundOff: draft.applyRoundOff ?? true,
            placeOfSupplyStateCode:
              draft.placeOfSupplyStateCode ??
              party?.shippingAddress?.stateCode ??
              party?.billingAddress.stateCode,
            reverseCharge: draft.reverseCharge,
            notes: draft.notes,
            terms: draft.terms,
            attachmentIds: draft.attachmentIds ?? [],
            sourceDocumentId: draft.sourceDocumentId,
            totals: {
              subtotal: zero(currency),
              lineDiscount: zero(currency),
              documentDiscount: zero(currency),
              taxableAmount: zero(currency),
              taxLines: [],
              totalTax: zero(currency),
              charges: zero(currency),
              roundOff: zero(currency),
              grandTotal: zero(currency),
            },
            createdBy: s.session.userId ?? CURRENT_USER_ID,
            createdAt: nowISO(),
            updatedAt: nowISO(),
          };
          doc.totals = computeTotals(doc);

          set({ documents: [doc, ...get().documents] });
          audit(finalized ? 'finalized' : 'created', draft.kind, doc.id, doc.number);
          return doc.id;
        },

        updateDocument: (id, patch) => {
          const existing = get().documents.find((d) => d.id === id);
          if (!existing) return;
          const merged = { ...existing, ...patch, updatedAt: nowISO() };
          merged.totals = computeTotals(merged);
          set({ documents: get().documents.map((d) => (d.id === id ? merged : d)) });
          audit('updated', existing.kind, id, merged.number);
        },

        recalculateDocument: (id) => {
          const existing = get().documents.find((d) => d.id === id);
          if (!existing) return;
          const merged = { ...existing, totals: computeTotals(existing) };
          set({ documents: get().documents.map((d) => (d.id === id ? merged : d)) });
        },

        setDocumentStatus: (id, status) => {
          const existing = get().documents.find((d) => d.id === id);
          if (!existing) return;
          let number = existing.number;
          if (!isFinalized(existing.status) && isFinalized(status)) {
            number = consumeSeriesNumber(existing.kind, existing.date);
          }
          const updated = { ...existing, status, number, updatedAt: nowISO() };
          set({ documents: get().documents.map((d) => (d.id === id ? updated : d)) });
          audit(`marked ${status}`, existing.kind, id, number);

          if (existing.kind === 'invoice' && status === 'sent') {
            notify('invoiceSent', 'Invoice sent', `${number} was shared with the customer.`, 'invoice', id);
          }
        },

        finalizeDocument: (id) => {
          const existing = get().documents.find((d) => d.id === id);
          if (!existing) return;
          const target: DocStatus =
            existing.kind === 'salesReturn'
              ? 'approved'
              : existing.kind === 'quote'
                ? 'sent'
                : existing.kind === 'salesOrder'
                  ? 'confirmed'
                  : existing.kind === 'delivery'
                    ? 'delivered'
                    : 'issued';
          get().setDocumentStatus(id, target);
        },

        removeDocument: (id) => {
          const d = get().documents.find((x) => x.id === id);
          // A registered invoice is the portal's record as much as ours: the
          // IRN has to be cancelled before the document can go.
          if (d?.compliance?.eInvoice?.status === 'generated') return;
          set({ documents: get().documents.filter((x) => x.id !== id) });
          if (d) audit('deleted', d.kind, id, d.number);
        },

        duplicateDocument: (id) => {
          const src = get().documents.find((d) => d.id === id);
          if (!src) return '';
          return get().createDocument({
            kind: src.kind,
            partyId: src.partyId,
            date: today(),
            dueDate: src.dueDate,
            lines: src.lines.map((l) => ({ ...l, id: uid('ln') })),
            documentDiscountMode: src.documentDiscountMode,
            documentDiscountValue: src.documentDiscountValue,
            charges: src.charges,
            applyRoundOff: src.applyRoundOff,
            notes: src.notes,
            terms: src.terms,
            placeOfSupplyStateCode: src.placeOfSupplyStateCode,
            branchId: src.branchId,
            status: 'draft',
          });
        },

        convertDocument: (id, target) => {
          const src = get().documents.find((d) => d.id === id);
          if (!src) return '';
          const party = get().parties.find((p) => p.id === src.partyId);
          const newId = get().createDocument({
            kind: target,
            partyId: src.partyId,
            date: today(),
            dueDate:
              target === 'invoice'
                ? new Date(Date.now() + (party?.paymentTermsDays ?? 30) * 86400000).toISOString().slice(0, 10)
                : undefined,
            lines: src.lines.map((l) => ({ ...l, id: uid('ln') })),
            documentDiscountMode: src.documentDiscountMode,
            documentDiscountValue: src.documentDiscountValue,
            charges: src.charges,
            applyRoundOff: src.applyRoundOff,
            notes: src.notes,
            placeOfSupplyStateCode: src.placeOfSupplyStateCode,
            branchId: src.branchId,
            sourceDocumentId: src.id,
            status: 'draft',
          });
          audit(`converted to ${target}`, src.kind, src.id, src.number);
          return newId;
        },

        /* ------------------------------------------------------------ */
        /* payments                                                     */
        /* ------------------------------------------------------------ */
        savePayment: (payment) => {
          const exists = get().payments.some((p) => p.id === payment.id);
          const withNumber =
            payment.number && payment.number !== ''
              ? payment
              : { ...payment, number: consumeSeriesNumber('payment', payment.date) };

          set({
            payments: exists
              ? get().payments.map((p) => (p.id === payment.id ? withNumber : p))
              : [withNumber, ...get().payments],
          });

          // Refresh the status of every invoice/bill this payment touches.
          const affected = new Set(withNumber.allocations.map((a) => a.documentId));
          if (affected.size) {
            const payments = get().payments;
            set({
              documents: get().documents.map((d) => {
                if (!affected.has(d.id)) return d;
                const allocated = payments
                  .flatMap((p) => p.allocations)
                  .filter((a) => a.documentId === d.id)
                  .reduce((acc, a) => acc + a.amount.minor, 0);
                const outstanding = d.totals.grandTotal.minor - allocated;
                const status: DocStatus =
                  outstanding <= 0 ? 'paid' : allocated > 0 ? 'partiallyPaid' : d.status;
                return { ...d, status, updatedAt: nowISO() };
              }),
            });
          }

          audit(exists ? 'updated payment' : 'recorded payment', 'payment', withNumber.id, withNumber.number);
          if (!exists) {
            notify('paymentReceived', 'Payment recorded', `${withNumber.number} recorded successfully.`, 'payment', withNumber.id);
          }
          return withNumber.id;
        },

        removePayment: (id) => {
          const p = get().payments.find((x) => x.id === id);
          if (!p) return;
          const affected = new Set(p.allocations.map((a) => a.documentId));
          const remaining = get().payments.filter((x) => x.id !== id);
          set({
            payments: remaining,
            documents: get().documents.map((d) => {
              if (!affected.has(d.id)) return d;
              const allocated = remaining
                .flatMap((x) => x.allocations)
                .filter((a) => a.documentId === d.id)
                .reduce((acc, a) => acc + a.amount.minor, 0);
              const outstanding = d.totals.grandTotal.minor - allocated;
              const status: DocStatus = outstanding <= 0 ? 'paid' : allocated > 0 ? 'partiallyPaid' : 'issued';
              return { ...d, status, updatedAt: nowISO() };
            }),
          });
          audit('deleted payment', 'payment', id, p.number);
        },

        /* ------------------------------------------------------------ */
        /* GST compliance                                               */
        /* ------------------------------------------------------------ */
        generateEInvoice: (documentId) => {
          const ctx = complianceContextFor(documentId);
          if (!ctx) return { ok: false, errors: [{ code: '0', message: 'Document not found' }] };
          const { doc, company, party } = ctx;

          const applicability = eInvoiceApplicability({ company, party, doc });
          if (!applicability.applicable) {
            patchCompliance(documentId, {
              eInvoice: { status: 'notApplicable', errors: [{ code: '0', message: applicability.reason }] },
            });
            return { ok: false, errors: [{ code: '0', message: applicability.reason }] };
          }

          const payload = buildEInvoicePayload({ company, party, doc, items: itemsOf(doc.companyId) });
          const result = irp().generate({ payload, documentId });

          if (!result.ok) {
            patchCompliance(documentId, { eInvoice: { status: 'failed', errors: result.errors } });
            audit('e-invoice rejected', doc.kind, doc.id, doc.number, {
              after: result.errors.map((e) => `${e.code} ${e.message}`).join('; '),
            });
            notify('eInvoice', 'IRN not generated', result.errors[0].message, doc.kind, doc.id);
            return { ok: false, errors: result.errors };
          }

          patchCompliance(documentId, {
            eInvoice: {
              status: 'generated',
              irn: result.irn,
              ackNo: result.ackNo,
              ackDate: result.ackDate,
              signedQrPayload: result.signedQrCode,
              generatedAt: nowISO(),
            },
          });
          audit('e-invoice generated', doc.kind, doc.id, doc.number, { after: result.irn });
          notify('eInvoice', 'IRN generated', `${doc.number} is registered with the IRP.`, doc.kind, doc.id);
          return { ok: true };
        },

        cancelEInvoice: (documentId, reasonCode, remarks) => {
          const ctx = complianceContextFor(documentId);
          const irn = ctx?.doc.compliance?.eInvoice?.irn;
          if (!ctx || !irn) {
            return { ok: false, errors: [{ code: '0', message: 'This document has no IRN to cancel' }] };
          }

          const result = irp().cancel({ irn, reasonCode, remarks });
          if (!result.ok) return { ok: false, errors: result.errors };

          patchCompliance(documentId, {
            eInvoice: {
              ...ctx.doc.compliance!.eInvoice!,
              status: 'cancelled',
              cancelledAt: result.cancelledAt,
              cancelReasonCode: reasonCode,
              cancelRemarks: remarks,
              errors: undefined,
            },
          });
          // A cancelled invoice cannot carry a live e-way bill.
          const ewb = ctx.doc.compliance?.eWayBill;
          if (ewb?.status === 'generated') get().cancelEWayBill(documentId, 'Invoice cancelled');

          audit('e-invoice cancelled', ctx.doc.kind, documentId, ctx.doc.number);
          notify('eInvoice', 'IRN cancelled', `${ctx.doc.number} was withdrawn from the IRP.`, ctx.doc.kind, documentId);
          return { ok: true };
        },

        generateEWayBill: (documentId, input) => {
          const ctx = complianceContextFor(documentId);
          if (!ctx) return { ok: false, errors: [{ code: '0', message: 'Document not found' }] };
          const { doc, company, party } = ctx;
          const items = itemsOf(doc.companyId);

          const applicability = ewbApplicability({ company, party, doc, items });
          if (!applicability.applicable) {
            patchCompliance(documentId, {
              eWayBill: { status: 'notApplicable', errors: [{ code: '0', message: applicability.reason }] },
            });
            return { ok: false, errors: [{ code: '0', message: applicability.reason }] };
          }

          const partA = buildPartA({ company, party, doc, items });
          const result = ewb().generate({
            partA,
            partB: input.partB,
            distanceKm: input.distanceKm,
            cargo: input.cargo,
            documentId,
          });

          if (!result.ok) {
            patchCompliance(documentId, {
              eWayBill: { status: 'failed', partA, partB: input.partB, errors: result.errors },
            });
            return { ok: false, errors: result.errors };
          }

          patchCompliance(documentId, {
            eWayBill: {
              status: 'generated',
              ewbNo: result.ewbNo,
              ewbDate: result.ewbDate,
              validUpto: result.validUpto,
              distanceKm: input.distanceKm,
              cargo: input.cargo,
              partA,
              partB: input.partB,
              generatedAt: nowISO(),
            },
          });
          audit('e-way bill generated', doc.kind, doc.id, doc.number, { after: result.ewbNo });
          notify('eWayBill', 'E-way bill generated', `${result.ewbNo} is valid until ${result.validUpto.slice(0, 10)}.`, doc.kind, doc.id);
          return { ok: true };
        },

        updateEwbVehicle: (documentId, partB) => {
          const ctx = complianceContextFor(documentId);
          const record = ctx?.doc.compliance?.eWayBill;
          if (!ctx || !record?.ewbNo) {
            return { ok: false, errors: [{ code: '0', message: 'No e-way bill on this document' }] };
          }
          const result = ewb().updateVehicle({ ewbNo: record.ewbNo, partB });
          if (!result.ok) return { ok: false, errors: result.errors };

          patchCompliance(documentId, { eWayBill: { ...record, partB, errors: undefined } });
          audit('e-way bill vehicle updated', ctx.doc.kind, documentId, record.ewbNo);
          return { ok: true };
        },

        extendEWayBill: (documentId, remainingDistanceKm) => {
          const ctx = complianceContextFor(documentId);
          const record = ctx?.doc.compliance?.eWayBill;
          if (!ctx || !record?.ewbNo) {
            return { ok: false, errors: [{ code: '0', message: 'No e-way bill on this document' }] };
          }
          const result = ewb().extend({
            ewbNo: record.ewbNo,
            remainingDistanceKm,
            cargo: record.cargo ?? 'regular',
          });
          if (!result.ok) return { ok: false, errors: result.errors };

          patchCompliance(documentId, {
            eWayBill: { ...record, status: 'generated', validUpto: result.validUpto, errors: undefined },
          });
          audit('e-way bill extended', ctx.doc.kind, documentId, record.ewbNo);
          return { ok: true };
        },

        cancelEWayBill: (documentId, reason) => {
          const ctx = complianceContextFor(documentId);
          const record = ctx?.doc.compliance?.eWayBill;
          if (!ctx || !record?.ewbNo) {
            return { ok: false, errors: [{ code: '0', message: 'No e-way bill on this document' }] };
          }
          const result = ewb().cancel({ ewbNo: record.ewbNo, reason });
          if (!result.ok) return { ok: false, errors: result.errors };

          patchCompliance(documentId, {
            eWayBill: { ...record, status: 'cancelled', cancelledAt: result.cancelledAt, cancelReason: reason },
          });
          audit('e-way bill cancelled', ctx.doc.kind, documentId, record.ewbNo);
          notify('eWayBill', 'E-way bill cancelled', `${record.ewbNo} was cancelled.`, ctx.doc.kind, documentId);
          return { ok: true };
        },

        /* ------------------------------------------------------------ */
        /* supporting                                                   */
        /* ------------------------------------------------------------ */
        addAttachment: (a) => {
          const attachment: Attachment = { ...a, id: uid('att'), uploadedAt: nowISO() };
          set({ attachments: [...get().attachments, attachment] });
          return attachment.id;
        },
        removeAttachment: (id) => set({ attachments: get().attachments.filter((a) => a.id !== id) }),
        pushNotification: (n) => notify(n.kind, n.title, n.body, n.entityType, n.entityId),
        markNotificationRead: (id) =>
          set({ notifications: get().notifications.map((n) => (n.id === id ? { ...n, read: true } : n)) }),
        markAllNotificationsRead: () =>
          set({ notifications: get().notifications.map((n) => ({ ...n, read: true })) }),
        clearNotifications: () =>
          set({ notifications: get().notifications.filter((n) => n.companyId !== get().activeCompanyId) }),
        toggleIntegration: (id) =>
          set({
            integrations: get().integrations.map((i) => (i.id === id ? { ...i, connected: !i.connected } : i)),
          }),

        /* ------------------------------------------------------------ */
        /* demo control                                                 */
        /* ------------------------------------------------------------ */
        resetDemoData: () => {
          const fresh = buildSeedData();
          set({
            ...fresh,
            activeCompanyId: PRIMARY_COMPANY_ID,
            activeBranchId: 'brn_mum',
          });
        },
      };
    },
    {
      // Bumped from ebs.data.v1: a blob written by the full prototype would
      // rehydrate slices this build no longer has.
      name: 'ebs.gst.v1',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => {
        const { hydrated, ...rest } = s;
        void hydrated;
        return rest as AppState;
      },
      onRehydrateStorage: () => (state) => {
        state?.setHydrated(true);
      },
    },
  ),
);
