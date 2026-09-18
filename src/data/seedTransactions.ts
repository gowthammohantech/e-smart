import {
  Attachment,
  AuditEvent,
  AppNotification,
  BusinessDocument,
  DocStatus,
  DocumentKind,
  DocumentLine,
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
    const isB2B = !!party.taxId;
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
      compliance:
        kind === 'invoice' && isB2B
          ? {
              eInvoiceStatus: status === 'draft' ? 'pending' : 'generated',
              irn: status === 'draft' ? undefined : `${rng.int(10, 99)}${uid('').replace(/[^a-z0-9]/g, '').slice(0, 30)}`.slice(0, 32),
              ewayBillStatus: 'notApplicable',
            }
          : undefined,
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

export function seedNotifications(docs: BusinessDocument[], payments: Payment[]): AppNotification[] {
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
  out.push({
    id: uid('ntf'),
    companyId: PRIMARY_COMPANY_ID,
    kind: 'compliance',
    title: 'E-invoice generated',
    body: 'IRN received from the IRP for your latest B2B invoice.',
    entityType: 'compliance',
    read: true,
    createdAt: `${daysAgo(1)}T10:12:00.000Z`,
  });
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
