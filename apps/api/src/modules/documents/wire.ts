import { businessDate } from '@esmart/core/lib/date';
import { and, eq, inArray } from 'drizzle-orm';
import type { Schema } from '@esmart/api-contract';
import { isPayableDocument } from '@esmart/core/domain/documentStates';
import { taxedCharges } from '@esmart/core/domain/lineCalc';
import type { BusinessDocument } from '@esmart/core/types';
import { schema } from '@esmart/db';
import type { DbOrTx } from '../../lib/audit';
import { compact, gstFlagsFrom, iso, money, versioned } from '../../lib/wire';
import type { DocRow } from './engine';
import { effectiveStatus } from './lifecycle';

type Compliance = Schema<'ComplianceInfo'>;

/** Tax components in the order an invoice prints them: centre and state, or integrated, then cess. */
const TAX_ORDER: string[] = ['CGST', 'SGST', 'IGST', 'VAT', 'GST', 'CESS', 'NONE'];
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

/** A stored bill of entry on the wire: amounts in base currency, as customs assessed them. */
function boeToWire(raw: unknown, base: string): Schema<'BusinessDocument'>['billOfEntry'] {
  const b = raw as { number: string; date: string; portCode: string; assessableMinor: number; igstMinor: number; cessMinor: number } | null;
  if (!b) return undefined;
  return { number: b.number, date: b.date, portCode: b.portCode, assessableValue: money(b.assessableMinor, base), igst: money(b.igstMinor, base), cess: b.cessMinor ? money(b.cessMinor, base) : undefined };
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
  const asOf = businessDate(now);

  return rows.map((row) => {
    const currency = row.currency.trim();
    const m = (minor: number) => money(minor, currency);
    // Charges taxed with the lines (RULES 1.10) are in the taxable value: the totals carry only what is left after tax.
    const taxed = taxedCharges({
      date: row.date,
      currency,
      charges: m(row.chargesMinor),
      lines: lines.filter((l) => l.documentId === row.id).map((l) => ({
        id: l.id, name: l.name, quantity: Number(l.quantity), unit: l.unit, unitPrice: m(l.unitPriceMinor), discountMode: l.discountMode,
        discountValue: Number(l.discountValue), taxCategoryId: l.taxCategoryId, taxRate: Number(l.taxRate), taxInclusive: l.taxInclusive, gst: gstFlagsFrom(l),
      })),
    }).minor;
    const untaxedCharges = row.chargesMinor - taxed;
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
          gst: gstFlagsFrom(l),
          expenseId: l.expenseId ?? undefined,
          costCentreId: l.costCentreId ?? undefined,
        })),
      documentDiscountMode: row.documentDiscountMode,
      documentDiscountValue: Number(row.documentDiscountValue),
      charges: m(row.chargesMinor),
      chargesKind: (row.chargesKind ?? undefined) as DocumentWire['chargesKind'],
      shipTo: (row.shipTo ?? undefined) as DocumentWire['shipTo'],
      applyRoundOff: row.applyRoundOff,
      roundOffManual: row.roundOffManualMinor !== null ? m(row.roundOffManualMinor) : undefined,
      placeOfSupplyStateCode: row.placeOfSupplyStateCode,
      reverseCharge: row.reverseCharge || undefined,
      partyGstin: row.partyGstin,
      partyStateCode: row.partyStateCode,
      notes: row.notes,
      terms: row.terms,
      attachmentIds: attachments.filter((a) => a.entityId === row.id).map((a) => a.id),
      sourceDocumentId: row.sourceDocumentId,
      mergedSourceIds: row.mergedSourceIds?.length ? row.mergedSourceIds : undefined,
      noteReason: row.noteReason,
      noteGst: row.noteGst as DocumentWire['noteGst'],
      crossBorderTax: (row.crossBorderTax ?? undefined) as DocumentWire['crossBorderTax'],
      originalNumber: row.originalNumber,
      originalDate: row.originalDate,
      billOfEntry: boeToWire(row.billOfEntry, baseCurrency),
      isdInvoice: row.isdInvoice || undefined,
      // On a bill, what was kept back; on an invoice, what the customer is expected to deduct (not settled).
      tds: row.kind !== 'invoice' && row.tdsSection && row.tdsAmountMinor ? { section: row.tdsSection as Schema<'TdsSectionCode'>, rate: Number(row.tdsRate), amount: m(row.tdsAmountMinor) } : undefined,
      tdsExpected: row.kind === 'invoice' && row.tdsSection && row.tdsAmountMinor ? { section: row.tdsSection as Schema<'TdsSectionCode'>, rate: Number(row.tdsRate), amount: m(row.tdsAmountMinor) } : undefined,
      selfInvoiceNumber: row.selfInvoiceNumber,
      itcReversedOn: row.itcReversedOn,
      itcReclaimedOn: row.itcReclaimedOn,
      itcClaimPeriod: row.itcClaimPeriod,
      costCentreId: row.costCentreId,
      customFields: row.customFields as Record<string, unknown>,
      vehicleId: row.vehicleId ?? undefined,
      transporterId: row.transporterId ?? undefined,
      approval: (row.approval as DocumentWire['approval']) ?? undefined,
      tcs: row.tcsSection && row.tcsRate ? { section: row.tcsSection, rate: Number(row.tcsRate) } : undefined,
      tcsSection: row.tcsSection ?? undefined,
      recurrence: row.recurrence,
      nextRecurrenceDate: row.nextRecurrenceDate,
      recurrenceEndDate: row.recurrenceEndDate,
      recurrenceAutoSend: row.recurrence !== 'none' ? row.recurrenceAutoSend : undefined,
      recurringParentId: row.recurringParentId,
      printLayout: (row.printLayout as DocumentWire['printLayout']) ?? undefined,
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
            reverseCharge: t.reverseCharge || undefined,
            taxableAmount: m(t.taxableAmountMinor),
            components: components
              .filter((c) => c.taxLineId === t.id)
              .sort((a, b) => TAX_ORDER.indexOf(a.type) - TAX_ORDER.indexOf(b.type))
              .map((c) => ({ type: c.type, label: c.label, rate: Number(c.rate), amount: m(c.amountMinor) })),
            totalTax: m(t.totalTaxMinor),
          })),
        totalTax: m(row.totalTaxMinor),
        reverseChargeTax: m(row.reverseChargeTaxMinor),
        // What the grand total holds beyond the goods, tax, charges and rounding is the TCS collected.
        ...(row.tcsRate && { tcs: m(row.grandTotalMinor - row.roundOffMinor - (row.taxableAmountMinor + row.totalTaxMinor - row.documentDiscountMinor + row.reimbursementsMinor + untaxedCharges)) }),
        reimbursements: m(row.reimbursementsMinor),
        charges: m(untaxedCharges),
        ...(taxed && { chargesTaxed: m(taxed) }),
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
  const asOf = businessDate(now);
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
      supplierDocNumber: row.supplierDocNumber,
      itcClaimPeriod: row.itcClaimPeriod,
      grandTotal: money(row.grandTotalMinor, currency),
      exchangeRate: Number(row.exchangeRate),
      totalTax: money(row.totalTaxMinor, currency),
      outstanding: money(open ? Math.max(row.grandTotalMinor - row.amountPaidMinor, 0) : 0, currency),
      // An invoice's expected TDS, so the receipt that allocates to it can take it as deducted.
      tdsExpected: row.kind === 'invoice' && row.tdsSection && row.tdsAmountMinor ? { section: row.tdsSection as Schema<'TdsSectionCode'>, rate: Number(row.tdsRate), amount: money(row.tdsAmountMinor, currency) } : undefined,
      eInvoiceStatus: compliance.einv.get(row.id)?.status,
      irn: compliance.einv.get(row.id)?.irn?.trim(),
      ewayBillStatus: ewayStatus(row.currentEwayBillId ? compliance.eway.get(row.currentEwayBillId) : undefined, now),
    });
  });
}

/** The same document as `@esmart/core` sees it, for the PDF template and the receivables engine. */
export function toCoreDocument(doc: DocumentWire): BusinessDocument {
  return { ...(doc as unknown as BusinessDocument), attachmentIds: doc.attachmentIds ?? [], createdAt: doc.createdAt ?? '', updatedAt: doc.updatedAt ?? '' };
}
