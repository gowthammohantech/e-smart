import { and, eq, ilike, inArray, or, sql, type SQL } from 'drizzle-orm';
import { buysFrom, hasLedger } from '@esmart/core/domain/partyKinds';
import { FULL_PLAN, hasModule } from '@esmart/core/domain/plan';
import { isValidGstin } from '@esmart/core/domain/gstin';
import { schema } from '@esmart/db';
import type { Schema } from '@esmart/api-contract';
import { RawBody, defineHandlers, type Ctx } from '../../context';
import { checkIfMatch, setEtag } from '../../http/etag';
import { ApiError, conflict, notFound, planUpgradeRequired, preconditionFailed, unprocessable, type Issue } from '../../http/errors';
import { keyset } from '../../http/pagination';
import { recordChange, type DbOrTx } from '../../lib/audit';
import { partyBalances } from '../../lib/balances';
import { newId } from '../../lib/ids';
import { partyStatement, statementHtml } from './statement';
import { partyColumns, partyToWire, partyWithBalance } from './wire';
import { money } from '../../lib/wire';
import { rateToBase } from '../documents/engine';

const P = schema.parties;
type PartyRow = typeof P.$inferSelect;

const today = (d: Date) => d.toISOString().slice(0, 10);

async function findParty(db: DbOrTx, companyId: string, id: string): Promise<PartyRow> {
  const [row] = await db.select().from(P).where(and(eq(P.companyId, companyId), eq(P.id, id)));
  if (!row) throw notFound('Party');
  return row;
}

/** Suppliers, and parties that are both, belong to the buying side, which the Sales plans don't include. */
function assertKindAllowed(ctx: { company: { plan: Schema<'PlanTier'> } }, kind: Schema<'PartyKind'>) {
  if (buysFrom(kind) && !hasModule(ctx.company.plan, 'purchases')) throw planUpgradeRequired(FULL_PLAN, 'purchases');
}

async function validate(db: DbOrTx, body: Schema<'Party'>, today: string) {
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
  // A general contact keeps no account with the business.
  if (!hasLedger(body.kind) && body.openingBalance.minor !== 0) issues.push({ field: 'openingBalance', message: 'A general contact has no opening balance; make them a customer, supplier or both', severity: 'blocking' });
  if (body.openingBalanceDate && body.openingBalanceDate > today) {
    issues.push({ field: 'openingBalanceDate', message: 'The opening balance date cannot be in the future', severity: 'blocking' });
  }
  const [cur] = await db.select().from(schema.currencies).where(eq(schema.currencies.code, body.currency));
  if (!cur) issues.push({ field: 'currency', message: `Unknown currency ${body.currency}`, severity: 'blocking' });
  if (issues.length) throw unprocessable(issues);
}

const CODE_PREFIX: Record<Schema<'PartyKind'>, string> = { customer: 'C-', supplier: 'S-', both: 'B-', general: 'G-' };

/** C-001, C-002… for customers; S-001… for suppliers, B- for both, G- for general contacts. Follows the highest so far. */
async function nextCode(db: DbOrTx, companyId: string, kind: Schema<'PartyKind'>): Promise<string> {
  const prefix = CODE_PREFIX[kind];
  const [row] = await db
    .select({ max: sql<number | null>`max(nullif(regexp_replace(${P.code}, '\\D', '', 'g'), '')::int)` })
    .from(P)
    .where(and(eq(P.companyId, companyId), eq(P.kind, kind), ilike(P.code, `${prefix}%`)));
  return `${prefix}${String((row?.max ?? 0) + 1).padStart(3, '0')}`;
}

async function withBalance(ctx: Ctx<'getParty'>, row: PartyRow) {
  const balances = await partyBalances(ctx.db, row.companyId, [row], today(ctx.now));
  const payable = row.kind === 'both' ? (await partyBalances(ctx.db, row.companyId, [row], today(ctx.now), 'supplier')).get(row.id) : undefined;
  return partyWithBalance(row, balances.get(row.id), payable);
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
/** The WHERE of a party list, shared by the list and its summary. */
function partyFilters(companyId: string, q: { kind?: Schema<'PartyKind'>; status?: 'active' | 'inactive'; q?: string }): SQL[] {
  const filters: SQL[] = [eq(P.companyId, companyId)];
  // A party that is both is among the customers and among the suppliers.
  if (q.kind === 'customer' || q.kind === 'supplier') filters.push(inArray(P.kind, [q.kind, 'both']));
  else if (q.kind) filters.push(eq(P.kind, q.kind));
  if (q.status) filters.push(eq(P.status, q.status));
  if (q.q) {
    const like = `%${q.q.trim()}%`;
    filters.push(or(ilike(P.name, like), ilike(P.code, like), ilike(P.displayName, like), ilike(P.email, like), ilike(P.phone, like), ilike(P.taxId, like))!);
  }
  return filters;
}

export const partiesHandlers = defineHandlers({
  async summarizePartyList(ctx) {
    const base = ctx.company.baseCurrency.trim();
    const rows = await ctx.db.select().from(P).where(and(...partyFilters(ctx.company.id, ctx.query)));
    const balances = await partyBalances(ctx.db, ctx.company.id, rows, today(ctx.now), ctx.query.kind === 'supplier' ? 'supplier' : 'customer');
    const day = today(ctx.now);
    const rates = new Map<string, number>();
    for (const c of new Set(rows.map((r) => r.currency.trim()))) rates.set(c, (await rateToBase(ctx.db, ctx.company.id, c, base, day)) ?? 1);
    const sum = (k: 'outstanding' | 'overdue' | 'advance') => money(Math.round(rows.reduce((a, r) => a + (balances.get(r.id)?.[k] ?? 0) * rates.get(r.currency.trim())!, 0)), base);
    return { count: rows.length, outstanding: sum('outstanding'), overdue: sum('overdue'), advance: sum('advance') };
  },

  async listParties(ctx) {
    const { limit, cursor } = ctx.query;
    const k = keyset({ cursor, limit, sort: P.name, id: P.id, order: 'asc' });
    const filters = partyFilters(ctx.company.id, ctx.query);
    const rows = await ctx.db
      .select()
      .from(P)
      .where(and(...filters, k.where))
      .orderBy(...k.orderBy)
      .limit(k.take);
    const page = rows.slice(0, k.take - 1);
    const balances = await partyBalances(ctx.db, ctx.company.id, page, today(ctx.now), ctx.query.kind === 'supplier' ? 'supplier' : 'customer');
    return k.page(
      page.map((r) => partyWithBalance(r, balances.get(r.id))),
      rows,
    );
  },

  async createParty(ctx) {
    assertKindAllowed(ctx, ctx.body.kind);
    await validate(ctx.db, ctx.body, ctx.now.toISOString().slice(0, 10));
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

  async importParties(ctx) {
    const { rows, dryRun } = ctx.body;
    const day = today(ctx.now);
    // What is already there, to tell duplicates by GSTIN or by name in any case.
    const existing = await ctx.db.select({ taxId: P.taxId, name: P.name }).from(P).where(eq(P.companyId, ctx.company.id));
    const gstins = new Set(existing.map((e) => e.taxId).filter(Boolean));
    const names = new Set(existing.map((e) => e.name.trim().toLowerCase()));
    type Result = { index: number; status: 'created' | 'duplicate' | 'invalid'; id?: string; issues?: Issue[] };
    const results: Result[] = [];
    const good: { index: number; body: Schema<'Party'> }[] = [];
    for (const [index, body] of rows.entries()) {
      try {
        assertKindAllowed(ctx, body.kind);
        await validate(ctx.db, body, day);
      } catch (err) {
        const issues = err instanceof ApiError ? ((err.extra.issues as Issue[] | undefined) ?? [{ field: 'kind', message: err.message, severity: 'blocking' as const }]) : [{ field: '', message: String(err), severity: 'blocking' as const }];
        results.push({ index, status: 'invalid', issues });
        continue;
      }
      const name = body.name.trim().toLowerCase();
      if ((body.taxId && gstins.has(body.taxId)) || names.has(name)) {
        results.push({ index, status: 'duplicate' });
        continue;
      }
      if (body.taxId) gstins.add(body.taxId);
      names.add(name);
      good.push({ index, body });
    }
    if (!dryRun && good.length) {
      await ctx.db.transaction(async (tx) => {
        // Codes follow each kind's series, counted on within the batch.
        const next = new Map<string, number>();
        for (const { index, body } of good) {
          let code = body.code?.trim();
          if (!code) {
            const n = next.get(body.kind) ?? Number((await nextCode(tx, ctx.company.id, body.kind)).replace(/\D/g, ''));
            code = `${CODE_PREFIX[body.kind]}${String(n).padStart(3, '0')}`;
            next.set(body.kind, n + 1);
          }
          const [created] = await tx.insert(P).values({ id: newId('pty'), companyId: ctx.company.id, code, ...partyColumns(body) }).returning();
          await recordChange(tx, ctx.user, { companyId: ctx.company.id, action: 'created', entityType: 'party', entityId: created.id, entityLabel: created.name, version: created.version, after: partyToWire(created) });
          results.push({ index, status: 'created', id: created.id });
        }
      });
    } else for (const { index } of good) results.push({ index, status: 'created' });
    results.sort((a, b) => a.index - b.index);
    const count = (s: Result['status']) => results.filter((r) => r.status === s).length;
    return { created: count('created'), skipped: count('duplicate'), invalid: count('invalid'), results };
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
    await validate(ctx.db, ctx.body, ctx.now.toISOString().slice(0, 10));
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

  /** JSON by default; a PDF when the client asks for one in `Accept`. */
  async getPartyStatement(ctx) {
    const party = await findParty(ctx.db, ctx.company.id, ctx.params.id);
    const range = { from: ctx.query.from, to: ctx.query.to };
    const statement = await partyStatement(ctx.db, ctx.company, party, range);
    const accept = String(ctx.req.headers.accept ?? '');
    if (accept.includes('application/pdf') && !accept.includes('application/json')) {
      const pdf = await ctx.deps.providers.pdf.render(statementHtml(ctx.company, statement, range));
      return new RawBody(pdf, 'application/pdf', `statement-${party.code}.pdf`);
    }
    return statement;
  },
});

