/**
 * How a business wants its documents to look: a layout, an accent colour, which optional
 * columns and sections print, a line of its own at the foot, a smaller type size for long
 * invoices. Statutory content (title, GSTIN, HSN, tax, place of supply, IRN) always prints;
 * these only shape the rest. Every field defaults to the page as it was before templates existed.
 */
export type InvoiceTemplate = {
  /** Which ready-made page. Unset is `standard`, the app's own design. */
  layout?: InvoiceLayout;
  /** Hex, like #0B6E4F. Unset takes the layout's own. */
  accentColor?: string;
  /** Which side of the header the logo sits; unset takes the layout's own. */
  logoPosition?: 'left' | 'right';
  /** The line discount column; on by default. */
  showDiscountColumn?: boolean;
  /** The tax-rate column; on by default. */
  showTaxColumn?: boolean;
  /** HSN/SAC under each item's name on the standard page; on by default (the code stays in the e-invoice either way). */
  showHsn?: boolean;
  showLogo?: boolean;
  /** The HSN/SAC-wise tax table with the tax in words, under the items. */
  showHsnSummary?: boolean;
  /** The bank account and UPI QR, on documents the customer pays against. */
  showBank?: boolean;
  /** The signature image above the authorised signatory's line. */
  showSignature?: boolean;
  /** The declaration that the invoice shows the actual price. */
  showDeclaration?: boolean;
  /** The consignee (ship to) and dispatch from blocks. */
  showShipTo?: boolean;
  /** The company's PAN and TAN under the narration. */
  showPanTan?: boolean;
  /** A box for the customer's seal and signature. */
  showCustomerSeal?: boolean;
  /** Printed under "Declaration"; unset is the usual wording. */
  declarationText?: string;
  /** Printed at the foot instead of the app's line, e.g. "Thank you for your business". */
  footerText?: string;
  /** Smaller type, so long invoices take fewer pages. */
  compact?: boolean;
};

export const INVOICE_LAYOUTS = ['standard', 'classic', 'detailed', 'modern'] as const;
export type InvoiceLayout = (typeof INVOICE_LAYOUTS)[number];

export const DEFAULT_ACCENT = '#007AFF';
export const DEFAULT_DECLARATION = 'We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct.';

export type TemplateToggle =
  | 'showDiscountColumn' | 'showTaxColumn' | 'showHsn' | 'showLogo' | 'showHsnSummary' | 'showBank'
  | 'showSignature' | 'showDeclaration' | 'showShipTo' | 'showPanTan' | 'showCustomerSeal' | 'compact';

type LayoutDefaults = { accentColor: string; logoPosition: 'left' | 'right' } & Record<TemplateToggle, boolean>;

const ON = { showDiscountColumn: true, showTaxColumn: true, showHsn: true, showLogo: true, showBank: true, showSignature: true, compact: false };

/** What each layout prints when the business has said nothing. */
export const LAYOUT_DEFAULTS: Record<InvoiceLayout, LayoutDefaults> = {
  standard: { ...ON, accentColor: DEFAULT_ACCENT, logoPosition: 'left', showHsnSummary: false, showDeclaration: false, showShipTo: false, showPanTan: false, showCustomerSeal: false },
  classic: { ...ON, accentColor: '#13294B', logoPosition: 'left', showHsnSummary: true, showDeclaration: true, showShipTo: false, showPanTan: false, showCustomerSeal: true },
  detailed: { ...ON, accentColor: '#13294B', logoPosition: 'right', showHsnSummary: true, showDeclaration: true, showShipTo: true, showPanTan: true, showCustomerSeal: true },
  modern: { ...ON, accentColor: '#C8930B', logoPosition: 'left', showHsnSummary: true, showDeclaration: true, showShipTo: false, showPanTan: false, showCustomerSeal: true },
};

/**
 * The switches each layout has, so the settings screen offers only those that change its page.
 * The standard page has no HSN table, declaration, consignee, PAN/TAN or seal box; the ready-made
 * layouts give HSN its own column, so it isn't optional there (Rule 46(g)).
 */
export const LAYOUT_TOGGLES: Record<InvoiceLayout, TemplateToggle[]> = {
  standard: ['showDiscountColumn', 'showTaxColumn', 'showHsn', 'showLogo', 'showBank', 'showSignature', 'compact'],
  classic: ['showLogo', 'showHsnSummary', 'showBank', 'showSignature', 'showDeclaration', 'showShipTo', 'showPanTan', 'showCustomerSeal', 'compact'],
  detailed: ['showDiscountColumn', 'showLogo', 'showHsnSummary', 'showBank', 'showSignature', 'showDeclaration', 'showShipTo', 'showPanTan', 'showCustomerSeal', 'compact'],
  modern: ['showLogo', 'showHsnSummary', 'showBank', 'showSignature', 'showDeclaration', 'showShipTo', 'showPanTan', 'showCustomerSeal', 'compact'],
};

export type ResolvedTemplate = LayoutDefaults & { layout: InvoiceLayout; declarationText: string; footerText?: string };

const HEX = /^#[0-9A-Fa-f]{6}$/;

export function isInvoiceLayout(v: unknown): v is InvoiceLayout {
  return typeof v === 'string' && (INVOICE_LAYOUTS as readonly string[]).includes(v);
}

/**
 * The template with every default filled in: the business's choices, then its layout's own.
 * A bad colour or layout is ignored. `layout` (one document's choice) wins over the business's.
 */
export function resolveTemplate(t: InvoiceTemplate | null | undefined, layout?: InvoiceLayout | null): ResolvedTemplate {
  const chosen: InvoiceLayout = isInvoiceLayout(layout) ? layout : isInvoiceLayout(t?.layout) ? t.layout : 'standard';
  const d = LAYOUT_DEFAULTS[chosen];
  const pick = (k: TemplateToggle) => (typeof t?.[k] === 'boolean' ? (t[k] as boolean) : d[k]);
  return {
    layout: chosen,
    accentColor: t?.accentColor && HEX.test(t.accentColor) ? t.accentColor : d.accentColor,
    logoPosition: t?.logoPosition === 'left' || t?.logoPosition === 'right' ? t.logoPosition : d.logoPosition,
    showDiscountColumn: pick('showDiscountColumn'),
    showTaxColumn: pick('showTaxColumn'),
    showHsn: pick('showHsn'),
    showLogo: pick('showLogo'),
    showHsnSummary: pick('showHsnSummary'),
    showBank: pick('showBank'),
    showSignature: pick('showSignature'),
    showDeclaration: pick('showDeclaration'),
    showShipTo: pick('showShipTo'),
    showPanTan: pick('showPanTan'),
    showCustomerSeal: pick('showCustomerSeal'),
    compact: pick('compact'),
    declarationText: t?.declarationText?.trim() ? t.declarationText.trim().slice(0, 300) : DEFAULT_DECLARATION,
    ...(t?.footerText?.trim() && { footerText: t.footerText.trim().slice(0, 200) }),
  };
}

/** `#RRGGBB` as `rgba(r,g,b,a)`, for tints of the accent. */
export function tint(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}
