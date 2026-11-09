/**
 * The modern layout: an open page with the title in the accent, the logo beside the invoice's
 * particulars, "Billed by" and "Billed to" on rounded tinted cards, a filled items table with the
 * taxes under the lines, the HSN-wise tax table, then narration, bank and the e-invoice QR.
 */
import { formatMoney, formatPercent, formatQty } from '../../lib/format';
import { money } from '../../lib/money';
import { amountInWords } from '../../lib/amountInWords';
import { unitShortName } from '../../data/masters';
import { tint } from '../invoiceTemplate';
import type { DocView } from '../docView';
import { bankBlock, cancelledStrip, eInvoiceBlock, esc, logoTag, reimbursementTable, signatureTag, SUPPLY_NOTE } from '../blocks';
import { accentText, baseCss, stepRows, titleOf, buyerBlock, consigneeBlock, footLine, headerFacts, hsnTable, leftFoot, onAccent, pageHtml, sellerBlock, titleNotes } from './common';

export function modernLayout(view: DocView, copyLabel: string): string {
  const { doc, company, bi, tpl, language } = view;
  const accent = tpl.accentColor;
  const ink = onAccent(accent);
  const heading = accentText(accent);
  const fill = tint(accent, 0.12);
  const rule = tint(accent, 0.35);
  const logo = tpl.showLogo ? logoTag(view.logoSrc ?? company?.logoUri, company?.name) : '';

  const facts = headerFacts(view)
    .map((f) => `<tr><td class="flabel">${f.label}</td><td class="${f.strong ? 'b' : ''}">${f.value}</td></tr>`)
    .join('');

  const cards = [
    `<div class="card"><div class="ctitle">${bi('sales:pdf.billedBy')}</div>${sellerBlock(view)}</div>`,
    `<div class="card"><div class="ctitle">${bi('sales:pdf.billedTo')}</div>${buyerBlock(view)}</div>`,
    tpl.showShipTo ? `<div class="card"><div class="ctitle">${bi('sales:pdf.consigneeShipTo')}</div>${consigneeBlock(view)}</div>` : '',
  ].join('');

  const rows = view.items
    .map((line, i) => {
      const gross = money(Math.round(line.unitPrice.minor * line.quantity), doc.currency);
      const disc = line.discountValue > 0 ? `<div class="sub">Less discount ${line.discountMode === 'percent' ? formatPercent(line.discountValue) : formatMoney(money(line.discountValue * 100, doc.currency))}</div>` : '';
      return `<tr>
        <td class="ctr">${i + 1}</td>
        <td><div class="item">${esc(line.name)}</div>${line.description ? `<div class="sub">${esc(line.description)}</div>` : ''}${line.gst?.supplyType && line.gst.supplyType !== 'taxable' ? `<div class="sub">${SUPPLY_NOTE[line.gst.supplyType]}</div>` : ''}${disc}</td>
        <td>${esc(line.hsnCode)}</td>
        <td class="num">${formatQty(line.quantity)}</td>
        <td class="num">${formatMoney(line.unitPrice)}</td>
        <td>${esc(unitShortName(line.unit))}</td>
        <td class="num">${formatMoney(gross)}</td>
      </tr>`;
    })
    .join('');
  const steps = view.totals.filter((r) => !['subtotal', 'taxable', 'total'].includes(r.key));
  const total = view.totals.find((r) => r.key === 'total')!;
  const einv = eInvoiceBlock(doc, bi, view.ewayBill);
  const bank = tpl.showBank ? bankBlock(doc, company, bi) : '';

  const page = `
  ${copyLabel ? `<div class="copy-label">${esc(copyLabel)}</div>` : ''}
  ${cancelledStrip(doc)}
  <div class="title">${titleOf(view)}</div>
  ${titleNotes(view)}
  <div class="top ${tpl.logoPosition}">
    <div class="logo-slot">${logo}</div>
    <table class="facts">${facts}</table>
  </div>
  <div class="cards">${cards}</div>
  <table class="items">
    <thead><tr>
      <th class="sl">${bi('sales:pdf.slNo')}</th>
      <th>${bi('sales:pdf.description')}</th>
      <th>${bi('sales:pdf.hsnSac')}</th>
      <th class="num">${bi('sales:pdf.qty')}</th>
      <th class="num">${bi('sales:pdf.rate')}</th>
      <th>${bi('sales:pdf.per')}</th>
      <th class="num">${bi('sales:pdf.amount')}</th>
    </tr></thead>
    <tbody>${rows}${stepRows(steps, 5)}
      <tr class="grand"><td></td><td colspan="5" class="num">${total.name}</td><td class="num">${total.value}</td></tr>
    </tbody>
  </table>
  ${view.reimbursed.length ? reimbursementTable(view) : ''}
  <div class="words"><span class="cap">${bi('sales:pdf.amountChargeable')}</span> <span class="b">${esc(amountInWords(doc.totals.grandTotal))}</span></div>
  ${hsnTable(view, 'hsn')}
  <div class="closing">
    <div class="col">${leftFoot(view, { terms: true })}</div>
    <div class="col">${bank}</div>
  </div>
  ${einv}
  <div class="signs">
    <div>${tpl.showCustomerSeal ? `<div class="muted">${bi('sales:pdf.customerSeal')}</div>` : ''}</div>
    <div class="signbox">
      <div class="b">For ${esc(company?.name)}</div>
      ${tpl.showSignature ? signatureTag(view.signatureSrc ?? company?.signatureUri) : ''}
      <div class="muted signline">${bi('sales:pdf.authorisedSignatory')}</div>
    </div>
  </div>
  <div class="foot">${footLine(view)}</div>`;

  const css = `${baseCss(view)}
  .copy-label { border-bottom: 2px solid ${accent}; padding-bottom: 2px; font-style: italic; }
  .title { text-align: center; font-size: 1.6em; font-weight: 700; color: ${heading}; margin: 2px 0 6px; letter-spacing: 0.3px; }
  .top { display: flex; justify-content: space-between; align-items: flex-start; gap: 18px; margin-bottom: 10px; }
  .top.right { flex-direction: row-reverse; }
  .facts { width: auto; }
  .facts td { padding: 2px 0 2px 14px; }
  .flabel { color: #4A5468; }
  .cards { display: flex; gap: 12px; margin-bottom: 10px; }
  .card { flex: 1; background: ${fill}; border-radius: 12px; padding: 8px 12px; }
  .ctitle { font-weight: 700; color: ${heading}; margin-bottom: 3px; font-size: 1.05em; }
  .pname { font-weight: 700; }
  .gstin { margin-top: 2px; }
  .items th { background: ${accent}; color: ${ink}; padding: 6px; text-align: left; font-weight: 700; border-right: 1px solid ${rule}; }
  .items th.num { text-align: right; }
  .items td { padding: 6px; background: ${fill}; border-right: 1px solid ${rule}; border-bottom: 1px solid ${rule}; }
  .items .sl { width: 30px; }
  .items tr.step td { font-style: italic; padding-top: 1px; padding-bottom: 1px; border-bottom: 0; }
  .items tr.step.first td { padding-top: 8px; }
  .items tr.step.last td { padding-bottom: 8px; border-bottom: 1px solid ${rule}; }
  .items tr.grand td { font-weight: 700; color: ${heading}; font-size: 1.08em; }
  .words { margin: 6px 0 8px; }
  .hsn { margin-top: 4px; }
  .hsn th { background: ${accent}; color: ${ink}; padding: 4px 5px; border: 1px solid ${rule}; }
  .hsn td { padding: 3px 5px; background: ${fill}; border: 1px solid ${rule}; }
  .hsn tr.sum td { background: ${tint(accent, 0.22)}; }
  .words-tax { margin: 6px 0 10px; }
  .cap { color: ${heading}; }
  .closing { display: flex; gap: 20px; margin-top: 6px; }
  .closing .col { flex: 1; }
  .kv { width: auto; }
  .kv td { padding: 1px 12px 1px 0; }
  .gap { height: 6px; }
  .pre { white-space: pre-wrap; }
  .einv { border: 1px solid ${rule}; border-radius: 10px; margin-top: 10px; }
  .badge { background: ${fill}; color: ${heading}; }
  .signs { display: flex; justify-content: space-between; margin-top: 14px; page-break-inside: avoid; }
  .signbox { text-align: right; }
  .signline { margin-top: 28px; }
  .signature + .signline { margin-top: 2px; }
  .foot { font-style: italic; margin-top: 12px; }`;

  return pageHtml(view, language, css, page);
}
