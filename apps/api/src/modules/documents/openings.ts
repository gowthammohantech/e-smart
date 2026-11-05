import { and, desc, asc, eq, inArray } from 'drizzle-orm';
import { schema } from '@esmart/db';
import { businessDate } from '@esmart/core/lib/date';
import { buysFrom, sellsTo } from '@esmart/core/domain/partyKinds';
import { normalizeGstin } from '@esmart/core/domain/gstin';
import { defineHandlers } from '../../context';
import type { Issue } from '../../http/errors';
import { recordChange, type DbOrTx } from '../../lib/audit';
import { newId } from '../../lib/ids';
import { effectiveStatus } from './lifecycle';

const D = schema.documents;
const P = schema.parties;

async function primaryBranchId(db: DbOrTx, companyId: string): Promise<string> {
  const B = schema.branches;
  const [b] = await db.select({ id: B.id }).from(B).where(eq(B.companyId, companyId)).orderBy(desc(B.isPrimary), asc(B.createdAt)).limit(1);
  return b.id;
}

/**
 * Opening invoices and bills (RULES 6.12): what was owed, invoice by invoice, when the books started
 * here, imported from a spreadsheet the app has read. Each becomes an issued openingInvoice or
 * openingBill under its own number, for what is still outstanding; ledger postings put it only on the
 * party's account and Opening balances.
 */
export const openingDocumentHandlers = defineHandlers({
  async importOpeningDocuments(ctx) {
    const { rows, dryRun } = ctx.body;
    const company = ctx.company;
    const base = company.baseCurrency.trim();
    const today = businessDate(ctx.now);

    const parties = await ctx.db
      .select({ id: P.id, name: P.name, kind: P.kind, taxId: P.taxId, opening: P.openingBalanceMinor, status: P.status })
      .from(P)
      .where(eq(P.companyId, company.id));
    // The one line each carries (a document has at least one): the amount, outside GST, at the 0% category.
    const T = schema.taxCategories;
    const [zeroRated] = await ctx.db.select({ id: T.id }).from(T).where(and(eq(T.companyId, company.id), eq(T.rate, '0'))).limit(1);
    const byGstin = new Map(parties.filter((p) => p.taxId).map((p) => [p.taxId!, p]));
    const byName = new Map<string, (typeof parties)[number][]>();
    for (const p of parties) byName.set(p.name.trim().toLowerCase(), [...(byName.get(p.name.trim().toLowerCase()) ?? []), p]);

    // Numbers already taken, per kind, to tell duplicates (the unique index would refuse them anyway).
    const taken = await ctx.db
      .select({ kind: D.kind, number: D.number })
      .from(D)
      .where(and(eq(D.companyId, company.id), inArray(D.kind, ['openingInvoice', 'openingBill'])));
    const used = new Set(taken.map((t) => `${t.kind}:${t.number.toLowerCase()}`));

    type Result = { index: number; status: 'created' | 'duplicate' | 'invalid'; id?: string; partyName?: string; issues?: Issue[] };
    const results: Result[] = [];
    const good: { index: number; row: (typeof rows)[number]; party: (typeof parties)[number] }[] = [];

    for (const [index, row] of rows.entries()) {
      const issues: Issue[] = [];
      const blocking = (field: string, message: string) => issues.push({ field, message, severity: 'blocking' });
      const key = row.party.trim();
      const gstin = normalizeGstin(key);
      const named = byName.get(key.toLowerCase()) ?? [];
      const party = byGstin.get(gstin) ?? (named.length === 1 ? named[0] : undefined);
      const invoice = row.kind === 'openingInvoice';
      if (!party) blocking('party', named.length > 1 ? `More than one contact is called ${key}; give the GSTIN` : `No contact ${key}; add it first (import contacts), then these`);
      else if (invoice ? !sellsTo(party.kind) : !buysFrom(party.kind)) blocking('party', `${party.name} is not a ${invoice ? 'customer' : 'supplier'}`);
      // Their opening balance is these invoices; holding both would count the debt twice.
      else if (party.opening !== 0) blocking('party', `${party.name} already has an opening balance; clear it, or leave these rows out`);
      const number = row.number.trim();
      if (!number) blocking('number', 'No number');
      if (row.amount.currency !== base) blocking('amount.currency', `Amounts are in the company's currency (${base})`);
      if (row.amount.minor <= 0) blocking('amount', 'Nothing outstanding');
      if (row.date > today) blocking('date', 'Dated in the future');
      if (row.dueDate && row.dueDate < row.date) blocking('dueDate', 'Due before it was raised');
      if (company.lockedThroughDate && row.date <= company.lockedThroughDate) blocking('date', `The books are closed through ${company.lockedThroughDate}`);
      if (!zeroRated) blocking('kind', 'This business has no 0% tax category to carry the amount; add one in Settings → Taxes');
      if (issues.length) {
        results.push({ index, status: 'invalid', partyName: party?.name, issues });
        continue;
      }
      const usedKey = `${row.kind}:${number.toLowerCase()}`;
      if (used.has(usedKey)) {
        results.push({ index, status: 'duplicate', partyName: party!.name });
        continue;
      }
      used.add(usedKey);
      good.push({ index, row: { ...row, number }, party: party! });
    }

    if (!dryRun && good.length) {
      await ctx.db.transaction(async (tx) => {
        const branchId = await primaryBranchId(tx, company.id);
        for (const { index, row, party } of good) {
          const values = {
            id: newId('doc'),
            companyId: company.id,
            branchId,
            kind: row.kind,
            number: row.number,
            partyId: party.id,
            date: row.date,
            dueDate: row.dueDate ?? row.date,
            currency: base,
            exchangeRate: '1',
            subtotalMinor: row.amount.minor,
            grandTotalMinor: row.amount.minor,
            grandTotalBaseMinor: row.amount.minor,
            notes: 'Outstanding when the books started here',
            createdBy: ctx.user.id,
          } as const;
          const status = effectiveStatus({ kind: row.kind, status: 'issued', grandTotalMinor: row.amount.minor, amountPaidMinor: 0, dueDate: values.dueDate }, today);
          const [created] = await tx.insert(D).values({ ...values, status }).returning();
          await tx.insert(schema.documentLines).values({
            id: newId('dln'),
            documentId: created.id,
            position: 0,
            name: `Outstanding on ${row.number}`,
            quantity: '1',
            unit: 'NOS',
            unitPriceMinor: row.amount.minor,
            taxCategoryId: zeroRated!.id,
            taxRate: '0',
            supplyType: 'nonGst',
            lineTotalMinor: row.amount.minor,
          });
          await recordChange(tx, ctx.user, {
            companyId: company.id,
            action: 'created',
            entityType: 'document',
            entityId: created.id,
            entityLabel: created.number,
            version: created.version,
          });
          results.push({ index, status: 'created', id: created.id, partyName: party.name });
        }
      });
    } else for (const { index, party } of good) results.push({ index, status: 'created', partyName: party.name });

    results.sort((a, b) => a.index - b.index);
    const count = (s: Result['status']) => results.filter((r) => r.status === s).length;
    return { created: count('created'), skipped: count('duplicate'), invalid: count('invalid'), results };
  },
});
