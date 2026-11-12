import { and, eq, inArray } from 'drizzle-orm';
import { taxRateOn } from '@esmart/core/domain/taxEngine';
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

/** One category of the company's at its rate on `date`, or undefined when there is no such category. */
export async function categoryRateOn(db: DbOrTx, companyId: string, categoryId: string, date: string): Promise<number | undefined> {
  const T = schema.taxCategories;
  const [c] = await db.select({ rate: T.rate, effectiveFrom: T.effectiveFrom }).from(T).where(and(eq(T.companyId, companyId), eq(T.id, categoryId)));
  if (!c) return undefined;
  const history = c.effectiveFrom > date ? (await taxHistories(db, [categoryId])).get(categoryId) : undefined;
  return taxRateOn({ rate: Number(c.rate), effectiveFrom: c.effectiveFrom, history }, date);
}
