import { and, eq, gte, inArray, lt, lte, type SQL } from 'drizzle-orm';
import { mainHsnCodeOf, blockingIssues } from '@esmart/core/domain/eInvoice';
import {
  EWAY_PART_B_REASONS,
  EWAY_SUB_SUPPLY_TYPES,
  EWAY_TRANSPORT_MODES,
  EWAY_VEHICLE_TYPES,
  buildEwbPayload,
  canCancelEwayBill,
  canExtendEwayBill,
  canUpdatePartB,
  ewayBillStatusAt,
  ewayDocTypeFor,
  isEwayBillRequired,
  validPincode,
  validatePartA,
  validatePartB,
} from '@esmart/core/domain/ewayBill';
import { qrMatrix, qrSvgString } from '@esmart/core/lib/qr';
import type { EwayBill as CoreEwayBill } from '@esmart/core/types';
import { schema } from '@esmart/db';
import type { Schema } from '@esmart/api-contract';
import { RawBody, defineHandlers, type Ctx } from '../../context';
import { conflict, invalid, notFound, unprocessable } from '../../http/errors';
import { keyset } from '../../http/pagination';
import { recordChange, type DbOrTx } from '../../lib/audit';
import { newId } from '../../lib/ids';
import { notify } from '../../lib/notify';
import { compact, iso, money } from '../../lib/wire';
import {
  branchVisible,
  companyItems,
  coreDocument,
  findDocument,
  loadSettings,
  portalCredentials,
  portalRejected,
  resolveTransporter,
  settingsCore,
  touchDocument,
} from './shared';

const W = schema.ewayBills;
const PB = schema.ewayBillPartBUpdates;
const X = schema.ewayBillExtensions;
const D = schema.documents;

type BillRow = typeof W.$inferSelect;
type PartBRow = typeof PB.$inferSelect;
type ExtensionRow = typeof X.$inferSelect;
type Issue = Schema<'ComplianceIssue'>;
type AnyCtx = Pick<Ctx<'getEwayBill'>, 'company' | 'user' | 'db' | 'now' | 'deps' | 'req' | 'reply'>;

// ------------------------------------------------------------------ wire

const partBToWire = (p: PartBRow): Schema<'EwayBillPartBUpdate'> =>
  compact({
    id: p.id,
    mode: p.mode,
    vehicleNumber: p.vehicleNumber,
    vehicleType: p.vehicleType,
    transportDocNumber: p.transportDocNumber,
    transportDocDate: p.transportDocDate,
    fromPlace: p.fromPlace,
    fromStateCode: p.fromStateCode,
    reasonCode: p.reasonCode,
    remark: p.remark,
    updatedAt: iso(p.updatedAt),
    updatedBy: p.updatedBy,
  });

const extensionToWire = (x: ExtensionRow): Schema<'EwayBillExtension'> =>
  compact({
    id: x.id,
    remainingDistanceKm: x.remainingDistanceKm,
    reasonCode: x.reasonCode,
    remark: x.remark,
    transitType: x.transitType,
    currentPlace: x.currentPlace,
    currentPincode: x.currentPincode.trim(),
    currentStateCode: x.currentStateCode,
    extendedAt: iso(x.extendedAt),
    extendedBy: x.extendedBy,
    previousValidUpto: iso(x.previousValidUpto)!,
    newValidUpto: iso(x.newValidUpto)!,
  });

const place = (row: BillRow, side: 'from' | 'to'): Schema<'EwayPlace'> =>
  compact({
    legalName: row[`${side}LegalName`],
    gstin: row[`${side}Gstin`],
    address1: row[`${side}Address1`],
    address2: row[`${side}Address2`],
    place: row[`${side}Place`],
    pincode: row[`${side}Pincode`].trim(),
    stateCode: row[`${side}StateCode`],
  });

/** The bill as `@esmart/core` sees it; `status` is the stored one, so core can tell expired from active itself. */
function coreBill(row: BillRow, transporterGstin?: string): CoreEwayBill {
  const currency = row.currency.trim();
  return {
    id: row.id,
    companyId: row.companyId,
    branchId: row.branchId,
    ewayBillNumber: row.ewayBillNumber.trim(),
    documentId: row.documentId,
    documentKind: row.documentKind,
    documentNumber: row.documentNumber,
    documentDate: row.documentDate,
    partyId: row.partyId,
    docType: row.docType,
    supplyType: row.supplyType,
    subSupplyType: row.subSupplyType,
    subSupplyDescription: row.subSupplyDescription ?? undefined,
    transactionType: row.transactionType as 1 | 2 | 3 | 4,
    from: place(row, 'from'),
    to: place(row, 'to'),
    consignmentValue: money(row.consignmentValueMinor, currency),
    taxableValue: money(row.taxableValueMinor, currency),
    cgst: money(row.cgstMinor, currency),
    sgst: money(row.sgstMinor, currency),
    igst: money(row.igstMinor, currency),
    mainHsnCode: row.mainHsnCode ?? undefined,
    itemCount: row.itemCount,
    transporterId: transporterGstin,
    transporterName: row.transporterName ?? undefined,
    transportMode: row.transportMode,
    vehicleNumber: row.vehicleNumber ?? undefined,
    vehicleType: row.vehicleType,
    transportDocNumber: row.transportDocNumber ?? undefined,
    transportDocDate: row.transportDocDate ?? undefined,
    distanceKm: row.distanceKm,
    generatedAt: row.generatedAt.toISOString(),
    generatedBy: row.generatedBy,
    validFrom: row.validFrom.toISOString(),
    validUpto: row.validUpto.toISOString(),
    status: row.status,
    cancelledAt: iso(row.cancelledAt),
    cancelReasonCode: row.cancelReasonCode ?? undefined,
    cancelRemark: row.cancelRemark ?? undefined,
    partBUpdates: [],
    extensions: [],
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function transporterGstins(db: DbOrTx, rows: BillRow[]): Promise<Map<string, string>> {
  const ids = [...new Set(rows.map((r) => r.transporterId).filter((x): x is string => !!x))];
  if (!ids.length) return new Map();
  const found = await db.select({ id: schema.transporters.id, gstin: schema.transporters.transporterId }).from(schema.transporters).where(inArray(schema.transporters.id, ids));
  return new Map(found.map((t) => [t.id, t.gstin]));
}

/** Bills with their Part-B history and extensions. `transporterId` is the transporter's GSTIN, as the app shows it. */
export async function ewayBillsToWire(db: DbOrTx, rows: BillRow[], now: Date): Promise<Schema<'EwayBill'>[]> {
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const partB = await db.select().from(PB).where(inArray(PB.ewayBillId, ids)).orderBy(PB.updatedAt, PB.id);
  const extensions = await db.select().from(X).where(inArray(X.ewayBillId, ids)).orderBy(X.extendedAt, X.id);
  const gstins = await transporterGstins(db, rows);
  return rows.map((row) => {
    const core = coreBill(row, row.transporterId ? gstins.get(row.transporterId) : undefined);
    return compact({
      ...core,
      status: ewayBillStatusAt(core, now.toISOString()),
      partBUpdates: partB.filter((p) => p.ewayBillId === row.id).map(partBToWire),
      extensions: extensions.filter((x) => x.ewayBillId === row.id).map(extensionToWire),
    }) as Schema<'EwayBill'>;
  });
}

async function findBill(ctx: AnyCtx, db: DbOrTx, id: string, opts: { lock?: boolean } = {}): Promise<BillRow> {
  const q = db.select().from(W).where(and(eq(W.companyId, ctx.company.id), eq(W.id, id)));
  const [row] = opts.lock ? await q.for('update') : await q;
  if (!row || !branchVisible(ctx.user, row.branchId)) throw notFound('E-way bill');
  return row;
}

async function toWire(ctx: AnyCtx, db: DbOrTx, row: BillRow) {
  const [bill] = await ewayBillsToWire(db, [row], ctx.now);
  return bill;
}

/** The document's row, locked, with its version moved on (its compliance card changed). */
async function touchBillDocument(ctx: AnyCtx, tx: DbOrTx, bill: BillRow, patch: Parameters<typeof touchDocument>[4], action: string) {
  const [doc] = await tx.select().from(D).where(eq(D.id, bill.documentId)).for('update');
  if (doc) await touchDocument(tx, ctx.user, doc, ctx.now, patch, { action, after: bill.ewayBillNumber.trim() });
}

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const rupees = (m: { minor: number; currency: string }) => `${m.currency} ${(m.minor / 100).toFixed(2)}`;
/** Validity and timestamps print in IST, as the portal prints them. */
const ist = (s?: string) => (s ? `${new Date(new Date(s).getTime() + 330 * 60_000).toISOString().slice(0, 16).replace('T', ' ')} IST` : '');

/** A one-page e-way bill: number and QR, Part-A, Part-B history and validity. */
export function ewayBillHtml(bill: Schema<'EwayBill'>, companyName: string): string {
  const number = bill.ewayBillNumber ?? '';
  const qr = qrSvgString(qrMatrix(number), { size: 132 });
  const partyBlock = (label: string, p?: Schema<'EwayPlace'>) =>
    p ? `<td><b>${label}</b><br>${esc(p.legalName)}<br>GSTIN ${esc(p.gstin)}<br>${esc(p.address1)} ${esc(p.address2)}<br>${esc(p.place)} ${esc(p.pincode)} (state ${esc(p.stateCode)})</td>` : '';
  const row = (k: string, v: unknown) => `<tr><th>${k}</th><td>${esc(v)}</td></tr>`;
  const partB = (bill.partBUpdates ?? [])
    .map((p) => `<tr><td>${ist(p.updatedAt)}</td><td>${esc(EWAY_TRANSPORT_MODES[p.mode].label)}</td><td>${esc(p.vehicleNumber ?? p.transportDocNumber)}</td><td>${esc(p.fromPlace)}</td><td>${esc(EWAY_PART_B_REASONS[p.reasonCode])}</td></tr>`)
    .join('');
  return `<!doctype html><html><head><meta charset="utf-8"><title>E-way bill ${esc(number)}</title>
<style>body{font-family:Helvetica,Arial,sans-serif;font-size:12px;color:#111}table{border-collapse:collapse;width:100%;margin:8px 0}th,td{border:1px solid #bbb;padding:4px 6px;text-align:left;vertical-align:top}th{background:#f3f3f3;width:32%}h1{font-size:18px;margin:0}.head{display:flex;justify-content:space-between;align-items:center}</style></head>
<body><div class="head"><div><h1>E-Way Bill</h1><div>E-Way Bill No: <b>${esc(number)}</b></div><div>Generated by ${esc(companyName)} on ${ist(bill.generatedAt)}</div>
<div>Valid from ${ist(bill.validFrom)} to ${ist(bill.validUpto)}</div><div>Status: ${esc(bill.status)}</div></div><div>${qr}</div></div>
<h2>Part-A</h2><table>
${row('Document', `${bill.docType} ${bill.documentNumber} dated ${bill.documentDate}`)}
${row('Supply type', `${bill.supplyType} / ${bill.subSupplyType ? EWAY_SUB_SUPPLY_TYPES[bill.subSupplyType as keyof typeof EWAY_SUB_SUPPLY_TYPES].label : ''}${bill.subSupplyDescription ? ` (${bill.subSupplyDescription})` : ''}`)}
${row('Transaction type', bill.transactionType)}
${row('Value of goods', bill.consignmentValue ? rupees(bill.consignmentValue) : '')}
${row('Taxable value', bill.taxableValue ? rupees(bill.taxableValue) : '')}
${row('CGST / SGST / IGST', [bill.cgst, bill.sgst, bill.igst].map((m) => (m ? rupees(m) : '-')).join(' / '))}
${row('HSN code', bill.mainHsnCode)}${row('Items', bill.itemCount)}
</table><table><tr>${partyBlock('From', bill.from)}${partyBlock('To', bill.to)}</tr></table>
<h2>Part-B</h2><table>
${row('Transporter', [bill.transporterName, bill.transporterId].filter(Boolean).join(' · '))}
${row('Mode', bill.transportMode ? EWAY_TRANSPORT_MODES[bill.transportMode].label : '')}
${row('Vehicle', [bill.vehicleNumber, bill.vehicleType ? EWAY_VEHICLE_TYPES[bill.vehicleType].label : ''].filter(Boolean).join(' · '))}
${row('Transport document', [bill.transportDocNumber, bill.transportDocDate].filter(Boolean).join(' dated '))}
${row('Approximate distance', `${bill.distanceKm} km`)}
</table>
${partB ? `<table><tr><th>Updated</th><th>Mode</th><th>Vehicle / document</th><th>From</th><th>Reason</th></tr>${partB}</table>` : ''}
${bill.cancelledAt ? `<p><b>Cancelled</b> ${ist(bill.cancelledAt)}</p>` : ''}
</body></html>`;
}

// ------------------------------------------------------------------ handlers

/**
 * E-way bills: listEwayBills, generateEwayBill, getEwayBill, getEwayBillPdf,
 * updateEwayBillPartB, extendEwayBill, cancelEwayBill. Each mirrors the app's
 * store action: core decides whether a bill is needed, validates Part-A and
 * Part-B, and owns the validity, extension and cancellation windows.
 */
export const ewayHandlers = defineHandlers({
  async listEwayBills(ctx) {
    const q = ctx.query;
    const filters: (SQL | undefined)[] = [eq(W.companyId, ctx.company.id)];
    if (ctx.user.branchIds.length) filters.push(inArray(W.branchId, ctx.user.branchIds));
    if (q.branchId) filters.push(eq(W.branchId, q.branchId));
    if (q.documentId) filters.push(eq(W.documentId, q.documentId));
    // `expired` is derived: active in the table, past its validity on the clock.
    if (q.status === 'cancelled') filters.push(eq(W.status, 'cancelled'));
    if (q.status === 'active') filters.push(eq(W.status, 'active'), gte(W.validUpto, ctx.now));
    if (q.status === 'expired') filters.push(eq(W.status, 'active'), lt(W.validUpto, ctx.now));
    if (q.expiringWithinHours !== undefined) {
      filters.push(eq(W.status, 'active'), gte(W.validUpto, ctx.now), lte(W.validUpto, new Date(ctx.now.getTime() + q.expiringWithinHours * 3_600_000)));
    }
    if (q.from) filters.push(gte(W.generatedAt, new Date(`${q.from}T00:00:00Z`)));
    if (q.to) filters.push(lt(W.generatedAt, new Date(new Date(`${q.to}T00:00:00Z`).getTime() + 86_400_000)));
    const k = keyset({ cursor: q.cursor, limit: q.limit, sort: W.generatedAt, id: W.id, order: 'desc' });
    const rows = await ctx.db
      .select()
      .from(W)
      .where(and(...filters, k.where))
      .orderBy(...k.orderBy)
      .limit(k.take);
    return k.page(await ewayBillsToWire(ctx.db, rows.slice(0, k.take - 1), ctx.now), rows);
  },

  async generateEwayBill(ctx) {
    const input = ctx.body;
    const now = ctx.now.toISOString();
    const [exists] = await ctx.db.select({ id: D.id }).from(D).where(and(eq(D.companyId, ctx.company.id), eq(D.id, input.documentId)));
    if (!exists) throw invalid('documentId', 'No such document in this company');

    // Distance 0 asks for the portal's road distance between the two PIN codes, as NIC does.
    let distanceKm = input.distanceKm;
    if (distanceKm === 0 && !validPincode(input.from.pincode) && !validPincode(input.to.pincode)) {
      distanceKm = (await ctx.deps.providers.gstin.distance(input.from.pincode, input.to.pincode)).distanceKm;
    }

    const result = await ctx.db.transaction(async (tx) => {
      const doc = await findDocument(tx, ctx.company, ctx.user, input.documentId, { lock: true });
      const settings = await loadSettings(tx, ctx.company);
      const core = await coreDocument(tx, ctx.company, doc, ctx.now);
      const requirement = isEwayBillRequired({ document: core, items: await companyItems(tx, ctx.company.id), settings: settingsCore(settings) });
      if (!requirement.required) throw unprocessable([{ code: 'EWB001', field: 'documentId', message: requirement.reason, severity: 'blocking' }], 'EWAY_BILL_NOT_REQUIRED');
      if (doc.currentEwayBillId) {
        const [live] = await tx.select().from(W).where(eq(W.id, doc.currentEwayBillId));
        if (live && ewayBillStatusAt(coreBill(live), now) === 'active') {
          throw unprocessable([{ code: 'EWB002', field: 'documentId', message: `E-way bill ${live.ewayBillNumber.trim()} is still active for ${doc.number}; cancel it first`, severity: 'blocking' }], 'EWAY_BILL_EXISTS');
        }
      }

      const currency = core.totals.grandTotal.currency;
      const componentTotal = (type: 'CGST' | 'SGST' | 'IGST') =>
        core.totals.taxLines.flatMap((l) => l.components).filter((c) => c.type === type).reduce((acc, c) => acc + c.amount.minor, 0);
      const partA = validatePartA({
        from: input.from,
        to: input.to,
        subSupplyType: input.subSupplyType,
        subSupplyDescription: input.subSupplyDescription,
        documentNumber: core.number,
        documentDate: core.date,
        consignmentValueMinor: core.totals.grandTotal.minor,
        mainHsnCode: mainHsnCodeOf(core),
      });
      const partB = validatePartB({
        transportMode: input.transportMode,
        vehicleNumber: input.vehicleNumber,
        vehicleType: input.vehicleType,
        transporterId: input.transporterId,
        transportDocNumber: input.transportDocNumber,
        transportDocDate: input.transportDocDate,
        distanceKm,
        now,
      });
      const issues = [...partA, ...partB];
      const blocking = blockingIssues(issues);
      if (blocking.length) throw unprocessable(issues as Issue[], 'EWAY_BILL_VALIDATION_FAILED', blocking[0].message);

      const transporter = input.transporterId?.trim()
        ? await resolveTransporter(tx, ctx.user, ctx.company.id, input.transporterId.trim(), input.transporterName, 'transporterId')
        : undefined;
      const draft = {
        companyId: doc.companyId,
        branchId: doc.branchId,
        documentId: doc.id,
        documentKind: doc.kind,
        documentNumber: doc.number,
        documentDate: doc.date,
        partyId: doc.partyId,
        docType: ewayDocTypeFor(doc.kind),
        supplyType: 'outward' as const,
        subSupplyType: input.subSupplyType,
        subSupplyDescription: input.subSupplyDescription,
        transactionType: input.transactionType,
        from: input.from,
        to: input.to,
        consignmentValue: core.totals.grandTotal,
        taxableValue: core.totals.taxableAmount,
        cgst: { minor: componentTotal('CGST'), currency },
        sgst: { minor: componentTotal('SGST'), currency },
        igst: { minor: componentTotal('IGST'), currency },
        mainHsnCode: mainHsnCodeOf(core),
        itemCount: core.lines.length,
        transporterId: transporter?.transporterId,
        transporterName: input.transporterName ?? transporter?.name,
        transportMode: input.transportMode,
        vehicleNumber: input.vehicleNumber,
        vehicleType: input.vehicleType,
        transportDocNumber: input.transportDocNumber,
        transportDocDate: input.transportDocDate,
        distanceKm,
        generatedAt: now,
        generatedBy: ctx.user.id,
      };
      const payload = buildEwbPayload(draft);
      if (ctx.query.dryRun) return { issues, row: null };

      const creds = await portalCredentials(tx, ctx.deps.config, ctx.company);
      const response = await ctx.deps.providers.compliance.submitEwayBill(creds, { payload, vehicleType: input.vehicleType, now });
      if (!response.ok) throw portalRejected(response.errors, 'EWB_REJECTED');
      const [taken] = await tx.select({ id: W.id }).from(W).where(eq(W.ewayBillNumber, response.ewayBillNumber));
      if (taken) throw portalRejected([{ code: 'EWB_DUPLICATE', field: 'document', message: 'The portal returned an e-way bill number already on record', severity: 'blocking' }], 'EWB_REJECTED');

      const [bill] = await tx
        .insert(W)
        .values({
          id: newId('ewb'),
          companyId: doc.companyId,
          branchId: doc.branchId,
          ewayBillNumber: response.ewayBillNumber,
          documentId: doc.id,
          documentKind: doc.kind,
          documentNumber: doc.number,
          documentDate: doc.date,
          partyId: doc.partyId,
          docType: draft.docType,
          supplyType: 'outward',
          subSupplyType: input.subSupplyType,
          subSupplyDescription: input.subSupplyDescription ?? null,
          transactionType: input.transactionType,
          fromLegalName: input.from.legalName,
          fromGstin: input.from.gstin.trim().toUpperCase(),
          fromAddress1: input.from.address1,
          fromAddress2: input.from.address2 ?? null,
          fromPlace: input.from.place,
          fromPincode: input.from.pincode,
          fromStateCode: input.from.stateCode,
          toLegalName: input.to.legalName,
          toGstin: input.to.gstin.trim().toUpperCase(),
          toAddress1: input.to.address1,
          toAddress2: input.to.address2 ?? null,
          toPlace: input.to.place,
          toPincode: input.to.pincode,
          toStateCode: input.to.stateCode,
          currency,
          consignmentValueMinor: draft.consignmentValue.minor,
          taxableValueMinor: draft.taxableValue.minor,
          cgstMinor: draft.cgst.minor,
          sgstMinor: draft.sgst.minor,
          igstMinor: draft.igst.minor,
          mainHsnCode: draft.mainHsnCode ?? null,
          itemCount: draft.itemCount,
          transporterId: transporter?.id ?? null,
          transporterName: draft.transporterName ?? null,
          transportMode: input.transportMode,
          vehicleNumber: input.vehicleNumber ?? null,
          vehicleType: input.vehicleType,
          transportDocNumber: input.transportDocNumber ?? null,
          transportDocDate: input.transportDocDate ?? null,
          distanceKm,
          generatedAt: new Date(response.generatedAt),
          generatedBy: ctx.user.id,
          validFrom: new Date(response.validFrom),
          validUpto: new Date(response.validUpto),
          createdAt: ctx.now,
          updatedAt: ctx.now,
        })
        .returning();
      // The first Part-B entry is the one the bill was raised with.
      await tx.insert(PB).values({
        id: newId('ewp'),
        ewayBillId: bill.id,
        mode: input.transportMode,
        vehicleNumber: input.vehicleNumber ?? null,
        vehicleType: input.vehicleType,
        transportDocNumber: input.transportDocNumber ?? null,
        transportDocDate: input.transportDocDate ?? null,
        fromPlace: input.from.place,
        fromStateCode: input.from.stateCode,
        reasonCode: '1',
        updatedBy: ctx.user.id,
        updatedAt: ctx.now,
      });
      await recordChange(tx, ctx.user, { companyId: bill.companyId, action: 'generated e-way bill', entityType: 'eway_bill', entityId: bill.id, entityLabel: bill.ewayBillNumber, version: bill.version, after: { documentNumber: doc.number } });
      await touchDocument(tx, ctx.user, doc, ctx.now, { currentEwayBillId: bill.id }, { action: 'generated e-way bill', after: bill.ewayBillNumber });
      await notify(tx, ctx.deps, { companyId: bill.companyId, kind: 'compliance', title: `E-way bill ${bill.ewayBillNumber}`, body: `${doc.number} · valid until ${response.validUpto.slice(0, 10)}`, entityType: 'eway_bill', entityId: bill.id });
      return { issues, row: bill };
    });
    const out = { ok: true, issues: result.issues as Issue[] };
    return result.row ? { ...out, ewayBill: await toWire(ctx, ctx.db, result.row) } : out;
  },

  async getEwayBill(ctx) {
    return toWire(ctx, ctx.db, await findBill(ctx, ctx.db, ctx.params.id));
  },

  async getEwayBillPdf(ctx) {
    const bill = await toWire(ctx, ctx.db, await findBill(ctx, ctx.db, ctx.params.id));
    const pdf = await ctx.deps.providers.pdf.render(ewayBillHtml(bill, ctx.company.legalName ?? ctx.company.name));
    return new RawBody(pdf, 'application/pdf', `eway-bill-${bill.ewayBillNumber}.pdf`);
  },

  /** A new vehicle or leg; appended to the history. Not on a cancelled or expired bill. */
  async updateEwayBillPartB(ctx) {
    const u = ctx.body;
    const now = ctx.now.toISOString();
    const row = await ctx.db.transaction(async (tx) => {
      const bill = await findBill(ctx, tx, ctx.params.id, { lock: true });
      const allowed = canUpdatePartB(coreBill(bill), now);
      if (!allowed.allowed) throw conflict('EWAY_BILL_CLOSED', allowed.reason);
      const issues = validatePartB({
        transportMode: u.mode,
        vehicleNumber: u.vehicleNumber,
        vehicleType: u.vehicleType,
        transportDocNumber: u.transportDocNumber,
        transportDocDate: u.transportDocDate,
        distanceKm: bill.distanceKm,
        now,
      });
      if (blockingIssues(issues).length) throw unprocessable(issues as Issue[], 'EWAY_BILL_VALIDATION_FAILED', blockingIssues(issues)[0].message);

      const creds = await portalCredentials(tx, ctx.deps.config, ctx.company);
      const response = await ctx.deps.providers.compliance.updatePartB(creds, { ewayBillNumber: bill.ewayBillNumber.trim(), ...u, now });
      if (!response.ok) throw portalRejected(response.errors, 'EWB_REJECTED');

      await tx.insert(PB).values({
        id: newId('ewp'),
        ewayBillId: bill.id,
        mode: u.mode,
        vehicleNumber: u.vehicleNumber ?? null,
        vehicleType: u.vehicleType,
        transportDocNumber: u.transportDocNumber ?? null,
        transportDocDate: u.transportDocDate ?? null,
        fromPlace: u.fromPlace,
        fromStateCode: u.fromStateCode,
        reasonCode: u.reasonCode,
        remark: u.remark ?? null,
        updatedBy: ctx.user.id,
        updatedAt: ctx.now,
      });
      const [updated] = await tx
        .update(W)
        .set({
          transportMode: u.mode,
          vehicleNumber: u.vehicleNumber ?? null,
          vehicleType: u.vehicleType,
          transportDocNumber: u.transportDocNumber ?? null,
          transportDocDate: u.transportDocDate ?? null,
          version: bill.version + 1,
          updatedAt: ctx.now,
        })
        .where(eq(W.id, bill.id))
        .returning();
      await recordChange(tx, ctx.user, { companyId: bill.companyId, action: 'updated Part-B', entityType: 'eway_bill', entityId: bill.id, entityLabel: bill.ewayBillNumber.trim(), version: updated.version, after: { vehicleNumber: u.vehicleNumber ?? u.transportDocNumber } });
      return { updated, issues };
    });
    return { ok: true, issues: row.issues as Issue[], ewayBill: await toWire(ctx, ctx.db, row.updated) };
  },

  /** From eight hours before expiry to eight hours after; the new validity runs from now over the remaining distance. */
  async extendEwayBill(ctx) {
    const x = ctx.body;
    const now = ctx.now.toISOString();
    const pin = validPincode(x.currentPincode);
    if (pin) throw invalid('currentPincode', pin);
    const updated = await ctx.db.transaction(async (tx) => {
      const bill = await findBill(ctx, tx, ctx.params.id, { lock: true });
      const core = coreBill(bill);
      const window = canExtendEwayBill(core, now);
      if (!window.allowed) throw conflict('EWAY_EXTENSION_WINDOW', `${window.reason} (${window.opensAt} to ${window.closesAt})`);

      const creds = await portalCredentials(tx, ctx.deps.config, ctx.company);
      const response = await ctx.deps.providers.compliance.extend(creds, { bill: core, ...x, now });
      if (!response.ok) throw portalRejected(response.errors, 'EWB_REJECTED');

      await tx.insert(X).values({
        id: newId('ewx'),
        ewayBillId: bill.id,
        reasonCode: x.reasonCode,
        remark: x.remark ?? null,
        transitType: x.transitType,
        currentPlace: x.currentPlace,
        currentPincode: x.currentPincode,
        currentStateCode: x.currentStateCode,
        remainingDistanceKm: x.remainingDistanceKm,
        previousValidUpto: bill.validUpto,
        newValidUpto: new Date(response.newValidUpto),
        extendedBy: ctx.user.id,
        extendedAt: ctx.now,
      });
      const [next] = await tx
        .update(W)
        .set({ validUpto: new Date(response.newValidUpto), version: bill.version + 1, updatedAt: ctx.now })
        .where(eq(W.id, bill.id))
        .returning();
      await recordChange(tx, ctx.user, { companyId: bill.companyId, action: 'extended e-way bill', entityType: 'eway_bill', entityId: bill.id, entityLabel: bill.ewayBillNumber.trim(), version: next.version, before: bill.validUpto.toISOString(), after: response.newValidUpto });
      await touchBillDocument(ctx, tx, next, {}, 'extended e-way bill');
      await notify(tx, ctx.deps, { companyId: bill.companyId, kind: 'compliance', title: 'E-way bill extended', body: `${bill.ewayBillNumber.trim()} now runs to ${response.newValidUpto.slice(0, 10)}`, entityType: 'eway_bill', entityId: bill.id });
      return next;
    });
    return { ok: true, issues: [], ewayBill: await toWire(ctx, ctx.db, updated) };
  },

  /** Within 24 hours of generation. */
  async cancelEwayBill(ctx) {
    const { reasonCode, remark } = ctx.body;
    const now = ctx.now.toISOString();
    await ctx.db.transaction(async (tx) => {
      const bill = await findBill(ctx, tx, ctx.params.id, { lock: true });
      const allowed = canCancelEwayBill(coreBill(bill), now);
      if (!allowed.allowed) throw conflict(bill.status === 'cancelled' ? 'EWAY_BILL_CANCELLED' : 'EWAY_CANCEL_WINDOW_CLOSED', allowed.reason);

      const creds = await portalCredentials(tx, ctx.deps.config, ctx.company);
      const response = await ctx.deps.providers.compliance.cancelEwayBill(creds, { ewayBillNumber: bill.ewayBillNumber.trim(), reasonCode, remark, now });
      if (!response.ok) throw portalRejected(response.errors, 'EWB_REJECTED');

      const [next] = await tx
        .update(W)
        .set({ status: 'cancelled', cancelledAt: ctx.now, cancelReasonCode: reasonCode, cancelRemark: remark?.slice(0, 100) ?? null, version: bill.version + 1, updatedAt: ctx.now })
        .where(eq(W.id, bill.id))
        .returning();
      await recordChange(tx, ctx.user, { companyId: bill.companyId, action: 'cancelled e-way bill', entityType: 'eway_bill', entityId: bill.id, entityLabel: bill.ewayBillNumber.trim(), version: next.version, after: response.reason });
      await touchBillDocument(ctx, tx, next, {}, 'cancelled e-way bill');
      await notify(tx, ctx.deps, { companyId: bill.companyId, kind: 'compliance', title: 'E-way bill cancelled', body: `${bill.ewayBillNumber.trim()} · ${response.reason}`, entityType: 'eway_bill', entityId: bill.id });
    });
    return { ok: true, issues: [] };
  },
});

