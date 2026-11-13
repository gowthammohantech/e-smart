import { and, asc, eq, inArray, isNotNull, isNull, ne } from 'drizzle-orm';
import { applyProfileLocks } from '@esmart/core/domain/companyLock';
import { approvalKindAvailable, moduleForApprovalKind, type Module } from '@esmart/core/domain/plan';
import { isValidGstin, normalizeGstin } from '@esmart/core/domain/gstin';
import type { Company as CoreCompany } from '@esmart/core/types';
import { schema } from '@esmart/db';
import type { Schema } from '@esmart/api-contract';
import type { DbOrTx } from '../../lib/audit';
import { defineHandlers } from '../../context';
import { checkIfMatch, setEtag } from '../../http/etag';
import { conflict, forbidden, invalid, preconditionFailed, unprocessable, type Issue } from '../../http/errors';
import { businessDate, financialYearOf } from '@esmart/core/lib/date';
import { identifyCompany, track } from '../../analytics/track';
import { recordChange } from '../../lib/audit';
import { newId } from '../../lib/ids';
import { addressTo } from '../../lib/wire';
import { companyArchiveHandlers } from './archive';
import { branchHandlers } from './branches';
import { createNumberingSeries, logCompanyDefaults, seedCompanyDefaults } from './defaults';
import { companyImageHandlers, companyWithImages } from './logo';
import { branchToWire, companyColumns, companyToWire, invoiceBankColumns } from './wire';

/** GSTIN check digit, and the reference data the foreign keys need. */
async function validateCompany(db: DbOrTx, body: { country: string; baseCurrency: string; taxRegistration?: { regime: string; identifier?: string } }) {
  const issues: Issue[] = [];
  const [country] = await db.select().from(schema.countries).where(eq(schema.countries.code, body.country));
  if (!country) issues.push({ field: 'country', message: `Unknown country ${body.country}`, severity: 'blocking' });
  const [currency] = await db.select().from(schema.currencies).where(eq(schema.currencies.code, body.baseCurrency));
  if (!currency) issues.push({ field: 'baseCurrency', message: `Unknown currency ${body.baseCurrency}`, severity: 'blocking' });
  const tax = body.taxRegistration;
  if (tax?.regime === 'GST' && body.country === 'IN' && tax.identifier && !isValidGstin(normalizeGstin(tax.identifier))) {
    issues.push({ field: 'taxRegistration.identifier', message: 'This GSTIN is not valid (check digit mismatch)', severity: 'blocking' });
  }
  if (issues.length) throw unprocessable(issues);
}

export const companiesHandlers = defineHandlers({
  async listCompanies(ctx) {
    const ids = ctx.user.companyIds;
    if (!ids.length) return { data: [] };
    // Archived businesses are out of the list; `archived=true` lists only them, to restore one.
    const archived = ctx.query.archived ? isNotNull(schema.companies.archivedAt) : isNull(schema.companies.archivedAt);
    const rows = await ctx.db.select().from(schema.companies).where(and(inArray(schema.companies.id, ids), archived)).orderBy(asc(schema.companies.createdAt));
    return { data: await Promise.all(rows.map(async (r) => companyWithImages(ctx.deps, ctx.db, r))) };
  },

  async createCompany(ctx) {
    // A new business has no payment accounts yet, so its invoice details can't be linked to one.
    const body = ctx.body.bankDetails?.paymentAccountId ? { ...ctx.body, bankDetails: { ...ctx.body.bankDetails, paymentAccountId: '' } } : ctx.body;
    await validateCompany(ctx.db, body);
    const branches = body.branches?.length
      ? body.branches
      : [{ name: body.address.city || body.name, code: 'HO', address: body.address, isPrimary: true }];
    const primaries = branches.filter((b) => b.isPrimary).length;
    if (primaries > 1) throw invalid('branches', 'Exactly one branch can be the primary branch');
    const codes = branches.map((b) => b.code.toUpperCase());
    if (new Set(codes).size !== codes.length) throw invalid('branches', 'Branch codes must be unique');

    const companyId = newId('cmp');
    const cols = companyColumns(body);
    const row = await ctx.db.transaction(async (tx) => {
      const [company] = await tx
        .insert(schema.companies)
        // A new business keeps stock perpetually from its first financial year (RULES 6.2).
        .values({ id: companyId, accountId: ctx.user.accountId, ...cols, perpetualStockFrom: financialYearOf(businessDate(ctx.now), cols.fiscalYearStartMonth).start, plan: 'free' })
        .returning();
      await tx.insert(schema.branches).values(
        branches.map((b, i) => ({
          id: newId('brn'),
          companyId,
          name: b.name,
          code: b.code.toUpperCase(),
          ...addressTo('address', b.address),
          isPrimary: primaries ? !!b.isPrimary : i === 0,
          phone: b.phone ?? null,
        })),
      );
      await createNumberingSeries(tx, companyId, body.numberingSeries);
      if (body.seedDefaults ?? true) await seedCompanyDefaults(tx, company);

      // The creator, and every other owner on the account, can open it.
      const owners = await tx
        .select({ id: schema.users.id })
        .from(schema.users)
        .where(and(eq(schema.users.accountId, ctx.user.accountId), eq(schema.users.role, 'owner')));
      const members = new Set([ctx.user.id, ...owners.map((o) => o.id)]);
      await tx.insert(schema.userCompanies).values([...members].map((userId) => ({ userId, companyId }))).onConflictDoNothing();
      const [me] = await tx.select({ d: schema.users.defaultCompanyId }).from(schema.users).where(eq(schema.users.id, ctx.user.id));
      if (!me?.d) await tx.update(schema.users).set({ defaultCompanyId: companyId }).where(eq(schema.users.id, ctx.user.id));

      await recordChange(tx, ctx.user, { companyId, action: 'created', entityType: 'company', entityId: companyId, entityLabel: company.name, version: company.version });
      await logCompanyDefaults(tx, companyId);
      return company;
    });
    identifyCompany(ctx, row);
    track(ctx, 'business_created', { businessType: row.businessType, taxRegime: row.taxRegime, stateCode: row.addressStateCode, branchCount: branches.length }, { company: row });
    setEtag(ctx.reply, row.version);
    return companyToWire(ctx.deps, row);
  },

  async getCompany(ctx) {
    setEtag(ctx.reply, ctx.company.version);
    return companyWithImages(ctx.deps, ctx.db, ctx.company);
  },

  /**
   * Profile edits. `plan` is billing's, and once the company has posted
   * entries the fields they were computed from are frozen (see
   * `@esmart/core/domain/companyLock`): the locked values are kept, not
   * rejected, as the app does.
   */
  async saveCompany(ctx) {
    const current = ctx.company;
    checkIfMatch(ctx.req, current.version);
    const prev = await companyToWire(ctx.deps, current);
    const posted = await hasPostedEntries(ctx.db, current.id);
    const next = applyProfileLocks(prev as CoreCompany, { ...ctx.body, id: current.id, accountId: current.accountId, plan: current.plan } as CoreCompany, posted);
    const body = next as unknown as Schema<'Company'>;
    await validateCompany(ctx.db, body);
    // The account the invoice details belong to must be one of this business's bank accounts.
    const linked = body.bankDetails?.paymentAccountId?.trim();
    if (linked) {
      const [account] = await ctx.db
        .select({ type: schema.paymentAccounts.type })
        .from(schema.paymentAccounts)
        .where(and(eq(schema.paymentAccounts.companyId, current.id), eq(schema.paymentAccounts.id, linked)));
      if (account?.type !== 'bank') throw unprocessable([{ field: 'bankDetails.paymentAccountId', message: 'Choose one of your bank accounts', severity: 'blocking' }]);
    }
    // Left out by an app that doesn't know about it: that isn't reopening the books.
    const lockedThroughDate = ctx.body.lockedThroughDate === undefined ? current.lockedThroughDate : ctx.body.lockedThroughDate;
    if (lockedThroughDate !== current.lockedThroughDate && ctx.user.role !== 'owner') throw forbidden('OWNER_ONLY', 'Only an owner can close or reopen the books');
    const disabledModules = ctx.body.disabledModules === undefined ? (current.disabledModules as string[]) : [...new Set(ctx.body.disabledModules)].sort();
    if (JSON.stringify(disabledModules) !== JSON.stringify([...(current.disabledModules as string[])].sort()) && ctx.user.role !== 'owner') throw forbidden('OWNER_ONLY', 'Only an owner can switch modules on or off');
    const approvalRules = ctx.body.approvalRules === undefined ? current.approvalRules : ctx.body.approvalRules.filter((r, i, all) => all.findIndex((x) => x.kind === r.kind) === i);
    if (JSON.stringify(approvalRules) !== JSON.stringify(current.approvalRules) && ctx.user.role !== 'owner') throw forbidden('OWNER_ONLY', 'Only an owner can set what needs approval');
    // A rule for what the plan doesn't have, or the owner switched off, can't be set; one kept from
    // when the module was on goes back as it was, and works again when the module does.
    const kept = (current.approvalRules as { kind: string; overMinor: number }[] | null) ?? [];
    const unavailable = ((approvalRules as { kind: string; overMinor: number }[] | null) ?? []).filter(
      (r) => !approvalKindAvailable(current.plan, disabledModules as Module[], r.kind) && !kept.some((k) => k.kind === r.kind && k.overMinor === r.overMinor),
    );
    if (unavailable.length) throw unprocessable(unavailable.map((r) => ({ field: 'approvalRules', message: `${r.kind} approvals need the ${moduleForApprovalKind(r.kind)} module, which this business doesn't have on`, severity: 'blocking' as const })), 'MODULE_UNAVAILABLE');
    // The AI budget is the owner's to set, as the screen says (left out by an older app: unchanged).
    if (ctx.body.aiMonthlyLimit !== undefined && (ctx.body.aiMonthlyLimit ?? null) !== (current.aiMonthlyLimit ?? null) && ctx.user.role !== 'owner') {
      throw forbidden('OWNER_ONLY', 'Only an owner can set the monthly AI budget');
    }
    const perpetualStockFrom = ctx.body.perpetualStockFrom === undefined ? current.perpetualStockFrom : ctx.body.perpetualStockFrom;
    if (perpetualStockFrom !== current.perpetualStockFrom) checkPerpetualFrom(ctx.user.role, current.fiscalYearStartMonth, lockedThroughDate, current.perpetualStockFrom, perpetualStockFrom);
    const stockCosting = ctx.body.stockCosting ?? (current.stockCosting as 'average' | 'fifo');
    if (stockCosting !== current.stockCosting) {
      // Costing values every period's stock from the start, so it changes only while none is closed (RULES 6.2).
      if (ctx.user.role !== 'owner') throw forbidden('OWNER_ONLY', 'Only an owner can change how stock is costed');
      if (lockedThroughDate) throw conflict('PERIOD_LOCKED', `The books are closed through ${lockedThroughDate}; stock costing changes every period's stock value, so reopen them first`);
    }
    const invoiceAccount = await linkedBankColumns(ctx.db, current, body.bankDetails?.paymentAccountId);
    const row = await ctx.db.transaction(async (tx) => {
      const [updated] = await tx
        .update(schema.companies)
        .set({ ...companyColumns(body), ...invoiceAccount, lockedThroughDate, perpetualStockFrom, stockCosting, disabledModules, approvalRules, version: current.version + 1, updatedAt: ctx.now })
        .where(and(eq(schema.companies.id, current.id), eq(schema.companies.version, current.version)))
        .returning();
      if (!updated) throw preconditionFailed();
      // The head office is the registered business: keep the primary branch's address, GSTIN
      // and phone in step (its name is the person's own), as the app does.
      const [primary] = await tx
        .select()
        .from(schema.branches)
        .where(and(eq(schema.branches.companyId, current.id), eq(schema.branches.isPrimary, true)));
      const gstin = updated.taxRegistered && updated.taxIdentifier ? updated.taxIdentifier : primary?.gstin ?? null;
      const phone = updated.phone ?? primary?.phone ?? null;
      if (primary && (addressChanged(primary, updated) || gstin !== primary.gstin || phone !== primary.phone)) {
        const [branch] = await tx
          .update(schema.branches)
          .set({ ...addressTo('address', body.address), gstin, phone, version: primary.version + 1, updatedAt: ctx.now })
          .where(eq(schema.branches.id, primary.id))
          .returning();
        await recordChange(tx, ctx.user, {
          companyId: current.id, action: 'updated', entityType: 'branch', entityId: branch.id, entityLabel: branch.name, version: branch.version,
          before: branchToWire(primary), after: branchToWire(branch),
        });
      }
      await recordChange(tx, ctx.user, {
        companyId: current.id,
        action: 'updated',
        entityType: 'company',
        entityId: current.id,
        entityLabel: updated.name,
        version: updated.version,
        before: prev,
        after: await companyToWire(ctx.deps, updated),
      });
      return updated;
    });
    identifyCompany(ctx, row);
    const layoutOf = (t: unknown) => (t as { layout?: string } | null)?.layout ?? 'standard';
    if (layoutOf(row.invoiceTemplate) !== layoutOf(current.invoiceTemplate)) track(ctx, 'invoice_template_changed', { template: layoutOf(row.invoiceTemplate), scope: 'company' }, { company: row });
    setEtag(ctx.reply, row.version);
    return companyWithImages(ctx.deps, ctx.db, row);
  },

  ...companyImageHandlers,
  ...companyArchiveHandlers,
  ...branchHandlers,
});

/**
 * A business whose invoice details are linked to a bank account prints that account's own details:
 * the bank columns are a copy of them, so a profile save (with whatever it last saw, or details typed
 * the old way) can't make the invoices disagree with the account. `sent` is the link in the body:
 * undefined keeps the current one, '' unlinks (the typed details in the body then apply).
 */
async function linkedBankColumns(db: DbOrTx, current: typeof schema.companies.$inferSelect, sent: string | undefined) {
  const id = sent === undefined ? current.bankPaymentAccountId : sent.trim();
  if (!id) return {};
  const A = schema.paymentAccounts;
  const [account] = await db.select().from(A).where(and(eq(A.companyId, current.id), eq(A.id, id)));
  // Gone since it was linked: stop following it, and keep what was printed.
  if (!account) return { bankPaymentAccountId: null };
  return { ...invoiceBankColumns(account), bankPaymentAccountId: account.id };
}

/** Any document past draft counts as posted, as in the app. */
async function hasPostedEntries(db: DbOrTx, companyId: string): Promise<boolean> {
  const D = schema.documents;
  const rows = await db.select({ id: D.id }).from(D).where(and(eq(D.companyId, companyId), ne(D.status, 'draft'))).limit(1);
  return rows.length > 0;
}

type AddressRow = { addressLine1: string; addressLine2: string | null; addressCity: string; addressState: string; addressStateCode: string | null; addressPostalCode: string; addressCountry: string };
function addressChanged(a: AddressRow, b: AddressRow): boolean {
  const keys = ['addressLine1', 'addressLine2', 'addressCity', 'addressState', 'addressStateCode', 'addressPostalCode', 'addressCountry'] as const;
  return keys.some((k) => (a[k] ?? '').trim() !== (b[k] ?? '').trim());
}

/**
 * Moving the books to perpetual stock, or back, or to another day (RULES 6.2). Only an owner may; the
 * day starts a financial year, so no year is half one way and half the other; and every year it
 * changes must still be open, so a closed period's stock and profit never change.
 */
function checkPerpetualFrom(role: string, fyStartMonth: number, lockedThroughDate: string | null, from: string | null, to: string | null) {
  if (role !== 'owner') throw forbidden('OWNER_ONLY', 'Only an owner can change how stock is kept in the books');
  if (to && financialYearOf(to, fyStartMonth).start !== to) {
    throw unprocessable([{ field: 'perpetualStockFrom', message: `Perpetual stock starts on the first day of a financial year, ${financialYearOf(to, fyStartMonth).start} for ${to}`, severity: 'blocking' }], 'PERPETUAL_NOT_YEAR_START');
  }
  const earliest = [from, to].filter((d): d is string => !!d).sort()[0];
  if (lockedThroughDate && earliest && earliest <= lockedThroughDate) {
    throw conflict('PERIOD_LOCKED', `The books are closed through ${lockedThroughDate}; stock can only change to perpetual, or back, from a year after it`);
  }
}
