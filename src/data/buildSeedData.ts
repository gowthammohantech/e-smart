/**
 * Assembles the whole demo book.
 *
 * It lives here rather than in the store so that it can be exercised without
 * pulling in AsyncStorage — the seed is the thing most worth asserting, since
 * a decorative prototype is exactly where fabricated GSTINs and invented IRNs
 * would hide.
 */

import {
  Attachment,
  AuditEvent,
  AppNotification,
  Branch,
  BusinessDocument,
  Company,
  Integration,
  Item,
  NumberingSeries,
  Party,
  Payment,
  PaymentAccount,
  TaxCategory,
  Transporter,
  User,
} from '@/types';
import { INTEGRATIONS } from './masters';
import {
  ACCOUNT_ID,
  seedBranches,
  seedCompanies,
  seedItems,
  seedNumberingSeries,
  seedParties,
  seedPaymentAccounts,
  seedTaxCategories,
  seedTransporters,
  seedUsers,
} from './seed';
import { seedAttachments, seedAudit, seedDocuments, seedNotifications, seedPayments } from './seedTransactions';

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
