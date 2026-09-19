import { BusinessDocument, Company, EwayBill, Party } from '@/types';
import { documentKindLabel, type Translate } from '@/i18n/labels';
import { flattenTaxComponents } from '@/domain/lineCalc';
import { formatMoney, formatPercent, formatQty } from '@/lib/format';
import { formatDate } from '@/lib/date';
import { money } from '@/lib/money';
import { INDIAN_STATES } from '@/data/masters';
import { MIN_READABLE_QR_SIZE, qrMatrix, qrSvgString } from '@/lib/qr';
import { E_INVOICE_CANCEL_REASONS } from '@/domain/eInvoice';
import type { LanguageCode } from '@/i18n/config';
import i18n from '@/i18n';

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
 * for sharing, and shown in the in-app preview.
 */
export function buildDocumentHtml({
  document: doc,
  company,
  party,
  branchName,
  ewayBill,
  t,
  language,
}: {
  document: BusinessDocument;
  company?: Company;
  party?: Party;
  branchName?: string;
  ewayBill?: EwayBill;
  /** Translator for the descriptive labels. Statutory field names stay English. */
  t: Translate;
  language: LanguageCode;
}): string {
  // A heading, so it takes the singular. Upper-casing is an English typographic
  // convention and a no-op on Tamil, so it is applied only where it means
  // something.
  const kindName = documentKindLabel(t, doc.kind, 1);
  const label = language === 'en' ? kindName.toUpperCase() : kindName;

  const bi = bilingual(t, language);
  const components = flattenTaxComponents(doc.totals.taxLines, doc.currency);
  const pos = INDIAN_STATES.find((s) => s.code === doc.placeOfSupplyStateCode)?.name;

  const rows = doc.lines
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
          ${line.hsnCode ? `<div class="sub">HSN/SAC ${esc(line.hsnCode)}</div>` : ''}
        </td>
        <td class="num">${formatQty(line.quantity)} ${esc(line.unit)}</td>
        <td class="num">${formatMoney(line.unitPrice)}</td>
        <td class="num">${discount}</td>
        <td class="num">${formatPercent(line.taxRate)}</td>
        <td class="num strong">${formatMoney(gross)}</td>
      </tr>`;
    })
    .join('');

  const totalRow = (name: string, value: string, strong = false) =>
    `<tr class="${strong ? 'grand' : ''}"><td>${esc(name)}</td><td class="num">${value}</td></tr>`;

  const totalRows = [
    totalRow(bi('sales:pdf.subtotal'), formatMoney(doc.totals.subtotal)),
    doc.totals.lineDiscount.minor > 0 ? totalRow('Line discounts', `− ${formatMoney(doc.totals.lineDiscount)}`) : '',
    totalRow(bi('sales:pdf.taxableValue'), formatMoney(doc.totals.taxableAmount)),
    ...components.map((c) => totalRow(c.label, formatMoney(c.amount))),
    doc.totals.documentDiscount.minor > 0 ? totalRow('Discount on total', `− ${formatMoney(doc.totals.documentDiscount)}`) : '',
    doc.totals.charges.minor > 0 ? totalRow('Other charges', formatMoney(doc.totals.charges)) : '',
    doc.totals.roundOff.minor !== 0 ? totalRow(bi('sales:pdf.roundOff'), formatMoney(doc.totals.roundOff, { signed: true })) : '',
    totalRow(bi('sales:pdf.total'), formatMoney(doc.totals.grandTotal), true),
  ]
    .filter(Boolean)
    .join('');

  return `<!DOCTYPE html>
<html>
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
    font-size: 12px;
    line-height: 1.45;
    background: #FFFFFF;
  }
  .head { display: flex; justify-content: space-between; align-items: flex-start; gap: 24px; }
  .brand { font-size: 19px; font-weight: 700; letter-spacing: -0.3px; }
  .muted { color: #5A6478; }
  .doc-title { font-size: 22px; font-weight: 700; letter-spacing: 1px; color: #007AFF; text-align: right; }
  .meta { text-align: right; margin-top: 6px; }
  .meta div { margin-bottom: 2px; }
  .rule { height: 2px; background: #007AFF; margin: 18px 0; border-radius: 1px; }
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
  .totals { width: 280px; margin-left: auto; margin-top: 14px; }
  .totals td { padding: 5px 0; border: 0; }
  .totals tr.grand td { border-top: 1px solid #E2E8F1; padding-top: 9px; font-weight: 700; font-size: 15px; }
  .notes { margin-top: 26px; display: flex; gap: 28px; }
  .notes > div { flex: 1; }
  .sign { margin-top: 34px; text-align: right; }
  .sign .line { margin-top: 42px; border-top: 1px solid #E2E8F1; display: inline-block; padding-top: 5px; min-width: 190px; }
  .foot { margin-top: 26px; text-align: center; color: #5A6478; font-size: 10px; }
  .badge { display: inline-block; padding: 3px 9px; border-radius: 99px; background: rgba(0,122,255,0.10); color: #007AFF; font-size: 10px; font-weight: 700; }
  .einv { display: flex; gap: 18px; margin-top: 16px; padding: 12px 14px; border: 1px solid #E2E8F1; border-radius: 6px; page-break-inside: avoid; }
  .einv-qr svg { display: block; }
  .einv-body { flex: 1; }
  .einv-grid { display: flex; gap: 26px; margin-top: 9px; }
  /* The English term printed under a Tamil label. */
  .alt { display: block; font-size: 8px; font-weight: 400; letter-spacing: 0.3px; opacity: 0.66; text-transform: none; }
  /* Tamil marks sit above and below the line and clip at the Latin leading. */
  body.ta { line-height: 1.62; }
  .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 10px; line-height: 1.5; word-break: break-all; letter-spacing: 0.2px; }
  .cancelled-strip { margin-bottom: 14px; padding: 8px 12px; border-radius: 5px; background: rgba(255,59,48,0.10); color: #C62F26; font-size: 11px; font-weight: 700; letter-spacing: 0.4px; }
</style>
</head>
<body class="${language}">
  ${cancelledStrip(doc)}
  <div class="head">
    <div>
      <div class="brand">${esc(company?.name)}</div>
      <div class="muted">${addressBlock(company?.address)}</div>
      ${company?.phone ? `<div class="muted">${esc(company.phone)}</div>` : ''}
      ${company?.email ? `<div class="muted">${esc(company.email)}</div>` : ''}
      ${company?.taxRegistration?.identifier ? `<div style="margin-top:5px"><strong>${esc(company.taxRegistration.identifierLabel)}:</strong> ${esc(company.taxRegistration.identifier)}</div>` : ''}
    </div>
    <div>
      <div class="doc-title">${label}</div>
      <div class="meta">
        <div><strong>${esc(doc.number)}</strong></div>
        <div class="muted">Date: ${formatDate(doc.date)}</div>
        ${doc.dueDate ? `<div class="muted">Due: ${formatDate(doc.dueDate)}</div>` : ''}
        ${doc.validUntil ? `<div class="muted">Valid until: ${formatDate(doc.validUntil)}</div>` : ''}
        ${branchName ? `<div class="muted">${esc(branchName)}</div>` : ''}
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
        <th class="num">${bi('sales:pdf.disc')}</th>
        <th class="num">${bi('sales:pdf.tax')}</th>
        <th class="num">${bi('sales:pdf.amount')}</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>

  <table class="totals"><tbody>${totalRows}</tbody></table>

  ${eInvoiceBlock(doc, bi, ewayBill)}

  <div class="notes">
    <div>
      ${doc.notes ? `<div class="cap">${bi('sales:pdf.notes')}</div><div>${esc(doc.notes)}</div>` : ''}
      ${doc.terms ? `<div class="cap" style="margin-top:12px">Terms &amp; conditions</div><div class="muted">${esc(doc.terms)}</div>` : ''}
    </div>
  </div>

  <div class="sign">
    <div class="muted">For ${esc(company?.name)}</div>
    <div class="line muted">Authorised signatory</div>
  </div>

  <div class="foot">${esc(t('sales:pdf.generatedWith'))}</div>
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
