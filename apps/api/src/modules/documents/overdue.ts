import { and, eq, gte, inArray, isNull, lt, sql } from 'drizzle-orm';
import { schema } from '@esmart/db';
import type { Deps } from '../../context';
import { notify, noteDate, noteMoney } from '../../lib/notify';
import { today } from './lifecycle';

const D = schema.documents;
/** Only invoices that fell due this past week: turning this on mustn't flood people with old ones. */
const LOOK_BACK_DAYS = 7;

/**
 * The daily `invoices.overdue` job: tells each business, once per invoice, that it has fallen overdue.
 * The mark goes on in the same statement that picks the invoice, so a second run finds nothing.
 */
export async function notifyOverdueInvoices(deps: Pick<Deps, 'db' | 'now'> & Deps): Promise<number> {
  const asOf = today(deps.now());
  const from = new Date(`${asOf}T00:00:00Z`);
  from.setUTCDate(from.getUTCDate() - LOOK_BACK_DAYS);
  const activeCompanies = deps.db
    .select({ id: schema.companies.id })
    .from(schema.companies)
    .innerJoin(schema.accounts, eq(schema.accounts.id, schema.companies.accountId))
    .where(and(isNull(schema.accounts.suspendedAt), isNull(schema.companies.archivedAt)));
  const marked = await deps.db
    .update(D)
    .set({ overdueNotifiedAt: deps.now() })
    .where(
      and(
        eq(D.kind, 'invoice'),
        inArray(D.status, ['sent', 'issued', 'partiallyPaid', 'overdue']),
        lt(D.dueDate, asOf),
        gte(D.dueDate, from.toISOString().slice(0, 10)),
        lt(D.amountPaidMinor, D.grandTotalMinor),
        isNull(D.overdueNotifiedAt),
        inArray(D.companyId, activeCompanies),
      ),
    )
    .returning({ id: D.id, companyId: D.companyId, number: D.number, dueDate: D.dueDate, partyId: D.partyId, currency: D.currency, owed: sql<number>`${D.grandTotalMinor} - ${D.amountPaidMinor}` });
  for (const inv of marked) {
    const [party] = await deps.db.select({ name: schema.parties.name }).from(schema.parties).where(eq(schema.parties.id, inv.partyId));
    await notify(deps.db, deps, {
      companyId: inv.companyId,
      kind: 'invoiceOverdue',
      title: `${inv.number} is overdue`,
      body: `${party?.name ?? 'A customer'} · ${noteMoney(Number(inv.owed), inv.currency)} was due ${inv.dueDate ? noteDate(inv.dueDate) : 'earlier'}`,
      entityType: 'document',
      entityId: inv.id,
    });
  }
  return marked.length;
}
