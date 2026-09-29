import { and, asc, eq, inArray } from 'drizzle-orm';
import { isValidGstin, normalizeGstin } from '@esmart/core/domain/gstin';
import { schema } from '@esmart/db';
import type { DbOrTx } from '../../lib/audit';
import { defineHandlers } from '../../context';
import { setEtag } from '../../http/etag';
import { invalid, unprocessable, type Issue } from '../../http/errors';
import { recordChange } from '../../lib/audit';
import { newId } from '../../lib/ids';
import { addressTo } from '../../lib/wire';
import { createNumberingSeries, seedCompanyDefaults } from './defaults';
import { companyColumns, companyToWire } from './wire';

async function logoKeyOf(db: DbOrTx, attachmentId: string | null): Promise<string | null> {
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
});

