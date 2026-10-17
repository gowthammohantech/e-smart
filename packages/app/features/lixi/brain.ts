import { BusinessDocument, DocumentKind, Expense, Party, Payment, PlanTier } from '@esmart/core/types';
import { Money } from '@esmart/core/lib/money';
import { listJoin } from '@esmart/core/lib/format';
import { AgingSummary, OutstandingDoc } from '@esmart/core/domain/receivables';
import { type Translate } from '@esmart/core/labels';
import { Module, hasModule } from '@esmart/core/domain/plan';
import i18n from '@esmart/i18n';
import type { LanguageCode } from '@esmart/i18n/config';

/**
 * Lixi, the in-app assistant: the reply shapes the chat renders, and what the
 * app says itself (the greeting, the starter prompts, the held-tab
 * questions). Every answer comes from the server's model (remote.ts), which
 * reads the books through the API; there is no on-device fallback.
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
