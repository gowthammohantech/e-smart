import { BusinessDocument, DocumentKind, Party, Payment } from '@/types';
import { Money, money, sum, zero } from '@/lib/money';
import { formatMoney } from '@/lib/format';
import { DateRange, inRange, resolveRange } from '@/lib/date';
import { OutstandingDoc } from '@/domain/receivables';
import { DOCUMENT_LABELS } from '@/domain/documentStates';

/**
 * Lixi, the in-app assistant. The prototype has no server, so Lixi reads the
 * question for intent and answers from the same company-scoped books every
 * screen uses. No numbers are made up: if the data isn't there, Lixi says so.
 */

export type LixiContext = {
  currency: string;
  documents: BusinessDocument[];
  payments: Payment[];
  parties: Party[];
  outstanding: OutstandingDoc[];
  compliance: {
    failed: number;
    registered: number;
    ewbExpiringToday: number;
    ewbExpired: number;
    ewbActive: number;
  };
  /** Output tax charged this month, already summed by the reports engine. */
  monthTax: Money;
  userName?: string;
};

export type LixiStat = { label: string; value: string; tone?: 'good' | 'warn' | 'bad' };

export type LixiAction =
  | { type: 'route'; label: string; route: string; icon?: string }
  | { type: 'document'; label: string; kind: DocumentKind; id: string }
  | { type: 'ask'; label: string };

export type LixiReply = {
  text: string;
  stats?: LixiStat[];
  actions?: LixiAction[];
};

const LIVE = (d: BusinessDocument) => !['draft', 'cancelled', 'rejected'].includes(d.status);

const fmt = (m: Money) => formatMoney(m, { noDecimals: true });

function totalOf(docs: BusinessDocument[], currency: string): Money {
  return docs.length ? sum(docs.map((d) => money(d.totals.grandTotal.minor, currency)), currency) : zero(currency);
}

function paidIn(payments: Payment[], range: DateRange, currency: string): Money {
  const live = payments.filter((p) => inRange(p.date, range));
  return live.length ? sum(live.map((p) => money(p.amount.minor, currency)), currency) : zero(currency);
}

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
  'Top customers',
  'Draft a new invoice',
];

export function greet(ctx: LixiContext): LixiReply {
  const first = ctx.userName?.split(' ')[0];
  const issues = ctx.compliance.failed + ctx.compliance.ewbExpiringToday + ctx.compliance.ewbExpired;
  const overdue = ctx.outstanding.filter((o) => o.daysOverdue > 0).length;
  const heads =
    issues + overdue === 0
      ? 'Your books look tidy today.'
      : `Heads up: ${[
          overdue ? plural(overdue, 'overdue invoice') : null,
          issues ? plural(issues, 'GST item') : null,
        ]
          .filter(Boolean)
          .join(' and ')} need${overdue + issues === 1 ? 's' : ''} a look.`;
  return {
    text: `Hi${first ? ` ${first}` : ''}, I'm Lixi. ${heads} Ask me about sales, dues, customers or GST.`,
  };
}

export function answer(input: string, ctx: LixiContext): LixiReply {
  const q = input.toLowerCase().trim();
  const { currency } = ctx;
  const invoices = ctx.documents.filter((d) => d.kind === 'invoice');

  if (!q) return { text: 'Ask me anything about your books.' };

  // A document number wins over every keyword: "INV-0042" should just open it.
  const byNumber = ctx.documents.find((d) => q.includes(d.number.toLowerCase()));
  if (byNumber) {
    const party = ctx.parties.find((p) => p.id === byNumber.partyId);
    const irn = byNumber.compliance?.eInvoice?.status;
    return {
      text: `${DOCUMENT_LABELS[byNumber.kind].singular} ${byNumber.number} for ${party?.name ?? 'an unknown customer'}, dated ${byNumber.date}. It's ${byNumber.status}.`,
      stats: [
        { label: 'Total', value: fmt(byNumber.totals.grandTotal) },
        ...(irn && irn !== 'notApplicable'
          ? [{ label: 'E-invoice', value: irn, tone: irn === 'generated' ? 'good' : irn === 'failed' ? 'bad' : undefined } as LixiStat]
          : []),
      ],
      actions: [{ type: 'document', label: `Open ${byNumber.number}`, kind: byNumber.kind, id: byNumber.id }],
    };
  }

  // Creating things.
  if (has(q, 'new ', 'create', 'make', 'draft a', 'raise', 'add ')) {
    if (has(q, 'quote', 'quotation', 'estimate'))
      return { text: 'Opening a fresh quotation for you.', actions: [{ type: 'route', label: 'New quote', route: '/(app)/sales/quotes/new', icon: 'file-percent-outline' }] };
    if (has(q, 'payment', 'receipt', 'receive'))
      return { text: "Let's record what came in.", actions: [{ type: 'route', label: 'Receive payment', route: '/(app)/payments/new', icon: 'cash-plus' }] };
    if (has(q, 'customer', 'party', 'client'))
      return { text: 'Add the customer — I only need a name to start, the GSTIN fills in their state.', actions: [{ type: 'route', label: 'Add customer', route: '/(app)/contacts/customers/new', icon: 'account-plus-outline' }] };
    if (has(q, 'item', 'product', 'service'))
      return { text: 'Add the item with its HSN/SAC so GST lands on the right slab.', actions: [{ type: 'route', label: 'Add item', route: '/(app)/catalog/items/new', icon: 'tag-plus-outline' }] };
    return { text: 'A new tax invoice, coming up. I will pick CGST/SGST or IGST from the place of supply.', actions: [{ type: 'route', label: 'New invoice', route: '/(app)/sales/invoices/new', icon: 'file-document-edit-outline' }] };
  }

  // A customer named in the question.
  const party = ctx.parties.find((p) => {
    const name = p.name.toLowerCase();
    const first = name.split(' ')[0];
    return q.includes(name) || (first.length > 3 && new RegExp(`\\b${first.replace(/[^a-z0-9]/g, '')}\\b`).test(q));
  });
  if (party) {
    const theirs = invoices.filter((d) => d.partyId === party.id && LIVE(d));
    const due = ctx.outstanding.filter((o) => o.document.partyId === party.id && o.outstanding.minor > 0);
    const dueTotal = due.length ? sum(due.map((o) => money(o.outstanding.minor, currency)), currency) : zero(currency);
    const late = due.filter((o) => o.daysOverdue > 0);
    return {
      text:
        due.length === 0
          ? `${party.name} is fully paid up.`
          : `${party.name} owes ${fmt(dueTotal)} across ${plural(due.length, 'invoice')}${late.length ? `, ${late.length} of them overdue` : ''}.`,
      stats: [
        { label: 'Billed', value: fmt(totalOf(theirs, currency)) },
        { label: 'Outstanding', value: fmt(dueTotal), tone: late.length ? 'bad' : due.length ? 'warn' : 'good' },
        { label: 'Invoices', value: String(theirs.length) },
      ],
      actions: [{ type: 'route', label: `Open ${party.name}`, route: `/(app)/contacts/customers/${party.id}` }],
    };
  }

  // GST and compliance.
  if (has(q, 'gst', 'e-invoice', 'einvoice', 'irn', 'irp', 'e-way', 'eway', 'way bill', 'compliance', 'tax', 'gstr')) {
    const { failed, registered, ewbExpiringToday, ewbExpired, ewbActive } = ctx.compliance;
    const problems = failed + ewbExpiringToday + ewbExpired;
    const actions: LixiAction[] = [];
    if (failed) actions.push({ type: 'route', label: 'Fix rejected invoices', route: '/(app)/gst/e-invoices', icon: 'alert-circle-outline' });
    if (ewbExpiringToday || ewbExpired) actions.push({ type: 'route', label: 'E-way bills', route: '/(app)/gst/e-way-bills', icon: 'truck-fast-outline' });
    actions.push({ type: 'route', label: 'GSTR-1', route: '/(app)/gst/gstr1', icon: 'file-table-outline' });
    return {
      text:
        problems === 0
          ? `All clear. ${plural(registered, 'IRN')} registered and nothing waiting on the portal. You've charged ${fmt(ctx.monthTax)} GST this month.`
          : [
              failed ? `The IRP rejected ${plural(failed, 'invoice')} — fix and resubmit before filing.` : null,
              ewbExpiringToday ? `${plural(ewbExpiringToday, 'e-way bill')} expire${ewbExpiringToday === 1 ? 's' : ''} today; extend it if the goods are still moving.` : null,
              ewbExpired ? `${plural(ewbExpired, 'e-way bill')} already expired.` : null,
            ]
              .filter(Boolean)
              .join(' '),
      stats: [
        { label: 'GST this month', value: fmt(ctx.monthTax) },
        { label: 'IRNs', value: String(registered), tone: 'good' },
        { label: 'Rejected', value: String(failed), tone: failed ? 'bad' : 'good' },
        { label: 'Live EWBs', value: String(ewbActive) },
      ],
      actions,
    };
  }

  // Money owed.
  if (has(q, 'owe', 'outstanding', 'receivable', 'due', 'overdue', 'pending', 'collect', 'unpaid')) {
    const open = ctx.outstanding.filter((o) => o.outstanding.minor > 0);
    const late = open.filter((o) => o.daysOverdue > 0).sort((a, b) => b.outstanding.minor - a.outstanding.minor);
    const total = open.length ? sum(open.map((o) => money(o.outstanding.minor, currency)), currency) : zero(currency);
    const lateTotal = late.length ? sum(late.map((o) => money(o.outstanding.minor, currency)), currency) : zero(currency);
    const worst = late[0];
    const worstName = worst ? ctx.parties.find((p) => p.id === worst.document.partyId)?.name : undefined;
    return {
      text:
        open.length === 0
          ? 'Nobody owes you anything right now. Nice.'
          : `${fmt(total)} is still to come in${late.length ? `, and ${fmt(lateTotal)} of it is overdue` : ''}.${worst ? ` Biggest: ${worstName} on ${worst.document.number}, ${worst.daysOverdue} days late.` : ''}`,
      stats: [
        { label: 'Outstanding', value: fmt(total) },
        { label: 'Overdue', value: fmt(lateTotal), tone: late.length ? 'bad' : 'good' },
        { label: 'Invoices', value: String(open.length) },
      ],
      actions: [
        { type: 'route', label: 'Receivables', route: '/(app)/receivables', icon: 'account-cash-outline' },
        ...(worst ? [{ type: 'document', label: `Open ${worst.document.number}`, kind: worst.document.kind, id: worst.document.id } as LixiAction] : []),
      ],
    };
  }

  // Best customers.
  if (has(q, 'top', 'best', 'biggest', 'customers', 'who buys')) {
    const byParty = new Map<string, number>();
    invoices.filter(LIVE).forEach((d) => byParty.set(d.partyId, (byParty.get(d.partyId) ?? 0) + d.totals.grandTotal.minor));
    const ranked = [...byParty.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
    if (!ranked.length) return { text: "No invoices yet, so no leaderboard. Raise the first one and I'll start counting." };
    const nameOf = (id: string) => ctx.parties.find((p) => p.id === id)?.name ?? 'Unknown';
    return {
      text: `${nameOf(ranked[0][0])} leads your sales. Here are your top ${ranked.length}:`,
      stats: ranked.map(([id, minor]) => ({ label: nameOf(id), value: fmt(money(minor, currency)) })),
      actions: ranked.map(([id]) => ({ type: 'ask', label: `About ${nameOf(id)}` }) as LixiAction),
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
          : `${plural(drafts.length, 'draft invoice')} to finish and ${plural(quotes.length, 'quote')} awaiting a reply, worth ${fmt(totalOf(quotes, currency))}.`,
      actions: [
        { type: 'route', label: 'Invoices', route: '/(app)/sales/invoices' },
        { type: 'route', label: 'Quotes', route: '/(app)/sales/quotes' },
      ],
    };
  }

  // Sales, with a period.
  if (has(q, 'sale', 'sold', 'revenue', 'turnover', 'income', 'business', 'how am i', 'how are', 'doing', 'summary', 'today', 'month', 'week', 'year')) {
    const preset = has(q, 'today') ? 'today' : has(q, 'last month') ? 'lastMonth' : has(q, 'week') ? 'last7' : has(q, 'year', 'fy') ? 'thisFY' : 'thisMonth';
    const label = { today: 'today', lastMonth: 'last month', last7: 'in the last 7 days', thisFY: 'this financial year', thisMonth: 'this month' }[preset];
    const range = resolveRange(preset);
    const sold = invoices.filter((d) => LIVE(d) && inRange(d.date, range));
    const total = totalOf(sold, currency);
    const received = paidIn(ctx.payments, range, currency);
    return {
      text: sold.length
        ? `You've invoiced ${fmt(total)} ${label} across ${plural(sold.length, 'invoice')}, and collected ${fmt(received)}.`
        : `No invoices ${label} yet.${received.minor ? ` You did collect ${fmt(received)}.` : ''}`,
      stats: [
        { label: 'Invoiced', value: fmt(total) },
        { label: 'Collected', value: fmt(received), tone: 'good' },
        { label: 'Invoices', value: String(sold.length) },
      ],
      actions: [{ type: 'route', label: 'Sales report', route: '/(app)/reports/sales', icon: 'chart-bar' }],
    };
  }

  if (/\b(hi|hello|hey|namaste)\b/.test(q)) return greet(ctx);

  if (has(q, 'thank', 'thanks', 'great', 'cool')) return { text: 'Anytime. I am one tap away in the middle of the bar.' };

  return {
    text: "I didn't catch that. I'm best with sales, who owes you, your customers, GST and e-way bills — or give me an invoice number.",
    actions: LIXI_SUGGESTIONS.slice(0, 3).map((label) => ({ type: 'ask', label }) as LixiAction),
  };
}
