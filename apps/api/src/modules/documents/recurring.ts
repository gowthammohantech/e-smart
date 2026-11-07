import { and, eq, inArray, isNull, lte, ne } from 'drizzle-orm';
import { addDaysISO, businessDate } from '@esmart/core/lib/date';
import { schema } from '@esmart/db';
import type { AuthUser, CompanyRow, Deps } from '../../context';
import { recordChange, type DbOrTx } from '../../lib/audit';
import { notify } from '../../lib/notify';
import { nextRecurrence, schedulerActor } from '../expenses/engine';
import { fieldsFromRow, linesFromRows, type DocFields } from './engine';
import { documentsHandlers, insertDocument, type AnyCtx } from './handlers';
import { FINAL_STATUS } from './lifecycle';

const D = schema.documents;
type DocRow = typeof D.$inferSelect;

/** Days between two ISO dates. */
const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

/** What a handler shared with a request needs, for work the scheduler does as the series' owner. */
function jobCtx(deps: Deps, db: DbOrTx, company: CompanyRow, user: AuthUser, now: Date): AnyCtx {
  const reply = { header: () => reply, code: () => reply, status: () => reply } as unknown as AnyCtx['reply'];
  return { company, user, db: db as AnyCtx['db'], now, deps, req: { headers: {} } as AnyCtx['req'], reply };
}

/**
 * A copy of the template for `date`: the same customer, lines and prices, at the tax and exchange
 * rates of that day, due as many days after its date as the template was. Lines recovering a billable
 * expense are left out, since an expense is recovered once.
 */
function copyFields(template: DocRow, date: string, baseCurrency: string): DocFields {
  const f = fieldsFromRow(template);
  return {
    ...f,
    date,
    dueDate: template.dueDate ? addDaysISO(date, daysBetween(template.date, template.dueDate)) : null,
    // A foreign-currency copy is converted at its own day's rate, not the template's.
    exchangeRate: f.currency === baseCurrency ? f.exchangeRate : null,
    sourceDocumentId: null,
  };
}

/**
 * The `invoices.recur` job: issues every copy of a recurring invoice that has fallen due by `today`
 * and moves the template's next date past it. Each template is handled under a `FOR UPDATE SKIP LOCKED`
 * row lock, and a date that already has a copy is skipped, so two runners or a rerun never issue the
 * same copy twice. A copy that can't be issued (a closed period, the customer's credit limit) stops
 * that series where it is, to be tried again tomorrow, and the business is told. Copies set to be
 * emailed go out once their transaction has committed.
 */
export async function issueRecurringInvoices(deps: Deps, today: string | Date): Promise<{ created: string[]; failed: string[] }> {
  const asOf = typeof today === 'string' ? today : businessDate(today);
  const activeCompanies = deps.db
    .select({ id: schema.companies.id })
    .from(schema.companies)
    .innerJoin(schema.accounts, eq(schema.accounts.id, schema.companies.accountId))
    .where(and(isNull(schema.accounts.suspendedAt), isNull(schema.companies.archivedAt)));
  const due = await deps.db
    .select({ id: D.id })
    .from(D)
    .where(and(eq(D.kind, 'invoice'), ne(D.recurrence, 'none'), lte(D.nextRecurrenceDate, asOf), isNull(D.recurringParentId), inArray(D.companyId, activeCompanies)))
    .orderBy(D.nextRecurrenceDate, D.id);
  const created: string[] = [];
  const failed: string[] = [];
  const toSend: { company: CompanyRow; actor: AuthUser; id: string; number: string; template: string }[] = [];

  for (const { id } of due) {
    await deps.db.transaction(async (tx) => {
      const [template] = await tx
        .select()
        .from(D)
        .where(and(eq(D.id, id), ne(D.recurrence, 'none'), lte(D.nextRecurrenceDate, asOf)))
        .for('update', { skipLocked: true });
      if (!template?.nextRecurrenceDate || template.recurrence === 'none') return;
      const now = deps.now();
      // A cancelled invoice stops repeating.
      if (template.status === 'cancelled') {
        await tx.update(D).set({ recurrence: 'none', nextRecurrenceDate: null, version: template.version + 1, updatedAt: now }).where(eq(D.id, template.id));
        return;
      }
      const [company] = await tx.select().from(schema.companies).where(eq(schema.companies.id, template.companyId));
      const actor = await schedulerActor(tx, template.createdBy);
      const lines = (await tx.select().from(schema.documentLines).where(eq(schema.documentLines.documentId, template.id))).filter((l) => !l.expenseId);
      const end = template.recurrenceEndDate;
      let next: string | null = template.nextRecurrenceDate;

      while (next && next <= asOf && (!end || next <= end)) {
        const date: string = next;
        const [already] = await tx.select({ id: D.id }).from(D).where(and(eq(D.recurringParentId, template.id), eq(D.date, date)));
        if (!already) {
          try {
            // In a savepoint, so a copy that can't be issued leaves the series and the rest untouched.
            const copy = await tx.transaction(async (sp) => {
              const row = await insertDocument(jobCtx(deps, sp, company, actor, now), copyFields(template, date, company.baseCurrency.trim()), linesFromRows(lines).map((l) => ({ ...l, id: undefined })), FINAL_STATUS.invoice as never);
              await sp.update(D).set({ recurringParentId: template.id }).where(eq(D.id, row.id));
              return row;
            });
            created.push(copy.id);
            if (template.recurrenceAutoSend) toSend.push({ company, actor, id: copy.id, number: copy.number, template: template.number });
          } catch (err) {
            failed.push(template.id);
            await notify(tx, deps, {
              companyId: template.companyId,
              kind: 'system',
              title: `Recurring invoice ${template.number} not issued`,
              body: `The copy for ${date} could not be issued: ${err instanceof Error ? err.message : String(err)}. It will be tried again tomorrow.`,
              entityType: 'document',
              entityId: template.id,
            });
            break;
          }
        }
        next = nextRecurrence(template.date, template.recurrence, date);
      }
      if (next === template.nextRecurrenceDate) return;
      const left = next && (!end || next <= end) ? next : null;
      const [updated] = await tx.update(D).set({ nextRecurrenceDate: left, version: template.version + 1, updatedAt: now }).where(eq(D.id, template.id)).returning();
      await recordChange(tx, actor, {
        companyId: updated.companyId,
        action: 'recurred',
        entityType: 'document',
        entityId: updated.id,
        entityLabel: updated.number,
        version: updated.version,
        before: { nextRecurrenceDate: template.nextRecurrenceDate },
        after: { nextRecurrenceDate: left },
      });
    });
  }

  // Emailed as the real send does it (PDF, share and payment links); a customer with no email is said so.
  for (const s of toSend) {
    try {
      const ctx = { ...jobCtx(deps, deps.db, s.company, s.actor, deps.now()), maybeUser: s.actor, params: { companyId: s.company.id, id: s.id }, query: {}, body: { channel: 'email' as const, attachPdf: true, includePaymentLink: true } };
      await documentsHandlers.sendDocument(ctx as never);
    } catch (err) {
      await notify(deps.db, deps, {
        companyId: s.company.id,
        kind: 'system',
        title: `${s.number} issued but not emailed`,
        body: `${s.number}, from recurring invoice ${s.template}, was issued but could not be emailed: ${err instanceof Error ? err.message : String(err)}`,
        entityType: 'document',
        entityId: s.id,
      });
    }
  }
  return { created, failed };
}
