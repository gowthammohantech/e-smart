import { and, desc, eq, exists, getTableColumns, ilike, inArray, ne, or, sql, type SQL } from 'drizzle-orm';
import { SALES_KINDS } from '@esmart/core/domain/documentStates';
import { hasModule } from '@esmart/core/domain/plan';
import { schema } from '@esmart/db';
import { defineHandlers } from '../../context';
import { itemToWire } from '../catalog/wire';
import { summariesToWire, type SummaryRow } from '../documents/wire';
import { partyToWire } from '../parties/wire';
import { paymentsToWire } from '../payments/wire';

/** `q` as a contains-pattern, with LIKE's own wildcards taken literally. */
const containsPattern = (q: string) => `%${q.trim().replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

/**
 * Search: search. Each group is a capped ILIKE over the fields people
 * type: party name, code, GSTIN, phone and email; item name, SKU, barcode
 * and HSN; document and payment number, reference and party name. The
 * buying side (suppliers, purchase documents, payments made) only shows on
 * plans that have it, and documents and payments only in the caller's
 * branches. The contract's result has no expenses group, so expenses are
 * searched through listExpenses `q` instead.
 */
export const searchHandlers = defineHandlers({
  async search(ctx) {
    const like = containsPattern(ctx.query.q);
    const limit = Math.min(Math.max(ctx.query.limit ?? 5, 1), 20);
    const companyId = ctx.company.id;
    const purchases = hasModule(ctx.company.plan, 'purchases');
    const payables = hasModule(ctx.company.plan, 'payables');
    const branches = ctx.user.branchIds;

    const P = schema.parties;
    const partyFilters: (SQL | undefined)[] = [
      eq(P.companyId, companyId),
      or(ilike(P.name, like), ilike(P.displayName, like), ilike(P.code, like), ilike(P.taxId, like), ilike(P.phone, like), ilike(P.email, like)),
    ];
    if (!purchases) partyFilters.push(ne(P.kind, 'supplier'));
    const parties = await ctx.db.select().from(P).where(and(...partyFilters)).orderBy(P.name, P.id).limit(limit);

    const I = schema.items;
    const items = await ctx.db
      .select()
      .from(I)
      .where(and(eq(I.companyId, companyId), or(ilike(I.name, like), ilike(I.sku, like), ilike(I.barcode, like), ilike(I.hsnCode, like))))
      .orderBy(I.name, I.id)
      .limit(limit);

    const D = schema.documents;
    const docFilters: (SQL | undefined)[] = [eq(D.companyId, companyId), or(ilike(D.number, like), ilike(D.reference, like), ilike(D.supplierDocNumber, like), ilike(P.name, like))];
    if (!purchases) docFilters.push(inArray(D.kind, SALES_KINDS));
    if (branches.length) docFilters.push(inArray(D.branchId, branches));
    const docs = (await ctx.db
      .select({ ...getTableColumns(D), partyName: P.name })
      .from(D)
      .innerJoin(P, eq(P.id, D.partyId))
      .where(and(...docFilters))
      .orderBy(desc(D.date), desc(D.id))
      .limit(limit)) as SummaryRow[];

    const PAY = schema.payments;
    const payFilters: (SQL | undefined)[] = [eq(PAY.companyId, companyId), or(ilike(PAY.number, like), ilike(PAY.reference, like), exists(ctx.db.select({ one: sql`1` }).from(P).where(and(eq(P.id, PAY.partyId), ilike(P.name, like)))))];
    if (!payables) payFilters.push(eq(PAY.direction, 'received'));
    if (branches.length) payFilters.push(inArray(PAY.branchId, branches));
    const payments = await ctx.db
      .select()
      .from(PAY)
      .where(and(...payFilters))
      .orderBy(desc(PAY.date), desc(PAY.id))
      .limit(limit);

    return {
      parties: parties.map(partyToWire),
      items: items.map((r) => itemToWire(r)),
      documents: await summariesToWire(ctx.db, docs, ctx.now),
      payments: await paymentsToWire(ctx.db, payments, ctx.company.baseCurrency.trim()),
    };
  },
});
