import type { LanguageCode } from '@/i18n/config';

/**
 * Matching stems for Lixi's intents, per language.
 *
 * These live in code rather than the message catalogue on purpose: they are
 * not copy. A translator polishing a sentence would quietly break matching,
 * and these need to stay deliberately clipped — Tamil is agglutinative
 * (இருப்பு + ஐ → இருப்பை), so a stem has to match as a substring rather than
 * a whole word.
 *
 * Nothing here may use `\b`. JavaScript's word boundary is ASCII-only, so a
 * `\b`-anchored pattern never matches Tamil script at all — a failure that
 * looks like "Tamil doesn't work" rather than like a bug in one intent.
 */
export type IntentId =
  | 'payables'
  | 'receivables'
  | 'stock'
  | 'spend'
  | 'gst'
  | 'sales'
  | 'topCustomers'
  | 'drafts'
  | 'greeting'
  | 'thanks'
  | 'create'
  | 'help';

export const KEYWORDS: Record<LanguageCode, Partial<Record<IntentId, string[]>>> = {
  en: {
    payables: ['i owe', 'we owe', 'payable', 'supplier', 'vendor', 'bills due', 'bill due', 'to pay'],
    receivables: ['owes me', 'owe me', 'receivable', 'outstanding', 'who owes', 'unpaid', 'collect'],
    stock: ['stock', 'inventory', 'reorder', 'running out', 'run out', 'low on'],
    spend: ['spend', 'spent', 'expense', 'cost'],
    gst: ['gst', 'tax', 'e-invoice', 'einvoice', 'irn', 'e-way', 'eway', 'gstr', 'return'],
    sales: ['sales', 'sold', 'revenue', 'turnover', 'invoiced', 'business this'],
    topCustomers: ['top customer', 'best customer', 'biggest customer', 'top client'],
    drafts: ['draft', 'quote', 'quotation', 'pending', 'waiting'],
    greeting: ['hi', 'hello', 'hey', 'namaste'],
    thanks: ['thank', 'thanks', 'cheers'],
    create: ['new ', 'create', 'make', 'draft a', 'raise', 'add ', 'record '],
    help: ['help', 'what can you', 'how do i'],
  },
  ta: {
    payables: ['தர வேண்டும்', 'செலுத்த வேண்டிய', 'கொடுக்க வேண்டிய', 'சப்ளையர்', 'விற்பனையாள', 'பாக்கி தர'],
    receivables: ['வர வேண்டும்', 'வரவேண்டிய', 'நிலுவை', 'பாக்கி', 'யார் தர', 'வசூல்'],
    stock: ['இருப்பு', 'இருப்பை', 'சரக்கு', 'ஸ்டாக்', 'தீர்ந்த', 'குறைவ', 'குறைந்த'],
    spend: ['செலவ', 'செலவு', 'கட்டண'],
    gst: ['ஜிஎஸ்டி', 'வரி', 'இ-இன்வாய்ஸ்', 'இன்வாய்ஸ்', 'இ-வே', 'தாக்கல்'],
    sales: ['விற்பனை', 'விற்ற', 'வருவாய்', 'வியாபார'],
    topCustomers: ['முன்னணி வாடிக்கை', 'சிறந்த வாடிக்கை', 'அதிக வாங்கு'],
    drafts: ['வரைவு', 'மதிப்பீடு', 'நிலுவையில்', 'காத்திருக்க'],
    greeting: ['வணக்கம்', 'ஹலோ', 'ஹாய்'],
    thanks: ['நன்றி'],
    create: ['புதிய', 'உருவாக்கு', 'போடு', 'சேர்', 'பதிவு செய்'],
    help: ['உதவி', 'என்ன செய்ய', 'எப்படி'],
  },
};

/**
 * Stems for an intent in English plus the active language.
 *
 * The union is deliberate, and it is the most important decision here: Indian
 * traders code-switch constantly — "GST", "stock" and "invoice" all appear in
 * Tamil speech — so a Tamil speaker typing an English word still gets an
 * answer, and an English speaker is never worse off.
 */
export function stemsFor(intent: IntentId, lang: LanguageCode): string[] {
  const english = KEYWORDS.en[intent] ?? [];
  if (lang === 'en') return english;
  return [...english, ...(KEYWORDS[lang][intent] ?? [])];
}
