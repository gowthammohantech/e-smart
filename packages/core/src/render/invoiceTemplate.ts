/**
 * How a business wants its documents to look: an accent colour, which optional columns print, a line
 * of its own at the foot, a smaller type size for long invoices. Statutory content (title, GSTIN,
 * HSN, tax, place of supply, IRN) always prints; these only shape the rest. Every field defaults to
 * the page as it was before templates existed.
 */
export type InvoiceTemplate = {
  /** Hex, like #0B6E4F. */
  accentColor?: string;
  /** The line discount column; on by default. */
  showDiscountColumn?: boolean;
  /** The tax-rate column; on by default. */
  showTaxColumn?: boolean;
  /** HSN/SAC under each item's name; on by default (the code stays in the e-invoice either way). */
  showHsn?: boolean;
  showLogo?: boolean;
  /** Printed at the foot instead of the app's line, e.g. "Thank you for your business". */
  footerText?: string;
  /** Smaller type, so long invoices take fewer pages. */
  compact?: boolean;
};

export const DEFAULT_ACCENT = '#007AFF';
const HEX = /^#[0-9A-Fa-f]{6}$/;

export type ResolvedTemplate = Required<Omit<InvoiceTemplate, 'footerText'>> & { footerText?: string };

/** The template with every default filled in, and a bad colour ignored. */
export function resolveTemplate(t: InvoiceTemplate | null | undefined): ResolvedTemplate {
  return {
    accentColor: t?.accentColor && HEX.test(t.accentColor) ? t.accentColor : DEFAULT_ACCENT,
    showDiscountColumn: t?.showDiscountColumn ?? true,
    showTaxColumn: t?.showTaxColumn ?? true,
    showHsn: t?.showHsn ?? true,
    showLogo: t?.showLogo ?? true,
    compact: t?.compact ?? false,
    ...(t?.footerText?.trim() && { footerText: t.footerText.trim().slice(0, 200) }),
  };
}

/** `#RRGGBB` as `rgba(r,g,b,a)`, for tints of the accent. */
export function tint(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}
