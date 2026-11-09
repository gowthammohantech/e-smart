import { PLANS } from '@esmart/core/domain/plan';
import en from '@esmart/i18n/locales/en';

/**
 * Every word on the page. Features come from story/04-modules-and-features.md,
 * prices and plan lines from the app's own PLANS table and plan.json, so the
 * site can't drift from what the app sells.
 *
 * Anything marked `placeholder: true` is stand-in social proof or contact
 * detail. It is hidden on the live page (see `live`); replace it and drop the
 * flag to show it: `grep -n "placeholder: true" content/site.ts`.
 */

/**
 * Stand-in content stays in this file so it's easy to swap for the real thing,
 * but never renders: components show only what `live` lets through.
 */
export function live<T extends { placeholder?: boolean }>(item: T): T | null;
export function live<T extends { placeholder?: boolean }>(items: readonly T[]): T[];
export function live<T extends { placeholder?: boolean }>(x: T | readonly T[]): T | T[] | null {
  if (Array.isArray(x)) return (x as readonly T[]).filter((i) => !i.placeholder);
  return (x as T).placeholder ? null : (x as T);
}

/**
 * Where the site sends people. NEXT_PUBLIC_* is inlined at build time (see
 * .env.example); unset or empty falls back to production.
 */
export const links = {
  webApp: process.env.NEXT_PUBLIC_WEB_APP_URL || 'https://smart.elixir-books.com/sign-in',
  appStore: process.env.NEXT_PUBLIC_APP_STORE_URL || 'https://apps.apple.com/in/app/elixir-books-smart/id6822206449',
  playStore: process.env.NEXT_PUBLIC_PLAY_STORE_URL || 'https://play.google.com/store/apps/details?id=com.elixir.bookssmart',
};

/** The sign-in page with ?demo=1: the web app signs straight into the public demo (read-only sample businesses). */
export const demoHref = `${links.webApp}${links.webApp.includes('?') ? '&' : '?'}demo=1`;

export const brand = {
  name: 'Elixir Books Smart',
  short: 'Elixir Books',
  tagline: en.settings.about.pitch,
};

export const nav = {
  links: [
    { label: 'Features', href: '#features' },
    { label: 'How it works', href: '#how-it-works' },
    { label: 'Pricing', href: '#pricing' },
    { label: 'FAQ', href: '#faq' },
    { label: 'Cookbook', href: '/docs' },
  ],
  cta: { label: 'Get started', href: links.webApp },
  demo: { label: 'Try the demo', href: demoHref },
};

export const hero = {
  reviews: { label: '10k+ reviews from Indian businesses', placeholder: true },
  title: ['Invoices, GST', 'and stock.', 'Without the ERP.'],
  sub: 'Bill, file e-invoices and e-way bills, chase payments and keep stock — from your phone, in English or Tamil.',
  side: "Your books, on every device. Lixi, your AI assistant, keeps an eye on what's overdue, what's low and what's about to expire, and drafts the next step for you to confirm.",
  demo: { label: 'Try the live demo', note: 'No sign-up. Eight sample businesses, ready to explore.', href: demoHref },
  downloadLabel: 'Download the app:',
  stores: [
    { store: 'apple', top: 'Download on the', name: 'App Store', href: links.appStore },
    { store: 'google', top: 'Get it on', name: 'Google Play', href: links.playStore },
  ],
  chips: [
    { tone: 'good', title: 'IRN generated', detail: 'Signed QR on the invoice' },
    { tone: 'warn', title: 'E-way bill', detail: '1d 18h validity left' },
    { tone: 'primary', title: '₹48,260 received', detail: 'Split across 3 invoices' },
  ],
} as const;

export const marquee = {
  words: ['Invoicing', 'GST', 'E-Way Bill', 'Inventory', 'Payments', 'Reports'],
  usedBy: { label: 'Used and loved by 25,000+ businesses across India', placeholder: true },
  worksWithLabel: 'Works with',
  worksWith: ['Whitebooks', 'Razorpay', 'UPI', 'WhatsApp', 'Tally'],
};

export const about = {
  eyebrow: 'About Elixir Books',
  title: 'Everyday business management, right from your phone.',
  body: 'Invoices, payments, purchases and stock in one set of books — with GST compliance built in, not bolted on. Made for Indian businesses with 1 to 25 people: wholesalers, retailers, service firms and light manufacturers.',
  stats: [
    { icon: 'download', label: 'App downloads', value: '24K+', placeholder: true },
    { icon: 'star', label: 'Positive reviews', value: '99%', placeholder: true },
    { icon: 'receipt', label: 'Invoices filed', value: '1.2M+', placeholder: true },
  ],
} as const;

export const howItWorks = {
  eyebrow: 'Simplified process',
  title: 'From first invoice to filed return',
  demo: {
    label: 'Watch demo',
    videoUrl: '',
    placeholder: true,
    /** Shown in place of the video until videoUrl is set: one roast at random, then a nudge to book a live demo. */
    pitch: {
      eyebrow: 'Nice try',
      roasts: [
        'Oh, you wanted a two-minute video? Your accountant deserves more effort than that.',
        "Pressing play doesn't count as due diligence. We checked.",
        'A video can\'t answer "but what about my GST?" We can.',
        "You'd skip to the end anyway. Be honest.",
        'Bold of you to think a video could do it justice.',
        "Videos don't talk back. Our team does, and they actually enjoy GST questions.",
      ],
      reroll: 'Roast me again',
      body: 'Book a live walkthrough instead: we run the app on your kind of business and answer every question you bring.',
      perks: ['Live walkthrough of your workflow', 'Open Q&A, as long as you like', 'Free, no commitment'],
      cta: { label: 'Book a free demo', href: 'https://elixir-books.com/contact' },
      secondary: "Fine, I'll leave",
    },
  },
  steps: [
    {
      title: 'Set up your business',
      body: 'Five quick steps: business details and logo, GSTIN (check digit verified), invoice numbering with a live preview, and your branches.',
    },
    {
      title: 'Bill and file',
      body: 'Turn a quote into an order, a delivery and an invoice. Generate the IRN and e-way bill without leaving the document.',
    },
    {
      title: 'Get paid and track',
      body: 'Send reminders on WhatsApp, SMS or email, share a payment link, and watch it land in nine live reports.',
    },
  ],
};

export const features = {
  eyebrow: 'Built for how India bills',
  title: 'Save hours on every GST cycle.',
  body: 'Tax is worked out for you — CGST and SGST, or IGST, from the place of supply — and every compliance step shows its working, so nothing is filed blind.',
  items: [
    { title: 'GST compliance on every plan', body: 'E-invoice and e-way bill are included even on Free. Compliance is never a paywall.' },
    { title: 'Your books, on every device', body: 'Always in sync — your data lives safely in the cloud, so phone, tablet and web show the same books.' },
    { title: 'Lixi drafts, you confirm', body: 'Ask about dues, sales or stock. Lixi drafts invoices, payments and reminders, and saves nothing until you say so.' },
  ],
};

export const bento = {
  eyebrow: 'All-in-one',
  title: ['Everything a growing business', 'runs on, in one app'],
  large: [
    {
      key: 'compliance',
      label: 'GST compliance',
      title: 'E-invoice and e-way bill, without the portal',
      body: 'IRN with a signed QR on screen and on the PDF, every validation error at once, a 24-hour cancel countdown, Part-B updates and validity worked out from distance.',
    },
    {
      key: 'lixi',
      label: 'Lixi AI assistant',
      title: 'An assistant that knows your books',
      body: 'Ask "who owes me more than 60 days?" or "what is low on stock?". Lixi answers from your data and drafts the follow-up for you to confirm.',
    },
  ],
  small: [
    {
      icon: 'file',
      shot: 'invoice',
      title: 'Sales documents',
      body: 'Quotations, sales orders, delivery notes, tax invoices and returns — each converts into the next. Discounts, charges, round-off and foreign currency.',
    },
    {
      icon: 'boxes',
      shot: 'inventory',
      title: 'Purchases and stock',
      body: 'Purchase orders, goods receipts, bills and returns. Stock by branch, transfers, reorder levels, low-stock alerts and barcode lookup.',
    },
    {
      icon: 'wallet',
      shot: 'receivables',
      title: 'Money in, money out',
      body: 'Split one payment across invoices, keep advances, see FX gain or loss, and track receivables and payables in five aging buckets.',
    },
    {
      icon: 'chart',
      shot: 'report',
      title: 'Nine live reports',
      body: 'Sales, purchases, expenses, receivables, payables, stock, tax, payments and profit — filter by date, branch, party or currency, export to CSV.',
    },
  ],
} as const;

export const everything = {
  eyebrow: 'And the rest',
  title: 'The details that save the day',
  items: [
    { icon: 'building', title: 'Several businesses', body: 'One sign-in, separate books, switch from the header.' },
    { icon: 'git', title: 'Branches and transfers', body: 'Stock and numbering per location.' },
    { icon: 'shield', title: 'Roles and access', body: 'Owner, Admin, Accountant, Sales and Viewer.' },
    { icon: 'history', title: 'Audit trail', body: 'Who changed what, and when.' },
    { icon: 'database', title: 'Backup and Tally export', body: 'JSON, zipped CSV and Tally XML, nightly or weekly.' },
    { icon: 'scan', title: 'Expenses and receipt capture', body: 'Categories, receipts and recurring expenses.' },
    { icon: 'users', title: 'Customers and suppliers', body: 'GSTIN check, credit limits, aging and statements.' },
    { icon: 'send', title: 'Share anywhere', body: 'Send PDFs by WhatsApp, email or SMS.' },
    { icon: 'languages', title: 'English and தமிழ்', body: 'Bilingual invoices: Tamil labels with English beneath.' },
    { icon: 'devices', title: 'iPhone, Android and web', body: 'The same books on every screen, light or dark.' },
    { icon: 'bell', title: 'Needs-attention feed', body: 'Overdue, drafts, low stock, rejected IRNs, expiring bills.' },
    { icon: 'search', title: 'Search everything', body: 'Documents, parties and items from one box.' },
  ],
} as const;

const tierCopy = en.plan.tier;

export type PlanCard = {
  key: string;
  name: string;
  blurb: string;
  monthly: number;
  yearly: number;
  popular: boolean;
  features: string[];
  /** Lines from higher tiers, shown dimmed so the step up is visible. */
  missing: string[];
};

/** What each tier still lacks, from the tier above it. */
const missing: Record<PlanCard['key'], string[]> = {
  free: ['Purchases & payables', 'Stock, branches & transfers', 'All reports'],
  basic: ['Purchases & payables', 'Stock, branches & transfers', 'All reports'],
  pro: ['Role-based access', 'Backup & audit export'],
  business: [],
};

export const pricing = {
  eyebrow: 'Pricing',
  title: 'Choose a plan and start billing today',
  sub: 'Every plan sells and files GST. Yearly billing costs ten months.',
  monthlyLabel: 'Monthly billing',
  yearlyLabel: 'Yearly billing',
  badge: 'Save 2 months',
  footnote:
    'Prices in INR, before GST. Compliance is never a paywall, and moving to a smaller plan hides data — it never deletes it.',
  plans: PLANS.map(
    (plan): PlanCard => ({
      key: plan.key,
      name: plan.name,
      blurb: tierCopy[plan.key].blurb,
      monthly: plan.monthly,
      yearly: plan.yearly,
      popular: Boolean(plan.popular),
      features: plan.features.map((slug) => (tierCopy[plan.key].feature as Record<string, string>)[slug]),
      missing: missing[plan.key] ?? [],
    }),
  ),
};

export const faq = {
  eyebrow: 'Frequently asked questions',
  title: 'Your billing questions, answered',
  sub: "Can't find what you need? Write to us and a person — not a bot — will reply.",
  items: [
    {
      q: 'Are e-invoices and e-way bills really on the Free plan?',
      a: 'Yes. Generating an IRN, the signed QR and e-way bills are on every plan, including Free. Paid plans add volume, more users and the buying side of the business.',
    },
    {
      q: 'Does it work without internet?',
      a: 'No — Elixir Books needs an internet connection. Your books live safely in the cloud, so every phone, tablet and browser you sign in on shows the same, up-to-date data.',
    },
    {
      q: 'How do you connect to the GST portals?',
      a: 'Through licensed GST Suvidha Providers. Your e-invoices go to the IRP and your e-way bills to the NIC system, and every response — accepted or rejected — is kept in a compliance register.',
    },
    {
      q: 'Can my accountant keep using Tally?',
      a: 'Yes. Backup & export produces Tally XML vouchers alongside JSON and zipped CSV, and you can schedule a nightly or weekly backup.',
    },
    {
      q: 'Can I run more than one business?',
      a: 'Yes. One sign-in can hold several businesses, each with its own books, GSTIN and numbering. Smart Pro covers three, Smart Business has no limit.',
    },
    {
      q: 'What can Lixi see, and can it change my books?',
      a: 'Lixi reads the business you have open to answer questions. It can draft invoices, payments, contacts, expenses and reminders, but nothing is saved until you review and confirm it.',
    },
  ],
};

export const testimonials = {
  eyebrow: 'Testimonials',
  title: 'What business owners say about their books now',
  items: [
    {
      quote: 'We raise forty invoices a day. The IRN and e-way bill come out with the invoice, so the truck leaves on time.',
      name: 'Ramesh K.',
      avatar: 5,
      role: 'Wholesale distributor, Coimbatore',
      placeholder: true,
    },
    {
      quote: 'My counter staff bill in Tamil and the customer gets a clean bilingual invoice. Nobody needed training.',
      name: 'Lakshmi S.',
      avatar: 6,
      role: 'Retail store owner, Madurai',
      placeholder: true,
    },
    {
      quote: 'Clients send me Tally XML at month end instead of a bag of bills. GSTR-1 takes an afternoon, not a week.',
      name: 'Arjun P.',
      avatar: 7,
      role: 'Chartered accountant, Pune',
      placeholder: true,
    },
  ],
};

export const footer = {
  socials: [
    { label: 'Facebook', href: 'https://www.facebook.com/Elixirbooksofficial' },
    { label: 'X', href: 'https://x.com/Elixirbooks_c' },
    { label: 'LinkedIn', href: 'https://www.linkedin.com/company/elixirglobal/' },
    { label: 'Instagram', href: 'https://www.instagram.com/Elixirbooks' },
  ],
  payments: ['UPI', 'RuPay', 'Visa', 'Mastercard'],
  // From elixir-books.com/contact.
  contacts: [
    { icon: 'phone', title: 'Phone', lines: ['+91 89256 33391', 'Mon–Sat, 9:30am–7pm IST'], href: 'tel:+918925633391' },
    { icon: 'mail', title: 'Email', lines: ['contact@elixir-books.com', 'We reply within 1 business hour'], href: 'mailto:contact@elixir-books.com' },
    {
      icon: 'pin',
      title: 'Office',
      lines: ['7th Floor, KRM Center, 2 Harrington Road', 'Chetpet, Chennai 600031'],
      href: 'https://elixir-books.com/contact',
    },
  ],
  copyright: '© 2026 Elixir Business Solutions India Pvt. Ltd. All rights reserved.',
  legal: [
    { label: 'Cookbook', href: '/docs' },
    { label: 'Privacy Policy', href: '/privacy' },
    { label: 'Terms', href: '/terms' },
    { label: 'Refunds', href: '/refund' },
    { label: 'Delete your account', href: '/delete-account' },
    { label: 'Support', href: '/support' },
  ],
} as const;
