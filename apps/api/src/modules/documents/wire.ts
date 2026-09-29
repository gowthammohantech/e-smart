import { and, eq, inArray } from 'drizzle-orm';
import type { Schema } from '@esmart/api-contract';
import { isPayableDocument } from '@esmart/core/domain/documentStates';
import type { BusinessDocument } from '@esmart/core/types';
import { schema } from '@esmart/db';
import type { DbOrTx } from '../../lib/audit';
import { compact, iso, money, versioned } from '../../lib/wire';
import type { DocRow } from './engine';
import { effectiveStatus } from './lifecycle';

type Compliance = Schema<'ComplianceInfo'>;
type EwayRow = Pick<typeof schema.ewayBills.$inferSelect, 'id' | 'ewayBillNumber' | 'validUpto' | 'status'>;
type EInvoiceRow = typeof schema.eInvoices.$inferSelect;

/**
 * `BusinessDocument` on the wire. Its status is the *effective* one, so it
 * can read `paid`, `overdue` or `cancelled`.
 */
export type DocumentWire = Schema<'BusinessDocument'>;

function ewayStatus(e: EwayRow | undefined, now: Date): Compliance['ewayBillStatus'] {
  if (!e) return undefined;
  if (e.status === 'cancelled') return 'cancelled';
  return e.validUpto < now ? 'expired' : 'generated';
}

function complianceOf(row: DocRow, e: EInvoiceRow | undefined, eway: EwayRow | undefined, now: Date): Compliance | undefined {
  const out = compact({
    eInvoiceStatus: e?.status,
    eInvoiceDocType: e?.docType,
    eInvoiceSupplyType: e?.supplyType,
    irn: e?.irn?.trim(),
    ackNo: e?.ackNo,
    ackDate: e?.ackDate,
    signedQrPayload: e?.signedQrPayload,
    irnGeneratedAt: iso(e?.generatedAt),
    irnCancelledAt: iso(e?.cancelledAt),
    irnCancelReasonCode: e?.cancelReasonCode,
    irnCancelRemark: e?.cancelRemark,
    eInvoiceIssues: (e?.issues as Schema<'ComplianceIssue'>[] | null) ?? undefined,
    ewayBillStatus: ewayStatus(eway, now),
    ewayBillId: eway?.id,
    ewayBillNumber: eway?.ewayBillNumber?.trim(),
    ewayBillValidUpto: iso(eway?.validUpto),
    lastMessage: row.complianceLastMessage,
    lastAttemptAt: iso(row.complianceLastAttemptAt ?? e?.lastAttemptAt),
  });
  return Object.keys(out).length ? out : undefined;
}

async function complianceRows(db: DbOrTx, rows: DocRow[]) {
  const ids = rows.map((r) => r.id);
  const ewayIds = rows.map((r) => r.currentEwayBillId).filter((x): x is string => !!x);
  // Sequential on purpose: `db` may be a transaction, which runs one query at a time.
  const einv = ids.length ? await db.select().from(schema.eInvoices).where(inArray(schema.eInvoices.documentId, ids)) : [];
  const eway = ewayIds.length
    ? await db
        .select({ id: schema.ewayBills.id, ewayBillNumber: schema.ewayBills.ewayBillNumber, validUpto: schema.ewayBills.validUpto, status: schema.ewayBills.status })
        .from(schema.ewayBills)
        .where(inArray(schema.ewayBills.id, ewayIds))
    : [];
  return { einv: new Map(einv.map((e) => [e.documentId, e])), eway: new Map(eway.map((e) => [e.id, e])) };
}

/** Full documents: lines, tax breakdown, attachments and compliance, batched. */
export async function documentsToWire(db: DbOrTx, rows: DocRow[], now: Date, baseCurrency: string): Promise<DocumentWire[]> {
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const TL = schema.documentTaxLines;
  const lines = await db.select().from(schema.documentLines).where(inArray(schema.documentLines.documentId, ids)).orderBy(schema.documentLines.position);
  const taxLines = await db.select().from(TL).where(inArray(TL.documentId, ids)).orderBy(TL.rate);
  const attachments = await db
    .select({ id: schema.attachments.id, entityId: schema.attachments.entityId })
    .from(schema.attachments)
    .where(and(eq(schema.attachments.entityType, 'document'), inArray(schema.attachments.entityId, ids)))
    .orderBy(schema.attachments.uploadedAt);
  const compliance = await complianceRows(db, rows);
  const components = taxLines.length
    ? await db.select().from(schema.documentTaxComponents).where(inArray(schema.documentTaxComponents.taxLineId, taxLines.map((t) => t.id))).orderBy(schema.documentTaxComponents.label)
    : [];
  const asOf = now.toISOString().slice(0, 10);

  return rows.map((row) => {
    const currency = row.currency.trim();
    const m = (minor: number) => money(minor, currency);
    const doc = compact({
      id: row.id,
      companyId: row.companyId,
      kind: row.kind,
      number: row.number,
      status: effectiveStatus(row, asOf),
      partyId: row.partyId,
      branchId: row.branchId,
      date: row.date,
      dueDate: row.dueDate,
      validUntil: row.validUntil,
      reference: row.reference,
      supplierDocNumber: row.supplierDocNumber,
      currency,
      exchangeRate: Number(row.exchangeRate),
      lines: lines
        .filter((l) => l.documentId === row.id)
        .map((l) => ({
          id: l.id,
          itemId: l.itemId,
          name: l.name,
          description: l.description,
          hsnCode: l.hsnCode,
          quantity: Number(l.quantity),
          unit: l.unit,
          unitPrice: m(l.unitPriceMinor),
          discountMode: l.discountMode,
          discountValue: Number(l.discountValue),
          taxCategoryId: l.taxCategoryId,
          taxRate: Number(l.taxRate),
          taxInclusive: l.taxInclusive,
        })),
      documentDiscountMode: row.documentDiscountMode,
      documentDiscountValue: Number(row.documentDiscountValue),
      charges: m(row.chargesMinor),
      applyRoundOff: row.applyRoundOff,
      placeOfSupplyStateCode: row.placeOfSupplyStateCode,
      notes: row.notes,
      terms: row.terms,
      attachmentIds: attachments.filter((a) => a.entityId === row.id).map((a) => a.id),
      sourceDocumentId: row.sourceDocumentId,
      totals: {
        subtotal: m(row.subtotalMinor),
        lineDiscount: m(row.lineDiscountMinor),
        documentDiscount: m(row.documentDiscountMinor),
        taxableAmount: m(row.taxableAmountMinor),
        taxLines: taxLines
          .filter((t) => t.documentId === row.id)
          .map((t) => ({
            categoryId: t.taxCategoryId,
            categoryName: t.categoryName,
            rate: Number(t.rate),
            taxableAmount: m(t.taxableAmountMinor),
            components: components
              .filter((c) => c.taxLineId === t.id)
              .map((c) => ({ type: c.type, label: c.label, rate: Number(c.rate), amount: m(c.amountMinor) })),
            totalTax: m(t.totalTaxMinor),
          })),
        totalTax: m(row.totalTaxMinor),
        charges: m(row.chargesMinor),
        roundOff: m(row.roundOffMinor),
        grandTotal: m(row.grandTotalMinor),
        grandTotalBase: money(row.grandTotalBaseMinor, baseCurrency),
      },
      compliance: complianceOf(row, compliance.einv.get(row.id), row.currentEwayBillId ? compliance.eway.get(row.currentEwayBillId) : undefined, now),
      createdBy: row.createdBy,
      ...versioned(row),
    });
    return doc as DocumentWire;
  });
}

export type SummaryRow = DocRow & { partyName: string };

/** The light row lists return. */
export async function summariesToWire(db: DbOrTx, rows: SummaryRow[], now: Date): Promise<Schema<'DocumentSummary'>[]> {
  const compliance = await complianceRows(db, rows);
  const asOf = now.toISOString().slice(0, 10);
  return rows.map((row) => {
    const currency = row.currency.trim();
    const status = effectiveStatus(row, asOf);
    const open = isPayableDocument(row.kind) && !['draft', 'cancelled'].includes(status);
    return compact({
      id: row.id,
      kind: row.kind,
      number: row.number,
      status,
      partyId: row.partyId,
      partyName: row.partyName,
      branchId: row.branchId,
      date: row.date,
      dueDate: row.dueDate,
      grandTotal: money(row.grandTotalMinor, currency),
      outstanding: money(open ? Math.max(row.grandTotalMinor - row.amountPaidMinor, 0) : 0, currency),
      eInvoiceStatus: compliance.einv.get(row.id)?.status,
      ewayBillStatus: ewayStatus(row.currentEwayBillId ? compliance.eway.get(row.currentEwayBillId) : undefined, now),
    });
  });
}

/** The same document as `@esmart/core` sees it, for the PDF template and the receivables engine. */
export function toCoreDocument(doc: DocumentWire): BusinessDocument {
  return { ...(doc as unknown as BusinessDocument), attachmentIds: doc.attachmentIds ?? [], createdAt: doc.createdAt ?? '', updatedAt: doc.updatedAt ?? '' };
}
