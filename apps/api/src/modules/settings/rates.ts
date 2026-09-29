import { and, asc, desc, eq, inArray, ne, sql } from 'drizzle-orm';
import type { Schema } from '@esmart/api-contract';
import { schema } from '@esmart/db';
import { defineHandlers } from '../../context';
import { checkIfMatch, setEtag } from '../../http/etag';
import { invalid, notFound, preconditionFailed, unprocessable, type Issue } from '../../http/errors';
import type { DbOrTx } from '../../lib/audit';
import { newId } from '../../lib/ids';
import { audit } from './shared';
import { exchangeRateToWire } from './wire';

const R = schema.exchangeRates;
type RateRow = typeof R.$inferSelect;

const label = (r: RateRow) => `${r.fromCurrency.trim()}/${r.toCurrency.trim()} ${r.effectiveFrom}`;
const today = (d: Date) => d.toISOString().slice(0, 10);

async function findRate(db: DbOrTx, companyId: string, id: string) {
  const [row] = await db.select().from(R).where(and(eq(R.companyId, companyId), eq(R.id, id)));
  if (!row) throw notFound('Exchange rate');
  return row;
}

async function validate(db: DbOrTx, companyId: string, body: Schema<'ExchangeRate'>, exceptId?: string) {
  const issues: Issue[] = [];
  if (body.from === body.to) issues.push({ field: 'to', message: 'A rate converts between two different currencies', severity: 'blocking' });
  if (!(body.rate > 0)) issues.push({ field: 'rate', message: 'Rate must be greater than zero', severity: 'blocking' });
  const known = await db.select({ code: schema.currencies.code }).from(schema.currencies).where(inArray(schema.currencies.code, [body.from, body.to]));
  const codes = new Set(known.map((c) => c.code.trim()));
  for (const f of ['from', 'to'] as const) if (!codes.has(body[f])) issues.push({ field: f, message: `Unknown currency ${body[f]}`, severity: 'blocking' });
  if (issues.length) throw unprocessable(issues);
  const filters = [eq(R.companyId, companyId), eq(R.fromCurrency, body.from), eq(R.toCurrency, body.to), eq(R.effectiveFrom, body.effectiveFrom)];
  if (exceptId) filters.push(ne(R.id, exceptId));
  const [dupe] = await db.select({ id: R.id }).from(R).where(and(...filters));
  if (dupe) throw invalid('effectiveFrom', `There is already a ${body.from}/${body.to} rate from ${body.effectiveFrom}`, 'EXCHANGE_RATE_EXISTS');
}

/** Foreign currencies on the company's records, plus any it already keeps rates for. */
async function currenciesInUse(db: DbOrTx, companyId: string, base: string): Promise<string[]> {
  const res = await db.execute<{ c: string }>(sql`
    select distinct trim(c) as c from (
      select currency as c from parties where company_id = ${companyId}
      union select currency from documents where company_id = ${companyId}
      union select currency from payments where company_id = ${companyId}
      union select currency from expenses where company_id = ${companyId}
      union select currency from payment_accounts where company_id = ${companyId}
      union select from_currency from exchange_rates where company_id = ${companyId} and to_currency = ${base}
    ) used`);
  return res.rows.map((r) => r.c).filter((c) => c !== base).sort();
}

export const rateHandlers = defineHandlers({
  async listExchangeRates(ctx) {
    const rows = await ctx.db
      .select()
      .from(R)
      .where(eq(R.companyId, ctx.company.id))
      .orderBy(desc(R.effectiveFrom), asc(R.fromCurrency), asc(R.toCurrency));
    return { data: rows.map(exchangeRateToWire) };
  },

  async createExchangeRate(ctx) {
    await validate(ctx.db, ctx.company.id, ctx.body);
    const row = await ctx.db.transaction(async (tx) => {
      const [created] = await tx
        .insert(R)
        .values({
          id: newId('fxr'),
          companyId: ctx.company.id,
          fromCurrency: ctx.body.from,
          toCurrency: ctx.body.to,
          rate: String(ctx.body.rate),
          effectiveFrom: ctx.body.effectiveFrom,
          source: 'manual',
        })
        .returning();
      await audit(tx, ctx.user, ctx.company.id, 'exchange_rate', 'created', created, label(created), { after: exchangeRateToWire(created) });
      return created;
    });
    setEtag(ctx.reply, row.version);
    return exchangeRateToWire(row);
  },

  async saveExchangeRate(ctx) {
    const current = await findRate(ctx.db, ctx.company.id, ctx.params.id);
    checkIfMatch(ctx.req, current.version);
    await validate(ctx.db, ctx.company.id, ctx.body, current.id);
    const row = await ctx.db.transaction(async (tx) => {
      // A person editing a rate makes it theirs, whoever fetched it.
      const [updated] = await tx
        .update(R)
        .set({
          fromCurrency: ctx.body.from,
          toCurrency: ctx.body.to,
          rate: String(ctx.body.rate),
          effectiveFrom: ctx.body.effectiveFrom,
          source: 'manual',
          version: current.version + 1,
          updatedAt: ctx.now,
        })
        .where(and(eq(R.id, current.id), eq(R.version, current.version)))
        .returning();
      if (!updated) throw preconditionFailed();
      await audit(tx, ctx.user, ctx.company.id, 'exchange_rate', 'updated', updated, label(updated), { before: exchangeRateToWire(current), after: exchangeRateToWire(updated) });
      return updated;
    });
    setEtag(ctx.reply, row.version);
    return exchangeRateToWire(row);
  },

  /** Documents store the rate they used, so deleting one never rewrites history. */
  async removeExchangeRate(ctx) {
    const current = await findRate(ctx.db, ctx.company.id, ctx.params.id);
    checkIfMatch(ctx.req, current.version);
    await ctx.db.transaction(async (tx) => {
      await tx.delete(R).where(eq(R.id, current.id));
      await audit(tx, ctx.user, ctx.company.id, 'exchange_rate', 'deleted', current, label(current), { before: exchangeRateToWire(current) });
    });
    return undefined;
  },

  /**
   * Today's provider rate into the base currency for every foreign currency
   * the company uses. Re-running on the same day updates today's rows.
   */
  async refreshExchangeRates(ctx) {
    const base = ctx.company.baseCurrency.trim();
    const date = today(ctx.now);
    const wanted = await currenciesInUse(ctx.db, ctx.company.id, base);
    if (!wanted.length) return { data: [] };
    const rates = await ctx.deps.providers.fx.rates(base, wanted, date);
    const rows = await ctx.db.transaction(async (tx) => {
      const out: RateRow[] = [];
      for (const [from, rate] of Object.entries(rates)) {
        const [before] = await tx
          .select()
          .from(R)
          .where(and(eq(R.companyId, ctx.company.id), eq(R.fromCurrency, from), eq(R.toCurrency, base), eq(R.effectiveFrom, date)));
        const [row] = await tx
          .insert(R)
          .values({ id: newId('fxr'), companyId: ctx.company.id, fromCurrency: from, toCurrency: base, rate: String(rate), effectiveFrom: date, source: 'provider' })
          .onConflictDoUpdate({
            target: [R.companyId, R.fromCurrency, R.toCurrency, R.effectiveFrom],
            set: { rate: String(rate), source: 'provider', version: sql`${R.version} + 1`, updatedAt: ctx.now },
          })
          .returning();
        await audit(tx, ctx.user, ctx.company.id, 'exchange_rate', before ? 'updated' : 'created', row, label(row), {
          before: before ? exchangeRateToWire(before) : undefined,
          after: exchangeRateToWire(row),
        });
        out.push(row);
      }
      return out;
    });
    return { data: rows.map(exchangeRateToWire) };
  },
});
