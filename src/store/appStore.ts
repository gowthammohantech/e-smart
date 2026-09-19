import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import {
  Attachment,
  AuditEvent,
  AppNotification,
  Branch,
  BusinessDocument,
  CancelReasonCode,
  Company,
  PlanTier,
  Transporter,
  ComplianceInfo,
  ComplianceIssue,
  ComplianceSettings,
  DeviceSession,
  DocStatus,
  DocumentKind,
  DocumentLine,
  EwayBill,
  EwayBillPartBUpdate,
  EwayExtendReasonCode,
  EwayPlace,
  EwaySubSupplyType,
  ExchangeRate,
  Expense,
  ExpenseCategory,
  Integration,
  Item,
  NotificationKind,
  NumberingSeries,
  Party,
  Payment,
  PaymentAccount,
  StockMovement,
  SyncQueueEntry,
  TaxCategory,
  TransportMode,
  User,
  VehicleType,
} from '@/types';
import { Money, zero } from '@/lib/money';
import { nowISO, today } from '@/lib/date';
import { uid } from '@/lib/id';
import { calculateDocument } from '@/domain/lineCalc';
import { formatNumber } from '@/domain/numbering';
import { initialStatus, isFinalized } from '@/domain/documentStates';
import {
  EInvoiceContext,
  blockingIssues,
  buildIrpPayload,
  canCancelEInvoice,
  isEInvoiceApplicable,
  mainHsnCodeOf,
  validateEInvoice,
} from '@/domain/eInvoice';
import {
  buildEwbPayload,
  canCancelEwayBill,
  canUpdatePartB,
  ewayDocTypeFor,
  isEwayBillRequired,
  subSupplyTypeFor,
  validatePartA,
  validatePartB,
} from '@/domain/ewayBill';
import {
  IrpSimulation,
  cancelEwayBillAtPortal,
  cancelIrn,
  extendEwayBillAtPortal,
  submitEwayBill,
  submitInvoice,
} from '@/domain/irpAdapter';
import { INTEGRATIONS, LEGACY_BUSINESS_TYPE_LABELS } from '@/data/masters';
import { isValidGstin } from '@/domain/gstin';
import {
  ACCOUNT_ID,
  CURRENT_USER_ID,
  PRIMARY_COMPANY_ID,
  defaultComplianceSettings,
  seedBranches,
  seedCompanies,
  seedDevices,
  seedExchangeRates,
  seedExpenseCategories,
  seedItems,
  seedComplianceSettings,
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
  seedCompliance,
  seedDocuments,
  seedExpenses,
  seedNotifications,
  seedPayments,
  seedStockMovements,
  seedSyncQueue,
} from '@/data/seedTransactions';

export type AppData = {
  accountId: string;
  users: User[];
  devices: DeviceSession[];
  companies: Company[];
  branches: Branch[];
  parties: Party[];
  items: Item[];
  taxCategories: TaxCategory[];
  expenseCategories: ExpenseCategory[];
  paymentAccounts: PaymentAccount[];
  exchangeRates: ExchangeRate[];
  numberingSeries: NumberingSeries[];
  documents: BusinessDocument[];
  payments: Payment[];
  expenses: Expense[];
  stockMovements: StockMovement[];
  attachments: Attachment[];
  notifications: AppNotification[];
  auditEvents: AuditEvent[];
  syncQueue: SyncQueueEntry[];
  integrations: Integration[];
  complianceSettings: ComplianceSettings[];
  ewayBills: EwayBill[];
  transporters: Transporter[];
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
  const complianceSettings = seedComplianceSettings();
  const { documents, ewayBills } = seedCompliance(
    seedDocuments({ items, parties, taxCategories, series }),
    companies,
    parties,
    branches,
    complianceSettings,
  );
  const payments = seedPayments(documents, series);
  const expenses = seedExpenses(series);
  const stockMovements = seedStockMovements(items, documents);

  // Advance each series past the numbers the seed data already consumed.
  const advanced = series.map((s) => {
    const used =
      s.kind === 'payment'
        ? payments.filter((p) => p.companyId === s.companyId).length
        : s.kind === 'expense'
          ? expenses.filter((e) => e.companyId === s.companyId).length
          : documents.filter((d) => d.companyId === s.companyId && d.kind === s.kind).length;
    return { ...s, nextNumber: used + 1 };
  });

  return {
    accountId: ACCOUNT_ID,
    users,
    devices: seedDevices(),
    companies,
    branches,
    parties,
    items,
    taxCategories,
    expenseCategories: seedExpenseCategories(),
    paymentAccounts: seedPaymentAccounts(),
    exchangeRates: seedExchangeRates(),
    numberingSeries: advanced,
    documents,
    payments,
    expenses,
    stockMovements,
    attachments: seedAttachments(),
    notifications: seedNotifications(documents, payments, ewayBills),
    auditEvents: seedAudit(documents, payments, ewayBills),
    syncQueue: seedSyncQueue(),
    integrations: INTEGRATIONS.map((i) => ({ ...i })),
    complianceSettings,
    ewayBills,
    transporters: seedTransporters(),
  };
}

type Actions = {
  /* session */
  signIn: (email: string) => void;
  signInWithOtp: (phone: string) => void;
  signUp: (name: string, email: string) => void;
  signOut: () => void;
  completeOnboarding: () => void;
  revokeDevice: (id: string) => void;

  /* company */
  setActiveCompany: (companyId: string) => void;
  setActiveBranch: (branchId: string) => void;
  saveCompany: (company: Company) => void;
  setPlan: (companyId: string, plan: PlanTier) => void;
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
  saveExpenseCategory: (cat: ExpenseCategory) => void;
  removeExpenseCategory: (id: string) => void;
  savePaymentAccount: (acc: PaymentAccount) => void;
  removePaymentAccount: (id: string) => void;
  saveExchangeRate: (rate: ExchangeRate) => void;
  removeExchangeRate: (id: string) => void;
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

  /* payments */
  savePayment: (payment: Payment) => string;
  removePayment: (id: string) => void;

  /* expenses */
  saveExpense: (expense: Expense) => string;
  removeExpense: (id: string) => void;

  /* inventory */
  addStockMovement: (m: Omit<StockMovement, 'id' | 'createdAt' | 'createdBy'>) => void;
  transferStock: (args: { itemId: string; fromBranchId: string; toBranchId: string; quantity: number; date: string; notes?: string }) => void;

  /* supporting */
  addAttachment: (a: Omit<Attachment, 'id' | 'uploadedAt'>) => string;
  removeAttachment: (id: string) => void;
  pushNotification: (n: Omit<AppNotification, 'id' | 'createdAt' | 'read'>) => void;
  markNotificationRead: (id: string) => void;
  markAllNotificationsRead: () => void;
  clearNotifications: () => void;
  toggleIntegration: (id: string) => void;

  /* compliance */
  saveComplianceSettings: (settings: ComplianceSettings) => void;
  saveTransporter: (transporter: Transporter) => void;
  removeTransporter: (id: string) => void;
  generateEInvoice: (documentId: string, opts?: { simulation?: IrpSimulation }) => ComplianceResult;
  cancelEInvoice: (documentId: string, reasonCode: CancelReasonCode, remark?: string) => ComplianceResult;
  generateEwayBill: (input: NewEwayBillInput) => ComplianceResult & { ewayBillId?: string };
  updateEwayBillPartB: (
    id: string,
    update: Omit<EwayBillPartBUpdate, 'id' | 'updatedAt' | 'updatedBy'>,
  ) => ComplianceResult;
  extendEwayBill: (id: string, args: ExtendEwayBillInput) => ComplianceResult;
  cancelEwayBill: (id: string, reasonCode: CancelReasonCode, remark?: string) => ComplianceResult;
  retrySync: (id: string) => void;
  clearSyncQueue: () => void;

  /* demo control */
  resetDemoData: () => void;
  hydrated: boolean;
  setHydrated: (v: boolean) => void;
};

export type NewDocumentInput = {
  kind: DocumentKind;
  partyId: string;
  date: string;
  dueDate?: string;
  validUntil?: string;
  currency: string;
  exchangeRate: number;
  lines: DocumentLine[];
  documentDiscountMode?: 'percent' | 'amount';
  documentDiscountValue?: number;
  charges?: Money;
  applyRoundOff?: boolean;
  notes?: string;
  terms?: string;
  reference?: string;
  supplierDocNumber?: string;
  placeOfSupplyStateCode?: string;
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

export type ComplianceResult = { ok: boolean; issues: ComplianceIssue[] };

export type NewEwayBillInput = {
  documentId: string;
  subSupplyType: EwaySubSupplyType;
  subSupplyDescription?: string;
  transactionType: 1 | 2 | 3 | 4;
  from: EwayPlace;
  to: EwayPlace;
  transporterId?: string;
  transporterName?: string;
  transportMode: TransportMode;
  vehicleNumber?: string;
  vehicleType: VehicleType;
  transportDocNumber?: string;
  transportDocDate?: string;
  distanceKm: number;
  simulation?: IrpSimulation;
};

export type ExtendEwayBillInput = {
  remainingDistanceKm: number;
  reasonCode: EwayExtendReasonCode;
  remark?: string;
  transitType: 'inTransit' | 'inMovement';
  currentPlace: string;
  currentPincode: string;
  currentStateCode: string;
};

const emptySession: Session = { userId: null, authenticated: false, onboardingComplete: false };

/**
 * Version 2 introduced e-way bills and compliance settings, which refer to
 * documents by id. Ids are minted with `uid()`, which is not stable across
 * seed runs, so a saved v1 dataset and a freshly built v2 one cannot be
 * stitched together — every seeded bill would point at a document that no
 * longer exists. Rebuilding the demo data is the only coherent answer, and
 * the sign-in and the active company are carried over so nobody is bounced
 * back to the welcome screen.
 *
 * Version 3 put a plan on every company. Anyone who already has data was
 * using the whole app, so they land on Pro and nothing disappears. It also
 * started checking the GSTIN check digit, which the demo GSTINs used to get
 * wrong: a saved demo company or party whose GSTIN differs from the seed's
 * only in that digit is given the seed's corrected one.
 *
 * Version 4 turned `Company.businessType` from an English display label into
 * a stable slug, so it survives a language switch. The eight labels that
 * shipped are mapped back; anything else is left as it is.
 */
export function migratePersisted(persisted: unknown, version: number): AppState {
  if (version < 2) {
    const prior = persisted as Partial<AppState> | undefined;
    return {
      ...buildSeedData(),
      session: prior?.session ?? emptySession,
      activeCompanyId: prior?.activeCompanyId ?? PRIMARY_COMPANY_ID,
      activeBranchId: prior?.activeBranchId ?? 'brn_mum',
    } as AppState;
  }
  let state = persisted as AppState;
  if (version < 3) {
    const seedGstin = new Map<string, string>();
    seedCompanies().forEach((c) => c.taxRegistration?.identifier && seedGstin.set(c.id, c.taxRegistration.identifier));
    seedParties().forEach((p) => p.taxId && seedGstin.set(p.id, p.taxId));
    const repair = (id: string, gstin: string | undefined) => {
      const fixed = seedGstin.get(id);
      return gstin && fixed && !isValidGstin(gstin) && gstin.slice(0, 14) === fixed.slice(0, 14) ? fixed : gstin;
    };
    state = {
      ...state,
      companies: (state.companies ?? []).map((c) => ({
        ...c,
        plan: c.plan ?? 'pro',
        taxRegistration: c.taxRegistration && {
          ...c.taxRegistration,
          identifier: repair(c.id, c.taxRegistration.identifier),
        },
      })),
      parties: (state.parties ?? []).map((p) => ({ ...p, taxId: repair(p.id, p.taxId) })),
      transporters: state.transporters ?? seedTransporters(),
      complianceSettings: (state.complianceSettings ?? []).map((c) =>
        c.defaultTransporterId === '27AABCT5512M1ZQ' ? { ...c, defaultTransporterId: '27AABCT5512M1Z6' } : c,
      ),
    };
  }
  if (version < 4) {
    // Business type used to persist its English label, so it stopped matching
    // the picker the moment the app spoke another language. It is a slug now;
    // map the eight labels that shipped, and leave anything unrecognised
    // alone rather than guessing.
    state = {
      ...state,
      companies: (state.companies ?? []).map((c) => ({
        ...c,
        businessType: LEGACY_BUSINESS_TYPE_LABELS[c.businessType] ?? c.businessType,
      })),
    };
  }
  return state;
}

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
          currency: doc.currency,
          baseCurrency: company?.baseCurrency ?? 'INR',
          exchangeRate: doc.exchangeRate,
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

      /** Post stock movements for a document that has just been finalized. */
      const postStockFor = (doc: BusinessDocument) => {
        const s = get();
        const type =
          doc.kind === 'invoice' || doc.kind === 'delivery'
            ? 'salesIssue'
            : doc.kind === 'goodsReceipt' || doc.kind === 'purchaseBill'
              ? 'purchaseReceipt'
              : doc.kind === 'salesReturn'
                ? 'salesReturn'
                : doc.kind === 'purchaseReturn'
                  ? 'purchaseReturn'
                  : null;
        if (!type) return;

        const already = s.stockMovements.some((m) => m.referenceId === doc.id);
        if (already) return;

        const moves: StockMovement[] = [];
        doc.lines.forEach((line) => {
          const item = s.items.find((i) => i.id === line.itemId);
          if (!item || !item.trackInventory) return;
          moves.push({
            id: uid('stk'),
            companyId: doc.companyId,
            branchId: doc.branchId,
            itemId: item.id,
            type,
            quantity: line.quantity,
            unitCost: type === 'purchaseReceipt' ? line.unitPrice : item.purchasePrice,
            date: doc.date,
            referenceId: doc.id,
            referenceNumber: doc.number,
            createdBy: s.session.userId ?? CURRENT_USER_ID,
            createdAt: nowISO(),
          });
        });
        if (moves.length) set({ stockMovements: [...get().stockMovements, ...moves] });
      };

      /* -------------------------------------------------------------- */
      /* compliance helpers                                             */
      /* -------------------------------------------------------------- */

      const settingsFor = (companyId: string): ComplianceSettings =>
        get().complianceSettings.find((c) => c.companyId === companyId) ??
        defaultComplianceSettings(companyId, companyOf(companyId)?.baseCurrency ?? 'INR');

      const eInvoiceContextFor = (doc: BusinessDocument): EInvoiceContext | null => {
        const s = get();
        const company = companyOf(doc.companyId);
        if (!company) return null;
        return {
          document: doc,
          company,
          buyer: s.parties.find((p) => p.id === doc.partyId),
          settings: settingsFor(doc.companyId),
          items: s.items.filter((i) => i.companyId === doc.companyId),
          existingIrns: s.documents
            .filter((d) => d.companyId === doc.companyId && d.id !== doc.id && !!d.compliance?.irn)
            .map((d) => d.compliance!.irn!),
          now: nowISO(),
        };
      };

      /**
       * Write compliance state without going through `updateDocument`: a
       * reported IRN must not recalculate totals, consume a number, or land in
       * the audit trail as an ordinary edit.
       */
      const writeCompliance = (documentId: string, patch: Partial<ComplianceInfo>) => {
        set({
          documents: get().documents.map((d) =>
            d.id === documentId
              ? { ...d, compliance: { ...d.compliance, ...patch }, updatedAt: nowISO() }
              : d,
          ),
        });
      };

      const fail = (issues: ComplianceIssue[]): ComplianceResult => ({ ok: false, issues });

      /**
       * Report a freshly finalised document, where the company has asked for
       * that to happen automatically.
       *
       * An e-way bill is only raised here when the settings carry enough to
       * raise one without asking — which for road transport they never do,
       * because nobody can configure a vehicle number in advance. In that case
       * the document is marked pending and the user is prompted, rather than a
       * bill being invented with a blank Part-B.
       */
      const autoReportCompliance = (documentId: string) => {
        const doc = get().documents.find((d) => d.id === documentId);
        if (!doc) return;
        const settings = settingsFor(doc.companyId);

        if (settings.autoGenerateEInvoiceOnFinalise) {
          const ctx = eInvoiceContextFor(doc);
          if (ctx && isEInvoiceApplicable(ctx).applicable) get().generateEInvoice(documentId);
        }

        if (!settings.autoGenerateEwayBillOnFinalise) return;

        const items = get().items.filter((i) => i.companyId === doc.companyId);
        if (!isEwayBillRequired({ document: doc, items, settings }).required) return;

        const company = companyOf(doc.companyId);
        const buyer = get().parties.find((p) => p.id === doc.partyId);
        const branch = get().branches.find((b) => b.id === doc.branchId);
        const canRaiseUnattended =
          settings.defaultTransportMode !== 'road' && !!settings.defaultTransporterId;

        if (!company || !buyer || !branch || !canRaiseUnattended) {
          writeCompliance(documentId, { ewayBillStatus: 'pending' });
          notify(
            'compliance',
            'E-way bill needed',
            `${doc.number} needs a vehicle number before a bill can be raised.`,
            doc.kind,
            doc.id,
          );
          return;
        }

        const shipTo = buyer.shippingAddress ?? buyer.billingAddress;
        get().generateEwayBill({
          documentId,
          subSupplyType: subSupplyTypeFor(doc.kind),
          transactionType: 1,
          from: {
            legalName: company.legalName ?? company.name,
            gstin: company.taxRegistration?.identifier ?? 'URP',
            address1: branch.address.line1,
            address2: branch.address.line2,
            place: branch.address.city,
            pincode: branch.address.postalCode,
            stateCode: branch.address.stateCode ?? '',
          },
          to: {
            legalName: buyer.name,
            gstin: buyer.taxId ?? 'URP',
            address1: shipTo.line1,
            address2: shipTo.line2,
            place: shipTo.city,
            pincode: shipTo.postalCode,
            stateCode: shipTo.stateCode ?? '',
          },
          transporterId: settings.defaultTransporterId,
          transporterName: settings.defaultTransporterName,
          transportMode: settings.defaultTransportMode,
          vehicleType: settings.defaultVehicleType,
          transportDocNumber: `AUTO/${doc.number}`,
          transportDocDate: doc.date,
          distanceKm: settings.defaultDistanceKm,
        });
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
        revokeDevice: (id) => set({ devices: get().devices.filter((d) => d.id !== id) }),

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
        setPlan: (companyId, plan) => {
          const company = get().companies.find((c) => c.id === companyId);
          if (!company || company.plan === plan) return;
          set({ companies: get().companies.map((c) => (c.id === companyId ? { ...c, plan } : c)) });
          audit('updated', 'company', companyId, `Plan changed to ${plan}`);
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
            'invoice', 'quote', 'salesOrder', 'delivery', 'salesReturn',
            'purchaseOrder', 'goodsReceipt', 'purchaseBill', 'purchaseReturn', 'payment', 'expense',
          ];
          const prefixes: Record<string, string> = {
            invoice: 'INV', quote: 'QT', salesOrder: 'SO', delivery: 'DN', salesReturn: 'CRN',
            purchaseOrder: 'PO', goodsReceipt: 'GRN', purchaseBill: 'BILL', purchaseReturn: 'DRN',
            payment: 'PAY', expense: 'EXP',
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
            currency: partial.baseCurrency,
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
          audit(exists ? 'updated' : 'created', party.kind, party.id, party.name);
          return party.id;
        },
        removeParty: (id) => {
          const p = get().parties.find((x) => x.id === id);
          set({ parties: get().parties.filter((x) => x.id !== id) });
          if (p) audit('deleted', p.kind, id, p.name);
        },
        saveItem: (item) => {
          const exists = get().items.some((i) => i.id === item.id);
          set({ items: exists ? get().items.map((i) => (i.id === item.id ? item : i)) : [...get().items, item] });
          if (!exists && item.trackInventory && item.openingStock > 0) {
            const m: StockMovement = {
              id: uid('stk'),
              companyId: item.companyId,
              branchId: get().activeBranchId ?? 'brn_mum',
              itemId: item.id,
              type: 'opening',
              quantity: item.openingStock,
              unitCost: item.purchasePrice,
              date: today(),
              notes: 'Opening stock',
              createdBy: get().session.userId ?? CURRENT_USER_ID,
              createdAt: nowISO(),
            };
            set({ stockMovements: [...get().stockMovements, m] });
          }
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
        saveExpenseCategory: (cat) => {
          const exists = get().expenseCategories.some((c) => c.id === cat.id);
          set({
            expenseCategories: exists
              ? get().expenseCategories.map((c) => (c.id === cat.id ? cat : c))
              : [...get().expenseCategories, cat],
          });
        },
        removeExpenseCategory: (id) => set({ expenseCategories: get().expenseCategories.filter((c) => c.id !== id) }),
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
        saveExchangeRate: (rate) => {
          const exists = get().exchangeRates.some((r) => r.id === rate.id);
          set({
            exchangeRates: exists
              ? get().exchangeRates.map((r) => (r.id === rate.id ? rate : r))
              : [...get().exchangeRates, rate],
          });
          audit(exists ? 'updated' : 'created', 'exchangeRate', rate.id, `${rate.from}/${rate.to}`);
        },
        removeExchangeRate: (id) => set({ exchangeRates: get().exchangeRates.filter((r) => r.id !== id) }),
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
            supplierDocNumber: draft.supplierDocNumber,
            currency: draft.currency,
            exchangeRate: draft.exchangeRate,
            lines: draft.lines,
            documentDiscountMode: draft.documentDiscountMode ?? 'percent',
            documentDiscountValue: draft.documentDiscountValue ?? 0,
            charges: draft.charges ?? zero(draft.currency),
            applyRoundOff: draft.applyRoundOff ?? draft.currency === 'INR',
            placeOfSupplyStateCode: draft.placeOfSupplyStateCode ?? party?.billingAddress.stateCode,
            notes: draft.notes,
            terms: draft.terms,
            attachmentIds: draft.attachmentIds ?? [],
            sourceDocumentId: draft.sourceDocumentId,
            totals: {
              subtotal: zero(draft.currency),
              lineDiscount: zero(draft.currency),
              documentDiscount: zero(draft.currency),
              taxableAmount: zero(draft.currency),
              taxLines: [],
              totalTax: zero(draft.currency),
              charges: zero(draft.currency),
              roundOff: zero(draft.currency),
              grandTotal: zero(draft.currency),
              grandTotalBase: zero(draft.currency),
            },
            createdBy: s.session.userId ?? CURRENT_USER_ID,
            createdAt: nowISO(),
            updatedAt: nowISO(),
          };
          doc.totals = computeTotals(doc);

          set({ documents: [doc, ...get().documents] });
          if (finalized) postStockFor(doc);
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
          if (isFinalized(status)) postStockFor(updated);
          audit(`marked ${status}`, existing.kind, id, number);

          if (existing.kind === 'invoice' && status === 'sent') {
            notify('invoiceSent', 'Invoice sent', `${number} was shared with the customer.`, 'invoice', id);
          }
        },

        finalizeDocument: (id) => {
          const existing = get().documents.find((d) => d.id === id);
          if (!existing) return;
          const target: DocStatus =
            existing.kind === 'salesReturn' || existing.kind === 'purchaseReturn'
              ? 'approved'
              : existing.kind === 'quote'
                ? 'sent'
                : existing.kind === 'salesOrder' || existing.kind === 'purchaseOrder'
                  ? 'confirmed'
                  : existing.kind === 'delivery'
                    ? 'delivered'
                    : existing.kind === 'goodsReceipt'
                      ? 'received'
                      : 'issued';
          get().setDocumentStatus(id, target);
          autoReportCompliance(id);
        },

        removeDocument: (id) => {
          const d = get().documents.find((x) => x.id === id);
          set({
            documents: get().documents.filter((x) => x.id !== id),
            stockMovements: get().stockMovements.filter((m) => m.referenceId !== id),
          });
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
            currency: src.currency,
            exchangeRate: src.exchangeRate,
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
              target === 'invoice' || target === 'purchaseBill'
                ? new Date(Date.now() + (party?.paymentTermsDays ?? 30) * 86400000).toISOString().slice(0, 10)
                : undefined,
            currency: src.currency,
            exchangeRate: src.exchangeRate,
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
          if (!exists && withNumber.direction === 'received') {
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
        /* expenses                                                     */
        /* ------------------------------------------------------------ */
        saveExpense: (expense) => {
          const exists = get().expenses.some((e) => e.id === expense.id);
          const withNumber =
            expense.number && expense.number !== ''
              ? expense
              : { ...expense, number: consumeSeriesNumber('expense', expense.date) };
          set({
            expenses: exists
              ? get().expenses.map((e) => (e.id === expense.id ? withNumber : e))
              : [withNumber, ...get().expenses],
          });
          audit(exists ? 'updated' : 'created', 'expense', withNumber.id, withNumber.number);
          return withNumber.id;
        },
        removeExpense: (id) => {
          const e = get().expenses.find((x) => x.id === id);
          set({ expenses: get().expenses.filter((x) => x.id !== id) });
          if (e) audit('deleted', 'expense', id, e.number);
        },

        /* ------------------------------------------------------------ */
        /* inventory                                                    */
        /* ------------------------------------------------------------ */
        addStockMovement: (m) => {
          const movement: StockMovement = {
            ...m,
            id: uid('stk'),
            createdBy: get().session.userId ?? CURRENT_USER_ID,
            createdAt: nowISO(),
          };
          set({ stockMovements: [...get().stockMovements, movement] });
          const item = get().items.find((i) => i.id === m.itemId);
          audit('stock movement', 'inventory', movement.id, item?.name ?? m.itemId);
        },

        transferStock: ({ itemId, fromBranchId, toBranchId, quantity, date, notes }) => {
          const s = get();
          const item = s.items.find((i) => i.id === itemId);
          const base: Omit<StockMovement, 'id' | 'type' | 'branchId'> = {
            companyId: s.activeCompanyId,
            itemId,
            quantity,
            unitCost: item?.purchasePrice ?? zero('INR'),
            date,
            notes,
            createdBy: s.session.userId ?? CURRENT_USER_ID,
            createdAt: nowISO(),
          };
          set({
            stockMovements: [
              ...s.stockMovements,
              { ...base, id: uid('stk'), type: 'transferOut', branchId: fromBranchId },
              { ...base, id: uid('stk'), type: 'transferIn', branchId: toBranchId },
            ],
          });
          audit('stock transfer', 'inventory', itemId, item?.name ?? itemId);
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
        /* compliance (FRD 16)                                          */
        /* ------------------------------------------------------------ */

        saveComplianceSettings: (settings) => {
          const exists = get().complianceSettings.some((c) => c.companyId === settings.companyId);
          const next = { ...settings, updatedAt: nowISO() };
          set({
            complianceSettings: exists
              ? get().complianceSettings.map((c) => (c.companyId === settings.companyId ? next : c))
              : [next, ...get().complianceSettings],
          });
          audit('updated', 'complianceSettings', settings.companyId, 'E-invoicing & e-way bill');
        },
        saveTransporter: (transporter) => {
          const exists = get().transporters.some((x) => x.id === transporter.id);
          set({
            transporters: exists
              ? get().transporters.map((x) => (x.id === transporter.id ? transporter : x))
              : [...get().transporters, transporter],
          });
          audit(exists ? 'updated' : 'created', 'transporter', transporter.id, transporter.name);
        },
        removeTransporter: (id) => {
          const gone = get().transporters.find((x) => x.id === id);
          set({ transporters: get().transporters.filter((x) => x.id !== id) });
          if (gone) audit('deleted', 'transporter', id, gone.name);
        },

        generateEInvoice: (documentId, opts) => {
          const doc = get().documents.find((d) => d.id === documentId);
          if (!doc) return fail([]);

          const ctx = eInvoiceContextFor(doc);
          if (!ctx) return fail([]);

          const applicability = isEInvoiceApplicable(ctx);
          if (!applicability.applicable) {
            writeCompliance(documentId, {
              eInvoiceStatus: 'notApplicable',
              lastMessage: applicability.reason,
            });
            return fail([
              { code: 'NA', field: 'document', message: applicability.reason, severity: 'blocking' },
            ]);
          }

          const issues = validateEInvoice(ctx);
          const blocking = blockingIssues(issues);
          if (blocking.length) {
            writeCompliance(documentId, {
              eInvoiceStatus: 'failed',
              eInvoiceIssues: issues,
              lastAttemptAt: nowISO(),
              lastMessage: blocking[0].message,
            });
            audit('e-invoice rejected', doc.kind, doc.id, doc.number, { after: blocking[0].code });
            notify(
              'compliance',
              'E-invoice rejected',
              `${doc.number}: ${blocking[0].message}`,
              doc.kind,
              doc.id,
            );
            return fail(issues);
          }

          const response = submitInvoice({
            payload: buildIrpPayload(ctx),
            existingIrns: ctx.existingIrns ?? [],
            now: ctx.now,
            simulation: opts?.simulation,
          });

          if (!response.ok) {
            writeCompliance(documentId, {
              eInvoiceStatus: 'failed',
              eInvoiceIssues: response.errors,
              lastAttemptAt: nowISO(),
              lastMessage: response.errors[0]?.message,
            });
            audit('e-invoice rejected', doc.kind, doc.id, doc.number, {
              after: response.errors[0]?.code,
            });
            notify(
              'compliance',
              'E-invoice rejected',
              `${doc.number}: ${response.errors[0]?.message ?? 'The portal refused the invoice'}`,
              doc.kind,
              doc.id,
            );
            return fail(response.errors);
          }

          writeCompliance(documentId, {
            eInvoiceStatus: 'generated',
            eInvoiceDocType: applicability.docType ?? undefined,
            eInvoiceSupplyType: applicability.supplyType ?? undefined,
            irn: response.irn,
            ackNo: response.ackNo,
            ackDate: response.ackDate,
            signedQrPayload: response.signedQrPayload,
            irnGeneratedAt: ctx.now,
            irnCancelledAt: undefined,
            irnCancelReasonCode: undefined,
            irnCancelRemark: undefined,
            eInvoiceIssues: issues.length ? issues : undefined,
            lastAttemptAt: ctx.now,
            lastMessage: undefined,
          });

          audit('generated e-invoice', doc.kind, doc.id, doc.number, { after: response.irn });
          notify(
            'compliance',
            'IRN generated',
            `${doc.number} · Ack ${response.ackNo}`,
            doc.kind,
            doc.id,
          );
          return { ok: true, issues };
        },

        cancelEInvoice: (documentId, reasonCode, remark) => {
          const doc = get().documents.find((d) => d.id === documentId);
          if (!doc) return fail([]);

          const now = nowISO();
          const allowed = canCancelEInvoice(doc.compliance, now);
          if (!allowed.allowed) {
            return fail([
              {
                code: 'CANCEL',
                field: 'irn',
                message: allowed.reason ?? 'This IRN cannot be cancelled',
                severity: 'blocking',
              },
            ]);
          }

          const response = cancelIrn({
            irn: doc.compliance!.irn!,
            irnGeneratedAt: doc.compliance!.irnGeneratedAt!,
            reasonCode,
            remark,
            now,
          });
          if (!response.ok) return fail(response.errors);

          writeCompliance(documentId, {
            eInvoiceStatus: 'cancelled',
            irnCancelledAt: now,
            irnCancelReasonCode: reasonCode,
            irnCancelRemark: remark,
            lastMessage: `IRN cancelled on the portal: ${response.reason.toLowerCase()}`,
          });

          audit('cancelled e-invoice', doc.kind, doc.id, doc.number, {
            before: doc.compliance?.irn,
            after: response.reason,
          });
          notify('compliance', 'IRN cancelled', `${doc.number} · ${response.reason}`, doc.kind, doc.id);
          return { ok: true, issues: [] };
        },

        generateEwayBill: (input) => {
          const s = get();
          const doc = s.documents.find((d) => d.id === input.documentId);
          if (!doc) return fail([]);

          const settings = settingsFor(doc.companyId);
          const items = s.items.filter((i) => i.companyId === doc.companyId);
          const requirement = isEwayBillRequired({ document: doc, items, settings });
          if (!requirement.required) {
            return fail([
              { code: 'EWB001', field: 'document', message: requirement.reason, severity: 'blocking' },
            ]);
          }

          const now = nowISO();
          const currency = doc.totals.grandTotal.currency;
          const componentTotal = (type: 'CGST' | 'SGST' | 'IGST') =>
            doc.totals.taxLines
              .flatMap((l) => l.components)
              .filter((c) => c.type === type)
              .reduce((acc, c) => acc + c.amount.minor, 0);

          const partA = validatePartA({
            from: input.from,
            to: input.to,
            subSupplyType: input.subSupplyType,
            subSupplyDescription: input.subSupplyDescription,
            documentNumber: doc.number,
            documentDate: doc.date,
            consignmentValueMinor: doc.totals.grandTotal.minor,
            mainHsnCode: mainHsnCodeOf(doc),
          });
          const partB = validatePartB({
            transportMode: input.transportMode,
            vehicleNumber: input.vehicleNumber,
            vehicleType: input.vehicleType,
            transporterId: input.transporterId,
            transportDocNumber: input.transportDocNumber,
            transportDocDate: input.transportDocDate,
            distanceKm: input.distanceKm,
            now,
          });

          const issues = [...partA, ...partB];
          if (blockingIssues(issues).length) return fail(issues);

          const draft = {
            companyId: doc.companyId,
            branchId: doc.branchId,
            documentId: doc.id,
            documentKind: doc.kind,
            documentNumber: doc.number,
            documentDate: doc.date,
            partyId: doc.partyId,
            docType: ewayDocTypeFor(doc.kind),
            supplyType: 'outward' as const,
            subSupplyType: input.subSupplyType,
            subSupplyDescription: input.subSupplyDescription,
            transactionType: input.transactionType,
            from: input.from,
            to: input.to,
            consignmentValue: doc.totals.grandTotal,
            taxableValue: doc.totals.taxableAmount,
            cgst: { minor: componentTotal('CGST'), currency },
            sgst: { minor: componentTotal('SGST'), currency },
            igst: { minor: componentTotal('IGST'), currency },
            mainHsnCode: mainHsnCodeOf(doc),
            itemCount: doc.lines.length,
            transporterId: input.transporterId,
            transporterName: input.transporterName,
            transportMode: input.transportMode,
            vehicleNumber: input.vehicleNumber,
            vehicleType: input.vehicleType,
            transportDocNumber: input.transportDocNumber,
            transportDocDate: input.transportDocDate,
            distanceKm: input.distanceKm,
            generatedAt: now,
            generatedBy: s.session.userId ?? CURRENT_USER_ID,
            cancelledAt: undefined,
            cancelReasonCode: undefined,
            cancelRemark: undefined,
          };

          const response = submitEwayBill({
            payload: buildEwbPayload(draft),
            vehicleType: input.vehicleType,
            now,
            simulation: input.simulation,
          });
          if (!response.ok) return fail(response.errors);

          const bill: EwayBill = {
            ...draft,
            id: uid('ewb'),
            ewayBillNumber: response.ewayBillNumber,
            validFrom: response.validFrom,
            validUpto: response.validUpto,
            status: 'active',
            partBUpdates: [
              {
                id: uid('pb'),
                mode: input.transportMode,
                vehicleNumber: input.vehicleNumber,
                vehicleType: input.vehicleType,
                transportDocNumber: input.transportDocNumber,
                transportDocDate: input.transportDocDate,
                fromPlace: input.from.place,
                fromStateCode: input.from.stateCode,
                reasonCode: '1',
                updatedAt: now,
                updatedBy: s.session.userId ?? CURRENT_USER_ID,
              },
            ],
            extensions: [],
            createdAt: now,
            updatedAt: now,
          };

          set({ ewayBills: [bill, ...get().ewayBills] });
          writeCompliance(doc.id, {
            ewayBillStatus: 'generated',
            ewayBillId: bill.id,
            ewayBillNumber: bill.ewayBillNumber,
            ewayBillValidUpto: bill.validUpto,
          });

          audit('generated e-way bill', 'ewayBill', bill.id, bill.ewayBillNumber, { after: doc.number });
          notify(
            'compliance',
            `E-way bill ${bill.ewayBillNumber}`,
            `${doc.number} · valid until ${bill.validUpto.slice(0, 10)}`,
            'ewayBill',
            bill.id,
          );
          return { ok: true, issues, ewayBillId: bill.id };
        },

        updateEwayBillPartB: (id, update) => {
          const s = get();
          const bill = s.ewayBills.find((b) => b.id === id);
          if (!bill) return fail([]);

          const now = nowISO();
          const allowed = canUpdatePartB(bill, now);
          if (!allowed.allowed) {
            return fail([
              {
                code: 'EWB210',
                field: 'status',
                message: allowed.reason ?? 'Part-B cannot be updated',
                severity: 'blocking',
              },
            ]);
          }

          const issues = validatePartB({
            transportMode: update.mode,
            vehicleNumber: update.vehicleNumber,
            vehicleType: update.vehicleType,
            transportDocNumber: update.transportDocNumber,
            transportDocDate: update.transportDocDate,
            distanceKm: bill.distanceKm,
            now,
          });
          if (blockingIssues(issues).length) return fail(issues);

          const entry: EwayBillPartBUpdate = {
            ...update,
            id: uid('pb'),
            updatedAt: now,
            updatedBy: s.session.userId ?? CURRENT_USER_ID,
          };

          set({
            ewayBills: get().ewayBills.map((b) =>
              b.id === id
                ? {
                    ...b,
                    transportMode: update.mode,
                    vehicleNumber: update.vehicleNumber,
                    vehicleType: update.vehicleType,
                    transportDocNumber: update.transportDocNumber,
                    transportDocDate: update.transportDocDate,
                    partBUpdates: [...b.partBUpdates, entry],
                    updatedAt: now,
                  }
                : b,
            ),
          });

          audit('updated Part-B', 'ewayBill', bill.id, bill.ewayBillNumber, {
            after: update.vehicleNumber ?? update.transportDocNumber,
          });
          return { ok: true, issues };
        },

        extendEwayBill: (id, args) => {
          const s = get();
          const bill = s.ewayBills.find((b) => b.id === id);
          if (!bill) return fail([]);

          const now = nowISO();
          const response = extendEwayBillAtPortal({
            bill,
            remainingDistanceKm: args.remainingDistanceKm,
            reasonCode: args.reasonCode,
            now,
          });
          if (!response.ok) return fail(response.errors);

          const extension = {
            id: uid('ext'),
            extendedAt: now,
            extendedBy: s.session.userId ?? CURRENT_USER_ID,
            reasonCode: args.reasonCode,
            remark: args.remark,
            transitType: args.transitType,
            currentPlace: args.currentPlace,
            currentPincode: args.currentPincode,
            currentStateCode: args.currentStateCode,
            remainingDistanceKm: args.remainingDistanceKm,
            previousValidUpto: bill.validUpto,
            newValidUpto: response.newValidUpto,
          };

          set({
            ewayBills: get().ewayBills.map((b) =>
              b.id === id
                ? {
                    ...b,
                    validUpto: response.newValidUpto,
                    extensions: [...b.extensions, extension],
                    updatedAt: now,
                  }
                : b,
            ),
          });
          writeCompliance(bill.documentId, { ewayBillValidUpto: response.newValidUpto });

          audit('extended e-way bill', 'ewayBill', bill.id, bill.ewayBillNumber, {
            before: bill.validUpto,
            after: response.newValidUpto,
          });
          notify(
            'compliance',
            'E-way bill extended',
            `${bill.ewayBillNumber} now runs to ${response.newValidUpto.slice(0, 10)}`,
            'ewayBill',
            bill.id,
          );
          return { ok: true, issues: [] };
        },

        cancelEwayBill: (id, reasonCode, remark) => {
          const bill = get().ewayBills.find((b) => b.id === id);
          if (!bill) return fail([]);

          const now = nowISO();
          const allowed = canCancelEwayBill(bill, now);
          if (!allowed.allowed) {
            return fail([
              {
                code: 'EWB220',
                field: 'status',
                message: allowed.reason ?? 'This bill cannot be cancelled',
                severity: 'blocking',
              },
            ]);
          }

          const response = cancelEwayBillAtPortal({
            ewayBillNumber: bill.ewayBillNumber,
            reasonCode,
            remark,
            now,
          });
          if (!response.ok) return fail(response.errors);

          set({
            ewayBills: get().ewayBills.map((b) =>
              b.id === id
                ? {
                    ...b,
                    status: 'cancelled' as const,
                    cancelledAt: now,
                    cancelReasonCode: reasonCode,
                    cancelRemark: remark,
                    updatedAt: now,
                  }
                : b,
            ),
          });
          writeCompliance(bill.documentId, { ewayBillStatus: 'cancelled' });

          audit('cancelled e-way bill', 'ewayBill', bill.id, bill.ewayBillNumber, {
            after: response.reason,
          });
          notify(
            'compliance',
            'E-way bill cancelled',
            `${bill.ewayBillNumber} · ${response.reason}`,
            'ewayBill',
            bill.id,
          );
          return { ok: true, issues: [] };
        },

        retrySync: (id) =>
          set({ syncQueue: get().syncQueue.filter((q) => q.id !== id) }),
        clearSyncQueue: () => set({ syncQueue: [] }),

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
      name: 'ebs.data.v1',
      version: 4,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => {
        const { hydrated, ...rest } = s;
        void hydrated;
        return rest as AppState;
      },
      migrate: (persisted, version) => migratePersisted(persisted, version),
      onRehydrateStorage: () => (state) => {
        state?.setHydrated(true);
      },
    },
  ),
);
