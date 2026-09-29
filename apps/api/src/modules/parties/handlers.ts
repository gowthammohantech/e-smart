import { and, eq, ilike, or, sql, type SQL } from 'drizzle-orm';
import { FULL_PLAN, hasModule } from '@esmart/core/domain/plan';
import { isValidGstin } from '@esmart/core/domain/gstin';
import { schema } from '@esmart/db';
import type { Schema } from '@esmart/api-contract';
import { defineHandlers, type Ctx } from '../../context';
import { checkIfMatch, setEtag } from '../../http/etag';
import { conflict, notFound, planUpgradeRequired, preconditionFailed, unprocessable, type Issue } from '../../http/errors';
import { keyset } from '../../http/pagination';
import { recordChange, type DbOrTx } from '../../lib/audit';
import { partyBalances } from '../../lib/balances';
import { newId } from '../../lib/ids';
import { partyColumns, partyToWire, partyWithBalance } from './wire';

const P = schema.parties;
type PartyRow = typeof P.$inferSelect;

const today = (d: Date) => d.toISOString().slice(0, 10);

async function findParty(db: DbOrTx, companyId: string, id: string): Promise<PartyRow> {
  const [row] = await db.select().from(P).where(and(eq(P.companyId, companyId), eq(P.id, id)));
  if (!row) throw notFound('Party');
  return row;
}

/** Suppliers belong to the buying side, which the Sales plans don't include. */
function assertKindAllowed(ctx: { company: { plan: Schema<'PlanTier'> } }, kind: Schema<'PartyKind'>) {
  if (kind === 'supplier' && !hasModule(ctx.company.plan, 'purchases')) throw planUpgradeRequired(FULL_PLAN, 'purchases');
}

async function validate(db: DbOrTx, body: Schema<'Party'>) {
  const issues: Issue[] = [];
  if (body.taxId && body.billingAddress.country === 'IN' && !isValidGstin(body.taxId)) {
    issues.push({ field: 'taxId', message: 'This GSTIN is not valid (check digit mismatch)', severity: 'blocking' });
  }
  if (body.taxId && body.billingAddress.stateCode && body.billingAddress.country === 'IN' && body.taxId.slice(0, 2) !== body.billingAddress.stateCode) {
    issues.push({ field: 'billingAddress.stateCode', message: "The billing state doesn't match the GSTIN's state code", severity: 'blocking' });
  }
  for (const [field, m] of [
    ['openingBalance', body.openingBalance],
    ['creditLimit', body.creditLimit],
  ] as const) {
    if (m && m.currency !== body.currency) issues.push({ field: `${field}.currency`, message: `Must be in the party's currency (${body.currency})`, severity: 'blocking' });
  }
  const [cur] = await db.select().from(schema.currencies).where(eq(schema.currencies.code, body.currency));
  if (!cur) issues.push({ field: 'currency', message: `Unknown currency ${body.currency}`, severity: 'blocking' });
  if (issues.length) throw unprocessable(issues);
}

/** C-001, C-002… for customers; S-001… for suppliers. Follows the highest so far. */
async function nextCode(db: DbOrTx, companyId: string, kind: Schema<'PartyKind'>): Promise<string> {
  const prefix = kind === 'supplier' ? 'S-' : 'C-';
  const [row] = await db
    .select({ max: sql<number | null>`max(nullif(regexp_replace(${P.code}, '\\D', '', 'g'), '')::int)` })
    .from(P)
    .where(and(eq(P.companyId, companyId), eq(P.kind, kind), ilike(P.code, `${prefix}%`)));
  return `${prefix}${String((row?.max ?? 0) + 1).padStart(3, '0')}`;
}

async function withBalance(ctx: Ctx<'getParty'>, row: PartyRow) {
  const balances = await partyBalances(ctx.db, row.companyId, [row], today(ctx.now));
  return partyWithBalance(row, balances.get(row.id));
}

/** Documents, payments, expenses or e-way bills that point at the party. */
async function usage(db: DbOrTx, companyId: string, partyId: string): Promise<string | null> {
  const checks: [string, SQL][] = [
    ['documents', sql`select 1 from documents where company_id = ${companyId} and party_id = ${partyId} limit 1`],
    ['payments', sql`select 1 from payments where company_id = ${companyId} and party_id = ${partyId} limit 1`],
    ['expenses', sql`select 1 from expenses where company_id = ${companyId} and supplier_id = ${partyId} limit 1`],
    ['e-way bills', sql`select 1 from eway_bills where company_id = ${companyId} and party_id = ${partyId} limit 1`],
  ];
  for (const [what, q] of checks) {
    const res = await db.execute(q);
    if (res.rows.length) return what;
  }
  return null;
}

/**
 * Parties: listParties, createParty, getParty, saveParty, removeParty,
 * getPartyStatement.
 */
export const partiesHandlers = defineHandlers({
  async listParties(ctx) {
    const { kind, status, q, limit, cursor } = ctx.query;
    const k = keyset({ cursor, limit, sort: P.name, id: P.id, order: 'asc' });
    const filters = [eq(P.companyId, ctx.company.id)];
    if (kind) filters.push(eq(P.kind, kind));
    if (status) filters.push(eq(P.status, status));
    if (q) {
      const like = `%${q.trim()}%`;
      filters.push(or(ilike(P.name, like), ilike(P.code, like), ilike(P.displayName, like), ilike(P.email, like), ilike(P.phone, like), ilike(P.taxId, like))!);
    }
    const rows = await ctx.db
      .select()
      .from(P)
      .where(and(...filters, k.where))
      .orderBy(...k.orderBy)
      .limit(k.take);
    const page = rows.slice(0, k.take - 1);
    const balances = await partyBalances(ctx.db, ctx.company.id, page, today(ctx.now));
    return k.page(
      page.map((r) => partyWithBalance(r, balances.get(r.id))),
      rows,
    );
  },

  async createParty(ctx) {
    assertKindAllowed(ctx, ctx.body.kind);
    await validate(ctx.db, ctx.body);
    const row = await ctx.db.transaction(async (tx) => {
      const code = ctx.body.code?.trim() || (await nextCode(tx, ctx.company.id, ctx.body.kind));
      const [dupe] = await tx.select({ id: P.id }).from(P).where(and(eq(P.companyId, ctx.company.id), eq(P.code, code)));
      if (dupe) throw conflict('PARTY_CODE_TAKEN', `Another party already uses the code ${code}`);
      const [created] = await tx
        .insert(P)
        .values({ id: newId('pty'), companyId: ctx.company.id, code, ...partyColumns(ctx.body) })
        .returning();
      await recordChange(tx, ctx.user, { companyId: ctx.company.id, action: 'created', entityType: 'party', entityId: created.id, entityLabel: created.name, version: created.version, after: partyToWire(created) });
      return created;
    });
    setEtag(ctx.reply, row.version);
    return partyToWire(row);
  },

  async getParty(ctx) {
    const row = await findParty(ctx.db, ctx.company.id, ctx.params.id);
    setEtag(ctx.reply, row.version);
    return withBalance(ctx, row);
  },

  async saveParty(ctx) {
    const current = await findParty(ctx.db, ctx.company.id, ctx.params.id);
    checkIfMatch(ctx.req, current.version);
    assertKindAllowed(ctx, ctx.body.kind);
    await validate(ctx.db, ctx.body);
    if (ctx.body.kind !== current.kind && (await usage(ctx.db, ctx.company.id, current.id))) {
      throw conflict('PARTY_KIND_LOCKED', 'A party with transactions cannot switch between customer and supplier');
    }
    const code = ctx.body.code?.trim() || current.code;
    const row = await ctx.db.transaction(async (tx) => {
      if (code !== current.code) {
        const [dupe] = await tx.select({ id: P.id }).from(P).where(and(eq(P.companyId, ctx.company.id), eq(P.code, code)));
        if (dupe) throw conflict('PARTY_CODE_TAKEN', `Another party already uses the code ${code}`);
      }
      const [updated] = await tx
        .update(P)
        .set({ ...partyColumns(ctx.body), code, version: current.version + 1, updatedAt: ctx.now })
        .where(and(eq(P.id, current.id), eq(P.version, current.version)))
        .returning();
      if (!updated) throw preconditionFailed();
      await recordChange(tx, ctx.user, {
        companyId: ctx.company.id,
        action: 'updated',
        entityType: 'party',
        entityId: updated.id,
        entityLabel: updated.name,
        version: updated.version,
        before: partyToWire(current),
        after: partyToWire(updated),
      });
      return updated;
    });
    setEtag(ctx.reply, row.version);
    return partyToWire(row);
  },

  async removeParty(ctx) {
    const current = await findParty(ctx.db, ctx.company.id, ctx.params.id);
    checkIfMatch(ctx.req, current.version);
    const used = await usage(ctx.db, ctx.company.id, current.id);
    if (used) throw conflict('PARTY_IN_USE', `This party has ${used}; mark it inactive instead`);
    await ctx.db.transaction(async (tx) => {
      await tx.delete(P).where(eq(P.id, current.id));
      await recordChange(tx, ctx.user, {
        companyId: ctx.company.id,
        action: 'deleted',
        entityType: 'party',
        entityId: current.id,
        entityLabel: current.name,
        version: current.version + 1,
        deleted: true,
        before: partyToWire(current),
      });
    });
    return undefined;
  },
});

