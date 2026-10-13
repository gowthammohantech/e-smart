/**
 * The demo dataset: the "Vertex Traders" account the seeder loads when
 * SEED_DEMO_ACCOUNT=true. It lives here, beside the seeder, so it never ships
 * in a client bundle.
 */
import { INTEGRATIONS } from '@esmart/core/data/masters';
import {
  ACCOUNT_ID,
  seedBranches,
  seedCompanies,
  seedComplianceSettings,
  seedExchangeRates,
  seedExpenseCategories,
  seedItems,
  seedNumberingSeries,
  seedParties,
  seedPaymentAccounts,
  seedTaxCategories,
  seedTransporters,
  seedUsers,
} from './seed';
import { seedAudit, seedCompliance, seedDocuments, seedExpenses, seedNotifications, seedPayments, seedStockMovements } from './seedTransactions';

export * from './seed';
export * from './seedTransactions';

/** The demo dataset, numbering series advanced past what the seed consumed. */
export function buildDemoData() {
  const companies = seedCompanies();
  const branches = seedBranches();
  const users = seedUsers();
  const parties = seedParties();
  const items = seedItems();
  const taxCategories = seedTaxCategories();
  const series = seedNumberingSeries();
  const complianceSettings = seedComplianceSettings();
  const { documents, ewayBills } = seedCompliance(seedDocuments({ items, parties, taxCategories, series }), companies, parties, branches, complianceSettings);
  const payments = seedPayments(documents, series);
  const expenses = seedExpenses(series);
  const stockMovements = seedStockMovements(items, documents);
  const numberingSeries = series.map((x) => {
    const used =
      x.kind === 'payment'
        ? payments.filter((p) => p.companyId === x.companyId).length
        : x.kind === 'expense'
          ? expenses.filter((e) => e.companyId === x.companyId).length
          : documents.filter((d) => d.companyId === x.companyId && d.kind === x.kind).length;
    return { ...x, nextNumber: used + 1 };
  });
  return {
    accountId: ACCOUNT_ID,
    users,
    companies,
    branches,
    parties,
    items,
    taxCategories,
    expenseCategories: seedExpenseCategories(),
    paymentAccounts: seedPaymentAccounts(),
    exchangeRates: seedExchangeRates(),
    numberingSeries,
    documents,
    payments,
    expenses,
    stockMovements,
    notifications: seedNotifications(documents, payments, ewayBills),
    auditEvents: seedAudit(documents, payments, ewayBills),
    integrations: INTEGRATIONS.map((i) => ({ ...i })),
    complianceSettings,
    ewayBills,
    transporters: seedTransporters(),
  };
}

export type DemoData = ReturnType<typeof buildDemoData>;
