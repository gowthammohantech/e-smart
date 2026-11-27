import { cleanAmount, matchColumns } from '@esmart/core/lib/csv';
import { guessJournalColumns, journalsFromCsv, type JournalField } from '@esmart/core/domain/journalImport';
import { unitCodeOf } from '@esmart/core/domain/itemImport';
import { isValidGstin, normalizeGstin } from '@esmart/core/domain/gstin';
import { fromMajor, money, toMajor, type Money } from '@esmart/core/lib/money';
import { api, errorMessage } from './api';
import { importedBefore, remember } from './ledger';
import { findParty, missingParty, loadAccounts, loadCategories, loadItems, loadParties, loadSupplierBillNumbers, partyKey, type AccountRef, type ItemRef } from './lookups';
import { col, emptyResult, inChunks, norm, pool, shape, tally, toIsoDate, withoutExamples, type Ctx, type Entity, type Env, type Mapping, type Outcome, type Parsed, type SendResult } from './kit';

const get = (row: string[], mapping: Mapping, key: string) => (mapping[key] !== undefined ? (row[mapping[key]!] ?? '').trim() : '');
const inr = (n: number) => n.toLocaleString('en-IN', { maximumFractionDigits: 2 });
const DATE_HELP = 'is not a date. Write it day/month/year, like 31/03/2026';

/** A rate like "18", "18%" or "GST 18%" as a number; undefined when empty, null when it is not one. */
function rateOf(raw: string): number | undefined | null {
  if (!raw.trim()) return undefined;
  const n = Number(raw.replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) && /\d/.test(raw) ? n : null;
}

/** An amount cell as money, with the problem to report when it is not one. */
function amountOf(raw: string, label: string, ctx: Ctx, problems: string[], { positive = false } = {}): Money | undefined {
  const v = cleanAmount(raw);
  if (v === undefined) return undefined;
  if (v === null || (positive && Number(v) <= 0) || Number(v) < 0) {
    problems.push(`${label} "${raw}" is not ${positive ? 'an amount above zero' : 'an amount'}`);
    return undefined;
  }
  return fromMajor(v, ctx.currency);
}

const taxByRate = (ctx: Ctx, rate: number) => ctx.taxCategories.find((c) => c.rate === rate);

/** The sentence that says a plan lacks a feature a sheet needs; undefined when it has it, or nothing needs it. */
export function needs(ctx: Ctx, module: string, what: string, count: number): string | undefined {
  if (!count || !ctx.modules || ctx.modules.includes(module)) return undefined;
  return `${what} need the ${module[0].toUpperCase()}${module.slice(1)} feature, which ${ctx.planName ?? 'this plan'} does not include. ${count === 1 ? 'That row' : `Those ${count} rows`} will be rejected. Upgrade the plan, or leave ${count === 1 ? 'it' : 'them'} out.`;
}

/** The kind of account a payment method goes through. */
const accountTypeOf = (method: string) => (method === 'cash' ? 'cash' : method === 'wallet' ? 'wallet' : 'bank');

/**
 * The cash or bank account for a row: the one it names, else one that fits its method, else (with no
 * method given) the first there is, and the method follows the account.
 */
function pickAccount(accounts: AccountRef[], named: string | undefined, method: string | undefined): { account?: AccountRef; method?: string; problem?: string } {
  const list = accounts.map((a) => a.name).join(', ') || 'none';
  if (named) {
    const account = accounts.find((a) => norm(a.name) === norm(named));
    if (!account) return { problem: `No cash or bank account called ${named}. You have: ${list}` };
    return { account, method: method ?? (account.type === 'cash' ? 'cash' : account.type === 'wallet' ? 'wallet' : 'bank') };
  }
  if (!accounts.length) return { problem: 'This business has no cash or bank account yet. Add one in Elixir Books first' };
  if (!method) return { account: accounts[0], method: accounts[0].type === 'cash' ? 'cash' : accounts[0].type === 'wallet' ? 'wallet' : 'bank' };
  const account = accounts.find((a) => a.type === accountTypeOf(method));
  if (!account) return { problem: `This business has no ${accountTypeOf(method)} account for a ${method} payment. Add one in Elixir Books, or name an account that exists (${list})` };
  return { account, method };
}

/* ------------------------------------------------------------------------------------------------
 * Sales invoices and purchase bills: one row per line, rows with the same number making one document.
 * Saved as drafts, so nothing is posted, no new number is taken, and nothing is counted twice with
 * the opening balances; the person issues them in Elixir Books once they have looked them over.
 * ---------------------------------------------------------------------------------------------- */

type DocLine = { name: string; item: string; description?: string; quantity: number; unit?: string; rate: Money; discount: number; taxRate?: number; hsn?: string };
type DocRecord = { kind: 'invoice' | 'purchaseBill'; number: string; date: string; dueDate?: string; party: string; gstin?: string; notes?: string; lines: DocLine[] };

function docEntity(cfg: { id: 'sales' | 'purchases'; kind: DocRecord['kind']; title: string; blurb: string; sheetName: string; who: 'Customer' | 'Supplier'; partyAliases: string[]; numberLabel: string; nameHint: RegExp; sample: { number: string; party: string; gstin: string } }): Entity {
  const aliases: Record<string, string[]> = {
    number: ['invoiceno', 'invoicenumber', 'invno', 'billno', 'billnumber', 'voucherno', 'vouchernumber', 'documentno', 'number', 'refno', 'supplierinvoiceno', 'supplierbillno', 'invoice', 'bill'],
    date: ['date', 'invoicedate', 'billdate', 'voucherdate', 'docdate', 'txndate', 'transactiondate'],
    dueDate: ['duedate', 'paymentdue', 'duedt', 'payby'],
    party: cfg.partyAliases,
    partyGstin: ['gstin', 'gstno', 'partygstin', 'customergstin', 'suppliergstin', 'gstinuin', 'gstnumber'],
    item: ['item', 'itemname', 'product', 'productname', 'sku', 'itemcode', 'particulars', 'goods'],
    description: ['description', 'details', 'itemdescription'],
    quantity: ['qty', 'quantity', 'qnty', 'nos'],
    unit: ['unit', 'uom', 'units'],
    rate: ['rate', 'price', 'unitprice', 'unitrate', 'sellingprice', 'saleprice', 'purchaseprice', 'cost', 'itemrate'],
    discount: ['discount', 'discountpercent', 'disc', 'discountpct', 'discountrate'],
    taxRate: ['gst', 'gstrate', 'taxrate', 'tax', 'gstpercent', 'taxpercent', 'igstrate'],
    hsnCode: ['hsn', 'hsncode', 'sac', 'hsnsac', 'saccode'],
    notes: ['notes', 'remarks', 'narration', 'comments', 'terms'],
  };
  const fields = [
    { key: 'number', label: cfg.numberLabel, required: true },
    { key: 'date', label: 'Date', required: true },
    { key: 'dueDate', label: 'Due date' },
    { key: 'party', label: cfg.who, required: true },
    { key: 'partyGstin', label: `${cfg.who} GSTIN` },
    { key: 'item', label: 'Item (name or SKU)' },
    { key: 'description', label: 'Description' },
    { key: 'quantity', label: 'Quantity', required: true },
    { key: 'unit', label: 'Unit' },
    { key: 'rate', label: 'Rate', required: true },
    { key: 'discount', label: 'Discount %' },
    { key: 'taxRate', label: 'GST %' },
    { key: 'hsnCode', label: 'HSN / SAC' },
    { key: 'notes', label: 'Notes' },
  ];
  const issuedWord = cfg.kind === 'invoice' ? 'invoices' : 'bills';

  return {
    id: cfg.id,
    group: 'Transactions',
    title: cfg.title,
    blurb: cfg.blurb,
    sheetName: cfg.sheetName,
    fields,
    nameHint: cfg.nameHint,
    signature: ['number', 'party', 'quantity'],
    options: [
      {
        key: 'save',
        label: 'Save them as',
        hint: `Drafts post nothing and take no new numbers. You look them over and issue them in Elixir Books. Issuing now posts sales, GST and stock straight away and gives each a new number from your series.`,
        choices: [
          { value: 'draft', label: `Drafts (recommended)` },
          { value: 'issue', label: `Issued ${issuedWord}` },
        ],
        default: 'draft',
      },
    ],
    template: {
      name: cfg.sheetName,
      columns: [
        col(cfg.numberLabel, cfg.sample.number, 'Required. Rows with the same number make one document.', { required: true, width: 20 }),
        col('Date', '31/03/2026', 'Required. Day/month/year.', { required: true }),
        col('Due Date', '30/04/2026', 'Day/month/year.'),
        col(cfg.who, cfg.sample.party, `Required. The ${cfg.who.toLowerCase()}'s name as in your contacts, or their GSTIN column below.`, { required: true, width: 26 }),
        col(`${cfg.who} GSTIN`, cfg.sample.gstin, 'Used to find the contact when two share a name.', { width: 20 }),
        col('Item', 'Ball Bearing 6203', 'An item’s name or SKU. An item you do not keep is added to the document by name.', { width: 26 }),
        col('Description', '', 'Shown on the line.'),
        col('Qty', '10', 'Required.', { required: true }),
        col('Unit', 'NOS', 'Left blank, the item’s unit.', { options: ['PCS', 'BOX', 'KG', 'LTR', 'MTR', 'HR', 'DAY', 'SET', 'NOS'] }),
        col('Rate', '250', 'Required. Price for one, before GST.', { required: true }),
        col('Discount %', '0', 'Percent off the line.'),
        col('GST %', '18', 'Left blank, the item’s GST rate.', { options: ['0', '5', '12', '18', '28'] }),
        col('HSN', '84821011', 'Left blank, the item’s.'),
        col('Notes', '', 'Printed on the document.', { width: 24 }),
      ],
    },
    guess: (header) => matchColumns(header, aliases) as Mapping,
    parse(rows, mapping, ctx): Parsed {
      const { rows: clean, lineOf } = withoutExamples(rows);
      type Draft = { key: string; lines: number[]; number: string; date?: string; dueDate?: string; party: string; gstin: string; notes: string; items: DocLine[]; problems: string[] };
      const drafts = new Map<string, Draft>();
      let current: { number: string; date: string; dueDate: string; party: string; gstin: string; notes: string } | undefined;
      clean.slice(1).forEach((row, i) => {
        const line = lineOf.get(row) ?? i + 2;
        const number = get(row, mapping, 'number');
        // A row with no number carries on the document above it (many exports write the heading once).
        if (number) current = { number, date: get(row, mapping, 'date'), dueDate: get(row, mapping, 'dueDate'), party: get(row, mapping, 'party'), gstin: get(row, mapping, 'partyGstin'), notes: get(row, mapping, 'notes') };
        else if (current) {
          current = { ...current, date: get(row, mapping, 'date') || current.date, dueDate: get(row, mapping, 'dueDate') || current.dueDate, party: get(row, mapping, 'party') || current.party, gstin: get(row, mapping, 'partyGstin') || current.gstin };
        }
        const head = current;
        if (!head) {
          drafts.set(`#${line}`, { key: `#${line}`, lines: [line], number: '', party: '', gstin: '', notes: '', items: [], problems: [`No ${cfg.numberLabel.toLowerCase()}`] });
          return;
        }
        const key = `${norm(head.number)}|${partyKey(head.party || head.gstin)}`;
        const d = drafts.get(key) ?? { key, lines: [], number: head.number, party: head.party, gstin: head.gstin, notes: head.notes, items: [], problems: [] as string[] };
        drafts.set(key, d);
        d.lines.push(line);
        const problems = d.problems;
        const here = (m: string) => problems.push(`Line ${line}: ${m}`);
        if (!d.date) {
          const date = toIsoDate(head.date);
          if (!date) here(`"${head.date}" ${DATE_HELP}`);
          else d.date = date;
        }
        if (head.dueDate && !d.dueDate) {
          const due = toIsoDate(head.dueDate);
          if (!due) here(`Due date "${head.dueDate}" ${DATE_HELP}`);
          else d.dueDate = due;
        }
        if (!head.party && !head.gstin) here(`No ${cfg.who.toLowerCase()}`);
        if (head.gstin && !isValidGstin(normalizeGstin(head.gstin))) here(`GSTIN ${head.gstin} isn’t valid`);

        const item = get(row, mapping, 'item');
        const description = get(row, mapping, 'description');
        const name = item || description;
        if (!name) here('No item or description');
        const q = cleanAmount(get(row, mapping, 'quantity'));
        if (q === undefined || q === null || Number(q) <= 0) here(`Quantity "${get(row, mapping, 'quantity')}" is not a number above zero`);
        const price = cleanAmount(get(row, mapping, 'rate'));
        if (price === undefined || price === null || Number(price) < 0) here(`Rate "${get(row, mapping, 'rate')}" is not an amount`);
        const discountRaw = cleanAmount(get(row, mapping, 'discount').replace(/%/g, ''));
        if (discountRaw === null || (discountRaw !== undefined && (Number(discountRaw) < 0 || Number(discountRaw) > 100))) here(`Discount "${get(row, mapping, 'discount')}" should be between 0 and 100`);
        const taxRaw = get(row, mapping, 'taxRate');
        const tax = rateOf(taxRaw);
        if (tax === null) here(`GST "${taxRaw}" is not a rate`);
        else if (tax !== undefined && !taxByRate(ctx, tax)) here(`GST ${tax}% isn’t set up. Use one of: ${ctx.taxCategories.map((c) => `${c.rate}%`).join(', ')}`);
        const unitRaw = get(row, mapping, 'unit');
        const unit = unitRaw ? unitCodeOf(unitRaw) : undefined;
        if (unitRaw && !unit) here(`Unit "${unitRaw}" isn’t recognised. Use a unit like NOS, KGS, LTR or MTR`);
        const hsn = get(row, mapping, 'hsnCode').replace(/\s/g, '');
        if (hsn && !/^\d{4}(\d{2}){0,2}$/.test(hsn)) here(`HSN/SAC "${hsn}" should be 4, 6 or 8 digits`);
        if (name && q && price && Number(q) > 0 && Number(price) >= 0) {
          d.items.push({
            name,
            item,
            ...(description && { description }),
            quantity: Number(q),
            ...(unit && { unit }),
            rate: fromMajor(price, ctx.currency),
            discount: discountRaw ? Number(discountRaw) : 0,
            ...(typeof tax === 'number' && { taxRate: tax }),
            ...(hsn && { hsn }),
          });
        }
      });

      const out: Parsed = { records: [], errors: [] };
      for (const d of drafts.values()) {
        if (!d.problems.length && d.date && d.items.length) {
          const base = clean.find((r) => (lineOf.get(r) ?? 0) === d.lines[0]);
          const dueDate = base && get(base, mapping, 'dueDate') ? toIsoDate(get(base, mapping, 'dueDate')) : undefined;
          out.records.push({
            line: d.lines[0],
            // The rows of a document travel together: the file of rows to fix lists them all.
            rows: d.lines,
            value: { kind: cfg.kind, number: d.number, date: d.date, ...((d.dueDate ?? dueDate) && { dueDate: d.dueDate ?? dueDate }), party: d.party, ...(d.gstin && { gstin: d.gstin }), ...(d.notes && { notes: d.notes }), lines: d.items } satisfies DocRecord,
          });
        } else {
          const why = d.problems.length ? d.problems : ['Nothing to import on these rows'];
          out.errors.push({ line: d.lines[0], message: `${d.number ? `${d.number}: ` : ''}${why.join(' · ')}` });
          for (const other of d.lines.slice(1)) out.errors.push({ line: other, message: `Left out with the rest of ${d.number || 'its document'} (see line ${d.lines[0]})` });
        }
      }
      return out;
    },
    async send(values, dryRun, env): Promise<SendResult> {
      const recs = values as DocRecord[];
      const [parties, items] = await Promise.all([loadParties(env.companyId), loadItems(env.companyId)]);
      const before = importedBefore(env.companyId, cfg.id);
      const status = env.options.save === 'issue' ? 'issued' : 'draft';
      const supplierNumbers = new Map<string, Set<string>>();
      const itemBy = new Map<string, ItemRef>();
      for (const i of items) {
        itemBy.set(`sku:${norm(i.sku)}`, i);
        if (!itemBy.has(`name:${norm(i.name)}`)) itemBy.set(`name:${norm(i.name)}`, i);
      }

      type Plan = { index: number; key: string; body?: Record<string, unknown>; outcome?: Outcome };
      const plans: Plan[] = [];
      const seen = new Set<string>();
      for (const [index, rec] of recs.entries()) {
        const key = `${cfg.kind}|${norm(rec.number)}|${partyKey(rec.party || rec.gstin || '')}|${rec.date}`;
        const fail = (message: string): Plan => ({ index, key, outcome: { index, status: 'invalid', message } });
        if (before.has(key) || seen.has(key)) {
          plans.push({ index, key, outcome: { index, status: 'duplicate', message: 'Already imported from this computer.' } });
          continue;
        }
        const found = findParty(parties, rec.party, rec.gstin);
        const pendingParty = env.pending.parties.has(partyKey(rec.party)) || (!!rec.gstin && env.pending.parties.has(normalizeGstin(rec.gstin)));
        if (!found.party && !(dryRun && pendingParty)) {
          plans.push(fail(missingParty(env, rec.party, rec.gstin, found.problem)));
          continue;
        }
        if (found.party && cfg.kind === 'purchaseBill') {
          let numbers = supplierNumbers.get(found.party.id);
          if (!numbers) supplierNumbers.set(found.party.id, (numbers = await loadSupplierBillNumbers(env.companyId, found.party.id).catch(() => new Set<string>())));
          if (numbers.has(norm(rec.number))) {
            plans.push({ index, key, outcome: { index, status: 'duplicate', message: `${found.party.name} already has a bill numbered ${rec.number}.` } });
            continue;
          }
        }
        const lines: Record<string, unknown>[] = [];
        let problem = '';
        for (const l of rec.lines) {
          const item = l.item ? (itemBy.get(`sku:${norm(l.item)}`) ?? itemBy.get(`name:${norm(l.item)}`)) : undefined;
          const pendingItem = !!l.item && env.pending.items.has(norm(l.item));
          const category = l.taxRate !== undefined ? taxByRate(env.ctx, l.taxRate)?.id : item?.taxCategoryId;
          if (!category && !(dryRun && pendingItem)) {
            problem = `Add a GST % for “${l.name}”, it is not an item you keep`;
            break;
          }
          lines.push({
            ...(item && { itemId: item.id }),
            name: l.name,
            ...(l.description && { description: l.description }),
            ...((l.hsn ?? item?.hsnCode) && { hsnCode: l.hsn ?? item?.hsnCode }),
            quantity: l.quantity,
            unit: l.unit ?? item?.unit ?? 'NOS',
            unitPrice: l.rate,
            discountMode: 'percent',
            discountValue: l.discount,
            taxCategoryId: category,
            taxInclusive: false,
          });
        }
        if (problem) {
          plans.push(fail(problem));
          continue;
        }
        seen.add(key);
        plans.push({
          index,
          key,
          body: {
            kind: cfg.kind,
            partyId: found.party?.id,
            date: rec.date,
            ...(rec.dueDate && { dueDate: rec.dueDate }),
            currency: env.ctx.currency,
            lines,
            // The number it had where it came from, kept on the document.
            reference: rec.number,
            ...(cfg.kind === 'purchaseBill' && { supplierDocNumber: rec.number }),
            ...(rec.notes && { notes: rec.notes }),
            status,
          },
        });
      }

      const results: Outcome[] = plans.map((p) => p.outcome ?? { index: p.index, status: 'created' });
      if (!dryRun) {
        const todo = plans.filter((p) => p.body);
        const done: string[] = [];
        await pool(todo, 4, async (p) => {
          try {
            await api().POST('/companies/{companyId}/documents', { params: { path: { companyId: env.companyId } }, body: p.body as never });
            done.push(p.key);
          } catch (err) {
            results[p.index] = { index: p.index, status: 'invalid', message: errorMessage(err) };
          }
        });
        remember(env.companyId, cfg.id, done);
      }
      return tally(results);
    },
    planNeeds: (records, ctx) => (cfg.kind === 'purchaseBill' ? needs(ctx, 'purchases', 'Purchase invoices', records.length) : undefined),
    preview: [
      { label: cfg.numberLabel, value: (d: DocRecord) => d.number },
      { label: 'Date', value: (d: DocRecord) => d.date },
      { label: cfg.who, value: (d: DocRecord) => d.party || d.gstin || '' },
      { label: 'Lines', value: (d: DocRecord) => String(d.lines.length) },
      { label: 'Before GST', value: (d: DocRecord) => inr(d.lines.reduce((n, l) => n + l.quantity * toMajor(l.rate) * (1 - l.discount / 100), 0)) },
    ] as Entity['preview'],
  };
}

export const SALES = docEntity({
  id: 'sales',
  kind: 'invoice',
  title: 'Sales invoices',
  blurb: 'Invoices you raised, one row per line, with items, rates and GST.',
  sheetName: 'Sales Invoices',
  who: 'Customer',
  partyAliases: ['customer', 'customername', 'party', 'partyname', 'buyer', 'billto', 'client', 'clientname', 'ledgername', 'soldto'],
  numberLabel: 'Invoice No',
  nameHint: /sale|invoice|receivable|outward/i,
  sample: { number: '(example) INV-1001', party: 'Sharma Traders', gstin: '27AABCV1234F1ZO' },
});

export const PURCHASES = docEntity({
  id: 'purchases',
  kind: 'purchaseBill',
  title: 'Purchase invoices',
  blurb: 'Bills from your suppliers, one row per line, with items, rates and GST.',
  sheetName: 'Purchase Invoices',
  who: 'Supplier',
  partyAliases: ['supplier', 'suppliername', 'party', 'partyname', 'vendor', 'vendorname', 'seller', 'ledgername', 'soldby'],
  numberLabel: 'Bill No',
  nameHint: /purchase|bill|payable|inward|vendor|supplier/i,
  sample: { number: '(example) BILL-2001', party: 'Kumar Supplies', gstin: '33AAAAA0000A1Z5' },
});

/* ------------------------------------------------------------------------------------------------
 * Payments and receipts: money in or out, with the contact it was for. Saved on account (not matched
 * to an invoice), so each shows as an advance the person matches in Elixir Books.
 * ---------------------------------------------------------------------------------------------- */

type PaymentRecord = { direction: 'received' | 'paid'; party: string; gstin?: string; date: string; amount: Money; method?: string; account?: string; reference?: string; notes?: string };

const METHOD_WORDS: [RegExp, string][] = [
  [/^cash$/, 'cash'],
  [/^(upi|gpay|googlepay|phonepe|paytm|bhim)$/, 'upi'],
  [/^(card|credit|debit|creditcard|debitcard|pos)$/, 'card'],
  [/^(cheque|check|chq|dd|demanddraft)$/, 'cheque'],
  [/^(bank|neft|rtgs|imps|online|transfer|banktransfer|netbanking|wire|ach)$/, 'bank'],
  [/^(wallet)$/, 'wallet'],
];
const methodOf = (raw: string) => (raw ? (METHOD_WORDS.find(([re]) => re.test(norm(raw)))?.[1] ?? 'other') : undefined);

export const PAYMENTS: Entity = {
  id: 'payments',
  group: 'Transactions',
  title: 'Payments & receipts',
  blurb: 'Money you received from customers and paid to suppliers. A cash or bank account cannot go below zero, so give it an opening balance first.',
  sheetName: 'Payments',
  nameHint: /payment|receipt|collection|voucher|cash|bank/i,
  signature: ['date', 'party', 'amount'],
  fields: [
    { key: 'date', label: 'Date', required: true },
    { key: 'type', label: 'Type (Received / Paid)' },
    { key: 'party', label: 'Customer or supplier', required: true },
    { key: 'partyGstin', label: 'GSTIN' },
    { key: 'amount', label: 'Amount', required: true },
    { key: 'method', label: 'Method' },
    { key: 'account', label: 'Cash / bank account' },
    { key: 'reference', label: 'Reference' },
    { key: 'notes', label: 'Notes' },
  ],
  template: {
    name: 'Payments',
    columns: [
      col('Date', '(example) 31/03/2026', 'Required. Day/month/year.', { required: true, width: 20 }),
      col('Type', 'Received', 'Received (from a customer) or Paid (to a supplier). Left blank, Received.', { options: ['Received', 'Paid'] }),
      col('Party', 'Sharma Traders', 'Required. The contact’s name as in your contacts.', { required: true, width: 26 }),
      col('GSTIN', '', 'Used to find the contact when two share a name.', { width: 20 }),
      col('Amount', '25000', 'Required.', { required: true }),
      col('Method', 'Bank', 'Cash, Bank, UPI, Card, Cheque, Wallet or Other.', { options: ['Cash', 'Bank', 'UPI', 'Card', 'Cheque', 'Wallet', 'Other'] }),
      col('Account', '', 'The cash or bank account in Elixir Books. Left blank, the first that fits the method.', { width: 22 }),
      col('Reference', 'UTR 1234567', 'A cheque number, UTR or note to find it by.'),
      col('Notes', '', 'Anything else.', { width: 24 }),
    ],
  },
  guess: (header) =>
    matchColumns(header, {
      date: ['date', 'paymentdate', 'receiptdate', 'voucherdate', 'txndate', 'transactiondate'],
      type: ['type', 'direction', 'paymenttype', 'vouchertype', 'receiptpayment'],
      party: ['party', 'partyname', 'customer', 'supplier', 'customername', 'suppliername', 'vendor', 'ledger', 'ledgername', 'paidby', 'receivedfrom', 'paidto', 'name'],
      partyGstin: ['gstin', 'gstno', 'partygstin', 'gstinuin'],
      amount: ['amount', 'amt', 'paymentamount', 'receivedamount', 'paidamount'],
      method: ['method', 'paymentmethod', 'paymentmode', 'mode', 'modeofpayment'],
      account: ['account', 'paymentaccount', 'bank', 'bankaccount', 'depositto', 'paidfrom', 'cashbank'],
      reference: ['reference', 'refno', 'referenceno', 'chequeno', 'transactionid', 'utr', 'txnid', 'ref'],
      notes: ['notes', 'remarks', 'narration', 'description', 'memo'],
    }) as Mapping,
  parse(rows, mapping, ctx) {
    const { rows: clean, lineOf } = withoutExamples(rows);
    const out: Parsed = { records: [], errors: [] };
    clean.slice(1).forEach((row, i) => {
      const line = lineOf.get(row) ?? i + 2;
      const problems: string[] = [];
      const date = toIsoDate(get(row, mapping, 'date'));
      if (!date) problems.push(`Date "${get(row, mapping, 'date')}" ${DATE_HELP}`);
      const typeRaw = norm(get(row, mapping, 'type'));
      const direction = !typeRaw || /receiv|receipt|^in$|inward|collect/.test(typeRaw) ? 'received' : /paid|pay|^out$|outward|made/.test(typeRaw) ? 'paid' : undefined;
      if (!direction) problems.push(`Type "${get(row, mapping, 'type')}" isn’t recognised. Use Received or Paid`);
      const party = get(row, mapping, 'party');
      const gstin = get(row, mapping, 'partyGstin');
      if (!party && !gstin) problems.push('No customer or supplier');
      const amount = amountOf(get(row, mapping, 'amount'), 'Amount', ctx, problems, { positive: true });
      if (!amount && !problems.some((p) => p.startsWith('Amount'))) problems.push('No amount');
      if (problems.length || !date || !direction || !amount) return void out.errors.push({ line, message: problems.join(' · ') });
      const method = methodOf(get(row, mapping, 'method'));
      out.records.push({
        line,
        value: { direction, party, ...(gstin && { gstin }), date, amount, ...(method && { method }), ...(get(row, mapping, 'account') && { account: get(row, mapping, 'account') }), ...(get(row, mapping, 'reference') && { reference: get(row, mapping, 'reference') }), ...(get(row, mapping, 'notes') && { notes: get(row, mapping, 'notes') }) } satisfies PaymentRecord,
      });
    });
    return out;
  },
  async send(values, dryRun, env): Promise<SendResult> {
    const recs = values as PaymentRecord[];
    const [parties, accounts] = await Promise.all([loadParties(env.companyId), loadAccounts(env.companyId)]);
    const before = importedBefore(env.companyId, 'payments');
    const results: Outcome[] = [];
    const todo: { index: number; key: string; body: Record<string, unknown> }[] = [];
    const seen = new Set<string>();
    for (const [index, rec] of recs.entries()) {
      const key = `${rec.direction}|${rec.date}|${rec.amount.minor}|${partyKey(rec.party || rec.gstin || '')}|${norm(rec.reference ?? '')}`;
      if (before.has(key) || seen.has(key)) {
        results[index] = { index, status: 'duplicate', message: 'Already imported from this computer.' };
        continue;
      }
      const found = findParty(parties, rec.party, rec.gstin);
      const pendingParty = env.pending.parties.has(partyKey(rec.party)) || (!!rec.gstin && env.pending.parties.has(normalizeGstin(rec.gstin)));
      if (!found.party && !(dryRun && pendingParty)) {
        results[index] = { index, status: 'invalid', message: missingParty(env, rec.party, rec.gstin, found.problem) };
        continue;
      }
      const chosen = pickAccount(accounts, rec.account, rec.method);
      if (!chosen.account) {
        results[index] = { index, status: 'invalid', message: chosen.problem };
        continue;
      }
      seen.add(key);
      results[index] = { index, status: 'created' };
      todo.push({
        index,
        key,
        body: {
          direction: rec.direction,
          partyId: found.party?.id,
          date: rec.date,
          amount: rec.amount,
          currency: env.ctx.currency,
          method: chosen.method,
          accountId: chosen.account.id,
          ...(rec.reference && { reference: rec.reference }),
          ...(rec.notes && { notes: rec.notes }),
          allocations: [],
        },
      });
    }
    if (!dryRun) {
      const done: string[] = [];
      await pool(todo, 4, async (t) => {
        try {
          await api().POST('/companies/{companyId}/payments', { params: { path: { companyId: env.companyId } }, body: t.body as never });
          done.push(t.key);
        } catch (err) {
          results[t.index] = { index: t.index, status: 'invalid', message: errorMessage(err) };
        }
      });
      remember(env.companyId, 'payments', done);
    }
    return tally(results);
  },
  planNeeds: (records, ctx) => needs(ctx, 'payables', 'Payments made to suppliers', (records as PaymentRecord[]).filter((r) => r.direction === 'paid').length),
  preview: [
    { label: 'Date', value: (p: PaymentRecord) => p.date },
    { label: 'Type', value: (p: PaymentRecord) => p.direction },
    { label: 'Party', value: (p: PaymentRecord) => p.party || p.gstin || '' },
    { label: 'Amount', value: (p: PaymentRecord) => inr(toMajor(p.amount)) },
    { label: 'Method', value: (p: PaymentRecord) => p.method ?? '' },
  ] as Entity['preview'],
};

/* ------------------------------------------------------------------------------------------------
 * Expenses: what the business spent, by category. A category that is not set up yet is added.
 * ---------------------------------------------------------------------------------------------- */

type ExpenseRecord = { date: string; category: string; amount: Money; method?: string; account?: string; supplier?: string; taxRate?: number; reference?: string; notes?: string };

export const EXPENSES: Entity = {
  id: 'expenses',
  group: 'Transactions',
  title: 'Expenses',
  blurb: 'Rent, fuel, salaries, travel and every other cost, by category. Paid from a cash or bank account, which cannot go below zero.',
  sheetName: 'Expenses',
  nameHint: /expense|spend|cost|payout/i,
  signature: ['date', 'category', 'amount'],
  fields: [
    { key: 'date', label: 'Date', required: true },
    { key: 'category', label: 'Category', required: true },
    { key: 'amount', label: 'Amount', required: true },
    { key: 'method', label: 'Method' },
    { key: 'account', label: 'Cash / bank account' },
    { key: 'supplier', label: 'Supplier' },
    { key: 'taxRate', label: 'GST % (in the amount)' },
    { key: 'reference', label: 'Reference' },
    { key: 'notes', label: 'Notes' },
  ],
  template: {
    name: 'Expenses',
    columns: [
      col('Date', '(example) 31/03/2026', 'Required. Day/month/year.', { required: true, width: 20 }),
      col('Category', 'Rent', 'Required. A category is added if you do not have it yet.', { required: true, width: 22 }),
      col('Amount', '25000', 'Required. The total paid.', { required: true }),
      col('Method', 'Bank', 'Cash, Bank, UPI, Card, Cheque, Wallet or Other.', { options: ['Cash', 'Bank', 'UPI', 'Card', 'Cheque', 'Wallet', 'Other'] }),
      col('Account', '', 'The cash or bank account in Elixir Books. Left blank, the first that fits the method.', { width: 22 }),
      col('Supplier', '', 'A supplier from your contacts. Left blank is fine.', { width: 22 }),
      col('GST %', '', 'If the amount includes GST, its rate.', { options: ['0', '5', '12', '18', '28'] }),
      col('Reference', 'Bill 4471', 'A bill number or note.'),
      col('Notes', '', 'Anything else.', { width: 24 }),
    ],
  },
  guess: (header) =>
    matchColumns(header, {
      date: ['date', 'expensedate', 'voucherdate', 'txndate', 'transactiondate'],
      category: ['category', 'expensecategory', 'head', 'expensehead', 'expenseaccount', 'accountname', 'ledger', 'ledgername', 'type', 'expensetype'],
      amount: ['amount', 'amt', 'total', 'expenseamount', 'paid', 'debit'],
      method: ['method', 'paymentmethod', 'paymentmode', 'mode', 'modeofpayment'],
      account: ['account', 'paymentaccount', 'bank', 'bankaccount', 'paidfrom', 'cashbank', 'paidthrough'],
      supplier: ['supplier', 'suppliername', 'vendor', 'vendorname', 'paidto', 'payee', 'party'],
      taxRate: ['gst', 'gstrate', 'taxrate', 'tax', 'gstpercent'],
      reference: ['reference', 'refno', 'referenceno', 'billno', 'invoiceno', 'ref'],
      notes: ['notes', 'remarks', 'narration', 'description', 'memo', 'details'],
    }) as Mapping,
  parse(rows, mapping, ctx) {
    const { rows: clean, lineOf } = withoutExamples(rows);
    const out: Parsed = { records: [], errors: [] };
    clean.slice(1).forEach((row, i) => {
      const line = lineOf.get(row) ?? i + 2;
      const problems: string[] = [];
      const date = toIsoDate(get(row, mapping, 'date'));
      if (!date) problems.push(`Date "${get(row, mapping, 'date')}" ${DATE_HELP}`);
      const category = get(row, mapping, 'category');
      if (!category) problems.push('No category');
      const amount = amountOf(get(row, mapping, 'amount'), 'Amount', ctx, problems, { positive: true });
      if (!amount && !problems.some((p) => p.startsWith('Amount'))) problems.push('No amount');
      const taxRaw = get(row, mapping, 'taxRate');
      const tax = rateOf(taxRaw);
      if (tax === null) problems.push(`GST "${taxRaw}" is not a rate`);
      else if (tax !== undefined && !taxByRate(ctx, tax)) problems.push(`GST ${tax}% isn’t set up. Use one of: ${ctx.taxCategories.map((c) => `${c.rate}%`).join(', ')}`);
      if (problems.length || !date || !amount) return void out.errors.push({ line, message: problems.join(' · ') });
      const method = methodOf(get(row, mapping, 'method'));
      out.records.push({
        line,
        value: {
          date,
          category,
          amount,
          ...(method && { method }),
          ...(get(row, mapping, 'account') && { account: get(row, mapping, 'account') }),
          ...(get(row, mapping, 'supplier') && { supplier: get(row, mapping, 'supplier') }),
          ...(typeof tax === 'number' && tax > 0 && { taxRate: tax }),
          ...(get(row, mapping, 'reference') && { reference: get(row, mapping, 'reference') }),
          ...(get(row, mapping, 'notes') && { notes: get(row, mapping, 'notes') }),
        } satisfies ExpenseRecord,
      });
    });
    return out;
  },
  async send(values, dryRun, env): Promise<SendResult> {
    const recs = values as ExpenseRecord[];
    const [parties, accounts, categories] = await Promise.all([loadParties(env.companyId), loadAccounts(env.companyId), loadCategories(env.companyId)]);
    const before = importedBefore(env.companyId, 'expenses');
    const categoryId = new Map(categories.map((c) => [norm(c.name), c.id]));
    const results: Outcome[] = [];
    const todo: { index: number; key: string; rec: ExpenseRecord; account: AccountRef; method: string }[] = [];
    const seen = new Set<string>();
    for (const [index, rec] of recs.entries()) {
      const key = `${rec.date}|${norm(rec.category)}|${rec.amount.minor}|${norm(rec.reference ?? '')}|${norm(rec.notes ?? '')}`;
      if (before.has(key) || seen.has(key)) {
        results[index] = { index, status: 'duplicate', message: 'Already imported from this computer.' };
        continue;
      }
      const chosen = pickAccount(accounts, rec.account, rec.method);
      if (!chosen.account || !chosen.method) {
        results[index] = { index, status: 'invalid', message: chosen.problem };
        continue;
      }
      seen.add(key);
      results[index] = { index, status: 'created' };
      todo.push({ index, key, rec, account: chosen.account, method: chosen.method });
    }
    if (!dryRun) {
      // Categories the business does not have yet, added once each before the expenses that use them.
      for (const name of new Set(todo.filter((t) => !categoryId.has(norm(t.rec.category))).map((t) => t.rec.category.trim()))) {
        if (categoryId.has(norm(name))) continue;
        try {
          const made = await api().POST('/companies/{companyId}/expense-categories', { params: { path: { companyId: env.companyId } }, body: { name } as never });
          const id = (made.data as { id?: string } | undefined)?.id;
          if (id) categoryId.set(norm(name), id);
        } catch (err) {
          for (const t of todo.filter((x) => norm(x.rec.category) === norm(name))) results[t.index] = { index: t.index, status: 'invalid', message: `The category ${name} could not be added: ${errorMessage(err)}` };
        }
      }
      const done: string[] = [];
      await pool(
        todo.filter((t) => results[t.index].status === 'created'),
        4,
        async (t) => {
          const { rec, account, method } = t;
          const supplier = rec.supplier ? findParty(parties, rec.supplier).party : undefined;
          const tax = rec.taxRate !== undefined ? taxByRate(env.ctx, rec.taxRate) : undefined;
          const notes = [rec.notes, rec.supplier && !supplier ? `Supplier: ${rec.supplier}` : ''].filter(Boolean).join(' · ');
          try {
            await api().POST('/companies/{companyId}/expenses', {
              params: { path: { companyId: env.companyId } },
              body: {
                categoryId: categoryId.get(norm(rec.category)),
                ...(supplier && { supplierId: supplier.id }),
                date: rec.date,
                amount: rec.amount,
                currency: env.ctx.currency,
                method,
                accountId: account.id,
                ...(tax && { taxCategoryId: tax.id, taxInclusive: true }),
                ...(rec.reference && { reference: rec.reference }),
                ...(notes && { notes }),
              } as never,
            });
            done.push(t.key);
          } catch (err) {
            results[t.index] = { index: t.index, status: 'invalid', message: errorMessage(err) };
          }
        },
      );
      remember(env.companyId, 'expenses', done);
    }
    return tally(results);
  },
  planNeeds: (records, ctx) => needs(ctx, 'expenses', 'Expenses', records.length),
  preview: [
    { label: 'Date', value: (e: ExpenseRecord) => e.date },
    { label: 'Category', value: (e: ExpenseRecord) => e.category },
    { label: 'Amount', value: (e: ExpenseRecord) => inr(toMajor(e.amount)) },
    { label: 'Method', value: (e: ExpenseRecord) => e.method ?? '' },
    { label: 'Supplier', value: (e: ExpenseRecord) => e.supplier ?? '' },
  ] as Entity['preview'],
};

/* ------------------------------------------------------------------------------------------------
 * Opening balances: what customers still owed, and what was still owed to suppliers, invoice by
 * invoice, when the books start here. They keep their original numbers and due dates and post only to
 * Opening balances, never to sales or GST. The server checks every row (a dry run) before saving.
 * ---------------------------------------------------------------------------------------------- */

type OpeningRecord = { kind: 'openingInvoice' | 'openingBill'; party: string; number: string; date: string; dueDate?: string; amount: Money };

export const OPENINGS: Entity = {
  id: 'openings',
  group: 'Opening balances',
  title: 'Outstanding invoices & bills',
  blurb: 'What customers still owe you and what you still owe suppliers, invoice by invoice.',
  sheetName: 'Opening Balances',
  nameHint: /opening|outstanding|receivable|payable|pending|due|ageing|aging/i,
  signature: ['party', 'number', 'amount'],
  fields: [
    { key: 'type', label: 'Type (Customer invoice / Supplier bill)' },
    { key: 'party', label: 'Customer or supplier', required: true },
    { key: 'partyGstin', label: 'GSTIN' },
    { key: 'number', label: 'Invoice or bill number', required: true },
    { key: 'date', label: 'Date', required: true },
    { key: 'dueDate', label: 'Due date' },
    { key: 'amount', label: 'Amount still outstanding', required: true },
  ],
  template: {
    name: 'Opening Balances',
    columns: [
      col('Type', 'Customer invoice', 'Customer invoice (they owe you) or Supplier bill (you owe them). Left blank, Customer invoice.', { options: ['Customer invoice', 'Supplier bill'] }),
      col('Party', '(example) Sharma Traders', 'Required. The contact’s name as in your contacts.', { required: true, width: 26 }),
      col('GSTIN', '', 'Used to find the contact. Better than a name.', { width: 20 }),
      col('Number', 'INV-0412', 'Required. The number it was raised under.', { required: true }),
      col('Date', '15/02/2026', 'Required. Day/month/year.', { required: true }),
      col('Due Date', '15/03/2026', 'Day/month/year.'),
      col('Amount', '25000', 'Required. What is still unpaid on it.', { required: true }),
    ],
  },
  guess: (header) =>
    matchColumns(header, {
      type: ['type', 'kind', 'documenttype', 'invoicetype', 'side'],
      party: ['party', 'partyname', 'customer', 'supplier', 'customername', 'suppliername', 'vendor', 'ledgername', 'name'],
      partyGstin: ['gstin', 'gstno', 'partygstin', 'gstinuin'],
      number: ['number', 'invoiceno', 'billno', 'invoicenumber', 'billnumber', 'voucherno', 'refno', 'documentno'],
      date: ['date', 'invoicedate', 'billdate', 'voucherdate'],
      dueDate: ['duedate', 'paymentdue', 'duedt'],
      amount: ['amount', 'outstanding', 'balance', 'pending', 'due', 'amountdue', 'outstandingamount', 'balancedue', 'pendingamount', 'openingbalance'],
    }) as Mapping,
  parse(rows, mapping, ctx) {
    const { rows: clean, lineOf } = withoutExamples(rows);
    const out: Parsed = { records: [], errors: [] };
    clean.slice(1).forEach((row, i) => {
      const line = lineOf.get(row) ?? i + 2;
      const problems: string[] = [];
      const typeRaw = norm(get(row, mapping, 'type'));
      const kind = /supplier|bill|vendor|payable|creditor|purchase/.test(typeRaw) ? 'openingBill' : 'openingInvoice';
      const gstin = get(row, mapping, 'partyGstin');
      const party = get(row, mapping, 'party');
      const partyKeyText = gstin && isValidGstin(normalizeGstin(gstin)) ? normalizeGstin(gstin) : party;
      if (!partyKeyText) problems.push('No customer or supplier');
      const number = get(row, mapping, 'number');
      if (!number) problems.push('No invoice or bill number');
      const date = toIsoDate(get(row, mapping, 'date'));
      if (!date) problems.push(`Date "${get(row, mapping, 'date')}" ${DATE_HELP}`);
      const dueRaw = get(row, mapping, 'dueDate');
      const dueDate = dueRaw ? toIsoDate(dueRaw) : undefined;
      if (dueRaw && !dueDate) problems.push(`Due date "${dueRaw}" ${DATE_HELP}`);
      const amount = amountOf(get(row, mapping, 'amount'), 'Amount', ctx, problems, { positive: true });
      if (!amount && !problems.some((p) => p.startsWith('Amount'))) problems.push('Nothing outstanding');
      if (problems.length || !date || !amount) return void out.errors.push({ line, message: problems.join(' · ') });
      out.records.push({ line, value: { kind, party: partyKeyText, number, date, ...(dueDate && { dueDate }), amount } satisfies OpeningRecord });
    });
    return out;
  },
  async send(values, dryRun, env): Promise<SendResult> {
    const recs = values as OpeningRecord[];
    const res = await inChunks(recs, async (chunk) => {
      const { data, error } = await api().POST('/companies/{companyId}/documents/openings/import', { params: { path: { companyId: env.companyId } }, body: { rows: chunk as never, dryRun } });
      if (error || !data) throw error ?? new Error('No answer from the server');
      return shape(data as never);
    }, 500);
    const results = res.results.map((r) => {
      const rec = recs[r.index];
      if (r.status !== 'invalid' || !/^No contact /.test(r.message ?? '')) return r;
      // In the check, a contact this same file is about to add does not exist yet: that is not a problem.
      if (dryRun && env.pending.parties.has(partyKey(rec.party))) return { ...r, status: 'created' as const, message: undefined };
      return { ...r, message: missingParty(env, rec.party, undefined, r.message) };
    });
    return tally(results);
  },
  planNeeds: (records, ctx) => needs(ctx, 'purchases', 'Bills you owe suppliers', (records as OpeningRecord[]).filter((r) => r.kind === 'openingBill').length),
  preview: [
    { label: 'Type', value: (o: OpeningRecord) => (o.kind === 'openingBill' ? 'Supplier bill' : 'Customer invoice') },
    { label: 'Party', value: (o: OpeningRecord) => o.party },
    { label: 'Number', value: (o: OpeningRecord) => o.number },
    { label: 'Date', value: (o: OpeningRecord) => o.date },
    { label: 'Outstanding', value: (o: OpeningRecord) => inr(toMajor(o.amount)) },
  ] as Entity['preview'],
};

/* ------------------------------------------------------------------------------------------------
 * Journal entries: one row per line, rows with the same reference making one journal. Used for
 * opening balances of accounts, adjustments, anything that is not an invoice or a payment.
 * ---------------------------------------------------------------------------------------------- */

type JournalRecord = { reference: string; date: string; narration?: string; lines: { account: string; debitMinor: number; creditMinor: number; narration?: string }[] };

export const JOURNALS: Entity = {
  id: 'journals',
  group: 'Opening balances',
  title: 'Journal entries',
  blurb: 'Opening balances of accounts and any other journal, debit and credit.',
  sheetName: 'Journals',
  nameHint: /journal|voucher|ledger|trial|jv/i,
  signature: ['date', 'account'],
  options: [
    {
      key: 'save',
      label: 'Save them as',
      hint: 'Posted journals change your books straight away and must balance. Drafts can be looked over and posted in Elixir Books.',
      choices: [
        { value: 'post', label: 'Posted journals' },
        { value: 'draft', label: 'Drafts' },
      ],
      default: 'post',
    },
  ],
  fields: [
    { key: 'date', label: 'Date', required: true },
    { key: 'reference', label: 'Journal number' },
    { key: 'account', label: 'Account', required: true },
    { key: 'debit', label: 'Debit' },
    { key: 'credit', label: 'Credit' },
    { key: 'narration', label: 'Narration' },
  ],
  template: {
    name: 'Journals',
    columns: [
      col('Date', '(example) 31/03/2026', 'Required. Day/month/year.', { required: true, width: 20 }),
      col('Journal No', 'JV-1', 'Rows with the same number are one journal.'),
      col('Account', 'Rent', 'Required. An account from your chart of accounts.', { required: true, width: 24 }),
      col('Debit', '25000', 'Each line is a debit or a credit.'),
      col('Credit', '', 'Each line is a debit or a credit.'),
      col('Narration', 'March rent', 'What it was for.', { width: 28 }),
    ],
  },
  guess: (header) => guessJournalColumns(header) as Mapping,
  parse(rows, mapping, ctx) {
    const { rows: clean } = withoutExamples(rows);
    const out: Parsed = { records: [], errors: [] };
    if (!ctx.accounts.length) {
      out.errors.push({ line: 2, message: 'Journals need the Books feature, which this business does not have yet.' });
      return out;
    }
    const names = ctx.accounts.map((a) => ({ key: a.key, name: a.name }));
    // The core reader knows a few date forms; hand it every form we know, as ISO.
    const dateAt = mapping.date;
    const normalised = dateAt === undefined ? clean : clean.map((r, i) => (i === 0 ? r : r.map((c, ci) => (ci === dateAt ? (toIsoDate(c) ?? c) : c))));
    for (const j of journalsFromCsv(normalised, mapping as Partial<Record<JournalField, number>>, names, ctx.currency)) {
      if (j.problems.length || !j.lines.length) out.errors.push({ line: j.line, message: `${j.reference ? `${j.reference}: ` : ''}${j.problems.join(' · ') || 'Nothing to import'}` });
      else out.records.push({ line: j.line, value: { reference: j.reference, date: j.date, ...(j.narration && { narration: j.narration }), lines: j.lines } satisfies JournalRecord });
    }
    return out;
  },
  async send(values, dryRun, env): Promise<SendResult> {
    const journals = values as JournalRecord[];
    const asDrafts = env.options.save === 'draft';
    return inChunks(
      journals,
      async (chunk) => {
        const { data, error } = await api().POST('/companies/{companyId}/vouchers/import', {
          params: { path: { companyId: env.companyId } },
          body: {
            dryRun,
            asDrafts,
            vouchers: (chunk as JournalRecord[]).map((j) => ({
              kind: 'journal',
              date: j.date,
              ...(j.reference && { reference: j.reference }),
              ...(j.narration && { narration: j.narration }),
              lines: j.lines.map((l) => ({ account: l.account, debit: money(l.debitMinor, env.ctx.currency), credit: money(l.creditMinor, env.ctx.currency), ...(l.narration && { narration: l.narration }) })),
            })),
          } as never,
        });
        if (error || !data) throw error ?? new Error('No answer from the server');
        return shape(data as never);
      },
      500,
    );
  },
  planNeeds: (records, ctx) => needs(ctx, 'books', 'Journal entries', records.length),
  preview: [
    { label: 'Date', value: (j: JournalRecord) => j.date },
    { label: 'Number', value: (j: JournalRecord) => j.reference },
    { label: 'Lines', value: (j: JournalRecord) => String(j.lines.length) },
    { label: 'Total', value: (j: JournalRecord) => inr(j.lines.reduce((n, l) => n + l.debitMinor, 0) / 100) },
    { label: 'Narration', value: (j: JournalRecord) => j.narration ?? '' },
  ] as Entity['preview'],
};

export { emptyResult };
