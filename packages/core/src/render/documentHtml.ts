import { BankDetails, Branch, BusinessDocument, Company, DocumentKind, EwayBill, Party } from '../types';
import { documentKindLabel, type Translate } from '../labels';
import { flattenTaxComponents, taxedCharges } from '../domain/lineCalc';
import { formatMoney, formatPercent, formatQty } from '../lib/format';
import { formatDate } from '../lib/date';
import { money } from '../lib/money';
import { amountInWords } from '../lib/amountInWords';
import { INDIAN_STATES, unitShortName } from '../data/masters';
import { MIN_READABLE_QR_SIZE, qrMatrix, qrSvgString } from '../lib/qr';
import { E_INVOICE_CANCEL_REASONS } from '../domain/eInvoice';
import type { LanguageCode } from '@esmart/i18n/config';
import i18n from '@esmart/i18n';
import { printableFields, type CustomField } from '../domain/customFields';
import { resolveTemplate, tint, type InvoiceTemplate } from './invoiceTemplate';
import { TCS_SECTIONS } from '../data/tcsSections';

const TCS_LABEL: Record<string, string> = Object.fromEntries(TCS_SECTIONS.map((s) => [s.code, s.label.split(' ')[0]]));

/**
 * A field label on the printed document. Under Tamil it reads in Tamil with
 * the English underneath in a muted span: a GST invoice is a legal document,
 * read by officers and by counterparties in other states, so the English term
 * has to stay visible. Under English the second half is omitted, which keeps
 * an English PDF byte-identical to what it was before.
 *
 * Values — amounts, GSTIN, HSN, IRN, dates — are never doubled up; only the
 * labels are.
 */
function bilingual(t: Translate, language: LanguageCode): (key: string) => string {
  const en: Translate = i18n.getFixedT('en', null);
  return (key) => {
    const primary = esc(t(key));
    if (language === 'en') return primary;
    const secondary = esc(en(key));
    return secondary && secondary !== primary
      ? `${primary} <span class="alt">${secondary}</span>`
      : primary;
  };
}

/** Statutory wording on the note, so English like the field names. */
const NOTE_REASON = { discount: 'Discount after sale', priceChange: 'Price change', taxCorrection: 'Tax correction', deficiency: 'Short or faulty supply', other: 'Other' } as const;

const SUPPLY_NOTE = { nil: 'Nil-rated supply', exempt: 'Exempt supply', nonGst: 'Non-GST supply' } as const;

function esc(s: string | undefined | null): string {
  return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}

function addressBlock(a?: { line1?: string; line2?: string; city?: string; state?: string; postalCode?: string }): string {
  if (!a) return '';
  return [a.line1, a.line2, [a.city, a.postalCode].filter(Boolean).join(' '), a.state]
    .filter(Boolean)
    .map((l) => esc(l))
    .join('<br/>');
}

/**
 * Print-ready HTML for a business document. Rendered to PDF with expo-print
 * for sharing and shown in the in-app preview by the app, and rendered to PDF
 * by the API (`getDocumentPdf`), so both print the same page.
 */
/** The signatory's signature above the line, from the same kinds of source as the logo. */
function signatureTag(src: string | undefined): string {
  if (!src || !/^(https?:|data:image\/|file:|blob:)/i.test(src)) return '';
  return `<img class="signature" src="${esc(src)}" alt="">`;
}

/** The business logo above its name, from a link, a data URI or a file just picked on the device. */
function logoTag(src: string | undefined, name: string | undefined): string {
  if (!src || !/^(https?:|data:image\/|file:|blob:)/i.test(src)) return '';
  return `<img class="logo" src="${esc(src)}" alt="${esc(name)}">`;
}

/** Documents a customer pays against, which print the bank account (and a UPI QR) to pay into. */
const PAYABLE_KINDS: DocumentKind[] = ['invoice', 'quote', 'proforma', 'salesOrder'];

/**
 * `upi://pay` for the amount, read by every UPI app: the payee address and name,
 * the amount in rupees, and the document number as the note, so the payment is
 * easy to match. INR only; UPI carries nothing else.
 */
export function upiPayLink(upiId: string, payee: string, amountMinor: number, note: string): string {
  // Spaces as '+', and the payee's '@' left as is: some UPI apps don't decode %40.
  const q = (s: string) => encodeURIComponent(s).replace(/%20/g, '+').replace(/%40/g, '@');
  return `upi://pay?pa=${q(upiId)}&pn=${q(payee)}&am=${(amountMinor / 100).toFixed(2)}&cu=INR&tn=${q(note)}`;
}

/** The bank account block beside the notes, with a UPI QR for the total when the document is in rupees. */
function bankBlock(doc: BusinessDocument, company: Company | undefined, bi: (key: string) => string): string {
  const b: BankDetails | undefined = company?.bankDetails;
  if (!b || !PAYABLE_KINDS.includes(doc.kind) || !(b.accountNumber || b.upiId)) return '';
  const row = (key: string, value?: string) => (value ? `<tr><td class="muted">${bi(key)}</td><td>${esc(value)}</td></tr>` : '');
  let qr = '';
  if (b.upiId && doc.currency === 'INR' && doc.totals.grandTotal.minor > 0) {
    try {
      const link = upiPayLink(b.upiId, b.accountName || company?.name || '', doc.totals.grandTotal.minor, doc.number);
      qr = `<div class="upi-qr">${qrSvgString(qrMatrix(link, 'M'), { size: 112, quietZone: 2 })}<div class="muted">${bi('sales:pdf.scanToPay')}</div></div>`;
    } catch {
      qr = '';
    }
  }
  return `<div class="bank">
      <div class="cap">${bi('sales:pdf.bankDetails')}</div>
      <div class="bank-body">
        <table class="bank-rows"><tbody>
          ${row('sales:pdf.accountName', b.accountName)}
          ${row('sales:pdf.bank', b.bankName)}
          ${row('sales:pdf.accountNumber', b.accountNumber)}
          ${row('sales:pdf.ifsc', b.ifsc)}
          ${row('sales:pdf.branch', b.branch)}
          ${row('sales:pdf.upi', b.upiId)}
        </tbody></table>
        ${qr}
      </div>
    </div>`;
}

export function buildDocumentHtml({
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
  t,
  language,
}: {
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
  /** Translator for the descriptive labels. Statutory field names stay English. */
  t: Translate;
  language: LanguageCode;
}): string {
  // A heading, so it takes the singular. Upper-casing is an English typographic
  // convention and a no-op on Tamil, so it is applied only where it means
  // something.
  // A composition dealer may not issue a tax invoice, only a bill of supply (Rule 49). Statutory, so English.
  const billOfSupply = doc.kind === 'invoice' && !!company?.taxRegistration?.compositionScheme;
  const kindName = billOfSupply ? 'Bill of Supply' : documentKindLabel(t, doc.kind, 1);
  const label = language === 'en' || billOfSupply ? kindName.toUpperCase() : kindName;

  const bi = bilingual(t, language);
  const sellerTaxId = branch?.gstin ?? company?.taxRegistration?.identifier;
  const branchLabel = branchName ?? branch?.name;
  const components = flattenTaxComponents(doc.totals.taxLines, doc.currency);
  const chargesTaxed = doc.totals.chargesTaxed ?? taxedCharges(doc);
  const pos = INDIAN_STATES.find((s) => s.code === doc.placeOfSupplyStateCode)?.name;

  // Pure-agent reimbursements sit outside the taxable value (Rule 33), so they get their own
  // table and the items table adds up to the subtotal.
  const tpl = resolveTemplate(template ?? company?.invoiceTemplate);
  const reimbursed = doc.lines.filter((l) => l.gst?.reimbursement);
  const rows = doc.lines
    .filter((l) => !l.gst?.reimbursement)
    .map((line, i) => {
      const gross = money(Math.round(line.unitPrice.minor * line.quantity), doc.currency);
      const discount =
        line.discountValue > 0
          ? line.discountMode === 'percent'
            ? formatPercent(line.discountValue)
            : formatMoney(money(line.discountValue * 100, doc.currency))
          : '—';
      return `<tr>
        <td class="num">${i + 1}</td>
        <td>
          <div class="item">${esc(line.name)}</div>
          ${line.hsnCode && tpl.showHsn ? `<div class="sub">HSN/SAC ${esc(line.hsnCode)}</div>` : ''}
          ${line.gst?.supplyType && line.gst.supplyType !== 'taxable' ? `<div class="sub">${SUPPLY_NOTE[line.gst.supplyType]}</div>` : ''}
        </td>
        <td class="num">${formatQty(line.quantity)} ${esc(unitShortName(line.unit))}</td>
        <td class="num">${formatMoney(line.unitPrice)}</td>
        ${tpl.showDiscountColumn ? `<td class="num">${discount}</td>` : ''}
        ${tpl.showTaxColumn ? `<td class="num">${formatPercent(line.taxRate)}</td>` : ''}
        <td class="num strong">${formatMoney(gross)}</td>
      </tr>`;
    })
    .join('');

  const reimbursementTable = reimbursed.length
    ? `<table class="reimbursements">
    <thead>
      <tr>
        <th style="width:26px">#</th>
        <th>Reimbursement of expenses (pure agent, at cost, not part of taxable value)</th>
        <th class="num">${bi('sales:pdf.amount')}</th>
      </tr>
    </thead>
    <tbody>${reimbursed
      .map(
        (line, i) => `<tr>
        <td class="num">${i + 1}</td>
        <td><div class="item">${esc(line.name)}</div>${line.description ? `<div class="sub">${esc(line.description)}</div>` : ''}</td>
        <td class="num strong">${formatMoney(money(Math.round(line.unitPrice.minor * line.quantity), doc.currency))}</td>
      </tr>`,
      )
      .join('')}</tbody>
  </table>`
    : '';

  // `name` is markup: `bi()` labels come escaped already, plain ones go through `esc` here.
  const totalRow = (name: string, value: string, strong = false) =>
    `<tr class="${strong ? 'grand' : ''}"><td>${name}</td><td class="num">${value}</td></tr>`;

  const totalRows = [
    totalRow(bi('sales:pdf.subtotal'), formatMoney(doc.totals.subtotal)),
    doc.totals.lineDiscount.minor > 0 ? totalRow(esc('Line discounts'), `− ${formatMoney(doc.totals.lineDiscount)}`) : '',
    // Charges taxed with the items (RULES 1.10): part of the taxable value, so shown above it.
    chargesTaxed.minor ? totalRow(esc('Freight and other charges'), formatMoney(chargesTaxed)) : '',
    totalRow(bi('sales:pdf.taxableValue'), formatMoney(doc.totals.taxableAmount)),
    ...components.map((c) => totalRow(esc(c.label), formatMoney(c.amount))),
    doc.totals.documentDiscount.minor > 0 ? totalRow(esc('Discount on total'), `− ${formatMoney(doc.totals.documentDiscount)}`) : '',
    doc.totals.reimbursements?.minor ? totalRow(esc('Reimbursement of expenses'), formatMoney(doc.totals.reimbursements)) : '',
    doc.totals.charges.minor > 0 ? totalRow(esc('Other charges'), formatMoney(doc.totals.charges)) : '',
    // Income-tax TCS (s.206C), collected with the price: statutory, so English.
    doc.totals.tcs?.minor ? totalRow(esc(`TCS collected u/s ${doc.tcs?.section ? (TCS_LABEL[doc.tcs.section] ?? '206C') : '206C'} @ ${doc.tcs?.rate ?? ''}%`), formatMoney(doc.totals.tcs)) : '',
    doc.totals.roundOff.minor !== 0 ? totalRow(bi('sales:pdf.roundOff'), formatMoney(doc.totals.roundOff, { signed: true })) : '',
    totalRow(bi('sales:pdf.total'), formatMoney(doc.totals.grandTotal), true),
    // Rule 46(p): the invoice says whether tax is payable on reverse charge, and how much.
    doc.totals.reverseChargeTax?.minor ? totalRow(esc('Tax payable on reverse charge by the recipient'), formatMoney(doc.totals.reverseChargeTax)) : '',
  ]
    .filter(Boolean)
    .join('');

  return `<!DOCTYPE html>
<html lang="${language}">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${label} ${esc(doc.number)}</title>
<style>
  * { box-sizing: border-box; }
  body {
    /* The Tamil faces sit after the Latin ones, so Latin text is unchanged and
       Tamil glyphs come from the platform font rather than rendering as tofu.
       Both print WebViews subset-embed what they use into the PDF, so no
       webfont is shipped. */
    font-family: -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial,
                 "Noto Sans Tamil", "Tamil Sangam MN", Latha, sans-serif;
    color: #0E121A;
    margin: 0;
    padding: 28px;
    font-size: ${tpl.compact ? 10.5 : 12}px;
    line-height: ${tpl.compact ? 1.3 : 1.45};
    background: #FFFFFF;
  }
  .head { display: flex; justify-content: space-between; align-items: flex-start; gap: 24px; }
  .brand { font-size: 19px; font-weight: 700; letter-spacing: -0.3px; }
  .logo { display: block; max-width: 160px; max-height: 56px; object-fit: contain; margin-bottom: 8px; }
  .muted { color: #5A6478; }
  .doc-title { font-size: 22px; font-weight: 700; letter-spacing: 1px; color: ${tpl.accentColor}; text-align: right; }
  .meta { text-align: right; margin-top: 6px; }
  .meta div { margin-bottom: 2px; }
  .rule { height: 2px; background: ${tpl.accentColor}; margin: 18px 0; border-radius: 1px; }
  .parties { display: flex; gap: 28px; margin-bottom: 18px; }
  .parties > div { flex: 1; }
  .cap { font-size: 10px; letter-spacing: 0.8px; text-transform: uppercase; color: #5A6478; margin-bottom: 5px; font-weight: 700; }
  .name { font-weight: 700; font-size: 13px; margin-bottom: 3px; }
  table { width: 100%; border-collapse: collapse; }
  thead th {
    background: #F4F6FA; text-align: left; padding: 8px 9px;
    font-size: 10px; letter-spacing: 0.6px; text-transform: uppercase; color: #5A6478;
    border-bottom: 1px solid #E2E8F1;
  }
  tbody td { padding: 9px; border-bottom: 1px solid #E2E8F1; vertical-align: top; }
  .num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
  thead th.num { text-align: right; }
  .item { font-weight: 600; }
  .sub { color: #5A6478; font-size: 10px; margin-top: 2px; }
  .strong { font-weight: 700; }
  .reimbursements { margin-top: 14px; }
  .totals { width: 280px; margin-left: auto; margin-top: 14px; }
  .totals td { padding: 5px 0; border: 0; }
  .totals tr.grand td { border-top: 1px solid #E2E8F1; padding-top: 9px; font-weight: 700; font-size: 15px; }
  .words { margin-top: 10px; text-align: right; font-size: 12px; }
  .notes { margin-top: 26px; display: flex; gap: 28px; }
  .notes > div { flex: 1; }
  .bank { flex: 1; page-break-inside: avoid; }
  .bank-body { display: flex; gap: 14px; align-items: flex-start; }
  .bank-rows td { padding: 2px 10px 2px 0; border: 0; font-size: 11px; }
  .upi-qr { text-align: center; font-size: 9px; max-width: 120px; }
  .upi-qr svg { display: block; margin: 0 auto 4px; }
  .sign { margin-top: 34px; text-align: right; }
  .sign .signature { display: block; margin: 8px 0 -34px auto; max-width: 180px; max-height: 60px; object-fit: contain; }
  .sign .line { margin-top: 42px; border-top: 1px solid #E2E8F1; display: inline-block; padding-top: 5px; min-width: 190px; }
  .foot { margin-top: 26px; text-align: center; color: #5A6478; font-size: 10px; }
  .badge { display: inline-block; padding: 3px 9px; border-radius: 99px; background: ${tint(tpl.accentColor, 0.1)}; color: ${tpl.accentColor}; font-size: 10px; font-weight: 700; }
  .einv { display: flex; gap: 18px; margin-top: 16px; padding: 12px 14px; border: 1px solid #E2E8F1; border-radius: 6px; page-break-inside: avoid; }
  .einv-qr svg { display: block; }
  .einv-body { flex: 1; }
  .einv-grid { display: flex; gap: 26px; margin-top: 9px; }
  /* The English term printed under a Tamil label. */
  .alt { display: block; font-size: 8px; font-weight: 400; letter-spacing: 0.3px; opacity: 0.66; text-transform: none; }
  /* Tamil marks sit above and below the line and clip at the Latin leading. */
  body.ta { line-height: 1.62; }
  /* Tracking pulls Tamil vowel signs away from their letters; the Latin
     .alt line under each label keeps its own. */
  body.ta .brand, body.ta .doc-title, body.ta .cap, body.ta thead th, body.ta .cancelled-strip { letter-spacing: 0; }
  .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 10px; line-height: 1.5; word-break: break-all; letter-spacing: 0.2px; }
  .cancelled-strip { margin-bottom: 14px; padding: 8px 12px; border-radius: 5px; background: rgba(255,59,48,0.10); color: #C62F26; font-size: 11px; font-weight: 700; letter-spacing: 0.4px; }
</style>
</head>
<body class="${language}">
  ${cancelledStrip(doc)}
  <div class="head">
    <div>
      ${tpl.showLogo ? logoTag(logoSrc ?? company?.logoUri, company?.name) : ''}
      <div class="brand">${esc(company?.name)}</div>
      <div class="muted">${addressBlock(branch?.address?.line1 ? branch.address : company?.address)}</div>
      ${company?.phone ? `<div class="muted">${esc(company.phone)}</div>` : ''}
      ${company?.email ? `<div class="muted">${esc(company.email)}</div>` : ''}
      ${sellerTaxId ? `<div style="margin-top:5px"><strong>${esc(company?.taxRegistration?.identifierLabel ?? 'GSTIN')}:</strong> ${esc(sellerTaxId)}</div>` : ''}
    </div>
    <div>
      <div class="doc-title">${label}</div>
      ${doc.kind === 'proforma' ? '<div class="muted">Not a tax invoice. A tax invoice follows on supply or on receipt of payment.</div>' : ''}
      ${billOfSupply ? '<div class="sub">Composition taxable person, not eligible to collect tax on supplies</div>' : ''}
      <div class="meta">
        <div><strong>${esc(doc.number)}</strong></div>
        <div class="muted">Date: ${formatDate(doc.date)}</div>
        ${doc.dueDate ? `<div class="muted">Due: ${formatDate(doc.dueDate)}</div>` : ''}
        ${doc.validUntil ? `<div class="muted">Valid until: ${formatDate(doc.validUntil)}</div>` : ''}
        ${source ? `<div class="muted">Against ${esc(source.number)} of ${formatDate(source.date)}</div>` : ''}
        ${doc.noteReason ? `<div class="muted">Reason: ${esc(NOTE_REASON[doc.noteReason])}</div>` : ''}
        ${branchLabel ? `<div class="muted">${esc(branchLabel)}</div>` : ''}
      </div>
    </div>
  </div>

  <div class="rule"></div>

  <div class="parties">
    <div>
      <div class="cap">${bi('sales:pdf.billTo')}</div>
      <div class="name">${esc(party?.name)}</div>
      <div class="muted">${addressBlock(party?.billingAddress)}</div>
      ${party?.taxId ? `<div style="margin-top:4px"><strong>${esc(t('sales:pdf.gstin'))}:</strong> ${esc(party.taxId)}</div>` : ''}
      ${party?.phone ? `<div class="muted">${esc(party.phone)}</div>` : ''}
      ${party?.email ? `<div class="muted">${esc(party.email)}</div>` : ''}
    </div>
    <div>
      ${pos ? `<div class="cap">${bi('sales:pdf.placeOfSupply')}</div><div>${esc(pos)}</div>` : ''}
      ${doc.reference ? `<div class="cap" style="margin-top:10px">${bi('sales:pdf.reference')}</div><div>${esc(doc.reference)}</div>` : ''}
      ${doc.supplierDocNumber ? `<div class="cap" style="margin-top:10px">${bi('sales:pdf.supplierDocument')}</div><div>${esc(doc.supplierDocNumber)}</div>` : ''}
      ${doc.currency !== (company?.baseCurrency ?? 'INR') ? `<div class="cap" style="margin-top:10px">${bi('sales:pdf.currency')}</div><div>${esc(doc.currency)} @ ${doc.exchangeRate.toFixed(4)} ${esc(company?.baseCurrency)}</div>` : ''}
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th style="width:26px">#</th>
        <th>${bi('sales:pdf.description')}</th>
        <th class="num">${bi('sales:pdf.qty')}</th>
        <th class="num">${bi('sales:pdf.rate')}</th>
        ${tpl.showDiscountColumn ? `<th class="num">${bi('sales:pdf.disc')}</th>` : ''}
        ${tpl.showTaxColumn ? `<th class="num">${bi('sales:pdf.tax')}</th>` : ''}
        <th class="num">${bi('sales:pdf.amount')}</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>

  ${reimbursementTable}

  <table class="totals"><tbody>${totalRows}</tbody></table>
  <div class="words"><span class="cap">${bi('sales:pdf.amountInWords')}</span> ${esc(amountInWords(doc.totals.grandTotal))}</div>

  ${eInvoiceBlock(doc, bi, ewayBill)}

  <div class="notes">
    <div>
      ${(() => {
        // The company's own fields marked to print: this document's, then the party's.
        const printed = [...printableFields(customFields, 'document', doc.customFields), ...printableFields(customFields, 'party', party?.customFields)];
        return printed.length ? `<table class="custom-fields" style="margin-bottom:12px"><tbody>${printed.map((f) => `<tr><td class="muted" style="padding:2px 12px 2px 0">${esc(f.label)}</td><td style="padding:2px 0">${esc(f.text)}</td></tr>`).join('')}</tbody></table>` : '';
      })()}
      ${doc.notes ? `<div class="cap">${bi('sales:pdf.notes')}</div><div>${esc(doc.notes)}</div>` : ''}
      ${doc.terms ? `<div class="cap" style="margin-top:12px">Terms &amp; conditions</div><div class="muted">${esc(doc.terms)}</div>` : ''}
    </div>
    ${bankBlock(doc, company, bi)}
  </div>

  <div class="sign">
    <div class="muted">For ${esc(company?.name)}</div>
    ${signatureTag(signatureSrc ?? company?.signatureUri)}
    <div class="line muted">${bi('sales:pdf.authorisedSignatory')}</div>
  </div>

  <div class="foot">${esc(tpl.footerText ?? t('sales:pdf.generatedWith'))}</div>
</body>
</html>`;
}


/**
 * The e-invoice block on a printed document (FRD 16).
 *
 * The IRN, the acknowledgement number, the acknowledgement date and the signed
 * QR are all required on a printed e-invoice, and the e-way bill number must
 * appear on the document travelling with the consignment — so none of this is
 * decoration that can be dropped to save room.
 */
function eInvoiceBlock(doc: BusinessDocument, bi: (key: string) => string, ewayBill?: EwayBill): string {
  const c = doc.compliance;
  const reported = c?.eInvoiceStatus === 'generated' || c?.eInvoiceStatus === 'cancelled';
  if (!reported || !c?.irn) return '';

  // The QR is generated markup, not user content, so it must reach the page as
  // SVG rather than being escaped like every other value interpolated here.
  let qr = '';
  if (c.signedQrPayload) {
    try {
      // Printed a little over the floor, because paper and camera angles are
      // less forgiving than a screen.
      qr = qrSvgString(qrMatrix(c.signedQrPayload, 'M'), {
        size: MIN_READABLE_QR_SIZE + 20,
        quietZone: 4,
      });
    } catch {
      qr = '';
    }
  }

  const ewb = ewayBill
    ? `<div class="einv-grid">
        <div><div class="cap">${bi('sales:pdf.ewbNo')}</div><div>${esc(ewayBill.ewayBillNumber)}</div></div>
        <div><div class="cap">${bi('sales:pdf.validUntil')}</div><div>${esc(formatDate(ewayBill.validUpto.slice(0, 10)))}</div></div>
      </div>`
    : '';

  return `<div class="einv">
    ${qr ? `<div class="einv-qr">${qr}</div>` : ''}
    <div class="einv-body">
      <span class="badge">E-INVOICE</span>
      <div class="cap" style="margin-top:9px">IRN</div>
      <div class="mono">${esc(c.irn)}</div>
      <div class="einv-grid">
        <div><div class="cap">${bi('sales:pdf.ackNo')}</div><div>${esc(c.ackNo)}</div></div>
        <div><div class="cap">${bi('sales:pdf.ackDate')}</div><div>${esc(c.ackDate)}</div></div>
      </div>
      ${ewb}
    </div>
  </div>`;
}

/** A cancelled IRN must be obvious on the page; printing one silently misleads. */
function cancelledStrip(doc: BusinessDocument): string {
  const c = doc.compliance;
  if (c?.eInvoiceStatus !== 'cancelled') return '';
  const reason = c.irnCancelReasonCode ? E_INVOICE_CANCEL_REASONS[c.irnCancelReasonCode] : 'cancelled';
  const on = c.irnCancelledAt ? ` on ${formatDate(c.irnCancelledAt.slice(0, 10))}` : '';
  return `<div class="cancelled-strip">IRN CANCELLED — ${esc(reason)}${esc(on)}</div>`;
}
