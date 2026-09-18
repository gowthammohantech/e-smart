import {
  Attachment,
  AuditEvent,
  AppNotification,
  BusinessDocument,
  Company,
  DocStatus,
  DocumentKind,
  DocumentLine,
  Item,
  NumberingSeries,
  Party,
  Payment,
  PaymentMethod,
  TaxCategory,
} from '@/types';
import { Money, fromMajor, money, zero } from '@/lib/money';
import { addDaysISO, nowISO, today } from '@/lib/date';
import { calculateDocument } from '@/domain/lineCalc';
import { formatNumber } from '@/domain/numbering';
import { uid } from '@/lib/id';
import { eInvoiceApplicability } from '@/domain/gst/applicability';
import { buildEInvoicePayload } from '@/domain/gst/einvoice/buildPayload';
import { IrpAckRecord, createMockIrp } from '@/domain/gst/einvoice/mockIrp';
import { buildPartA } from '@/domain/gst/eway/buildPartA';
import { ewbApplicability } from '@/domain/gst/eway/applicability';
import { createMockEwb } from '@/domain/gst/eway/mockEwb';
import { PRIMARY_COMPANY_ID, SECOND_COMPANY_ID, CURRENT_USER_ID } from './seed';
import { makeRng } from './rng';

const rng = makeRng(77712345);

function daysAgo(n: number): string {
  return addDaysISO(today(), -n);
}

type BuildArgs = {
  items: Item[];
  parties: Party[];
  taxCategories: TaxCategory[];
  series: NumberingSeries[];
  companies: Company[];
};

function seriesFor(series: NumberingSeries[], companyId: string, kind: NumberingSeries['kind']) {
  return series.find((s) => s.companyId === companyId && s.kind === kind)!;
}

function buildLines(items: Item[], count: number, rand: ReturnType<typeof makeRng>): DocumentLine[] {
  const chosen: Item[] = [];
  while (chosen.length < count) {
    const it = rand.pick(items);
    if (!chosen.find((c) => c.id === it.id)) chosen.push(it);
  }
  return chosen.map((item) => {
    const qty = item.type === 'service' ? rand.int(1, 4) : rand.int(1, 24);
    const discount = rand.bool(0.25) ? rand.int(2, 10) : 0;
    return {
      id: uid('ln'),
      itemId: item.id,
      name: item.name,
      hsnCode: item.hsnCode,
      quantity: qty,
      unit: item.unit,
      unitPrice: item.salePrice,
      discountMode: 'percent' as const,
      discountValue: discount,
      taxCategoryId: item.taxCategoryId,
      taxRate: Number(item.taxCategoryId.replace('tax_', '')) || 0,
      taxInclusive: false,
    };
  });
}

function totalsFor(
  lines: DocumentLine[],
  currency: string,
  taxCategories: TaxCategory[],
  homeState: string,
  placeOfSupply: string,
  applyRoundOff: boolean,
) {
  return calculateDocument({
    lines,
    currency,
    documentDiscountMode: 'percent',
    documentDiscountValue: 0,
    charges: zero(currency),
    applyRoundOff,
    taxCategories,
    taxContext: {
      regime: 'GST',
      homeStateCode: homeState,
      placeOfSupplyStateCode: placeOfSupply,
      registered: true,
    },
  });
}

export function seedDocuments({ items, parties, taxCategories, series, companies }: BuildArgs): BusinessDocument[] {
  const docs: BusinessDocument[] = [];
  const customers = parties.filter((p) => p.companyId === PRIMARY_COMPANY_ID);
  const sellable = items.filter((i) => i.companyId === PRIMARY_COMPANY_ID && i.status === 'active');
  const goods = sellable.filter((i) => i.type === 'goods');
  const counters: Record<string, number> = {};

  const nextNumber = (companyId: string, kind: NumberingSeries['kind'], date: string) => {
    const key = `${companyId}:${kind}`;
    counters[key] = (counters[key] ?? 0) + 1;
    return formatNumber(seriesFor(series, companyId, kind), { date, sequence: counters[key] });
  };

  const mkDoc = (
    kind: DocumentKind,
    party: Party,
    status: DocStatus,
    date: string,
    lines: DocumentLine[],
    opts: { dueDays?: number; branchId?: string; companyId?: string; validDays?: number; sourceId?: string } = {},
  ): BusinessDocument => {
    const companyId = opts.companyId ?? PRIMARY_COMPANY_ID;
    const currency = 'INR';
    const homeState = companyId === PRIMARY_COMPANY_ID ? '27' : '29';
    const pos = party.billingAddress.stateCode ?? homeState;
    const totals = totalsFor(lines, currency, taxCategories, homeState, pos, true);
    return {
      id: uid(kind),
      companyId,
      branchId: opts.branchId ?? (companyId === PRIMARY_COMPANY_ID ? 'brn_mum' : 'brn_blr'),
      kind,
      number: nextNumber(companyId, kind, date),
      status,
      partyId: party.id,
      date,
      dueDate: opts.dueDays !== undefined ? addDaysISO(date, opts.dueDays) : undefined,
      validUntil: opts.validDays !== undefined ? addDaysISO(date, opts.validDays) : undefined,
      lines,
      documentDiscountMode: 'percent',
      documentDiscountValue: 0,
      charges: zero(currency),
      applyRoundOff: true,
      placeOfSupplyStateCode: pos,
      notes: undefined,
      terms: kind === 'invoice' ? 'Goods once sold will not be taken back. Interest @18% p.a. on overdue amounts.' : undefined,
      attachmentIds: [],
      sourceDocumentId: opts.sourceId,
      totals,
      // Compliance is filled in below by running the finished documents
      // through the mock portals, rather than invented here.
      createdBy: CURRENT_USER_ID,
      createdAt: `${date}T09:${String(rng.int(10, 59)).padStart(2, '0')}:00.000Z`,
      updatedAt: `${date}T09:${String(rng.int(10, 59)).padStart(2, '0')}:00.000Z`,
    };
  };

  // --- Invoices spread across every aging bucket and status ---------
  const invoicePlan: { days: number; status: DocStatus; terms: number }[] = [
    { days: 0, status: 'draft', terms: 30 },
    { days: 1, status: 'issued', terms: 30 },
    { days: 2, status: 'issued', terms: 15 },
    { days: 4, status: 'partiallyPaid', terms: 30 },
    { days: 5, status: 'issued', terms: 30 },
    { days: 6, status: 'paid', terms: 7 },
    { days: 8, status: 'paid', terms: 15 },
    { days: 9, status: 'issued', terms: 30 },
    { days: 11, status: 'paid', terms: 15 },
    { days: 12, status: 'paid', terms: 15 },
    { days: 14, status: 'issued', terms: 30 },
    { days: 15, status: 'partiallyPaid', terms: 7 },
    { days: 17, status: 'paid', terms: 30 },
    { days: 20, status: 'overdue', terms: 15 },
    { days: 26, status: 'paid', terms: 30 },
    { days: 33, status: 'overdue', terms: 15 },
    { days: 41, status: 'overdue', terms: 21 },
    { days: 48, status: 'paid', terms: 30 },
    { days: 55, status: 'overdue', terms: 15 },
    { days: 63, status: 'partiallyPaid', terms: 30 },
    { days: 72, status: 'overdue', terms: 30 },
    { days: 84, status: 'paid', terms: 45 },
    { days: 96, status: 'overdue', terms: 30 },
    { days: 105, status: 'paid', terms: 30 },
    { days: 110, status: 'overdue', terms: 15 },
    { days: 118, status: 'paid', terms: 30 },
    { days: 125, status: 'paid', terms: 30 },
    { days: 133, status: 'paid', terms: 30 },
    { days: 140, status: 'paid', terms: 30 },
    { days: 148, status: 'paid', terms: 45 },
    { days: 155, status: 'paid', terms: 45 },
    { days: 163, status: 'paid', terms: 30 },
    { days: 170, status: 'paid', terms: 30 },
    { days: 178, status: 'paid', terms: 30 },
    { days: 185, status: 'cancelled', terms: 30 },
  ];

  invoicePlan.forEach((plan, i) => {
    const party = customers[i % customers.length];
    const lines = buildLines(sellable, rng.int(1, 5), rng);
    docs.push(
      mkDoc('invoice', party, plan.status, daysAgo(plan.days), lines, {
        dueDays: plan.terms,
        branchId: i % 4 === 3 ? 'brn_pun' : 'brn_mum',
      }),
    );
  });

  // An SEZ supply, so the SEZ branch of the payload has a document.
  const sezCustomer = parties.find((p) => p.id === 'cus_13')!;
  docs.push(
    mkDoc('invoice', sezCustomer, 'issued', daysAgo(6), buildLines(goods, 3, rng), { dueDays: 30 }),
  );

  // --- Quotations ---------------------------------------------------
  const quoteStatuses: DocStatus[] = ['draft', 'sent', 'sent', 'accepted', 'rejected', 'expired', 'accepted', 'sent'];
  quoteStatuses.forEach((status, i) => {
    const party = customers[(i + 3) % customers.length];
    docs.push(
      mkDoc('quote', party, status, daysAgo(i * 7 + 2), buildLines(sellable, rng.int(2, 4), rng), { validDays: 15 }),
    );
  });

  // --- Sales orders --------------------------------------------------
  const soStatuses: DocStatus[] = ['draft', 'confirmed', 'confirmed', 'fulfilled', 'cancelled', 'confirmed'];
  soStatuses.forEach((status, i) => {
    const party = customers[(i + 1) % customers.length];
    docs.push(mkDoc('salesOrder', party, status, daysAgo(i * 9 + 3), buildLines(sellable, rng.int(1, 4), rng), { dueDays: 14 }));
  });

  // --- Delivery notes -------------------------------------------------
  (['draft', 'delivered', 'delivered', 'cancelled'] as DocStatus[]).forEach((status, i) => {
    const party = customers[(i + 5) % customers.length];
    docs.push(mkDoc('delivery', party, status, daysAgo(i * 6 + 1), buildLines(goods, 2, rng)));
  });

  // --- Sales returns --------------------------------------------------
  (['requested', 'approved', 'processed'] as DocStatus[]).forEach((status, i) => {
    const party = customers[(i + 2) % customers.length];
    docs.push(mkDoc('salesReturn', party, status, daysAgo(i * 11 + 5), buildLines(goods, 1, rng)));
  });

  // --- Second company (isolation demo) ---------------------------------
  const auroraCustomer = parties.find((p) => p.id === 'cus_a1')!;
  const auroraItem = items.find((i) => i.id === 'itm_a1')!;
  const auroraLines: DocumentLine[] = [
    {
      id: uid('ln'),
      itemId: auroraItem.id,
      name: auroraItem.name,
      hsnCode: auroraItem.hsnCode,
      quantity: 1,
      unit: 'NOS',
      unitPrice: auroraItem.salePrice,
      discountMode: 'percent',
      discountValue: 0,
      taxCategoryId: 'tax_18_a',
      taxRate: 18,
      taxInclusive: false,
    },
  ];
  docs.push(
    mkDoc('invoice', auroraCustomer, 'issued', daysAgo(12), auroraLines, {
      dueDays: 30,
      companyId: SECOND_COMPANY_ID,
      branchId: 'brn_blr',
    }),
  );
  docs.push(
    mkDoc('quote', auroraCustomer, 'sent', daysAgo(5), auroraLines, {
      validDays: 21,
      companyId: SECOND_COMPANY_ID,
      branchId: 'brn_blr',
    }),
  );

  return applyCompliance(docs, { parties, items, companies });
}

/**
 * Register the seeded documents with the mock portals.
 *
 * The seed does not invent IRNs. It runs the finished invoices through the
 * same code path the app uses, so every seeded IRN verifies, every Ack date
 * sits inside or outside the cancellation window on purpose, and the QR on a
 * seeded invoice scans back to its own payload.
 */
function applyCompliance(
  docs: BusinessDocument[],
  ctx: { parties: Party[]; items: Item[]; companies: Company[] },
): BusinessDocument[] {
  const activeIrns = new Map<string, IrpAckRecord>();
  const activeBills = new Map<string, { ewbDate: string; validUpto: string; documentId: string }>();

  // A deliberately broken GSTIN on one customer, so the rejection path has a
  // document of its own.
  const brokenGstinCustomerId = 'cus_7';

  return docs.map((doc, index) => {
    const company = ctx.companies.find((c) => c.id === doc.companyId);
    const party = ctx.parties.find((p) => p.id === doc.partyId);
    if (!company || !party) return doc;

    const items = ctx.items.filter((i) => i.companyId === doc.companyId);
    const applicability = eInvoiceApplicability({ company, party, doc });
    if (!applicability.applicable) {
      return {
        ...doc,
        compliance: {
          eInvoice: { status: 'notApplicable' as const, errors: [{ code: '0', message: applicability.reason }] },
        },
      };
    }

    // The IRP will not accept a document older than thirty days, exactly as
    // the real one will not — so the older seeded invoices stay unregistered.
    const ackAt = new Date(`${doc.date}T10:00:00.000Z`);
    const irp = createMockIrp({ now: () => ackAt, activeIrns });

    const effectiveParty =
      party.id === brokenGstinCustomerId ? { ...party, taxId: `${party.taxId?.slice(0, 14)}X` } : party;

    const payload = buildEInvoicePayload({ company, party: effectiveParty, doc, items });
    const result = irp.generate({ payload, documentId: doc.id });

    if (!result.ok) {
      return { ...doc, compliance: { eInvoice: { status: 'failed' as const, errors: result.errors } } };
    }

    activeIrns.set(result.irn, { ackDate: result.ackDate, documentId: doc.id });

    // One registered invoice is cancelled, to show the withdrawn state.
    const cancelThisOne = index % 17 === 5;
    if (cancelThisOne) {
      const cancel = irp.cancel({ irn: result.irn, reasonCode: '2' });
      if (cancel.ok) {
        activeIrns.set(result.irn, { ackDate: result.ackDate, documentId: doc.id, cancelled: true });
        return {
          ...doc,
          compliance: {
            eInvoice: {
              status: 'cancelled' as const,
              irn: result.irn,
              ackNo: result.ackNo,
              ackDate: result.ackDate,
              signedQrPayload: result.signedQrCode,
              generatedAt: ackAt.toISOString(),
              cancelledAt: cancel.cancelledAt,
              cancelReasonCode: '2' as const,
            },
          },
        };
      }
    }

    const compliance: BusinessDocument['compliance'] = {
      eInvoice: {
        status: 'generated',
        irn: result.irn,
        ackNo: result.ackNo,
        ackDate: result.ackDate,
        signedQrPayload: result.signedQrCode,
        generatedAt: ackAt.toISOString(),
      },
    };

    // Give the goods invoices over the threshold a live e-way bill.
    const withEwb = { ...doc, compliance };
    const ewbNeeded = ewbApplicability({ company, party, doc: withEwb, items });
    if (ewbNeeded.applicable && index % 5 === 1) {
      const generatedAt = new Date(Date.now() - 6 * 3_600_000);
      const ewb = createMockEwb({ now: () => generatedAt, activeBills });
      const distanceKm = 120 + ((index * 37) % 480);
      const partA = buildPartA({ company, party, doc: withEwb, items });
      const partB = {
        transMode: '1' as const,
        vehicleNo: `MH12AB${String(1000 + (index % 9000))}`,
        vehicleType: 'R' as const,
        transporterId: undefined,
      };
      const generated = ewb.generate({ partA, partB, distanceKm, cargo: 'regular', documentId: doc.id });
      if (generated.ok) {
        activeBills.set(generated.ewbNo, {
          ewbDate: generated.ewbDate,
          validUpto: generated.validUpto,
          documentId: doc.id,
        });
        compliance.eWayBill = {
          status: 'generated',
          ewbNo: generated.ewbNo,
          ewbDate: generated.ewbDate,
          validUpto: generated.validUpto,
          distanceKm,
          cargo: 'regular',
          partA,
          partB,
          generatedAt: generatedAt.toISOString(),
        };
      }
    }

    return { ...doc, compliance };
  });
}

/* ------------------------------------------------------------------ */
/* Payments derived from the invoice statuses                          */
/* ------------------------------------------------------------------ */

export function seedPayments(docs: BusinessDocument[], series: NumberingSeries[]): Payment[] {
  const payments: Payment[] = [];
  const counters: Record<string, number> = {};
  const methods: PaymentMethod[] = ['upi', 'bank', 'cash', 'cheque', 'card'];

  const nextNumber = (companyId: string, date: string) => {
    counters[companyId] = (counters[companyId] ?? 0) + 1;
    const s = series.find((x) => x.companyId === companyId && x.kind === 'payment')!;
    return formatNumber(s, { date, sequence: counters[companyId] });
  };

  const payable = docs.filter((d) => d.kind === 'invoice');

  payable.forEach((doc, i) => {
    const currency = doc.totals.grandTotal.currency;
    let amount: Money | null = null;

    if (doc.status === 'paid') {
      amount = doc.totals.grandTotal;
    } else if (doc.status === 'partiallyPaid') {
      amount = money(Math.round(doc.totals.grandTotal.minor * 0.4), currency);
    }
    if (!amount || amount.minor <= 0) return;

    const payDate = addDaysISO(doc.date, rng.int(1, 12));
    const clamped = payDate > today() ? today() : payDate;
    payments.push({
      id: uid('pay'),
      companyId: doc.companyId,
      branchId: doc.branchId,
      number: nextNumber(doc.companyId, clamped),
      partyId: doc.partyId,
      date: clamped,
      amount,
      method: methods[i % methods.length],
      reference: i % 3 === 0 ? `UTR${rng.int(100000000, 999999999)}` : undefined,
      accountId: doc.companyId === PRIMARY_COMPANY_ID ? (i % 4 === 0 ? 'acc_cash' : 'acc_hdfc') : 'acc_a_bank',
      allocations: [{ documentId: doc.id, documentNumber: doc.number, amount }],
      unallocated: zero(currency),
      notes: undefined,
      attachmentIds: [],
      createdBy: CURRENT_USER_ID,
      createdAt: `${clamped}T11:20:00.000Z`,
    });
  });

  // An unallocated advance, so the allocation UI has something to work with.
  payments.push({
    id: uid('pay'),
    companyId: PRIMARY_COMPANY_ID,
    branchId: 'brn_mum',
    number: nextNumber(PRIMARY_COMPANY_ID, daysAgo(4)),
    partyId: 'cus_2',
    date: daysAgo(4),
    amount: fromMajor(50000, 'INR'),
    method: 'bank',
    reference: 'ADV-2026-07',
    accountId: 'acc_hdfc',
    allocations: [],
    unallocated: fromMajor(50000, 'INR'),
    notes: 'Advance against upcoming order.',
    attachmentIds: [],
    createdBy: CURRENT_USER_ID,
    createdAt: `${daysAgo(4)}T15:05:00.000Z`,
  });

  return payments;
}

/* ------------------------------------------------------------------ */
/* Notifications                                                       */
/* ------------------------------------------------------------------ */

export function seedNotifications(docs: BusinessDocument[], payments: Payment[]): AppNotification[] {
  const out: AppNotification[] = [];
  const overdue = docs.filter((d) => d.kind === 'invoice' && d.status === 'overdue').slice(0, 4);
  const recentPayments = payments.slice(-3);

  overdue.forEach((d, i) => {
    out.push({
      id: uid('ntf'),
      companyId: d.companyId,
      kind: 'invoiceOverdue',
      title: `${d.number} is overdue`,
      body: `Payment was due on ${d.dueDate}. Send a reminder to keep the follow-up moving.`,
      entityType: 'invoice',
      entityId: d.id,
      read: i > 1,
      createdAt: `${d.dueDate}T09:00:00.000Z`,
    });
  });

  recentPayments.forEach((p, i) => {
    out.push({
      id: uid('ntf'),
      companyId: p.companyId,
      kind: 'paymentReceived',
      title: 'Payment received',
      body: `${p.number} recorded against ${p.allocations[0]?.documentNumber ?? 'advance'}.`,
      entityType: 'payment',
      entityId: p.id,
      read: i > 0,
      createdAt: `${p.date}T11:25:00.000Z`,
    });
  });

  const registered = docs.filter((d) => d.compliance?.eInvoice?.status === 'generated');
  registered.slice(0, 2).forEach((d, i) => {
    out.push({
      id: uid('ntf'),
      companyId: d.companyId,
      kind: 'eInvoice',
      title: 'IRN generated',
      body: `${d.number} is registered with the IRP.`,
      entityType: d.kind,
      entityId: d.id,
      read: i > 0,
      createdAt: `${d.date}T10:12:00.000Z`,
    });
  });

  const failed = docs.find((d) => d.compliance?.eInvoice?.status === 'failed');
  if (failed) {
    out.push({
      id: uid('ntf'),
      companyId: failed.companyId,
      kind: 'eInvoice',
      title: 'IRN not generated',
      body: failed.compliance?.eInvoice?.errors?.[0]?.message ?? 'The IRP rejected this invoice.',
      entityType: failed.kind,
      entityId: failed.id,
      read: false,
      createdAt: `${failed.date}T10:20:00.000Z`,
    });
  }

  const expiring = docs.find((d) => d.compliance?.eWayBill?.status === 'generated');
  if (expiring) {
    out.push({
      id: uid('ntf'),
      companyId: expiring.companyId,
      kind: 'eWayBill',
      title: 'E-way bill in transit',
      body: `${expiring.compliance?.eWayBill?.ewbNo} is valid until ${expiring.compliance?.eWayBill?.validUpto?.slice(0, 10)}.`,
      entityType: expiring.kind,
      entityId: expiring.id,
      read: false,
      createdAt: nowISO(),
    });
  }
  out.push({
    id: uid('ntf'),
    companyId: PRIMARY_COMPANY_ID,
    kind: 'system',
    title: 'GSTR-1 filing window opens in 6 days',
    body: 'Review your tax summary before filing.',
    entityType: 'system',
    read: false,
    createdAt: `${daysAgo(2)}T08:00:00.000Z`,
  });

  return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function seedAudit(docs: BusinessDocument[], payments: Payment[]): AuditEvent[] {
  const out: AuditEvent[] = [];
  docs.slice(0, 18).forEach((d) => {
    out.push({
      id: uid('aud'),
      companyId: d.companyId,
      actorId: CURRENT_USER_ID,
      actorName: 'Gowtham Mohan',
      action: d.status === 'draft' ? 'created' : 'finalized',
      entityType: d.kind,
      entityId: d.id,
      entityLabel: d.number,
      device: 'iPhone 15 Pro',
      createdAt: d.createdAt,
    });
  });
  payments.slice(0, 10).forEach((p) => {
    out.push({
      id: uid('aud'),
      companyId: p.companyId,
      actorId: CURRENT_USER_ID,
      actorName: 'Gowtham Mohan',
      action: 'recorded payment',
      entityType: 'payment',
      entityId: p.id,
      entityLabel: p.number,
      device: 'iPhone 15 Pro',
      createdAt: p.createdAt,
    });
  });
  return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function seedAttachments(): Attachment[] {
  return [];
}
