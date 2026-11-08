import { addDaysISO } from '@esmart/core/lib/date';
import { OPENING_DATE } from '@esmart/core/domain/ledger/postings';
import { sql } from 'drizzle-orm';
import type { CompanyRow } from '../../context';
import { conflict } from '../../http/errors';
import type { DbOrTx } from '../../lib/audit';

export type KeyUse = 'voucher' | 'voucher template' | 'fixed asset' | 'budget';

/**
 * Where an account key (`party:…`, `pay:…`, `exp:…`, `acc:…`) is still named outside its own record:
 * on a voucher's lines, a voucher template, a fixed asset's cost account or a budget. Vouchers carry
 * keys with no foreign key, so a master deleted while one still names it leaves postings to nothing,
 * and the Balance Sheet stops balancing. Returns what uses it ("voucher JV/26-27/0004"), or null.
 */
export async function ledgerKeyUse(db: DbOrTx, companyId: string, key: string, only?: KeyUse[]): Promise<string | null> {
  const line = JSON.stringify([{ account: key }]);
  const checks: [KeyUse, ReturnType<typeof sql>][] = [
    ['voucher', sql`select number as label from vouchers where company_id = ${companyId} and lines @> ${line}::jsonb limit 1`],
    ['voucher template', sql`select name as label from voucher_templates where company_id = ${companyId} and lines @> ${line}::jsonb limit 1`],
    ['fixed asset', sql`select name as label from fixed_assets where company_id = ${companyId} and account = ${key} limit 1`],
    ['budget', sql`select name as label from budgets where company_id = ${companyId} and lines @> ${line}::jsonb limit 1`],
  ];
  for (const [what, q] of checks) {
    if (only && !only.includes(what)) continue;
    const res = await db.execute(q);
    const row = res.rows[0] as { label?: string } | undefined;
    if (row) return `${what} ${row.label ?? ''}`.trim();
  }
  return null;
}

/**
 * An opening balance posts the day before its date (RULES 6.12), or at the start of the books when it
 * has none, so that is the day a closed period has to leave open for it to change.
 */
export function assertOpeningOpen(company: CompanyRow, date: string | null | undefined) {
  const locked = company.lockedThroughDate;
  if (!locked) return;
  const posts = date ? addDaysISO(date, -1) : OPENING_DATE;
  if (posts > locked) return;
  throw conflict(
    'PERIOD_LOCKED',
    date
      ? `The books are closed through ${locked}; an opening balance dated ${date} sits in them (it counts from ${posts}). An owner must reopen them to change it`
      : `The books are closed through ${locked}; an undated opening balance sits at the start of the books. Give it a date after ${locked}, or an owner must reopen them`,
  );
}
