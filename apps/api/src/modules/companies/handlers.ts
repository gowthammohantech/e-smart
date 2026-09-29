import { and, asc, eq, inArray, ne } from 'drizzle-orm';
import { applyProfileLocks } from '@esmart/core/domain/companyLock';
import { isValidGstin, normalizeGstin } from '@esmart/core/domain/gstin';
import type { Company as CoreCompany } from '@esmart/core/types';
import { schema } from '@esmart/db';
import type { Schema } from '@esmart/api-contract';
import type { DbOrTx } from '../../lib/audit';
import { defineHandlers } from '../../context';
import { checkIfMatch, setEtag } from '../../http/etag';
import { invalid, preconditionFailed, unprocessable, type Issue } from '../../http/errors';
import { recordChange } from '../../lib/audit';
import { newId } from '../../lib/ids';
import { addressTo } from '../../lib/wire';
import { branchHandlers } from './branches';
import { createNumberingSeries, seedCompanyDefaults } from './defaults';
import { logoHandlers } from './logo';
import { branchToWire, companyColumns, companyToWire } from './wire';

export async function logoKeyOf(db: DbOrTx, attachmentId: string | null): Promise<string | null> {
  if (!attachmentId) return null;
  const [a] = await db.select({ key: schema.attachments.storageKey }).from(schema.attachments).where(eq(schema.attachments.id, attachmentId));
  return a?.key ?? null;
}

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
    const rows = await ctx.db.select().from(schema.companies).where(inArray(schema.companies.id, ids)).orderBy(asc(schema.companies.createdAt));
    return { data: await Promise.all(rows.map(async (r) => companyToWire(ctx.deps, r, await logoKeyOf(ctx.db, r.logoAttachmentId)))) };
  },

  async createCompany(ctx) {
    const body = ctx.body;
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
        .values({ id: companyId, accountId: ctx.user.accountId, ...cols, plan: 'free' })
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
      return company;
    });
    setEtag(ctx.reply, row.version);
    return companyToWire(ctx.deps, row);
  },

  async getCompany(ctx) {
    setEtag(ctx.reply, ctx.company.version);
    return companyToWire(ctx.deps, ctx.company, await logoKeyOf(ctx.db, ctx.company.logoAttachmentId));
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
    const row = await ctx.db.transaction(async (tx) => {
      const [updated] = await tx
        .update(schema.companies)
        .set({ ...companyColumns(body), version: current.version + 1, updatedAt: ctx.now })
        .where(and(eq(schema.companies.id, current.id), eq(schema.companies.version, current.version)))
        .returning();
      if (!updated) throw preconditionFailed();
      // The head office is the registered address: keep the primary branch in step.
      const [primary] = await tx
        .select()
        .from(schema.branches)
        .where(and(eq(schema.branches.companyId, current.id), eq(schema.branches.isPrimary, true)));
      if (primary && addressChanged(primary, updated)) {
        const [branch] = await tx
          .update(schema.branches)
          .set({ ...addressTo('address', body.address), version: primary.version + 1, updatedAt: ctx.now })
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
    setEtag(ctx.reply, row.version);
    return companyToWire(ctx.deps, row, await logoKeyOf(ctx.db, row.logoAttachmentId));
  },

  ...logoHandlers,
  ...branchHandlers,
});

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

