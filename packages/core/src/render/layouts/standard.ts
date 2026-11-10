import { formatMoney, formatPercent, formatQty } from '../../lib/format';
import { formatDate } from '../../lib/date';
import { money } from '../../lib/money';
import { amountInWords } from '../../lib/amountInWords';
import { unitShortName } from '../../data/masters';
import { shownCessRate } from '../../domain/lineCalc';
import { tint } from '../invoiceTemplate';
import type { DocView } from '../docView';
import { addressBlock, bankBlock, cancelledStrip, eInvoiceBlock, esc, logoTag, NOTE_REASON, printedCustomFields, reimbursementTable, signatureTag, SUPPLY_NOTE } from '../blocks';

/**
 * The standard page: the app's own design, and what every business printed before it could choose
 * another. Its output is pinned byte for byte by `standardSnapshot.test.ts`.
 */
export function standardLayout(view: DocView): string {
  const { doc, company, party, branch, ewayBill, source, logoSrc, signatureSrc, t, language, bi, tpl, billOfSupply, label, sellerTaxId, branchLabel, pos, items, shownNumber } = view;
  const rows = items
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
        ${tpl.showTaxColumn ? `<td class="num">${formatPercent(line.taxRate)}${shownCessRate(line) ? `<div class="sub">+ ${formatPercent(shownCessRate(line))} ${bi('sales:pdf.cess')}</div>` : ''}</td>` : ''}
        <td class="num strong">${formatMoney(gross)}</td>
      </tr>`;
    })
    .join('');

  // `name` is markup: `bi()` labels come escaped already, plain ones go through `esc` here.
  const totalRow = (name: string, value: string, strong = false) =>
    `<tr class="${strong ? 'grand' : ''}"><td>${name}</td><td class="num">${value}</td></tr>`;
  const totalRows = view.totals.map((r) => totalRow(r.name, r.value, r.strong)).join('');

  return `<!DOCTYPE html>
<html lang="${language}">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${label} ${esc(shownNumber)}</title>
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
        <div><strong>${esc(shownNumber)}</strong></div>
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

  ${reimbursementTable(view)}

  <table class="totals"><tbody>${totalRows}</tbody></table>
  <div class="words"><span class="cap">${bi('sales:pdf.amountInWords')}</span> ${esc(amountInWords(doc.totals.grandTotal))}</div>

  ${eInvoiceBlock(doc, bi, ewayBill)}

  <div class="notes">
    <div>
      ${(() => {
        // The company's own fields marked to print: this document's, then the party's.
        const printed = printedCustomFields(view);
        return printed.length ? `<table class="custom-fields" style="margin-bottom:12px"><tbody>${printed.map((f) => `<tr><td class="muted" style="padding:2px 12px 2px 0">${esc(f.label)}</td><td style="padding:2px 0">${esc(f.text)}</td></tr>`).join('')}</tbody></table>` : '';
      })()}
      ${doc.notes ? `<div class="cap">${bi('sales:pdf.notes')}</div><div>${esc(doc.notes)}</div>` : ''}
      ${doc.terms ? `<div class="cap" style="margin-top:12px">Terms &amp; conditions</div><div class="muted">${esc(doc.terms)}</div>` : ''}
    </div>
    ${tpl.showBank ? bankBlock(doc, company, bi) : ''}
  </div>

  <div class="sign">
    <div class="muted">For ${esc(company?.name)}</div>
    ${tpl.showSignature ? signatureTag(signatureSrc ?? company?.signatureUri) : ''}
    <div class="line muted">${bi('sales:pdf.authorisedSignatory')}</div>
  </div>

  <div class="foot">${esc(tpl.footerText ?? t('sales:pdf.generatedWith'))}</div>
</body>
</html>`;
}
