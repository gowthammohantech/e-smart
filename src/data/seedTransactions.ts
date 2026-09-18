import {
  Attachment,
  AuditEvent,
  AppNotification,
  Branch,
  BusinessDocument,
  Company,
  ComplianceSettings,
  DocStatus,
  DocumentEwayStatus,
  DocumentKind,
  DocumentLine,
  EwayBill,
  EwayPlace,
  Expense,
  Item,
  NumberingSeries,
  Party,
  Payment,
  PaymentMethod,
  StockMovement,
  SyncQueueEntry,
  TaxCategory,
} from '@/types';
import { Money, fromMajor, money, zero } from '@/lib/money';
import { addDaysISO, nowISO, today } from '@/lib/date';
import { calculateDocument } from '@/domain/lineCalc';
import { formatNumber } from '@/domain/numbering';
import {
  EInvoiceContext,
  buildSignedQrPayload,
  claimsFor,
  computeIrn,
  fiscalYearCode,
  isEInvoiceApplicable,
  mainHsnCodeOf,
  portalDateTime,
} from '@/domain/eInvoice';
import {
  ewayBillStatusAt,
  ewayDocTypeFor,
  subSupplyTypeFor,
  validUptoFor,
} from '@/domain/ewayBill';
import { ackNoFrom, ewayBillNumberFrom } from '@/domain/irpAdapter';
import { uid } from '@/lib/id';
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

function buildPurchaseLines(items: Item[], count: number, rand: ReturnType<typeof makeRng>): DocumentLine[] {
  return buildLines(items.filter((i) => i.trackInventory), count, rand).map((l) => {
    const item = items.find((i) => i.id === l.itemId)!;
    return { ...l, unitPrice: item.purchasePrice, discountValue: 0, quantity: rand.int(10, 80) };
  });
}

function totalsFor(
  lines: DocumentLine[],
  currency: string,
  exchangeRate: number,
  taxCategories: TaxCategory[],
  homeState: string,
  placeOfSupply: string,
  applyRoundOff: boolean,
) {
  return calculateDocument({
    lines,
    currency,
    baseCurrency: 'INR',
    exchangeRate,
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

export function seedDocuments({ items, parties, taxCategories, series }: BuildArgs): BusinessDocument[] {
  const docs: BusinessDocument[] = [];
  const customers = parties.filter((p) => p.companyId === PRIMARY_COMPANY_ID && p.kind === 'customer');
  const suppliers = parties.filter((p) => p.companyId === PRIMARY_COMPANY_ID && p.kind === 'supplier');
  const sellable = items.filter((i) => i.companyId === PRIMARY_COMPANY_ID && i.status === 'active');
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
    opts: { dueDays?: number; branchId?: string; companyId?: string; currency?: string; rate?: number; validDays?: number; sourceId?: string } = {},
  ): BusinessDocument => {
    const companyId = opts.companyId ?? PRIMARY_COMPANY_ID;
    const currency = opts.currency ?? party.currency;
    const exchangeRate = opts.rate ?? (currency === 'INR' ? 1 : 23.85);
    const homeState = companyId === PRIMARY_COMPANY_ID ? '27' : '29';
    const pos = party.billingAddress.stateCode ?? homeState;
    const totals = totalsFor(lines, currency, exchangeRate, taxCategories, homeState, pos, currency === 'INR');
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
      currency,
      exchangeRate,
      lines,
      documentDiscountMode: 'percent',
      documentDiscountValue: 0,
      charges: zero(currency),
      applyRoundOff: currency === 'INR',
      placeOfSupplyStateCode: pos,
      notes: undefined,
      terms: kind === 'invoice' ? 'Goods once sold will not be taken back. Interest @18% p.a. on overdue amounts.' : undefined,
      attachmentIds: [],
      sourceDocumentId: opts.sourceId,
      totals,
      // Compliance is stamped on afterwards by seedCompliance, which needs the
      // finished document to compute a real IRN from it.
      compliance: undefined,
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

  // Foreign-currency invoice (AED) to exercise FX.
  const exportCustomer = parties.find((p) => p.id === 'cus_13')!;
  docs.push(
    mkDoc('invoice', exportCustomer, 'issued', daysAgo(18), buildLines(sellable.filter((i) => i.trackInventory), 3, rng), {
      dueDays: 30,
      currency: 'AED',
      rate: 23.85,
    }),
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
    docs.push(mkDoc('delivery', party, status, daysAgo(i * 6 + 1), buildLines(sellable.filter((s) => s.trackInventory), 2, rng)));
  });

  // --- Sales returns --------------------------------------------------
  (['requested', 'approved', 'processed'] as DocStatus[]).forEach((status, i) => {
    const party = customers[(i + 2) % customers.length];
    docs.push(mkDoc('salesReturn', party, status, daysAgo(i * 11 + 5), buildLines(sellable.filter((s) => s.trackInventory), 1, rng)));
  });

  // --- Purchase orders / receipts / bills / returns --------------------
  (['draft', 'confirmed', 'received', 'confirmed', 'cancelled'] as DocStatus[]).forEach((status, i) => {
    const party = suppliers[i % suppliers.length];
    docs.push(mkDoc('purchaseOrder', party, status, daysAgo(i * 8 + 4), buildPurchaseLines(sellable, rng.int(2, 4), rng), { dueDays: 20 }));
  });

  (['draft', 'received', 'received', 'billed'] as DocStatus[]).forEach((status, i) => {
    const party = suppliers[(i + 2) % suppliers.length];
    docs.push(mkDoc('goodsReceipt', party, status, daysAgo(i * 10 + 6), buildPurchaseLines(sellable, rng.int(1, 3), rng)));
  });

  const billPlan: { days: number; status: DocStatus; terms: number }[] = [
    { days: 3, status: 'issued', terms: 30 },
    { days: 8, status: 'paid', terms: 15 },
    { days: 14, status: 'partiallyPaid', terms: 30 },
    { days: 22, status: 'overdue', terms: 15 },
    { days: 30, status: 'paid', terms: 30 },
    { days: 44, status: 'overdue', terms: 21 },
    { days: 58, status: 'paid', terms: 30 },
    { days: 75, status: 'issued', terms: 45 },
    { days: 92, status: 'paid', terms: 30 },
    { days: 118, status: 'overdue', terms: 30 },
  ];
  billPlan.forEach((plan, i) => {
    const party = suppliers[i % suppliers.length];
    const d = mkDoc('purchaseBill', party, plan.status, daysAgo(plan.days), buildPurchaseLines(sellable, rng.int(2, 5), rng), {
      dueDays: plan.terms,
    });
    d.supplierDocNumber = `${party.code}-${rng.int(1000, 9999)}`;
    docs.push(d);
  });

  (['requested', 'processed'] as DocStatus[]).forEach((status, i) => {
    const party = suppliers[(i + 3) % suppliers.length];
    docs.push(mkDoc('purchaseReturn', party, status, daysAgo(i * 13 + 9), buildPurchaseLines(sellable, 1, rng)));
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

  return docs;
}

/* ------------------------------------------------------------------ */
/* Payments derived from the invoice/bill statuses                     */
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

  const payable = docs.filter((d) => d.kind === 'invoice' || d.kind === 'purchaseBill');

  payable.forEach((doc, i) => {
    const isSale = doc.kind === 'invoice';
    let amount: Money | null = null;

    if (doc.status === 'paid') {
      amount = doc.totals.grandTotal;
    } else if (doc.status === 'partiallyPaid') {
      amount = money(Math.round(doc.totals.grandTotal.minor * 0.4), doc.currency);
    }
    if (!amount || amount.minor <= 0) return;

    const payDate = addDaysISO(doc.date, rng.int(1, 12));
    const clamped = payDate > today() ? today() : payDate;
    payments.push({
      id: uid('pay'),
      companyId: doc.companyId,
      branchId: doc.branchId,
      number: nextNumber(doc.companyId, clamped),
      direction: isSale ? 'received' : 'paid',
      partyId: doc.partyId,
      date: clamped,
      amount,
      currency: doc.currency,
      exchangeRate: doc.exchangeRate,
      method: methods[i % methods.length],
      reference: i % 3 === 0 ? `UTR${rng.int(100000000, 999999999)}` : undefined,
      accountId: doc.companyId === PRIMARY_COMPANY_ID ? (i % 4 === 0 ? 'acc_cash' : 'acc_hdfc') : 'acc_a_bank',
      allocations: [{ documentId: doc.id, documentNumber: doc.number, amount }],
      unallocated: zero(doc.currency),
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
    direction: 'received',
    partyId: 'cus_2',
    date: daysAgo(4),
    amount: fromMajor(50000, 'INR'),
    currency: 'INR',
    exchangeRate: 1,
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
/* Expenses                                                            */
/* ------------------------------------------------------------------ */

const EXPENSE_PLAN: [string, number, number, string][] = [
  ['exp_rent', 55000, 2, 'Godown rent — Bhosari'],
  ['exp_salary', 148000, 3, 'Staff salaries'],
  ['exp_transport', 18400, 4, 'Freight — Mumbai to Nashik'],
  ['exp_utilities', 12250, 6, 'Electricity bill'],
  ['exp_marketing', 24000, 8, 'Google Ads top-up'],
  ['exp_office', 4380, 9, 'Stationery & printer ink'],
  ['exp_travel', 16800, 11, 'Client visit — Bengaluru'],
  ['exp_professional', 35000, 13, 'CA quarterly retainer'],
  ['exp_transport', 9200, 15, 'Local delivery charges'],
  ['exp_repairs', 7650, 17, 'Forklift servicing'],
  ['exp_bank', 1180, 19, 'Bank charges & NEFT fees'],
  ['exp_utilities', 3400, 21, 'Internet & broadband'],
  ['exp_rent', 55000, 32, 'Godown rent — Bhosari'],
  ['exp_salary', 145000, 33, 'Staff salaries'],
  ['exp_transport', 21300, 36, 'Freight — Pune to Surat'],
  ['exp_marketing', 48000, 39, 'Trade expo stall'],
  ['exp_office', 6100, 44, 'Packing consumables'],
  ['exp_travel', 22400, 48, 'Supplier audit — Vadodara'],
  ['exp_rent', 55000, 62, 'Godown rent — Bhosari'],
  ['exp_salary', 142000, 63, 'Staff salaries'],
  ['exp_utilities', 14100, 66, 'Electricity bill'],
  ['exp_professional', 35000, 73, 'CA quarterly retainer'],
  ['exp_repairs', 12900, 81, 'Warehouse racking repair'],
  ['exp_bank', 980, 88, 'Bank charges'],
];

export function seedExpenses(series: NumberingSeries[]): Expense[] {
  let counter = 0;
  const s = series.find((x) => x.companyId === PRIMARY_COMPANY_ID && x.kind === 'expense')!;
  const methods: PaymentMethod[] = ['bank', 'upi', 'cash', 'card'];

  const out = EXPENSE_PLAN.map(([categoryId, amount, days, notes], i) => {
    counter += 1;
    const date = daysAgo(days);
    const gross = fromMajor(amount, 'INR');
    const taxable = categoryId === 'exp_salary' || categoryId === 'exp_rent';
    return {
      id: uid('exp'),
      companyId: PRIMARY_COMPANY_ID,
      branchId: i % 3 === 2 ? 'brn_pun' : 'brn_mum',
      number: formatNumber(s, { date, sequence: counter }),
      categoryId,
      date,
      amount: gross,
      currency: 'INR',
      exchangeRate: 1,
      taxCategoryId: taxable ? undefined : 'tax_18',
      taxAmount: taxable ? zero('INR') : money(Math.round((gross.minor * 18) / 118), 'INR'),
      taxInclusive: true,
      accountId: i % 5 === 0 ? 'acc_cash' : 'acc_hdfc',
      method: methods[i % methods.length],
      notes,
      billable: false,
      recurrence: categoryId === 'exp_rent' || categoryId === 'exp_salary' ? ('monthly' as const) : ('none' as const),
      nextRecurrenceDate:
        categoryId === 'exp_rent' || categoryId === 'exp_salary' ? addDaysISO(date, 30) : undefined,
      attachmentIds: [],
      createdBy: CURRENT_USER_ID,
      createdAt: `${date}T10:00:00.000Z`,
    } as Expense;
  });

  return out;
}

/* ------------------------------------------------------------------ */
/* Stock movements derived from opening stock + documents              */
/* ------------------------------------------------------------------ */

export function seedStockMovements(items: Item[], docs: BusinessDocument[]): StockMovement[] {
  const moves: StockMovement[] = [];

  items
    .filter((i) => i.trackInventory)
    .forEach((item) => {
      moves.push({
        id: uid('stk'),
        companyId: item.companyId,
        branchId: item.companyId === PRIMARY_COMPANY_ID ? 'brn_mum' : 'brn_blr',
        itemId: item.id,
        type: 'opening',
        quantity: item.openingStock,
        unitCost: item.purchasePrice,
        date: daysAgo(365),
        notes: 'Opening stock on migration',
        createdBy: CURRENT_USER_ID,
        createdAt: `${daysAgo(365)}T08:00:00.000Z`,
      });
    });

  const affects = (d: BusinessDocument): boolean =>
    !['draft', 'cancelled', 'rejected', 'requested'].includes(d.status);

  docs.forEach((doc) => {
    if (!affects(doc)) return;
    const type =
      doc.kind === 'invoice' || doc.kind === 'delivery'
        ? 'salesIssue'
        : doc.kind === 'goodsReceipt' || doc.kind === 'purchaseBill'
          ? 'purchaseReceipt'
          : doc.kind === 'salesReturn'
            ? 'salesReturn'
            : doc.kind === 'purchaseReturn'
              ? 'purchaseReturn'
              : null;
    if (!type) return;

    doc.lines.forEach((line) => {
      const item = items.find((i) => i.id === line.itemId);
      if (!item || !item.trackInventory) return;
      moves.push({
        id: uid('stk'),
        companyId: doc.companyId,
        branchId: doc.branchId,
        itemId: item.id,
        type,
        quantity: line.quantity,
        unitCost: type === 'purchaseReceipt' ? line.unitPrice : item.purchasePrice,
        date: doc.date,
        referenceId: doc.id,
        referenceNumber: doc.number,
        createdBy: CURRENT_USER_ID,
        createdAt: doc.createdAt,
      });
    });
  });

  // A couple of manual adjustments and a transfer for the ledger demo.
  const first = items.find((i) => i.trackInventory)!;
  moves.push({
    id: uid('stk'),
    companyId: PRIMARY_COMPANY_ID,
    branchId: 'brn_mum',
    itemId: first.id,
    type: 'adjustment',
    quantity: -3,
    unitCost: first.purchasePrice,
    date: daysAgo(21),
    notes: 'Damaged in handling',
    createdBy: CURRENT_USER_ID,
    createdAt: `${daysAgo(21)}T16:40:00.000Z`,
  });
  const second = items.filter((i) => i.trackInventory)[4];
  moves.push({
    id: uid('stk'),
    companyId: PRIMARY_COMPANY_ID,
    branchId: 'brn_mum',
    itemId: second.id,
    type: 'transferOut',
    quantity: 25,
    unitCost: second.purchasePrice,
    date: daysAgo(14),
    notes: 'Mumbai → Pune restock',
    createdBy: CURRENT_USER_ID,
    createdAt: `${daysAgo(14)}T12:10:00.000Z`,
  });
  moves.push({
    id: uid('stk'),
    companyId: PRIMARY_COMPANY_ID,
    branchId: 'brn_pun',
    itemId: second.id,
    type: 'transferIn',
    quantity: 25,
    unitCost: second.purchasePrice,
    date: daysAgo(14),
    notes: 'Mumbai → Pune restock',
    createdBy: CURRENT_USER_ID,
    createdAt: `${daysAgo(14)}T12:10:00.000Z`,
  });

  return moves;
}

/* ------------------------------------------------------------------ */
/* Notifications, audit trail, sync queue, attachments                 */
/* ------------------------------------------------------------------ */

export function seedNotifications(
  docs: BusinessDocument[],
  payments: Payment[],
  ewayBills: EwayBill[] = [],
): AppNotification[] {
  const out: AppNotification[] = [];
  const overdue = docs.filter((d) => d.kind === 'invoice' && d.status === 'overdue').slice(0, 4);
  const recentPayments = payments.filter((p) => p.direction === 'received').slice(-3);

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

  out.push({
    id: uid('ntf'),
    companyId: PRIMARY_COMPANY_ID,
    kind: 'lowStock',
    title: '3 items below reorder level',
    body: 'Review low stock and raise a purchase order.',
    entityType: 'inventory',
    read: false,
    createdAt: nowISO(),
  });
  /* Compliance notifications, derived from the seeded documents and bills so
     the list reflects what the screens actually show. */
  const reported = docs.find((d) => d.compliance?.eInvoiceStatus === 'generated');
  if (reported) {
    out.push({
      id: uid('ntf'),
      companyId: reported.companyId,
      kind: 'compliance',
      title: 'IRN generated',
      body: `${reported.number} · Ack ${reported.compliance?.ackNo}`,
      entityType: reported.kind,
      entityId: reported.id,
      read: true,
      createdAt: reported.compliance?.irnGeneratedAt ?? `${daysAgo(1)}T10:12:00.000Z`,
    });
  }

  const rejected = docs.find((d) => d.compliance?.eInvoiceStatus === 'failed');
  if (rejected) {
    out.push({
      id: uid('ntf'),
      companyId: rejected.companyId,
      kind: 'compliance',
      title: 'E-invoice rejected',
      body: `${rejected.number}: ${rejected.compliance?.eInvoiceIssues?.[0]?.message ?? 'The portal refused the invoice'}`,
      entityType: rejected.kind,
      entityId: rejected.id,
      read: false,
      createdAt: rejected.compliance?.lastAttemptAt ?? `${daysAgo(2)}T10:14:00.000Z`,
    });
  }

  const expiring = ewayBills
    .filter((b) => b.status === 'active')
    .sort((a, b) => a.validUpto.localeCompare(b.validUpto))[0];
  if (expiring) {
    out.push({
      id: uid('ntf'),
      companyId: expiring.companyId,
      kind: 'compliance',
      title: 'E-way bill expiring soon',
      body: `${expiring.ewayBillNumber} for ${expiring.documentNumber} runs out on ${expiring.validUpto.slice(0, 10)}.`,
      entityType: 'ewayBill',
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

export function seedAudit(
  docs: BusinessDocument[],
  payments: Payment[],
  ewayBills: EwayBill[] = [],
): AuditEvent[] {
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

  /* Compliance events, so the audit trail carries the new vocabulary from the
     first launch rather than only after the user reports something. */
  const entry = (
    action: string,
    entityType: string,
    entityId: string,
    entityLabel: string,
    createdAt: string,
    extra: { before?: string; after?: string } = {},
  ): AuditEvent => ({
    id: uid('aud'),
    companyId: PRIMARY_COMPANY_ID,
    actorId: CURRENT_USER_ID,
    actorName: 'Gowtham Mohan',
    action,
    entityType,
    entityId,
    entityLabel,
    before: extra.before,
    after: extra.after,
    device: 'iPhone 15 Pro',
    createdAt,
  });

  docs
    .filter((d) => d.compliance?.eInvoiceStatus === 'generated' && d.compliance.irnGeneratedAt)
    .slice(0, 8)
    .forEach((d) => {
      out.push(
        entry('generated e-invoice', d.kind, d.id, d.number, d.compliance!.irnGeneratedAt!, {
          after: d.compliance!.irn,
        }),
      );
    });

  docs
    .filter((d) => d.compliance?.eInvoiceStatus === 'cancelled' && d.compliance.irnCancelledAt)
    .forEach((d) => {
      out.push(
        entry('cancelled e-invoice', d.kind, d.id, d.number, d.compliance!.irnCancelledAt!, {
          before: d.compliance!.irn,
          after: 'Order cancelled',
        }),
      );
    });

  docs
    .filter((d) => d.compliance?.eInvoiceStatus === 'failed' && d.compliance.lastAttemptAt)
    .forEach((d) => {
      out.push(
        entry('e-invoice rejected', d.kind, d.id, d.number, d.compliance!.lastAttemptAt!, {
          after: d.compliance!.eInvoiceIssues?.[0]?.code,
        }),
      );
    });

  ewayBills.forEach((b) => {
    out.push(
      entry('generated e-way bill', 'ewayBill', b.id, b.ewayBillNumber, b.generatedAt, {
        after: b.documentNumber,
      }),
    );
    b.extensions.forEach((e) => {
      out.push(
        entry('extended e-way bill', 'ewayBill', b.id, b.ewayBillNumber, e.extendedAt, {
          before: e.previousValidUpto,
          after: e.newValidUpto,
        }),
      );
    });
    if (b.cancelledAt) {
      out.push(
        entry('cancelled e-way bill', 'ewayBill', b.id, b.ewayBillNumber, b.cancelledAt, {
          after: 'Order cancelled',
        }),
      );
    }
  });

  return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function seedSyncQueue(): SyncQueueEntry[] {
  return [
    {
      id: uid('sq'),
      label: 'Expense EXP/26-27/0025 — Fuel',
      entityType: 'expense',
      entityId: 'pending_1',
      action: 'create',
      status: 'pending',
      attempts: 1,
      queuedAt: nowISO(),
    },
  ];
}

export function seedAttachments(): Attachment[] {
  return [];
}

/* ------------------------------------------------------------------ */
/* Compliance (FRD 16)                                                 */
/* ------------------------------------------------------------------ */

/**
 * Stamp e-invoice state onto the seeded documents and build the e-way bill
 * fixtures.
 *
 * Every IRN here is the genuine SHA-256 of the document it sits on, so a
 * curious user can recompute one by hand and get the same answer. The set
 * deliberately covers the states the interface has to handle — generated,
 * cancelled, rejected and not yet reported — and bills that are active,
 * expiring within the day, expired and cancelled.
 */
export function seedCompliance(
  docs: BusinessDocument[],
  companies: Company[],
  parties: Party[],
  branches: Branch[],
  settings: ComplianceSettings[],
): { documents: BusinessDocument[]; ewayBills: EwayBill[] } {
  const companyOf = (id: string) => companies.find((c) => c.id === id);
  const partyOf = (id: string) => parties.find((p) => p.id === id);
  const settingsOf = (id: string) => settings.find((s) => s.companyId === id);
  const ewayBills: EwayBill[] = [];

  const reportable = docs.filter(
    (d) => d.kind === 'invoice' && d.companyId === PRIMARY_COMPANY_ID && !!partyOf(d.partyId)?.taxId,
  );

  /** One invoice is left with a line missing its HSN, so a rejection is real. */
  const brokenId = reportable.find((d) => d.status === 'issued')?.id;
  /** One is reported and then cancelled inside the 24-hour window. */
  const cancelledId = reportable.find((d) => d.status === 'cancelled')?.id;
  /** One recent invoice is left unreported, so the hub has something to chase. */
  const pendingId = reportable.filter((d) => d.status === 'issued').slice(-1)[0]?.id;

  const documents = docs.map((doc) => {
    const company = companyOf(doc.companyId);
    const buyer = partyOf(doc.partyId);
    const config = settingsOf(doc.companyId);
    if (!company || !config) return doc;

    const base: EInvoiceContext = {
      document: doc,
      company,
      buyer,
      settings: config,
      items: [],
      existingIrns: [],
      now: nowISO(),
    };

    const applicability = isEInvoiceApplicable(base);
    if (!applicability.applicable) {
      return doc.kind === 'invoice'
        ? { ...doc, compliance: { eInvoiceStatus: 'notApplicable' as const, lastMessage: applicability.reason } }
        : doc;
    }

    if (doc.id === pendingId) {
      return { ...doc, compliance: { eInvoiceStatus: 'pending' as const } };
    }

    if (doc.id === brokenId) {
      // Strip the HSN from one line so the blocking validation is genuine
      // rather than a status someone typed in.
      const lines = doc.lines.map((l, i) => (i === 0 ? { ...l, hsnCode: undefined } : l));
      return {
        ...doc,
        lines,
        compliance: {
          eInvoiceStatus: 'failed' as const,
          eInvoiceDocType: applicability.docType ?? undefined,
          eInvoiceSupplyType: applicability.supplyType ?? undefined,
          lastAttemptAt: `${doc.date}T10:14:00.000Z`,
          eInvoiceIssues: [
            {
              code: '2176',
              field: 'lines[0].hsnCode',
              message: `"${doc.lines[0]?.name ?? 'The first line'}" has no HSN or SAC code`,
              severity: 'blocking' as const,
            },
          ],
          lastMessage: 'The portal rejected this invoice: HSN code is mandatory on every line',
        },
      };
    }

    const generatedAt = `${doc.date}T10:${String(rng.int(10, 55)).padStart(2, '0')}:00.000Z`;
    const irn = computeIrn(
      company.taxRegistration?.identifier ?? '',
      applicability.docType ?? 'INV',
      doc.number,
      fiscalYearCode(doc.date),
    );
    const claims = claimsFor({ ...base, document: doc }, irn, generatedAt);

    const compliance = {
      eInvoiceStatus: 'generated' as const,
      eInvoiceDocType: applicability.docType ?? undefined,
      eInvoiceSupplyType: applicability.supplyType ?? undefined,
      irn,
      ackNo: ackNoFrom(irn, generatedAt),
      ackDate: portalDateTime(generatedAt),
      signedQrPayload: buildSignedQrPayload(claims),
      irnGeneratedAt: generatedAt,
    };

    if (doc.id === cancelledId) {
      const cancelledAt = addHoursISO(generatedAt, 3);
      return {
        ...doc,
        compliance: {
          ...compliance,
          eInvoiceStatus: 'cancelled' as const,
          irnCancelledAt: cancelledAt,
          irnCancelReasonCode: '3' as const,
          irnCancelRemark: 'The customer withdrew the order before despatch.',
          lastMessage: 'IRN cancelled on the portal: order cancelled',
        },
      };
    }

    return { ...doc, compliance };
  });

  /* --- e-way bills ------------------------------------------------- */

  const vertex = companyOf(PRIMARY_COMPANY_ID);
  const mumbai = branches.find((b) => b.id === 'brn_mum');
  const movers = documents.filter(
    (d) =>
      d.companyId === PRIMARY_COMPANY_ID &&
      (d.kind === 'invoice' || d.kind === 'delivery') &&
      d.status !== 'draft' &&
      d.status !== 'cancelled',
  );

  if (vertex && mumbai) {
    const from: EwayPlace = {
      legalName: vertex.legalName ?? vertex.name,
      gstin: vertex.taxRegistration?.identifier ?? 'URP',
      address1: mumbai.address.line1,
      address2: mumbai.address.line2,
      place: mumbai.address.city,
      pincode: mumbai.address.postalCode,
      stateCode: mumbai.address.stateCode ?? '27',
    };

    const plan: {
      kind: 'active' | 'expiringSoon' | 'expired' | 'cancelled' | 'odcMultiLeg' | 'rail' | 'regenerated';
      distanceKm: number;
      generatedDaysAgo: number;
      vehicleType: EwayBill['vehicleType'];
      transportMode: EwayBill['transportMode'];
    }[] = [
      { kind: 'active', distanceKm: 640, generatedDaysAgo: 1, vehicleType: 'regular', transportMode: 'road' },
      { kind: 'expiringSoon', distanceKm: 150, generatedDaysAgo: 1, vehicleType: 'regular', transportMode: 'road' },
      { kind: 'expired', distanceKm: 380, generatedDaysAgo: 12, vehicleType: 'regular', transportMode: 'road' },
      { kind: 'cancelled', distanceKm: 210, generatedDaysAgo: 30, vehicleType: 'regular', transportMode: 'road' },
      { kind: 'odcMultiLeg', distanceKm: 1180, generatedDaysAgo: 6, vehicleType: 'overDimensional', transportMode: 'road' },
      { kind: 'rail', distanceKm: 1420, generatedDaysAgo: 3, vehicleType: 'regular', transportMode: 'rail' },
      { kind: 'regenerated', distanceKm: 210, generatedDaysAgo: 30, vehicleType: 'regular', transportMode: 'road' },
    ];

    plan.forEach((entry, i) => {
      // The regenerated bill deliberately shares a document with the cancelled
      // one, so a document carrying more than one bill is exercised.
      const doc = entry.kind === 'regenerated' ? movers[3] : movers[i % movers.length];
      if (!doc) return;
      const buyer = partyOf(doc.partyId);
      if (!buyer) return;

      const generatedAt = `${daysAgo(entry.generatedDaysAgo)}T07:${String(rng.int(10, 55)).padStart(2, '0')}:00.000Z`;
      const to: EwayPlace = {
        legalName: buyer.name,
        gstin: buyer.taxId ?? 'URP',
        address1: (buyer.shippingAddress ?? buyer.billingAddress).line1,
        place: (buyer.shippingAddress ?? buyer.billingAddress).city,
        pincode: (buyer.shippingAddress ?? buyer.billingAddress).postalCode,
        stateCode: (buyer.shippingAddress ?? buyer.billingAddress).stateCode ?? '27',
      };

      const igst = doc.totals.taxLines
        .flatMap((l) => l.components)
        .filter((c) => c.type === 'IGST')
        .reduce((acc, c) => acc + c.amount.minor, 0);
      const cgst = doc.totals.taxLines
        .flatMap((l) => l.components)
        .filter((c) => c.type === 'CGST')
        .reduce((acc, c) => acc + c.amount.minor, 0);
      const sgst = doc.totals.taxLines
        .flatMap((l) => l.components)
        .filter((c) => c.type === 'SGST')
        .reduce((acc, c) => acc + c.amount.minor, 0);

      const currency = doc.totals.grandTotal.currency;
      const isRail = entry.transportMode === 'rail';
      const seed = `${doc.number}:${entry.kind}:${generatedAt}`;

      const bill: EwayBill = {
        id: uid('ewb'),
        companyId: PRIMARY_COMPANY_ID,
        branchId: doc.branchId,
        ewayBillNumber: ewayBillNumberFrom(seed),
        documentId: doc.id,
        documentKind: doc.kind,
        documentNumber: doc.number,
        documentDate: doc.date,
        partyId: doc.partyId,
        docType: ewayDocTypeFor(doc.kind),
        supplyType: 'outward',
        subSupplyType: subSupplyTypeFor(doc.kind),
        transactionType: 1,
        from,
        to,
        consignmentValue: doc.totals.grandTotal,
        taxableValue: doc.totals.taxableAmount,
        cgst: money(cgst, currency),
        sgst: money(sgst, currency),
        igst: money(igst, currency),
        mainHsnCode: mainHsnCodeOf(doc),
        itemCount: doc.lines.length,
        transporterId: '27AABCT5512M1ZQ',
        transporterName: 'Konkan Roadlines',
        transportMode: entry.transportMode,
        vehicleNumber: isRail ? undefined : VEHICLES[i % VEHICLES.length],
        vehicleType: entry.vehicleType,
        transportDocNumber: isRail ? `RR/2026/${rng.int(1000, 9999)}` : undefined,
        transportDocDate: isRail ? daysAgo(entry.generatedDaysAgo) : undefined,
        distanceKm: entry.distanceKm,
        generatedAt,
        generatedBy: CURRENT_USER_ID,
        validFrom: generatedAt,
        validUpto: validUptoFor(generatedAt, entry.distanceKm, entry.vehicleType),
        status: 'active',
        partBUpdates: [],
        extensions: [],
        createdAt: generatedAt,
        updatedAt: generatedAt,
      };

      if (entry.kind === 'expiringSoon') {
        // Pull the validity in so this one always sits inside the next day,
        // whatever date the demo data is generated on.
        bill.validUpto = addHoursISO(nowISO(), 14);
      }

      if (entry.kind === 'cancelled') {
        bill.status = 'cancelled';
        bill.cancelledAt = addHoursISO(generatedAt, 4);
        bill.cancelReasonCode = '2';
        bill.cancelRemark = 'The consignment was held back; a fresh bill was raised.';
      }

      if (!isRail) {
        bill.partBUpdates.push({
          id: uid('pb'),
          mode: 'road',
          vehicleNumber: bill.vehicleNumber,
          vehicleType: bill.vehicleType,
          fromPlace: from.place,
          fromStateCode: from.stateCode,
          reasonCode: '1',
          updatedAt: generatedAt,
          updatedBy: CURRENT_USER_ID,
        });
      }

      if (entry.kind === 'odcMultiLeg') {
        bill.partBUpdates.push(
          {
            id: uid('pb'),
            mode: 'road',
            vehicleNumber: 'RJ14CD5678',
            vehicleType: 'overDimensional',
            fromPlace: 'Udaipur',
            fromStateCode: '08',
            reasonCode: '2',
            remark: 'Gearbox failure on the original tractor unit.',
            updatedAt: addHoursISO(generatedAt, 38),
            updatedBy: CURRENT_USER_ID,
          },
          {
            id: uid('pb'),
            mode: 'road',
            vehicleNumber: 'DL01EF9012',
            vehicleType: 'overDimensional',
            fromPlace: 'Jaipur',
            fromStateCode: '08',
            reasonCode: '3',
            remark: 'Transhipped to the Delhi leg carrier.',
            updatedAt: addHoursISO(generatedAt, 74),
            updatedBy: CURRENT_USER_ID,
          },
        );

        const previousValidUpto = bill.validUpto;
        bill.validUpto = validUptoFor(addHoursISO(generatedAt, 80), 260, 'overDimensional');
        bill.extensions.push({
          id: uid('ext'),
          extendedAt: addHoursISO(generatedAt, 80),
          extendedBy: CURRENT_USER_ID,
          reasonCode: '1',
          remark: 'Highway closed by flooding near Kota.',
          transitType: 'inTransit',
          currentPlace: 'Jaipur',
          currentPincode: '302001',
          currentStateCode: '08',
          remainingDistanceKm: 260,
          previousValidUpto,
          newValidUpto: bill.validUpto,
        });
      }

      ewayBills.push(bill);
    });
  }

  /* Mirror the latest bill onto each document it belongs to. */
  const withEway = documents.map((doc) => {
    const mine = ewayBills
      .filter((b) => b.documentId === doc.id)
      .sort((a, b) => b.generatedAt.localeCompare(a.generatedAt));
    const latest = mine[0];
    if (!latest) return doc;
    return {
      ...doc,
      compliance: {
        ...doc.compliance,
        ewayBillStatus: ewayBillStatusAt(latest, nowISO()) as DocumentEwayStatus,
        ewayBillId: latest.id,
        ewayBillNumber: latest.ewayBillNumber,
        ewayBillValidUpto: latest.validUpto,
      },
    };
  });

  return { documents: withEway, ewayBills };
}

const VEHICLES = ['MH12AB1234', 'MH04CD7781', 'KA01MJ7788', 'GJ05EF2290', 'MH14GH5512', 'RJ14CD5678'];

function addHoursISO(iso: string, hours: number): string {
  return new Date(new Date(iso).getTime() + hours * 3600 * 1000).toISOString();
}
