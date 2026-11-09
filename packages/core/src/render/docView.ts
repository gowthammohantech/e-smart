/**
 * Everything a printed layout needs, worked out once: the title, the seller's tax ID, place of
 * supply, the tax components, the lines split from reimbursements, the totals rows and the
 * resolved template. A layout only arranges these; none of them recomputes a figure, so every
 * layout prints the same amounts.
 */
import { Branch, BusinessDocument, Company, DocumentLine, EwayBill, Party, TaxComponent, type Address } from '../types';
import type { Money } from '../lib/money';
import { documentKindLabel, type Translate } from '../labels';
import { flattenTaxComponents, taxedCharges } from '../domain/lineCalc';
import { formatMoney } from '../lib/format';
import { INDIAN_STATES } from '../data/masters';
import type { LanguageCode } from '@esmart/i18n/config';
import type { CustomField } from '../domain/customFields';
import { resolveTemplate, type InvoiceLayout, type InvoiceTemplate, type ResolvedTemplate } from './invoiceTemplate';
import { hsnSummary, lineTaxes, type HsnSummary, type LineTax } from '../domain/hsnSummary';
import { bilingual, esc, TCS_LABEL } from './blocks';

export type DocumentHtmlInput = {
  document: BusinessDocument;
  company?: Company;
  party?: Party;
  branchName?: string;
  /** The issuing branch: its own address and GSTIN win over the company's. */
  branch?: Branch;
  ewayBill?: EwayBill;
  /** The invoice or bill a note or return is raised against: Rule 53 has the note name it. */
  source?: Pick<BusinessDocument, 'number' | 'date'>;
  /** The business logo, when not `company.logoUri`: the server passes it inline, as a data URI, so a PDF never waits on a link. */
  logoSrc?: string;
  /** The signature, when not `company.signatureUri`: inline from the server, as the logo is. */
  signatureSrc?: string;
  /** The company's custom fields: those marked to print show under the notes (the document's, then the party's). */
  customFields?: CustomField[];
  /** How the business wants it to look; defaults to `company.invoiceTemplate`, then to the standard page. */
  template?: InvoiceTemplate;
  /** This document's own layout, over the template's (`documents.print_layout`). */
  layout?: InvoiceLayout | null;
  /** Which copy, printed top right; `all` prints the three one after another. Unset prints no label. */
  copy?: CopyKind | 'all';
  /** Translator for the descriptive labels. Statutory field names stay English. */
  t: Translate;
  language: LanguageCode;
};

/** One row under the items: its label is markup (`bi()` labels come escaped, plain ones through `esc`). */
export type TotalEntry = { key: TotalKey; name: string; value: string; strong?: boolean };
export type TotalKey = 'subtotal' | 'lineDiscount' | 'chargesTaxed' | 'taxable' | 'tax' | 'documentDiscount' | 'reimbursements' | 'charges' | 'tcs' | 'roundOff' | 'total' | 'reverseCharge';

/** Rule 48: the original for the recipient, the duplicate for the transporter, the triplicate for the supplier. */
export type CopyKind = 'original' | 'duplicate' | 'triplicate';
export const COPY_LABEL: Record<CopyKind, string> = { original: 'ORIGINAL FOR RECIPIENT', duplicate: 'DUPLICATE FOR TRANSPORTER', triplicate: 'TRIPLICATE FOR SUPPLIER' };

export type DocView = {
  doc: BusinessDocument;
  company?: Company;
  party?: Party;
  branch?: Branch;
  ewayBill?: EwayBill;
  source?: Pick<BusinessDocument, 'number' | 'date'>;
  customFields: CustomField[];
  logoSrc?: string;
  signatureSrc?: string;
  t: Translate;
  language: LanguageCode;
  bi: (key: string) => string;
  tpl: ResolvedTemplate;
  /** A composition dealer's invoice is a bill of supply (Rule 49). */
  billOfSupply: boolean;
  /** The heading: upper-cased in English, as typed in Tamil. */
  label: string;
  sellerTaxId?: string;
  branchLabel?: string;
  /** Place of supply, by name. */
  pos?: string;
  components: TaxComponent[];
  chargesTaxed: Money;
  /** The lines that make up the taxable value; pure-agent reimbursements are apart. */
  items: DocumentLine[];
  reimbursed: DocumentLine[];
  totals: TotalEntry[];
  /** The number, or "Draft" for a draft's placeholder. */
  shownNumber: string;
  /** Where the goods go from: the issuing branch's address, else the company's. */
  sellerAddress?: Address;
  /** Income-tax PAN, read from the GSTIN (characters 3 to 12). */
  pan?: string;
  tan?: string;
  /** Each line's taxable value and share of the tax, worked out when a layout first asks. */
  lineTaxes: () => LineTax[];
  hsnSummary: () => HsnSummary;
};

export function buildDocView({
  document: doc,
  company,
  party,
  branchName,
  branch,
  ewayBill,
  logoSrc,
  signatureSrc,
  source,
  customFields = [],
  template,
  layout,
  t,
  language,
}: DocumentHtmlInput): DocView {
  // A heading, so it takes the singular. Upper-casing is an English typographic
  // convention and a no-op on Tamil, so it is applied only where it means
  // something.
  // A composition dealer may not issue a tax invoice, only a bill of supply (Rule 49). Statutory, so English.
  const billOfSupply = doc.kind === 'invoice' && !!company?.taxRegistration?.compositionScheme;
  const kindName = billOfSupply ? 'Bill of Supply' : documentKindLabel(t, doc.kind, 1);
  const label = language === 'en' || billOfSupply ? kindName.toUpperCase() : kindName;

  const bi = bilingual(t, language);
  const components = flattenTaxComponents(doc.totals.taxLines, doc.currency);
  const chargesTaxed = doc.totals.chargesTaxed ?? taxedCharges(doc);

  const row = (key: TotalKey, name: string, value: string, strong = false): TotalEntry => ({ key, name, value, strong });
  const totals = [
    row('subtotal', bi('sales:pdf.subtotal'), formatMoney(doc.totals.subtotal)),
    doc.totals.lineDiscount.minor > 0 ? row('lineDiscount', esc('Line discounts'), `− ${formatMoney(doc.totals.lineDiscount)}`) : null,
    // Charges taxed with the items (RULES 1.10): part of the taxable value, so shown above it.
    chargesTaxed.minor ? row('chargesTaxed', esc('Freight and other charges'), formatMoney(chargesTaxed)) : null,
    row('taxable', bi('sales:pdf.taxableValue'), formatMoney(doc.totals.taxableAmount)),
    ...components.map((c) => row('tax', esc(c.label), formatMoney(c.amount))),
    doc.totals.documentDiscount.minor > 0 ? row('documentDiscount', esc('Discount on total'), `− ${formatMoney(doc.totals.documentDiscount)}`) : null,
    doc.totals.reimbursements?.minor ? row('reimbursements', esc('Reimbursement of expenses'), formatMoney(doc.totals.reimbursements)) : null,
    doc.totals.charges.minor > 0 ? row('charges', esc('Other charges'), formatMoney(doc.totals.charges)) : null,
    // Income-tax TCS (s.206C), collected with the price: statutory, so English.
    doc.totals.tcs?.minor ? row('tcs', esc(`TCS collected u/s ${doc.tcs?.section ? (TCS_LABEL[doc.tcs.section] ?? '206C') : '206C'} @ ${doc.tcs?.rate ?? ''}%`), formatMoney(doc.totals.tcs)) : null,
    doc.totals.roundOff.minor !== 0 ? row('roundOff', bi('sales:pdf.roundOff'), formatMoney(doc.totals.roundOff, { signed: true })) : null,
    row('total', bi('sales:pdf.total'), formatMoney(doc.totals.grandTotal), true),
    // Rule 46(p): the invoice says whether tax is payable on reverse charge, and how much.
    doc.totals.reverseChargeTax?.minor ? row('reverseCharge', esc('Tax payable on reverse charge by the recipient'), formatMoney(doc.totals.reverseChargeTax)) : null,
  ].filter((r): r is TotalEntry => !!r);

  return {
    doc,
    company,
    party,
    branch,
    ewayBill,
    source,
    customFields,
    logoSrc,
    signatureSrc,
    t,
    language,
    bi,
    tpl: resolveTemplate(template ?? company?.invoiceTemplate, layout),
    billOfSupply,
    label,
    sellerTaxId: branch?.gstin ?? company?.taxRegistration?.identifier,
    branchLabel: branchName ?? branch?.name,
    pos: INDIAN_STATES.find((s) => s.code === doc.placeOfSupplyStateCode)?.name,
    components,
    chargesTaxed,
    items: doc.lines.filter((l) => !l.gst?.reimbursement),
    reimbursed: doc.lines.filter((l) => l.gst?.reimbursement),
    totals,
    // A draft has no number yet: its placeholder (INVOICE-DRAFT) reads as "Draft".
    shownNumber: doc.status === 'draft' && doc.number.endsWith('-DRAFT') ? 'Draft' : doc.number,
    sellerAddress: branch?.address?.line1 ? branch.address : company?.address,
    pan: panOf(branch?.gstin ?? company?.taxRegistration?.identifier),
    tan: company?.tan,
    lineTaxes: once(() => lineTaxes(doc)),
    hsnSummary: once(() => hsnSummary(doc, lineTaxes(doc))),
  };
}

const GSTIN = /^[0-9]{2}([A-Z]{5}[0-9]{4}[A-Z])[0-9A-Z]{3}$/;

/** The PAN inside a GSTIN. */
export function panOf(gstin: string | undefined): string | undefined {
  return gstin ? GSTIN.exec(gstin.trim().toUpperCase())?.[1] : undefined;
}

function once<T>(f: () => T): () => T {
  let v: { value: T } | undefined;
  return () => (v ??= { value: f() }).value;
}
