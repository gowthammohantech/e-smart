import { BusinessDocument, DocumentKind, Expense, Party, Payment, PlanTier } from '@/types';
import { Money, money, sum, zero } from '@/lib/money';
import { formatMoney, listJoin } from '@/lib/format';
import { DateRange, DateRangePreset, inRange, resolveRange } from '@/lib/date';
import { AgingSummary, OutstandingDoc } from '@/domain/receivables';
import { documentKindLabel, keyLabel, moduleLabel, statusLabel, type Translate } from '@/i18n/labels';
import { E_INVOICE_STATUS_META } from '@/features/compliance/complianceMeta';
import { FULL_PLAN, Module, canOpen, hasModule, planInfo } from '@/domain/plan';
import i18n from '@/i18n';
import type { LanguageCode } from '@/i18n/config';
import { type IntentId, stemsFor } from './keywords';

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
  /** The company's plan; Lixi doesn't answer for modules it leaves out. Defaults to the full app. */
  plan?: PlanTier;
};

/**
 * What Lixi needs from outside itself. Injected rather than imported so the
 * module stays free of React and a test can pass a translator that echoes its
 * key instead of asserting on prose.
 */
export type LixiDeps = { t: Translate; lang: LanguageCode };

/** The live translator, read at call time so a language switch is picked up. */
export const liveDeps = (): LixiDeps => ({ t: i18n.t, lang: (i18n.language as LanguageCode) ?? 'en' });

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

/**
 * Tamil input needs normalising before anything is compared: several IMEs
 * emit decomposed sequences, and without NFC every Tamil question falls
 * straight through to "I didn't catch that" — which presents as "Tamil
 * doesn't work at all" rather than as a bug in one intent.
 *
 * `toLowerCase` is a harmless no-op on Tamil, which has no case.
 */
function normalise(input: string): string {
  return input.normalize('NFC').toLowerCase().trim();
}

/** Whether a question hits an intent, in English or the active language. */
function hits(q: string, intent: IntentId, deps: LixiDeps): boolean {
  return has(q, ...stemsFor(intent, deps.lang));
}

/** The starter prompts shown before the first message. */
const SUGGESTIONS: { key: string; module?: Module }[] = [
  { key: 'lixi:suggestion.sales' },
  { key: 'lixi:suggestion.owed' },
  { key: 'lixi:suggestion.gst' },
  { key: 'lixi:suggestion.stock', module: 'inventory' },
  { key: 'lixi:suggestion.spend', module: 'expenses' },
  { key: 'lixi:suggestion.draftInvoice' },
];

export function lixiSuggestions(plan: PlanTier = 'pro', deps: LixiDeps = liveDeps()): string[] {
  return SUGGESTIONS.filter((s) => !s.module || hasModule(plan, s.module)).map((s) => deps.t(s.key));
}

/**
 * What Lixi is asked when a tab is held down: the question that tab's screen
 * most often raises. Keys are the tab route names.
 */
const TAB_QUESTION_KEYS: Record<string, string> = {
  index: 'lixi:tabQuestion.index',
  sales: 'lixi:tabQuestion.sales',
  purchases: 'lixi:tabQuestion.purchases',
  inventory: 'lixi:tabQuestion.inventory',
  contacts: 'lixi:tabQuestion.contacts',
  reports: 'lixi:tabQuestion.reports',
  gst: 'lixi:tabQuestion.gst',
  more: 'lixi:tabQuestion.more',
};

/** The tabs that have a held-tab question. */
export const LIXI_TABS = Object.keys(TAB_QUESTION_KEYS);

/** The question a held tab asks, in the active language. */
export function tabQuestion(tab: string, deps: LixiDeps = liveDeps()): string | undefined {
  const key = TAB_QUESTION_KEYS[tab];
  return key ? deps.t(key) : undefined;
}

export function greet(ctx: LixiContext, deps: LixiDeps = liveDeps()): LixiReply {
  const { t } = deps;
  const first = ctx.userName?.split(' ')[0];
  const gst = ctx.compliance.failed + ctx.compliance.ewbExpiringSoon;
  const overdue = ctx.receivables.outstanding.filter((o) => o.daysOverdue > 0).length;
  const low = hasModule(ctx.plan ?? 'pro', 'inventory') ? ctx.lowStock.length : 0;
  const flags = [
    overdue ? t('lixi:flag.overdueInvoice', { count: overdue }) : null,
    gst ? t('lixi:flag.gstItem', { count: gst }) : null,
    low ? t('lixi:flag.lowStock', { count: low }) : null,
  ].filter((f): f is string => Boolean(f));
  const heads = flags.length ? t('lixi:greet.headsUp', { flags: listJoin(flags) }) : t('lixi:greet.tidy');
  const hello = first ? t('lixi:greet.named', { name: first }) : t('lixi:greet.anon');
  return { text: `${hello} ${heads} ${t('lixi:greet.promise')}` };
}

/** Routes for the forms Lixi can open, each confirmed first. */
/**
 * Routes for the forms Lixi can open, each confirmed first. `words` stays in
 * English here and is matched alongside the Tamil stems in `keywords.ts`,
 * because these are matched as substrings, not translated.
 */
const CREATE: { words: string[]; labelKey: string; route: string; icon: string; textKey: string }[] = [
  { words: ['quote', 'quotation', 'estimate', 'மதிப்பீடு'], labelKey: 'lixi:create.labelQuote', route: '/(app)/sales/quotes/new', icon: 'file-percent-outline', textKey: 'lixi:create.quote' },
  { words: ['purchase order', ' po', 'கொள்முதல் ஆர்டர்'], labelKey: 'lixi:create.labelPurchaseOrder', route: '/(app)/purchases/orders/new', icon: 'cart-plus', textKey: 'lixi:create.purchaseOrder' },
  { words: ['bill', 'purchase', 'பில்', 'கொள்முதல்'], labelKey: 'lixi:create.labelPurchaseBill', route: '/(app)/purchases/bills/new', icon: 'file-document-outline', textKey: 'lixi:create.purchaseBill' },
  { words: ['expense', 'spend', 'செலவ'], labelKey: 'lixi:create.labelExpense', route: '/(app)/expenses/new', icon: 'receipt-text-outline', textKey: 'lixi:create.expense' },
  { words: ['payment', 'receipt', 'receive', 'கட்டண', 'ரசீது'], labelKey: 'lixi:create.labelPayment', route: '/(app)/payments/new', icon: 'cash-plus', textKey: 'lixi:create.payment' },
  { words: ['supplier', 'vendor', 'சப்ளையர்'], labelKey: 'lixi:create.labelSupplier', route: '/(app)/contacts/suppliers/new', icon: 'account-plus-outline', textKey: 'lixi:create.supplier' },
  { words: ['customer', 'client', 'வாடிக்கையாள'], labelKey: 'lixi:create.labelCustomer', route: '/(app)/contacts/customers/new', icon: 'account-plus-outline', textKey: 'lixi:create.customer' },
  { words: ['item', 'product', 'service', 'பொருள்', 'சேவை'], labelKey: 'lixi:create.labelItem', route: '/(app)/catalog/items/new', icon: 'tag-plus-outline', textKey: 'lixi:create.item' },
];

/**
 * Questions about modules the plan leaves out, matched the same way the
 * answers below match them. Payables is checked first for the same reason
 * it is below: "I owe" would otherwise read as receivables.
 */
const GATED_TOPICS: { module: Module; intent: IntentId }[] = [
  { module: 'payables', intent: 'payables' },
  { module: 'inventory', intent: 'stock' },
  { module: 'expenses', intent: 'spend' },
];

function upsell(module: Module, plan: PlanTier, deps: LixiDeps): LixiReply {
  return {
    text: deps.t('lixi:upsell.text', {
      module: moduleLabel(deps.t, module),
      plan: planInfo(plan).name,
      fullPlan: planInfo(FULL_PLAN).name,
    }),
    actions: [{ type: 'route', label: deps.t('lixi:upsell.seePlans'), route: '/(app)/settings/plan', icon: 'star-circle-outline' }],
  };
}

/**
 * Answers a question, within what the company's plan covers. A question
 * about a module the plan leaves out gets a plain "not on your plan" rather
 * than a zero that reads like a fact, and no reply offers a screen the plan
 * can't open.
 */
export function answer(input: string, ctx: LixiContext, deps: LixiDeps = liveDeps()): LixiReply {
  const plan = ctx.plan ?? 'pro';
  const q = input.toLowerCase().trim();
  const creating = has(q, 'new ', 'create', 'make', 'draft a', 'raise', 'add ', 'record ');
  const byNumber = ctx.documents.some((d) => d.number && q.includes(d.number.toLowerCase()));

  if (q && !byNumber) {
    const target = creating ? CREATE.find((c) => has(q, ...c.words)) : undefined;
    if (target && !canOpen(plan, target.route)) {
      return upsell(target.route.includes('/expenses/') ? 'expenses' : 'purchases', plan, deps);
    }
    if (!creating) {
      const topic = GATED_TOPICS.find((g) => !hasModule(plan, g.module) && hits(q, g.intent, deps));
      if (topic) return upsell(topic.module, plan, deps);
    }
  }

  const reply = answerFromBooks(input, ctx, deps);
  return {
    ...reply,
    actions: reply.actions?.filter((a) => a.type !== 'route' || canOpen(plan, a.route)),
  };
}

function answerFromBooks(input: string, ctx: LixiContext, deps: LixiDeps): LixiReply {
  const { t } = deps;
  const q = normalise(input);
  const { currency } = ctx;
  const invoices = ctx.documents.filter((d) => d.kind === 'invoice');

  if (!q) return { text: t('lixi:empty.ask') };

  // A document number wins over every keyword: "INV-0042" should just open it.
  const byNumber = ctx.documents.find((d) => d.number && q.includes(d.number.toLowerCase()));
  if (byNumber) {
    const party = ctx.parties.find((p) => p.id === byNumber.partyId);
    const irn = byNumber.compliance?.eInvoiceStatus;
    return {
      // `byNumber.status` used to be interpolated raw here, which printed the
      // code ("partiallyPaid") rather than the label.
      text: t('lixi:doc.summary', {
        kind: documentKindLabel(t, byNumber.kind, 1),
        number: byNumber.number,
        party: party?.name ?? t('lixi:doc.unknownParty'),
        date: byNumber.date,
        status: statusLabel(t, byNumber.status),
      }),
      stats: [
        { label: t('lixi:doc.total'), value: fmt(byNumber.totals.grandTotal) },
        ...(irn && irn !== 'notApplicable'
          ? [{ label: t('lixi:doc.eInvoice'), value: keyLabel(t, E_INVOICE_STATUS_META[irn].labelKey), tone: irn === 'generated' ? 'good' : irn === 'failed' ? 'bad' : undefined } as LixiStat]
          : []),
      ],
      actions: [{ type: 'document', label: t('lixi:doc.open', { number: byNumber.number }), kind: byNumber.kind, id: byNumber.id }],
    };
  }

  // Creating things: Lixi opens the form, the person fills it in and saves.
  if (hits(q, 'create', deps)) {
    const target = CREATE.find((c) => has(q, ...c.words));
    const pick = target ?? {
      labelKey: 'lixi:create.labelInvoice',
      route: '/(app)/sales/invoices/new',
      icon: 'file-document-edit-outline',
      textKey: 'lixi:create.invoice',
    };
    const label = t(pick.labelKey);
    return {
      text: t(pick.textKey),
      actions: [{ type: 'route', label, route: pick.route, icon: pick.icon, confirm: t('lixi:create.confirm', { label }) }],
    };
  }

  // A customer or supplier named in the question.
  // Substring matching throughout: building a RegExp from a party name threw
  // on anything with a regex character in it ("C++ Ltd"), and `\b` never
  // matched a Tamil name in the first place.
  const party = ctx.parties.find((p) => {
    const name = p.name.toLowerCase();
    const first = name.split(' ')[0];
    return q.includes(name) || (first.length > 3 && q.includes(first));
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
          ? t('lixi:party.squareSupplier', { party: party.name })
          : t('lixi:party.paidUp', { party: party.name })
        : supplier
          ? t('lixi:party.youOwe', {
              party: party.name,
              amount: fmt(dueTotal),
              count: due.length,
              late: late.length ? t('lixi:party.latePart', { count: late.length }) : '',
            })
          : t('lixi:party.owesYou', {
              party: party.name,
              amount: fmt(dueTotal),
              count: due.length,
              late: late.length ? t('lixi:party.overduePart', { count: late.length }) : '',
            });
    return {
      text,
      stats: [
        { label: t(supplier ? 'lixi:party.billedToYou' : 'lixi:party.billed'), value: fmt(docsTotal(theirs, currency)) },
        { label: t('lixi:party.outstanding'), value: fmt(dueTotal), tone: late.length ? 'bad' : due.length ? 'warn' : 'good' },
        { label: t(supplier ? 'lixi:party.bills' : 'lixi:party.invoices'), value: String(theirs.length) },
      ],
      actions: [
        { type: 'route', label: t('lixi:party.openParty', { party: party.name }), route: `/(app)/contacts/${supplier ? 'suppliers' : 'customers'}/${party.id}` },
      ],
    };
  }

  // GST and compliance.
  if (hits(q, 'gst', deps)) {
    const { failed, generated, pending, ewbActive, ewbExpiringSoon, ewbExpired, ewbMissing } = ctx.compliance;
    const problems = failed + ewbExpiringSoon + ewbMissing;
    return {
      text:
        problems === 0
          ? t('lixi:gst.clear', { count: generated, tax: fmt(ctx.monthTax) })
          : [
              failed ? t('lixi:gst.rejected', { count: failed }) : null,
              ewbExpiringSoon ? t('lixi:gst.expiring', { count: ewbExpiringSoon }) : null,
              ewbMissing ? t('lixi:gst.missing', { count: ewbMissing }) : null,
            ]
              .filter(Boolean)
              .join(' '),
      stats: [
        { label: t('lixi:gst.thisMonth'), value: fmt(ctx.monthTax) },
        { label: t('lixi:gst.irns'), value: String(generated), tone: 'good' },
        { label: t('lixi:gst.rejectedStat'), value: String(failed), tone: failed ? 'bad' : 'good' },
        { label: t('lixi:gst.awaiting'), value: String(pending), tone: pending ? 'warn' : 'good' },
        { label: t('lixi:gst.liveEwb'), value: String(ewbActive) },
        { label: t('lixi:gst.expiredEwb'), value: String(ewbExpired) },
      ],
      actions: [{ type: 'route', label: t('lixi:gst.action'), route: '/(app)/compliance', icon: 'shield-check-outline' }],
    };
  }

  // What I owe suppliers — checked before receivables, since both say "owe".
  if (hits(q, 'payables', deps)) {
    const open = ctx.payables.outstanding.filter((o) => o.outstanding.minor > 0);
    const late = open.filter((o) => o.daysOverdue > 0).sort((a, b) => b.outstanding.minor - a.outstanding.minor);
    const next = [...open].sort((a, b) => (a.document.dueDate ?? '').localeCompare(b.document.dueDate ?? ''))[0];
    const nextName = next ? ctx.parties.find((p) => p.id === next.document.partyId)?.name : undefined;
    return {
      text:
        open.length === 0
          ? t('lixi:payables.none')
          : t('lixi:payables.summary', {
              count: open.length,
              amount: fmt(ctx.payables.summary.total),
              late: late.length ? t('lixi:payables.latePart', { amount: fmt(ctx.payables.summary.overdue) }) : '',
              next: next
                ? t('lixi:payables.nextPart', {
                    party: nextName,
                    number: next.document.number,
                    due: next.document.dueDate ? t('lixi:payables.duePart', { date: next.document.dueDate }) : '',
                  })
                : '',
            }),
      stats: [
        { label: t('lixi:payables.payable'), value: fmt(ctx.payables.summary.total) },
        { label: t('lixi:payables.pastDue'), value: fmt(ctx.payables.summary.overdue), tone: late.length ? 'bad' : 'good' },
        { label: t('lixi:payables.dueSoon'), value: fmt(ctx.payables.summary.dueSoon), tone: 'warn' },
      ],
      actions: [{ type: 'route', label: t('lixi:payables.action'), route: '/(app)/payables', icon: 'file-clock-outline' }],
    };
  }

  // Money owed to me.
  if (hits(q, 'receivables', deps)) {
    const open = ctx.receivables.outstanding.filter((o) => o.outstanding.minor > 0);
    const late = open.filter((o) => o.daysOverdue > 0).sort((a, b) => b.outstanding.minor - a.outstanding.minor);
    const worst = late[0];
    const worstName = worst ? ctx.parties.find((p) => p.id === worst.document.partyId)?.name : undefined;
    return {
      text:
        open.length === 0
          ? t('lixi:receivables.none')
          : t('lixi:receivables.summary', {
              amount: fmt(ctx.receivables.summary.total),
              late: late.length ? t('lixi:receivables.latePart', { amount: fmt(ctx.receivables.summary.overdue) }) : '',
              worst: worst
                ? t('lixi:receivables.worstPart', {
                    party: worstName,
                    number: worst.document.number,
                    days: worst.daysOverdue,
                  })
                : '',
            }),
      stats: [
        { label: t('lixi:receivables.outstanding'), value: fmt(ctx.receivables.summary.total) },
        { label: t('lixi:receivables.overdue'), value: fmt(ctx.receivables.summary.overdue), tone: late.length ? 'bad' : 'good' },
        { label: t('lixi:receivables.invoices'), value: String(open.length) },
      ],
      actions: [
        { type: 'route', label: t('lixi:receivables.action'), route: '/(app)/receivables', icon: 'clock-alert-outline' },
        ...(worst ? [{ type: 'document', label: t('lixi:doc.open', { number: worst.document.number }), kind: worst.document.kind, id: worst.document.id } as LixiAction] : []),
      ],
    };
  }

  // Stock.
  if (hits(q, 'stock', deps)) {
    const low = ctx.lowStock;
    return {
      text: low.length ? t('lixi:stock.low', { count: low.length }) : t('lixi:stock.none'),
      stats: low.slice(0, 4).map((i) => ({ label: i.name, value: `${i.onHand} ${i.unit}`, tone: i.onHand <= 0 ? 'bad' : 'warn' }) as LixiStat),
      actions: [{ type: 'route', label: t('lixi:stock.action'), route: '/(app)/inventory/low-stock', icon: 'package-variant' }],
    };
  }

  // Spending.
  if (hits(q, 'spend', deps)) {
    const preset: DateRangePreset = has(q, 'this month', 'இந்த மாத') ? 'thisMonth' : 'lastMonth';
    const label = t(preset === 'thisMonth' ? 'lixi:spend.thisMonth' : 'lixi:spend.lastMonth');
    const range = resolveRange(preset);
    const rows = ctx.expenses.filter((e) => inRange(e.date, range));
    const spent = total(rows.map((e) => toBase(e.amount, e.exchangeRate, currency)), currency);
    return {
      text: t('lixi:spend.summary', {
        period: label,
        amount: fmt(spent),
        count: rows.length,
        payable: fmt(ctx.payables.summary.total),
      }),
      stats: [
        { label: t('lixi:spend.spent'), value: fmt(spent) },
        { label: t('lixi:spend.expenses'), value: String(rows.length) },
        { label: t('lixi:spend.owedToSuppliers'), value: fmt(ctx.payables.summary.total), tone: 'warn' },
      ],
      actions: [{ type: 'route', label: t('lixi:spend.action'), route: '/(app)/reports/expense-summary', icon: 'chart-bar' }],
    };
  }

  // Best customers.
  if (hits(q, 'topCustomers', deps)) {
    const byParty = new Map<string, number>();
    invoices
      .filter(LIVE)
      .forEach((d) => byParty.set(d.partyId, (byParty.get(d.partyId) ?? 0) + toBase(d.totals.grandTotal, d.exchangeRate, currency).minor));
    const ranked = [...byParty.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
    if (!ranked.length) return { text: t('lixi:top.none') };
    const nameOf = (id: string) => ctx.parties.find((p) => p.id === id)?.name ?? t('common:placeholder.unknown');
    return {
      text: t('lixi:top.leads', { party: nameOf(ranked[0][0]), count: ranked.length }),
      stats: ranked.map(([id, minor]) => ({ label: nameOf(id), value: fmt(money(minor, currency)) })),
      actions: ranked.map(([id]) => ({ type: 'ask', label: t('lixi:top.about', { party: nameOf(id) }), question: nameOf(id) }) as LixiAction),
    };
  }

  // Drafts and quotes waiting.
  if (hits(q, 'drafts', deps)) {
    const drafts = invoices.filter((d) => d.status === 'draft');
    const quotes = ctx.documents.filter((d) => d.kind === 'quote' && d.status === 'sent');
    return {
      text:
        drafts.length + quotes.length === 0
          ? t('lixi:drafts.none')
          : t('lixi:drafts.summary', {
              drafts: t('lixi:drafts.draftInvoice', { count: drafts.length }),
              quotes: t('lixi:drafts.quote', { count: quotes.length }),
              amount: fmt(docsTotal(quotes, currency)),
            }),
      actions: [
        { type: 'route', label: t('lixi:drafts.invoices'), route: '/(app)/sales/invoices' },
        { type: 'route', label: t('lixi:drafts.quotes'), route: '/(app)/sales/quotes' },
      ],
    };
  }

  // Sales, with a period.
  if (hits(q, 'sales', deps) || has(q, 'today', 'month', 'week', 'year', 'இன்று', 'மாத', 'வார', 'ஆண்ட')) {
    const preset: DateRangePreset = has(q, 'today', 'இன்று')
      ? 'today'
      : has(q, 'last month', 'கடந்த மாத')
        ? 'lastMonth'
        : has(q, 'week', 'வார')
          ? 'last7'
          : has(q, 'year', 'fy', 'ஆண்ட', 'நிதியாண்')
            ? 'thisFY'
            : 'thisMonth';
    const label = t(
      ({
        today: 'lixi:sales.periodToday',
        lastMonth: 'lixi:sales.periodLastMonth',
        last7: 'lixi:sales.periodLast7',
        thisFY: 'lixi:sales.periodThisFy',
      } as Record<string, string>)[preset] ?? 'lixi:sales.periodThisMonth',
    );
    const range: DateRange = resolveRange(preset);
    const sold = invoices.filter((d) => LIVE(d) && inRange(d.date, range));
    const invoiced = docsTotal(sold, currency);
    const received = total(
      ctx.payments.filter((p) => p.direction === 'received' && inRange(p.date, range)).map((p) => toBase(p.amount, p.exchangeRate, currency)),
      currency,
    );
    return {
      text: sold.length
        ? t('lixi:sales.summary', {
            amount: fmt(invoiced),
            period: label,
            count: sold.length,
            average: fmt(money(Math.round(invoiced.minor / sold.length), currency)),
            received: fmt(received),
          })
        : t('lixi:sales.none', {
            period: label,
            collected: received.minor ? t('lixi:sales.collectedPart', { amount: fmt(received) }) : '',
          }),
      stats: [
        { label: t('lixi:sales.invoiced'), value: fmt(invoiced) },
        { label: t('lixi:sales.collected'), value: fmt(received), tone: 'good' },
        { label: t('lixi:sales.invoices'), value: String(sold.length) },
      ],
      actions: [{ type: 'route', label: t('lixi:sales.action'), route: '/(app)/reports/sales-summary', icon: 'chart-bar' }],
    };
  }

  if (hits(q, 'greeting', deps)) return greet(ctx, deps);

  if (hits(q, 'thanks', deps)) return { text: t('lixi:thanks.reply') };

  return {
    text: t('lixi:fallback.text'),
    actions: lixiSuggestions(ctx.plan, deps).slice(0, 3).map((label) => ({ type: 'ask', label }) as LixiAction),
  };
}
