/**
 * Loads the app's demo dataset (the "Vertex Traders" account the prototype
 * ships with) into Postgres, so the API serves the same books the app shows.
 *
 * The data comes from `@esmart/core/data/seed*`, assembled the way the app's
 * `buildSeedData()` does it, with every relative date computed from today.
 * Running it again first deletes everything under the demo account (its
 * companies, users and all their rows), so it is idempotent and never touches
 * another account. Reference data is left alone: migrate loads it.
 *
 * `npm run db:seed -w @esmart/db` (DATABASE_URL, default the local dev db).
 */
import { randomBytes, createHash } from 'node:crypto';
import { sql } from 'drizzle-orm';
import type { PgInsertValue, PgTable } from 'drizzle-orm/pg-core';
import { hash } from '@node-rs/argon2';
import {
  ACCOUNT_ID,
  CURRENT_USER_ID,
  seedBranches,
  seedCompanies,
  seedComplianceSettings,
  seedDevices,
  seedExchangeRates,
  seedExpenseCategories,
  seedItems,
  seedNumberingSeries,
  seedParties,
  seedPaymentAccounts,
  seedTaxCategories,
  seedTransporters,
  seedUsers,
} from '@esmart/core/data/seed';
import {
  seedAudit,
  seedCompliance,
  seedDocuments,
  seedExpenses,
  seedNotifications,
  seedPayments,
  seedStockMovements,
} from '@esmart/core/data/seedTransactions';
import { INTEGRATIONS, UNITS } from '@esmart/core/data/masters';
import { calculateLine } from '@esmart/core/domain/lineCalc';
import { signedQuantity } from '@esmart/core/domain/stockLedger';
import { financialYearOf, today } from '@esmart/core/lib/date';
import type { Address, BusinessDocument, DocStatus, DocumentKind } from '@esmart/core/types';
import { createDb, createPool, type Db } from './index';
import { HSN_STARTER } from './reference';
import * as s from './schema';

/** The password the sign-in screen pre-fills for the demo owner. */
export const DEMO_EMAIL = 'gowtham@vertextraders.in';
export const DEMO_PASSWORD = 'demo1234';

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

/**
 * The demo dataset exactly as the app assembles it in `buildSeedData()`
 * (packages/app/store/appStore.ts), numbering series advanced past what the
 * seed consumed.
 */
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
    devices: seedDevices(),
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

/** Statuses the API derives at read time (documents/lifecycle.ts); the row stores the base status. */
const DERIVED: DocStatus[] = ['paid', 'partiallyPaid', 'overdue'];

/** What the column comment asks drafts to carry until they are finalised. */
const draftNumber = (kind: DocumentKind) => `${kind.toUpperCase()}-DRAFT`;

const at = (isoString: string) => new Date(isoString);
const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');

function address(prefix: 'address' | 'billing' | 'shipping', a: Address | undefined) {
  return {
    [`${prefix}Line1`]: a?.line1 ?? null,
    [`${prefix}Line2`]: a?.line2 ?? null,
    [`${prefix}City`]: a?.city ?? null,
    [`${prefix}State`]: a?.state ?? null,
    [`${prefix}StateCode`]: a?.stateCode ?? null,
    [`${prefix}PostalCode`]: a?.postalCode ?? null,
    [`${prefix}Country`]: a?.country ?? null,
  };
}

/** A company or branch address; both columns sets are NOT NULL. */
const addressCols = (a: Address) => ({
  addressLine1: a.line1,
  addressLine2: a.line2 ?? null,
  addressCity: a.city,
  addressState: a.state,
  addressStateCode: a.stateCode ?? null,
  addressPostalCode: a.postalCode,
  addressCountry: a.country,
});

/** `(a, b, c)` for an IN list; `(null)` matches nothing when there are no ids. */
const list = (ids: string[]) => (ids.length ? sql`(${sql.join(ids.map((id) => sql`${id}`), sql`, `)})` : sql`(null)`);

/**
 * Deletes every row under the demo account, children before parents. Users
 * and companies are found by the account and by the seed's own ids, so rows
 * the API added later (another company, an invited user) go too.
 */
async function deleteDemo(tx: Tx, data: DemoData) {
  const rows = <T>(r: { rows: T[] }) => r.rows;
  const companyIds = rows<{ id: string }>(
    await tx.execute(sql`select id from companies where account_id = ${data.accountId} or id in ${list(data.companies.map((c) => c.id))}`),
  ).map((r) => r.id);
  const userIds = rows<{ id: string }>(
    await tx.execute(sql`select id from users where account_id = ${data.accountId} or id in ${list(data.users.map((u) => u.id))}`),
  ).map((r) => r.id);
  const C = list(companyIds);
  const U = list(userIds);
  const docs = sql`(select id from documents where company_id in ${C})`;
  const bills = sql`(select id from eway_bills where company_id in ${C})`;
  const extractions = sql`(select id from ocr_extractions where company_id in ${C})`;

  // Break the reference cycles first: documents ↔ eway_bills, accounts ↔ users, companies → attachments.
  await tx.execute(sql`update documents set current_eway_bill_id = null where company_id in ${C}`);
  await tx.execute(sql`update accounts set owner_user_id = null where id = ${data.accountId}`);
  await tx.execute(sql`update users set default_company_id = null where id in ${U}`);
  await tx.execute(sql`update companies set logo_attachment_id = null where id in ${C}`);

  const statements = [
    sql`delete from reminder_documents where document_id in ${docs} or delivery_id in (select id from message_deliveries where company_id in ${C} or sent_by in ${U})`,
    sql`delete from message_deliveries where company_id in ${C} or sent_by in ${U}`,
    sql`delete from payment_links where company_id in ${C}`,
    sql`delete from share_links where company_id in ${C}`,
    sql`delete from payment_allocations where document_id in ${docs} or payment_id in (select id from payments where company_id in ${C})`,
    sql`delete from payments where company_id in ${C}`,
    sql`delete from eway_bill_part_b_updates where eway_bill_id in ${bills}`,
    sql`delete from eway_bill_extensions where eway_bill_id in ${bills}`,
    sql`delete from eway_bills where company_id in ${C}`,
    sql`delete from e_invoices where company_id in ${C} or document_id in ${docs}`,
    sql`delete from document_tax_components where tax_line_id in (select id from document_tax_lines where document_id in ${docs})`,
    sql`delete from document_tax_lines where document_id in ${docs}`,
    sql`delete from document_lines where document_id in ${docs}`,
    sql`delete from stock_movements where company_id in ${C}`,
    sql`delete from expenses where company_id in ${C}`,
    sql`delete from ocr_lines where extraction_id in ${extractions}`,
    sql`delete from ocr_fields where extraction_id in ${extractions}`,
    sql`delete from ocr_extractions where company_id in ${C}`,
    sql`delete from documents where company_id in ${C}`,
    sql`delete from notifications where company_id in ${C} or user_id in ${U}`,
    sql`delete from audit_events where company_id in ${C} or actor_id in ${U}`,
    sql`delete from change_log where company_id in ${C}`,
    sql`delete from export_jobs where company_id in ${C} or requested_by in ${U}`,
    sql`delete from sync_mutations where company_id in ${C} or user_id in ${U}`,
    sql`delete from subscription_events where company_id in ${C}`,
    sql`delete from subscriptions where company_id in ${C}`,
    sql`delete from company_integrations where company_id in ${C} or connected_by in ${U}`,
    sql`delete from compliance_settings where company_id in ${C}`,
    sql`delete from compliance_credentials where company_id in ${C}`,
    sql`delete from backup_settings where company_id in ${C}`,
    sql`delete from numbering_series where company_id in ${C}`,
    sql`delete from transporters where company_id in ${C}`,
    sql`delete from exchange_rates where company_id in ${C}`,
    sql`delete from payment_accounts where company_id in ${C}`,
    sql`delete from items where company_id in ${C}`,
    sql`delete from parties where company_id in ${C}`,
    sql`delete from tax_categories where company_id in ${C}`,
    sql`delete from expense_categories where company_id in ${C}`,
    sql`delete from user_branches where user_id in ${U} or branch_id in (select id from branches where company_id in ${C})`,
    sql`delete from user_companies where user_id in ${U} or company_id in ${C}`,
    sql`delete from branches where company_id in ${C}`,
    sql`delete from attachments where company_id in ${C} or uploaded_by in ${U}`,
    sql`delete from push_tokens where user_id in ${U}`,
    sql`delete from device_sessions where user_id in ${U}`,
    sql`delete from invites where user_id in ${U} or invited_by in ${U}`,
    sql`delete from password_reset_tokens where user_id in ${U}`,
    sql`delete from client_id_mappings where user_id in ${U}`,
    sql`delete from idempotency_keys where user_id in ${U}`,
    sql`delete from companies where id in ${C}`,
    sql`delete from users where id in ${U}`,
    sql`delete from accounts where id = ${data.accountId}`,
  ];
  for (const stmt of statements) await tx.execute(stmt);
}

/** Inserts in chunks, keeping each statement well under Postgres' parameter limit. */
async function insertAll<T extends PgTable>(tx: Tx, table: T, values: PgInsertValue<T>[]) {
  for (let i = 0; i < values.length; i += 500) await tx.insert(table).values(values.slice(i, i + 500));
}

/**
 * Replaces the demo account's data with a fresh copy of the demo dataset,
 * in one transaction. Returns the dataset that was written.
 */
export async function seedDemo(db: Db, data: DemoData = buildDemoData()): Promise<DemoData> {
  if (process.env.NODE_ENV === 'production') throw new Error('Refusing to seed demo data into a production database.');
  const passwordHash = await hash(DEMO_PASSWORD);
  const now = new Date();
  const companyCreated = new Map(data.companies.map((c) => [c.id, at(c.createdAt)]));
  const accountCreated = new Date(Math.min(...data.companies.map((c) => at(c.createdAt).getTime())));

  await db.transaction(async (tx) => {
    // Every FK is DEFERRABLE; checking at commit tolerates the cycles.
    await tx.execute(sql`set constraints all deferred`);

    const clash = await tx.execute<{ email: string }>(
      sql`select email from users where email in ${list(data.users.map((u) => u.email))} and account_id <> ${data.accountId} and id not in ${list(data.users.map((u) => u.id))}`,
    );
    if (clash.rows.length) throw new Error(`Another account already uses ${clash.rows.map((r) => r.email).join(', ')}; not seeding over it.`);

    await deleteDemo(tx, data);

    /* ---- reference rows the catalogue needs ---------------------------- */
    const hsnKnown = new Map(HSN_STARTER.map((h) => [h.code, h]));
    const hsnCodes = [...new Set(data.items.map((i) => i.hsnCode).filter((c): c is string => !!c))];
    await tx
      .insert(s.hsnCodes)
      .values(
        hsnCodes.map((code) => {
          const known = hsnKnown.get(code);
          const item = data.items.find((i) => i.hsnCode === code)!;
          return { code, description: known?.description ?? item.name, isService: known?.isService ?? code.startsWith('99'), defaultGstRate: known ? String(known.rate) : null };
        }),
      )
      .onConflictDoNothing();
    const unitCodes = new Set(data.items.map((i) => i.unit));
    await tx
      .insert(s.units)
      .values([...unitCodes].map((code) => {
        const u = UNITS.find((x) => x.code === code);
        return { code, name: u?.name ?? code, decimals: u?.decimals ?? 0 };
      }))
      .onConflictDoNothing();

    /* ---- account, companies, branches, users --------------------------- */
    const owner = data.users.find((u) => u.id === CURRENT_USER_ID)!;
    await tx.insert(s.accounts).values({ id: data.accountId, name: owner.name, createdAt: accountCreated, updatedAt: accountCreated });

    await insertAll(
      tx,
      s.companies,
      data.companies.map((c) => ({
        id: c.id,
        accountId: c.accountId,
        name: c.name,
        legalName: c.legalName ?? null,
        businessType: c.businessType,
        country: c.country,
        baseCurrency: c.baseCurrency,
        ...addressCols(c.address),
        email: c.email ?? null,
        phone: c.phone ?? null,
        website: c.website ?? null,
        taxRegime: c.taxRegistration?.regime ?? 'NONE',
        taxIdentifier: c.taxRegistration?.identifier ?? null,
        taxIdentifierLabel: c.taxRegistration?.identifierLabel ?? 'GSTIN',
        taxRegistered: c.taxRegistration?.registered ?? false,
        compositionScheme: c.taxRegistration?.compositionScheme ?? false,
        placeOfSupplyStateCode: c.taxRegistration?.placeOfSupplyStateCode ?? null,
        fiscalYearStartMonth: c.fiscalYearStartMonth,
        plan: c.plan,
        onboardingCompletedAt: at(c.createdAt),
        createdAt: at(c.createdAt),
        updatedAt: at(c.createdAt),
      })),
    );

    await insertAll(
      tx,
      s.branches,
      data.branches.map((b) => ({
        id: b.id,
        companyId: b.companyId,
        name: b.name,
        code: b.code,
        ...addressCols(b.address),
        isPrimary: b.isPrimary,
        phone: b.phone ?? null,
        createdAt: companyCreated.get(b.companyId),
        updatedAt: companyCreated.get(b.companyId),
      })),
    );

    await insertAll(
      tx,
      s.users,
      data.users.map((u) => ({
        id: u.id,
        accountId: u.accountId,
        name: u.name,
        email: u.email,
        phone: u.phone ?? null,
        // Everyone who can sign in shares the demo password; an invitee has none until they accept.
        passwordHash: u.status === 'invited' ? null : passwordHash,
        role: u.role,
        avatarColor: u.avatarColor,
        status: u.status,
        defaultCompanyId: u.companyIds[0] ?? null,
        emailVerifiedAt: u.status === 'active' ? accountCreated : null,
        lastActiveAt: u.lastActiveAt ? at(u.lastActiveAt) : null,
        createdAt: accountCreated,
        updatedAt: accountCreated,
      })),
    );
    await tx.update(s.accounts).set({ ownerUserId: owner.id }).where(sql`${s.accounts.id} = ${data.accountId}`);
    await insertAll(tx, s.userCompanies, data.users.flatMap((u) => u.companyIds.map((companyId) => ({ userId: u.id, companyId }))));
    await insertAll(tx, s.userBranches, data.users.flatMap((u) => u.branchIds.map((branchId) => ({ userId: u.id, branchId }))));

    await insertAll(
      tx,
      s.deviceSessions,
      data.devices.map((d) => ({
        id: d.id,
        userId: owner.id,
        label: d.label,
        platform: d.platform,
        location: d.location ?? null,
        // Nobody holds these tokens: the rows only populate the devices list.
        refreshTokenHash: sha256(randomBytes(32).toString('base64url')),
        refreshExpiresAt: new Date(now.getTime() + 30 * 86_400_000),
        lastActiveAt: at(d.lastActiveAt),
        createdAt: at(d.lastActiveAt),
      })),
    );

    /* ---- company masters --------------------------------------------- */
    await insertAll(
      tx,
      s.taxCategories,
      data.taxCategories.map((t) => ({
        id: t.id,
        companyId: t.companyId,
        name: t.name,
        rate: String(t.rate),
        type: t.type,
        hsnCode: t.hsnCode ?? null,
        effectiveFrom: t.effectiveFrom,
        description: t.description ?? null,
        createdAt: companyCreated.get(t.companyId),
        updatedAt: companyCreated.get(t.companyId),
      })),
    );
    await insertAll(
      tx,
      s.expenseCategories,
      data.expenseCategories.map((e) => ({ id: e.id, companyId: e.companyId, name: e.name, icon: e.icon, color: e.color, createdAt: companyCreated.get(e.companyId), updatedAt: companyCreated.get(e.companyId) })),
    );
    await insertAll(
      tx,
      s.paymentAccounts,
      data.paymentAccounts.map((a) => ({
        id: a.id,
        companyId: a.companyId,
        name: a.name,
        type: a.type,
        currency: a.currency,
        accountNumber: a.accountNumber ?? null,
        openingBalanceMinor: a.openingBalance.minor,
        isDefault: a.isDefault,
        createdAt: companyCreated.get(a.companyId),
        updatedAt: companyCreated.get(a.companyId),
      })),
    );
    await insertAll(
      tx,
      s.exchangeRates,
      data.exchangeRates.map((r) => ({
        id: r.id,
        companyId: r.companyId,
        fromCurrency: r.from,
        toCurrency: r.to,
        rate: String(r.rate),
        effectiveFrom: r.effectiveFrom,
        source: r.source,
        createdAt: at(r.effectiveFrom),
        updatedAt: at(r.effectiveFrom),
      })),
    );
    await insertAll(
      tx,
      s.transporters,
      data.transporters.map((t) => ({ id: t.id, companyId: t.companyId, name: t.name, transporterId: t.transporterId, phone: t.phone ?? null, status: t.status, createdAt: companyCreated.get(t.companyId), updatedAt: companyCreated.get(t.companyId) })),
    );
    // The seed names carriers by GSTIN; the columns reference the transporter row.
    const transporterRow = (companyId: string, gstin: string | undefined) =>
      gstin ? (data.transporters.find((t) => t.companyId === companyId && t.transporterId === gstin)?.id ?? null) : null;

    const fyStart = new Map(data.companies.map((c) => [c.id, c.fiscalYearStartMonth]));
    await insertAll(
      tx,
      s.numberingSeries,
      data.numberingSeries.map((n) => ({
        id: n.id,
        companyId: n.companyId,
        kind: n.kind,
        prefix: n.prefix,
        nextNumber: n.nextNumber,
        padding: n.padding,
        includeFiscalYear: n.includeFiscalYear,
        includeBranchCode: n.includeBranchCode,
        resetPolicy: n.resetPolicy,
        // The current period has already started: the next number continues it rather than restarting at 1.
        lastResetAt: n.resetPolicy === 'never' ? null : n.resetPolicy === 'monthly' ? `${today().slice(0, 7)}-01` : financialYearOf(today(), fyStart.get(n.companyId) ?? 4).start,
        updatedAt: now,
      })),
    );

    await insertAll(
      tx,
      s.complianceSettings,
      data.complianceSettings.map((c) => ({
        companyId: c.companyId,
        einvoiceEnabled: c.eInvoiceEnabled,
        annualTurnoverMinor: c.annualTurnover.minor,
        einvoiceTurnoverThresholdMinor: c.eInvoiceTurnoverThreshold.minor,
        currency: c.annualTurnover.currency,
        reportingWindowDays: c.reportingWindowDays,
        autoGenerateEinvoiceOnFinalise: c.autoGenerateEInvoiceOnFinalise,
        irpUsername: c.irpUsername ?? null,
        irpClientIdMasked: c.irpClientIdMasked ?? null,
        irpEnvironment: c.irpEnvironment,
        ewayBillEnabled: c.ewayBillEnabled,
        ewayBillThresholdMinor: c.ewayBillThreshold.minor,
        autoGenerateEwayBillOnFinalise: c.autoGenerateEwayBillOnFinalise,
        defaultTransporterId: transporterRow(c.companyId, c.defaultTransporterId),
        defaultDistanceKm: c.defaultDistanceKm,
        defaultTransportMode: c.defaultTransportMode,
        defaultVehicleType: c.defaultVehicleType,
        updatedAt: at(c.updatedAt),
      })),
    );

    // The backup screen shows a nightly cloud backup taken six hours ago.
    await insertAll(
      tx,
      s.backupSettings,
      data.companies.map((c) => ({ companyId: c.id, automatic: true, frequency: 'daily' as const, destination: 'elixir-cloud' as const, lastBackupAt: new Date(now.getTime() - 6 * 3600_000), updatedAt: now })),
    );

    // Integrations are account-wide in the app; each demo company gets the connected ones.
    const connected = data.integrations.filter((i) => i.connected);
    await insertAll(
      tx,
      s.companyIntegrations,
      data.companies.flatMap((c) => connected.map((i) => ({ companyId: c.id, integrationId: i.id, connected: true, config: {}, connectedBy: owner.id, connectedAt: at(c.createdAt) }))),
    );

    await insertAll(
      tx,
      s.parties,
      data.parties.map((p) => ({
        id: p.id,
        companyId: p.companyId,
        kind: p.kind,
        name: p.name,
        code: p.code,
        displayName: p.displayName ?? null,
        taxId: p.taxId ?? null,
        gstRegistrationType: p.gstRegistrationType ?? null,
        email: p.email ?? null,
        phone: p.phone ?? null,
        currency: p.currency,
        ...(address('billing', p.billingAddress) as Pick<typeof s.parties.$inferInsert, 'billingLine1' | 'billingCity' | 'billingState' | 'billingPostalCode' | 'billingCountry'>),
        ...address('shipping', p.shippingAddress),
        creditLimitMinor: p.creditLimit?.minor ?? null,
        openingBalanceMinor: p.openingBalance.minor,
        paymentTermsDays: p.paymentTermsDays,
        notes: p.notes ?? null,
        status: p.status,
        createdAt: at(p.createdAt),
        updatedAt: at(p.createdAt),
      })),
    );

    const baseOf = new Map(data.companies.map((c) => [c.id, c.baseCurrency]));
    await insertAll(
      tx,
      s.items,
      data.items.map((i) => ({
        id: i.id,
        companyId: i.companyId,
        sku: i.sku,
        name: i.name,
        description: i.description ?? null,
        type: i.type,
        unit: i.unit,
        currency: baseOf.get(i.companyId)!,
        salePriceMinor: i.salePrice.minor,
        purchasePriceMinor: i.purchasePrice.minor,
        taxCategoryId: i.taxCategoryId,
        hsnCode: i.hsnCode ?? null,
        barcode: i.barcode ?? null,
        trackInventory: i.trackInventory,
        openingStock: String(i.openingStock),
        reorderLevel: String(i.reorderLevel),
        status: i.status,
        createdAt: at(i.createdAt),
        updatedAt: at(i.createdAt),
      })),
    );

    /* ---- documents ----------------------------------------------------- */
    const paidTo = new Map<string, number>();
    for (const p of data.payments) for (const a of p.allocations) paidTo.set(a.documentId, (paidTo.get(a.documentId) ?? 0) + a.amount.minor);

    await insertAll(
      tx,
      s.documents,
      data.documents.map((d) => documentRow(d, paidTo.get(d.id) ?? 0)),
    );
    // Line totals under the same tax context the seed computed the document with.
    const homeState = new Map(data.companies.map((c) => [c.id, c.taxRegistration?.placeOfSupplyStateCode ?? c.address.stateCode]));
    // Aurora's quote and invoice share one line array, so a repeated line id gets a suffix.
    const lineIds = new Set<string>();
    const lineId = (id: string, documentId: string) => {
      const out = lineIds.has(id) ? `${id}_${documentId}`.slice(0, 40) : id;
      lineIds.add(out);
      return out;
    };
    await insertAll(
      tx,
      s.documentLines,
      data.documents.flatMap((d) =>
        d.lines.map((l, i) => ({
          id: lineId(l.id, d.id),
          documentId: d.id,
          position: i + 1,
          itemId: l.itemId ?? null,
          name: l.name,
          description: l.description ?? null,
          hsnCode: l.hsnCode ?? null,
          quantity: String(l.quantity),
          unit: l.unit,
          unitPriceMinor: l.unitPrice.minor,
          discountMode: l.discountMode,
          discountValue: String(l.discountValue),
          taxCategoryId: l.taxCategoryId,
          taxRate: String(l.taxRate),
          taxInclusive: l.taxInclusive,
          lineTotalMinor: calculateLine(l, d.currency, { regime: 'GST', homeStateCode: homeState.get(d.companyId), placeOfSupplyStateCode: d.placeOfSupplyStateCode, registered: true }).total.minor,
        })),
      ),
    );
    const taxLines = data.documents.flatMap((d) => d.totals.taxLines.map((t, i) => ({ doc: d, line: t, id: `dtl_${d.id}_${i}`.slice(0, 40) })));
    await insertAll(
      tx,
      s.documentTaxLines,
      taxLines.map(({ doc, line, id }) => ({
        id,
        documentId: doc.id,
        taxCategoryId: line.categoryId,
        categoryName: line.categoryName,
        rate: String(line.rate),
        taxableAmountMinor: line.taxableAmount.minor,
        totalTaxMinor: line.totalTax.minor,
      })),
    );
    await insertAll(
      tx,
      s.documentTaxComponents,
      taxLines.flatMap(({ line, id }) =>
        line.components.map((c, j) => ({ id: `${id.slice(0, 36)}_${j}`, taxLineId: id, type: c.type, label: c.label, rate: String(c.rate), amountMinor: c.amount.minor })),
      ),
    );

    /* ---- compliance --------------------------------------------------- */
    await insertAll(
      tx,
      s.eInvoices,
      data.documents
        .filter((d) => d.compliance?.eInvoiceStatus)
        .map((d) => {
          const c = d.compliance!;
          const attempted = c.eInvoiceStatus === 'generated' || c.eInvoiceStatus === 'cancelled' || c.eInvoiceStatus === 'failed';
          return {
            documentId: d.id,
            companyId: d.companyId,
            status: c.eInvoiceStatus!,
            docType: c.eInvoiceDocType ?? null,
            supplyType: c.eInvoiceSupplyType ?? null,
            irn: c.irn ?? null,
            ackNo: c.ackNo ?? null,
            ackDate: c.ackDate ?? null,
            signedQrPayload: c.signedQrPayload ?? null,
            generatedAt: c.irnGeneratedAt ? at(c.irnGeneratedAt) : null,
            cancelledAt: c.irnCancelledAt ? at(c.irnCancelledAt) : null,
            cancelReasonCode: c.irnCancelReasonCode ?? null,
            cancelRemark: c.irnCancelRemark ?? null,
            issues: c.eInvoiceIssues ?? null,
            attempts: attempted ? 1 : 0,
            lastAttemptAt: c.lastAttemptAt ? at(c.lastAttemptAt) : c.irnGeneratedAt ? at(c.irnGeneratedAt) : null,
            updatedAt: at(c.irnCancelledAt ?? c.irnGeneratedAt ?? c.lastAttemptAt ?? d.updatedAt),
          };
        }),
    );

    await insertAll(
      tx,
      s.ewayBills,
      data.ewayBills.map((b) => ({
        id: b.id,
        companyId: b.companyId,
        branchId: b.branchId,
        ewayBillNumber: b.ewayBillNumber,
        documentId: b.documentId,
        documentKind: b.documentKind,
        documentNumber: b.documentNumber,
        documentDate: b.documentDate,
        partyId: b.partyId,
        docType: b.docType,
        supplyType: b.supplyType,
        subSupplyType: b.subSupplyType,
        subSupplyDescription: b.subSupplyDescription ?? null,
        transactionType: b.transactionType,
        fromLegalName: b.from.legalName,
        fromGstin: b.from.gstin,
        fromAddress1: b.from.address1,
        fromAddress2: b.from.address2 ?? null,
        fromPlace: b.from.place,
        fromPincode: b.from.pincode,
        fromStateCode: b.from.stateCode,
        toLegalName: b.to.legalName,
        toGstin: b.to.gstin,
        toAddress1: b.to.address1,
        toAddress2: b.to.address2 ?? null,
        toPlace: b.to.place,
        toPincode: b.to.pincode,
        toStateCode: b.to.stateCode,
        currency: b.consignmentValue.currency,
        consignmentValueMinor: b.consignmentValue.minor,
        taxableValueMinor: b.taxableValue.minor,
        cgstMinor: b.cgst.minor,
        sgstMinor: b.sgst.minor,
        igstMinor: b.igst.minor,
        mainHsnCode: b.mainHsnCode ?? null,
        itemCount: b.itemCount,
        transporterId: transporterRow(b.companyId, b.transporterId),
        transporterName: b.transporterName ?? null,
        transportMode: b.transportMode,
        vehicleNumber: b.vehicleNumber ?? null,
        vehicleType: b.vehicleType,
        transportDocNumber: b.transportDocNumber ?? null,
        transportDocDate: b.transportDocDate ?? null,
        distanceKm: b.distanceKm,
        generatedAt: at(b.generatedAt),
        generatedBy: b.generatedBy,
        validFrom: at(b.validFrom),
        validUpto: at(b.validUpto),
        status: b.status,
        cancelledAt: b.cancelledAt ? at(b.cancelledAt) : null,
        cancelReasonCode: b.cancelReasonCode ?? null,
        cancelRemark: b.cancelRemark ?? null,
        createdAt: at(b.createdAt),
        updatedAt: at(b.updatedAt),
      })),
    );
    await insertAll(
      tx,
      s.ewayBillPartBUpdates,
      data.ewayBills.flatMap((b) =>
        b.partBUpdates.map((u) => ({
          id: u.id,
          ewayBillId: b.id,
          mode: u.mode,
          vehicleNumber: u.vehicleNumber ?? null,
          vehicleType: u.vehicleType,
          transportDocNumber: u.transportDocNumber ?? null,
          transportDocDate: u.transportDocDate ?? null,
          fromPlace: u.fromPlace,
          fromStateCode: u.fromStateCode,
          reasonCode: u.reasonCode,
          remark: u.remark ?? null,
          updatedBy: u.updatedBy,
          updatedAt: at(u.updatedAt),
        })),
      ),
    );
    await insertAll(
      tx,
      s.ewayBillExtensions,
      data.ewayBills.flatMap((b) =>
        b.extensions.map((e) => ({
          id: e.id,
          ewayBillId: b.id,
          reasonCode: e.reasonCode,
          remark: e.remark ?? null,
          transitType: e.transitType,
          currentPlace: e.currentPlace,
          currentPincode: e.currentPincode,
          currentStateCode: e.currentStateCode,
          remainingDistanceKm: e.remainingDistanceKm,
          previousValidUpto: at(e.previousValidUpto),
          newValidUpto: at(e.newValidUpto),
          extendedBy: e.extendedBy,
          extendedAt: at(e.extendedAt),
        })),
      ),
    );
    // Each document points at its latest bill, as the seed mirrors onto `compliance.ewayBillId`.
    for (const d of data.documents) {
      if (d.compliance?.ewayBillId) await tx.update(s.documents).set({ currentEwayBillId: d.compliance.ewayBillId }).where(sql`${s.documents.id} = ${d.id}`);
    }

    /* ---- money --------------------------------------------------------- */
    await insertAll(
      tx,
      s.payments,
      data.payments.map((p) => {
        const allocated = p.allocations.reduce((sum, a) => sum + a.amount.minor, 0);
        return {
          id: p.id,
          companyId: p.companyId,
          branchId: p.branchId,
          number: p.number,
          direction: p.direction,
          partyId: p.partyId,
          date: p.date,
          amountMinor: p.amount.minor,
          currency: p.currency,
          exchangeRate: String(p.exchangeRate),
          method: p.method,
          reference: p.reference ?? null,
          accountId: p.accountId,
          unallocatedMinor: p.amount.minor - allocated,
          notes: p.notes ?? null,
          createdBy: p.createdBy,
          createdAt: at(p.createdAt),
          updatedAt: at(p.createdAt),
        };
      }),
    );
    await insertAll(
      tx,
      s.paymentAllocations,
      data.payments.flatMap((p) => p.allocations.map((a, i) => ({ id: `pal_${p.id}_${i}`.slice(0, 40), paymentId: p.id, documentId: a.documentId, documentNumber: a.documentNumber, amountMinor: a.amount.minor }))),
    );

    await insertAll(
      tx,
      s.expenses,
      data.expenses.map((e) => ({
        id: e.id,
        companyId: e.companyId,
        branchId: e.branchId,
        number: e.number,
        categoryId: e.categoryId,
        supplierId: e.supplierId ?? null,
        date: e.date,
        amountMinor: e.amount.minor,
        currency: e.currency,
        exchangeRate: String(e.exchangeRate),
        taxCategoryId: e.taxCategoryId ?? null,
        taxAmountMinor: e.taxAmount.minor,
        taxInclusive: e.taxInclusive,
        accountId: e.accountId,
        method: e.method,
        reference: e.reference ?? null,
        notes: e.notes ?? null,
        billable: e.billable,
        recurrence: e.recurrence,
        nextRecurrenceDate: e.nextRecurrenceDate ?? null,
        createdBy: e.createdBy,
        createdAt: at(e.createdAt),
        updatedAt: at(e.createdAt),
      })),
    );

    /* ---- stock ledger -------------------------------------------------- */
    // The seed writes a transfer as a transferOut/transferIn pair; the ledger pairs them by group.
    const transferGroups = new Map<string, string>();
    await insertAll(
      tx,
      s.stockMovements,
      data.stockMovements.map((m) => {
        let transferGroupId: string | null = null;
        if (m.type === 'transferIn' || m.type === 'transferOut') {
          const key = `${m.itemId}:${m.date}:${m.createdAt}:${m.quantity}`;
          transferGroupId = transferGroups.get(key) ?? `trf_${m.id}`.slice(0, 40);
          transferGroups.set(key, transferGroupId);
        }
        return {
          id: m.id,
          companyId: m.companyId,
          branchId: m.branchId,
          itemId: m.itemId,
          type: m.type,
          // The column is signed, per core's stockLedger rules.
          quantity: String(signedQuantity(m)),
          currency: m.unitCost.currency,
          unitCostMinor: m.unitCost.minor,
          date: m.date,
          referenceType: m.referenceId ? 'document' : transferGroupId ? 'transfer' : m.type === 'adjustment' ? 'adjustment' : null,
          referenceId: m.referenceId ?? null,
          referenceNumber: m.referenceNumber ?? null,
          transferGroupId,
          adjustReason: m.type === 'adjustment' ? ('damaged' as const) : null,
          notes: m.notes ?? null,
          createdBy: m.createdBy,
          createdAt: at(m.createdAt),
        };
      }),
    );

    /* ---- activity ------------------------------------------------------ */
    await insertAll(
      tx,
      s.notifications,
      data.notifications.map((n) => ({
        id: n.id,
        companyId: n.companyId,
        userId: null,
        kind: n.kind,
        title: n.title,
        body: n.body,
        entityType: n.entityType ?? null,
        entityId: n.entityId ?? null,
        readAt: n.read ? at(n.createdAt) : null,
        createdAt: at(n.createdAt),
      })),
    );
    await insertAll(
      tx,
      s.auditEvents,
      data.auditEvents.map((a) => ({
        id: a.id,
        companyId: a.companyId,
        actorId: a.actorId,
        actorName: a.actorName,
        action: a.action,
        entityType: a.entityType,
        entityId: a.entityId,
        entityLabel: a.entityLabel,
        before: a.before ?? null,
        after: a.after ?? null,
        device: a.device ?? null,
        createdAt: at(a.createdAt),
      })),
    );

    await insertAll(tx, s.changeLog, changeLogRows(data, now));
  });

  return data;
}

function documentRow(d: BusinessDocument, amountPaidMinor: number): typeof s.documents.$inferInsert {
  const draft = d.status === 'draft';
  return {
    id: d.id,
    companyId: d.companyId,
    branchId: d.branchId,
    kind: d.kind,
    number: draft ? draftNumber(d.kind) : d.number,
    status: DERIVED.includes(d.status) ? 'issued' : d.status,
    partyId: d.partyId,
    date: d.date,
    dueDate: d.dueDate ?? null,
    validUntil: d.validUntil ?? null,
    reference: d.reference ?? null,
    supplierDocNumber: d.supplierDocNumber ?? null,
    currency: d.currency,
    exchangeRate: String(d.exchangeRate),
    documentDiscountMode: d.documentDiscountMode,
    documentDiscountValue: String(d.documentDiscountValue),
    chargesMinor: d.charges.minor,
    applyRoundOff: d.applyRoundOff,
    placeOfSupplyStateCode: d.placeOfSupplyStateCode ?? null,
    notes: d.notes ?? null,
    terms: d.terms ?? null,
    sourceDocumentId: d.sourceDocumentId ?? null,
    subtotalMinor: d.totals.subtotal.minor,
    lineDiscountMinor: d.totals.lineDiscount.minor,
    documentDiscountMinor: d.totals.documentDiscount.minor,
    taxableAmountMinor: d.totals.taxableAmount.minor,
    totalTaxMinor: d.totals.totalTax.minor,
    roundOffMinor: d.totals.roundOff.minor,
    grandTotalMinor: d.totals.grandTotal.minor,
    grandTotalBaseMinor: d.totals.grandTotalBase.minor,
    amountPaidMinor,
    complianceLastMessage: d.compliance?.lastMessage ?? null,
    complianceLastAttemptAt: d.compliance?.lastAttemptAt ? at(d.compliance.lastAttemptAt) : null,
    finalizedAt: draft ? null : at(d.createdAt),
    createdBy: d.createdBy,
    createdAt: at(d.createdAt),
    updatedAt: at(d.updatedAt),
  };
}

/**
 * One `upsert` (version 1) per entity the sync module can fetch
 * (apps/api/src/modules/sync/entities.ts), so a pull without a cursor returns
 * the whole dataset. Account-level rows (users, integrations) are logged in
 * every company they belong to, as the API itself does.
 */
function changeLogRows(data: DemoData, changedAt: Date): (typeof s.changeLog.$inferInsert)[] {
  const out: (typeof s.changeLog.$inferInsert)[] = [];
  const add = (companyId: string, entityType: string, entityId: string) => out.push({ companyId, entityType, entityId, op: 'upsert', version: 1, changedAt });
  for (const c of data.companies) {
    add(c.id, 'company', c.id);
    add(c.id, 'subscription', c.id);
    add(c.id, 'compliance_settings', c.id);
    add(c.id, 'backup_settings', c.id);
    for (const i of data.integrations) add(c.id, 'integration', i.id);
  }
  for (const u of data.users) for (const companyId of u.companyIds) add(companyId, 'user', u.id);
  for (const b of data.branches) add(b.companyId, 'branch', b.id);
  for (const t of data.taxCategories) add(t.companyId, 'tax_category', t.id);
  for (const e of data.expenseCategories) add(e.companyId, 'expense_category', e.id);
  for (const a of data.paymentAccounts) add(a.companyId, 'payment_account', a.id);
  for (const r of data.exchangeRates) add(r.companyId, 'exchange_rate', r.id);
  for (const t of data.transporters) add(t.companyId, 'transporter', t.id);
  for (const n of data.numberingSeries) add(n.companyId, 'numbering_series', n.id);
  for (const p of data.parties) add(p.companyId, 'party', p.id);
  for (const i of data.items) add(i.companyId, 'item', i.id);
  for (const d of data.documents) add(d.companyId, 'document', d.id);
  for (const p of data.payments) add(p.companyId, 'payment', p.id);
  for (const e of data.expenses) add(e.companyId, 'expense', e.id);
  for (const b of data.ewayBills) add(b.companyId, 'eway_bill', b.id);
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const url = process.env.DATABASE_URL ?? 'postgres://esmart:esmart@localhost:5432/esmart';
  const pool = createPool(url, 1);
  try {
    const data = await seedDemo(createDb(pool));
    console.log(
      `Demo data loaded: ${data.companies.length} companies, ${data.parties.length} parties, ${data.items.length} items, ${data.documents.length} documents, ${data.payments.length} payments, ${data.expenses.length} expenses. Sign in as ${DEMO_EMAIL} / ${DEMO_PASSWORD}.`,
    );
  } finally {
    await pool.end();
  }
}
