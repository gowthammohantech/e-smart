import { BusinessDocument, DocumentKind, Expense, Party, Payment } from '@/types';
import { Money, money, sum, zero } from '@/lib/money';
import { formatMoney } from '@/lib/format';
import { DateRange, DateRangePreset, inRange, resolveRange } from '@/lib/date';
import { AgingSummary, OutstandingDoc } from '@/domain/receivables';
import { DOCUMENT_LABELS } from '@/domain/documentStates';

/**
 * Lixi, the in-app assistant. The prototype has no server, so Lixi reads the
 * question for intent and answers from the same company-scoped books every
 * screen uses. No numbers are made up: if the data isn't there, Lixi says so.
 *
 * Lixi never writes to the books. Anything that opens a form which would,
 * carries a `confirm` prompt the chat asks before navigating.
 */

export type LixiContext = {
  currency: string;
  documents: BusinessDocument[];
  payments: Payment[];
  expenses: Expense[];
  parties: Party[];
  receivables: { outstanding: OutstandingDoc[]; summary: AgingSummary };
  payables: { outstanding: OutstandingDoc[]; summary: AgingSummary };
  lowStock: { name: string; onHand: number; unit: string }[];
  compliance: {
    failed: number;
    generated: number;
    pending: number;
    ewbActive: number;
    ewbExpiringSoon: number;
    ewbExpired: number;
    /** Documents that need an e-way bill and have no live one. */
    ewbMissing: number;
  };
  /** Output tax charged this month, already summed by the reports engine. */
  monthTax: Money;
  userName?: string;
};

export type LixiStat = { label: string; value: string; tone?: 'good' | 'warn' | 'bad' };

export type LixiAction =
  | { type: 'route'; label: string; route: string; icon?: string; confirm?: string }
  | { type: 'document'; label: string; kind: DocumentKind; id: string }
  | { type: 'ask'; label: string; question?: string };

export type LixiReply = {
  text: string;
  stats?: LixiStat[];
  actions?: LixiAction[];
};

const LIVE = (d: BusinessDocument) => !['draft', 'cancelled', 'rejected'].includes(d.status);

const fmt = (m: Money) => formatMoney(m, { noDecimals: true });

/** A foreign-currency document's value in the company's base currency. */
const toBase = (m: Money, rate: number | undefined, currency: string) =>
  money(Math.round(m.minor * (rate || 1)), currency);

const total = (values: Money[], currency: string) => (values.length ? sum(values, currency) : zero(currency));

const docsTotal = (docs: BusinessDocument[], currency: string) =>
  total(docs.map((d) => toBase(d.totals.grandTotal, d.exchangeRate, currency)), currency);

const owedTotal = (rows: OutstandingDoc[], currency: string) =>
  total(rows.map((o) => toBase(o.outstanding, o.document.exchangeRate, currency)), currency);

function has(q: string, ...words: string[]) {
  return words.some((w) => q.includes(w));
}

function plural(n: number, one: string, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`;
}

/** The starter prompts shown before the first message. */
export const LIXI_SUGGESTIONS = [
  'How are sales this month?',
  'Who owes me money?',
  'Anything wrong with GST?',
  'What is low on stock?',
  'What did I spend last month?',
  'Draft a new invoice',
];

/**
 * What Lixi is asked when a tab is held down: the question that tab's screen
 * most often raises. Keys are the tab route names.
 */
export const TAB_QUESTIONS: Record<string, string> = {
  index: 'How is business this month?',
  sales: 'Any drafts or quotes waiting?',
  purchases: 'What do I owe suppliers?',
  inventory: 'What is low on stock?',
  contacts: 'Top customers',
  reports: 'What did I spend last month?',
  more: 'Anything wrong with GST?',
};

export function greet(ctx: LixiContext): LixiReply {
  const first = ctx.userName?.split(' ')[0];
  const gst = ctx.compliance.failed + ctx.compliance.ewbExpiringSoon;
  const overdue = ctx.receivables.outstanding.filter((o) => o.daysOverdue > 0).length;
  const low = ctx.lowStock.length;
  const flags = [
    overdue ? plural(overdue, 'overdue invoice') : null,
    gst ? plural(gst, 'GST item') : null,
    low ? plural(low, 'item') + ' low on stock' : null,
  ].filter(Boolean);
  const heads = flags.length ? `Heads up: ${flags.join(', ')}.` : 'Your books look tidy today.';
  return {
    text: `Hi${first ? ` ${first}` : ''}, I'm Lixi. ${heads} I read your books but never change them without asking.`,
  };
}

/** Routes for the forms Lixi can open, each confirmed first. */
const CREATE: { words: string[]; label: string; route: string; icon: string; text: string }[] = [
  { words: ['quote', 'quotation', 'estimate'], label: 'New quote', route: '/(app)/sales/quotes/new', icon: 'file-percent-outline', text: 'I can open a fresh quotation for you to fill in.' },
  { words: ['purchase order', ' po'], label: 'New purchase order', route: '/(app)/purchases/orders/new', icon: 'cart-plus', text: 'I can open a purchase order for you to fill in.' },
  { words: ['bill', 'purchase'], label: 'New purchase bill', route: '/(app)/purchases/bills/new', icon: 'file-document-outline', text: 'I can open a purchase bill; you add the supplier and lines.' },
  { words: ['expense', 'spend'], label: 'Record expense', route: '/(app)/expenses/new', icon: 'receipt-text-outline', text: 'I can open a new expense for you.' },
  { words: ['payment', 'receipt', 'receive'], label: 'Receive payment', route: '/(app)/payments/new', icon: 'cash-plus', text: "I can open a payment receipt so you can record what came in." },
  { words: ['supplier', 'vendor'], label: 'Add supplier', route: '/(app)/contacts/suppliers/new', icon: 'account-plus-outline', text: 'I can open a new supplier for you.' },
  { words: ['customer', 'client'], label: 'Add customer', route: '/(app)/contacts/customers/new', icon: 'account-plus-outline', text: 'I can open a new customer; the GSTIN fills in their state.' },
  { words: ['item', 'product', 'service'], label: 'Add item', route: '/(app)/catalog/items/new', icon: 'tag-plus-outline', text: 'I can open a new item; give it an HSN/SAC so GST lands on the right slab.' },
];

export function answer(input: string, ctx: LixiContext): LixiReply {
  const q = input.toLowerCase().trim();
  const { currency } = ctx;
  const invoices = ctx.documents.filter((d) => d.kind === 'invoice');

  if (!q) return { text: 'Ask me anything about your books.' };

  // A document number wins over every keyword: "INV-0042" should just open it.
  const byNumber = ctx.documents.find((d) => d.number && q.includes(d.number.toLowerCase()));
  if (byNumber) {
    const party = ctx.parties.find((p) => p.id === byNumber.partyId);
    const irn = byNumber.compliance?.eInvoiceStatus;
    return {
      text: `${DOCUMENT_LABELS[byNumber.kind].singular} ${byNumber.number} for ${party?.name ?? 'an unknown party'}, dated ${byNumber.date}. It's ${byNumber.status}.`,
      stats: [
        { label: 'Total', value: fmt(byNumber.totals.grandTotal) },
        ...(irn && irn !== 'notApplicable'
          ? [{ label: 'E-invoice', value: irn, tone: irn === 'generated' ? 'good' : irn === 'failed' ? 'bad' : undefined } as LixiStat]
          : []),
      ],
      actions: [{ type: 'document', label: `Open ${byNumber.number}`, kind: byNumber.kind, id: byNumber.id }],
    };
  }

  // Creating things: Lixi opens the form, the person fills it in and saves.
  if (has(q, 'new ', 'create', 'make', 'draft a', 'raise', 'add ', 'record ')) {
    const target = CREATE.find((c) => has(q, ...c.words));
    const pick = target ?? {
      label: 'New invoice',
      route: '/(app)/sales/invoices/new',
      icon: 'file-document-edit-outline',
      text: "I can open a new tax invoice. I won't finalise it for you — you'll pick the customer and items and issue it yourself.",
    };
    return {
      text: pick.text,
      actions: [{ type: 'route', label: pick.label, route: pick.route, icon: pick.icon, confirm: `Open "${pick.label}"?` }],
    };
  }

  // A customer or supplier named in the question.
  const party = ctx.parties.find((p) => {
    const name = p.name.toLowerCase();
    const first = name.split(' ')[0].replace(/[^a-z0-9]/g, '');
    return q.includes(name) || (first.length > 3 && new RegExp(`\\b${first}\\b`).test(q));
  });
  if (party) {
    const supplier = party.kind === 'supplier';
    const book = supplier ? ctx.payables : ctx.receivables;
    const theirs = ctx.documents.filter((d) => d.partyId === party.id && d.kind === (supplier ? 'purchaseBill' : 'invoice') && LIVE(d));
    const due = book.outstanding.filter((o) => o.document.partyId === party.id && o.outstanding.minor > 0);
    const dueTotal = owedTotal(due, currency);
    const late = due.filter((o) => o.daysOverdue > 0);
    const text =
      due.length === 0
        ? supplier
          ? `You're square with ${party.name}.`
          : `${party.name} is fully paid up.`
        : supplier
          ? `You owe ${party.name} ${fmt(dueTotal)} on ${plural(due.length, 'bill')}${late.length ? `, ${late.length} past due` : ''}.`
          : `${party.name} owes you ${fmt(dueTotal)} across ${plural(due.length, 'invoice')}${late.length ? `, ${late.length} of them overdue` : ''}.`;
    return {
      text,
      stats: [
        { label: supplier ? 'Billed to you' : 'Billed', value: fmt(docsTotal(theirs, currency)) },
        { label: 'Outstanding', value: fmt(dueTotal), tone: late.length ? 'bad' : due.length ? 'warn' : 'good' },
        { label: supplier ? 'Bills' : 'Invoices', value: String(theirs.length) },
      ],
      actions: [
        { type: 'route', label: `Open ${party.name}`, route: `/(app)/contacts/${supplier ? 'suppliers' : 'customers'}/${party.id}` },
      ],
    };
  }

  // GST and compliance.
  if (has(q, 'gst', 'e-invoice', 'einvoice', 'irn', 'irp', 'e-way', 'eway', 'way bill', 'compliance', 'tax', 'gstr')) {
    const { failed, generated, pending, ewbActive, ewbExpiringSoon, ewbExpired, ewbMissing } = ctx.compliance;
    const problems = failed + ewbExpiringSoon + ewbMissing;
    return {
      text:
        problems === 0
          ? `All clear. ${plural(generated, 'IRN')} registered and nothing waiting on the portal. You've charged ${fmt(ctx.monthTax)} GST this month.`
          : [
              failed ? `The IRP rejected ${plural(failed, 'invoice')} — fix and resubmit before filing.` : null,
              ewbExpiringSoon ? `${plural(ewbExpiringSoon, 'e-way bill')} run${ewbExpiringSoon === 1 ? 's' : ''} out within a day; extend if the goods are still moving.` : null,
              ewbMissing ? `${plural(ewbMissing, 'document')} need${ewbMissing === 1 ? 's' : ''} an e-way bill and ${ewbMissing === 1 ? "doesn't" : "don't"} have one.` : null,
            ]
              .filter(Boolean)
              .join(' '),
      stats: [
        { label: 'GST this month', value: fmt(ctx.monthTax) },
        { label: 'IRNs', value: String(generated), tone: 'good' },
        { label: 'Rejected', value: String(failed), tone: failed ? 'bad' : 'good' },
        { label: 'Awaiting IRN', value: String(pending), tone: pending ? 'warn' : 'good' },
        { label: 'Live EWBs', value: String(ewbActive) },
        { label: 'Expired EWBs', value: String(ewbExpired) },
      ],
      actions: [{ type: 'route', label: 'GST compliance', route: '/(app)/compliance', icon: 'shield-check-outline' }],
    };
  }

  // What I owe suppliers — checked before receivables, since both say "owe".
  if (/\b(i|we) owe\b|payable|supplier|vendor|bills? due|to pay\b/.test(q)) {
    const open = ctx.payables.outstanding.filter((o) => o.outstanding.minor > 0);
    const late = open.filter((o) => o.daysOverdue > 0).sort((a, b) => b.outstanding.minor - a.outstanding.minor);
    const next = [...open].sort((a, b) => (a.document.dueDate ?? '').localeCompare(b.document.dueDate ?? ''))[0];
    const nextName = next ? ctx.parties.find((p) => p.id === next.document.partyId)?.name : undefined;
    return {
      text:
        open.length === 0
          ? "You don't owe any supplier right now."
          : `You owe suppliers ${fmt(ctx.payables.summary.total)} on ${plural(open.length, 'bill')}${late.length ? `, ${fmt(ctx.payables.summary.overdue)} of it past due` : ''}.${next ? ` Next up: ${nextName} on ${next.document.number}${next.document.dueDate ? `, due ${next.document.dueDate}` : ''}.` : ''}`,
      stats: [
        { label: 'Payable', value: fmt(ctx.payables.summary.total) },
        { label: 'Past due', value: fmt(ctx.payables.summary.overdue), tone: late.length ? 'bad' : 'good' },
        { label: 'Due in 7 days', value: fmt(ctx.payables.summary.dueSoon), tone: 'warn' },
      ],
      actions: [{ type: 'route', label: 'Payables', route: '/(app)/payables', icon: 'file-clock-outline' }],
    };
  }

  // Money owed to me.
  if (has(q, 'owe', 'outstanding', 'receivable', 'due', 'overdue', 'pending', 'collect', 'unpaid')) {
    const open = ctx.receivables.outstanding.filter((o) => o.outstanding.minor > 0);
    const late = open.filter((o) => o.daysOverdue > 0).sort((a, b) => b.outstanding.minor - a.outstanding.minor);
    const worst = late[0];
    const worstName = worst ? ctx.parties.find((p) => p.id === worst.document.partyId)?.name : undefined;
    return {
      text:
        open.length === 0
          ? 'Nobody owes you anything right now. Nice.'
          : `${fmt(ctx.receivables.summary.total)} is still to come in${late.length ? `, and ${fmt(ctx.receivables.summary.overdue)} of it is overdue` : ''}.${worst ? ` Biggest: ${worstName} on ${worst.document.number}, ${worst.daysOverdue} days late.` : ''}`,
      stats: [
        { label: 'Outstanding', value: fmt(ctx.receivables.summary.total) },
        { label: 'Overdue', value: fmt(ctx.receivables.summary.overdue), tone: late.length ? 'bad' : 'good' },
        { label: 'Invoices', value: String(open.length) },
      ],
      actions: [
        { type: 'route', label: 'Receivables', route: '/(app)/receivables', icon: 'clock-alert-outline' },
        ...(worst ? [{ type: 'document', label: `Open ${worst.document.number}`, kind: worst.document.kind, id: worst.document.id } as LixiAction] : []),
      ],
    };
  }

  // Stock.
  if (has(q, 'stock', 'inventory', 'reorder', 'running out', 'run out')) {
    const low = ctx.lowStock;
    return {
      text: low.length
        ? `${plural(low.length, 'item')} ${low.length === 1 ? 'is' : 'are'} at or below the reorder level.`
        : 'Nothing is below its reorder level right now.',
      stats: low.slice(0, 4).map((i) => ({ label: i.name, value: `${i.onHand} ${i.unit}`, tone: i.onHand <= 0 ? 'bad' : 'warn' }) as LixiStat),
      actions: [{ type: 'route', label: 'Low stock', route: '/(app)/inventory/low-stock', icon: 'package-variant' }],
    };
  }

  // Spending.
  if (has(q, 'spend', 'spent', 'expense', 'cost')) {
    const preset: DateRangePreset = has(q, 'this month') ? 'thisMonth' : 'lastMonth';
    const label = preset === 'thisMonth' ? 'This month' : 'Last month';
    const range = resolveRange(preset);
    const rows = ctx.expenses.filter((e) => inRange(e.date, range));
    const spent = total(rows.map((e) => toBase(e.amount, e.exchangeRate, currency)), currency);
    return {
      text: `${label} you spent ${fmt(spent)} across ${plural(rows.length, 'expense')}. You also owe suppliers ${fmt(ctx.payables.summary.total)}.`,
      stats: [
        { label: 'Spent', value: fmt(spent) },
        { label: 'Expenses', value: String(rows.length) },
        { label: 'Owed to suppliers', value: fmt(ctx.payables.summary.total), tone: 'warn' },
      ],
      actions: [{ type: 'route', label: 'Expense report', route: '/(app)/reports/expense-summary', icon: 'chart-bar' }],
    };
  }

  // Best customers.
  if (has(q, 'top', 'best', 'biggest', 'customers', 'who buys')) {
    const byParty = new Map<string, number>();
    invoices
      .filter(LIVE)
      .forEach((d) => byParty.set(d.partyId, (byParty.get(d.partyId) ?? 0) + toBase(d.totals.grandTotal, d.exchangeRate, currency).minor));
    const ranked = [...byParty.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
    if (!ranked.length) return { text: "No invoices yet, so no leaderboard. Raise the first one and I'll start counting." };
    const nameOf = (id: string) => ctx.parties.find((p) => p.id === id)?.name ?? 'Unknown';
    return {
      text: `${nameOf(ranked[0][0])} leads your sales. Here are your top ${ranked.length}:`,
      stats: ranked.map(([id, minor]) => ({ label: nameOf(id), value: fmt(money(minor, currency)) })),
      actions: ranked.map(([id]) => ({ type: 'ask', label: `About ${nameOf(id)}`, question: nameOf(id) }) as LixiAction),
    };
  }

  // Drafts and quotes waiting.
  if (has(q, 'draft', 'quote', 'quotation', 'unfinished')) {
    const drafts = invoices.filter((d) => d.status === 'draft');
    const quotes = ctx.documents.filter((d) => d.kind === 'quote' && d.status === 'sent');
    return {
      text:
        drafts.length + quotes.length === 0
          ? 'Nothing half-done. Every invoice is issued and no quote is waiting.'
          : `${plural(drafts.length, 'draft invoice')} to finish and ${plural(quotes.length, 'quote')} awaiting a reply, worth ${fmt(docsTotal(quotes, currency))}.`,
      actions: [
        { type: 'route', label: 'Invoices', route: '/(app)/sales/invoices' },
        { type: 'route', label: 'Quotes', route: '/(app)/sales/quotes' },
      ],
    };
  }

  // Sales, with a period.
  if (has(q, 'sale', 'sold', 'revenue', 'turnover', 'income', 'business', 'how am i', 'how are', 'doing', 'summary', 'today', 'month', 'week', 'year')) {
    const preset: DateRangePreset = has(q, 'today') ? 'today' : has(q, 'last month') ? 'lastMonth' : has(q, 'week') ? 'last7' : has(q, 'year', 'fy') ? 'thisFY' : 'thisMonth';
    const label = ({ today: 'today', lastMonth: 'last month', last7: 'in the last 7 days', thisFY: 'this financial year' } as Record<string, string>)[preset] ?? 'this month';
    const range: DateRange = resolveRange(preset);
    const sold = invoices.filter((d) => LIVE(d) && inRange(d.date, range));
    const invoiced = docsTotal(sold, currency);
    const received = total(
      ctx.payments.filter((p) => p.direction === 'received' && inRange(p.date, range)).map((p) => toBase(p.amount, p.exchangeRate, currency)),
      currency,
    );
    return {
      text: sold.length
        ? `You've invoiced ${fmt(invoiced)} ${label} across ${plural(sold.length, 'invoice')} — about ${fmt(money(Math.round(invoiced.minor / sold.length), currency))} each — and collected ${fmt(received)}.`
        : `No invoices ${label} yet.${received.minor ? ` You did collect ${fmt(received)}.` : ''}`,
      stats: [
        { label: 'Invoiced', value: fmt(invoiced) },
        { label: 'Collected', value: fmt(received), tone: 'good' },
        { label: 'Invoices', value: String(sold.length) },
      ],
      actions: [{ type: 'route', label: 'Sales report', route: '/(app)/reports/sales-summary', icon: 'chart-bar' }],
    };
  }

  if (/\b(hi|hello|hey|namaste)\b/.test(q)) return greet(ctx);

  if (has(q, 'thank', 'thanks', 'great', 'cool')) return { text: 'Anytime. I am one tap away in the middle of the bar.' };

  return {
    text: "I didn't catch that. I'm best with sales, who owes you, what you owe, stock, spending, GST and e-way bills — or give me a document number or a party's name.",
    actions: LIXI_SUGGESTIONS.slice(0, 3).map((label) => ({ type: 'ask', label }) as LixiAction),
  };
}
