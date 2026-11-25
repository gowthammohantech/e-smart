import { and, eq, inArray } from 'drizzle-orm';
import { taxUnavailableOn, taxRateOn } from '@esmart/core/domain/taxEngine';
import { schema } from '@esmart/db';
import type { DbOrTx } from './audit';

export type RateHistory = { effectiveFrom: string; rate: number }[];

/**
 * The rates each category had before its current one (`tax_category_rates`, kept when a rate is
 * changed), oldest first. With them, `taxRateOn` gives a category's rate on any date.
 */
export async function taxHistories(db: DbOrTx, categoryIds: string[]): Promise<Map<string, RateHistory>> {
  const out = new Map<string, RateHistory>();
  if (!categoryIds.length) return out;
  const R = schema.taxCategoryRates;
  const rows = await db.select().from(R).where(inArray(R.taxCategoryId, [...new Set(categoryIds)])).orderBy(R.effectiveFrom);
  for (const r of rows) {
    const list = out.get(r.taxCategoryId) ?? [];
    list.push({ effectiveFrom: r.effectiveFrom, rate: Number(r.rate) });
    out.set(r.taxCategoryId, list);
  }
  return out;
}

/**
 * One category of the company's as of `date`: its rate then, and whether it was in force at all
 * (a tax that starts later can't be charged). Undefined when there is no such category.
 */
export async function categoryOn(
  db: DbOrTx,
  companyId: string,
  categoryId: string,
  date: string,
): Promise<{ name: string; rate: number; available: boolean; effectiveFrom: string; why?: string } | undefined> {
  const T = schema.taxCategories;
  const [c] = await db.select({ name: T.name, rate: T.rate, effectiveFrom: T.effectiveFrom, effectiveTo: T.effectiveTo, status: T.status }).from(T).where(and(eq(T.companyId, companyId), eq(T.id, categoryId)));
  if (!c) return undefined;
  const history = c.effectiveFrom > date ? (await taxHistories(db, [categoryId])).get(categoryId) : undefined;
  const dated = { rate: Number(c.rate), effectiveFrom: c.effectiveFrom, history, effectiveTo: c.effectiveTo ?? undefined, status: c.status };
  const why = taxUnavailableWhy({ ...dated, name: c.name }, date);
  return { name: c.name, rate: taxRateOn(dated, date), available: !why, effectiveFrom: c.effectiveFrom, why };
}

/** Why a tax can't be charged on `date`, in words for a refusal; undefined when it can. */
export function taxUnavailableWhy(c: { name: string; effectiveFrom: string; effectiveTo?: string; status?: 'active' | 'inactive'; history?: { effectiveFrom: string; rate: number }[] }, date: string): string | undefined {
  const why = taxUnavailableOn(c, date);
  if (why === 'inactive') return `${c.name} is inactive; pick another tax rate`;
  if (why === 'ended') return `${c.name} ended on ${c.effectiveTo}; it can't be charged on ${date}`;
  if (why === 'notYet') return `${c.name} applies from ${c.effectiveFrom}; it can't be charged on ${date}`;
  return undefined;
}
