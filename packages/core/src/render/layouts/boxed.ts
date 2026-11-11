/**
 * The boxed layouts, ruled like a ledger as Indian businesses know them from their accounting
 * package: `classic` (seller and buyer on the left, the invoice's particulars in a grid on the
 * right, Sl/Description/HSN/Qty/Rate/per/Amount with the taxes under the items) and `detailed`
 * (consignee and dispatch-from as well, and each line's discount, taxable value, tax and total).
 * Both close with the HSN-wise tax table, narration, declaration, bank and signatures.
 */
import { formatMoney, formatPercent, formatQty } from '../../lib/format';
import { money } from '../../lib/money';
import { amountInWords } from '../../lib/amountInWords';
import { unitShortName } from '../../data/masters';
import { tint } from '../invoiceTemplate';
import type { DocView, TotalEntry } from '../docView';
import { bankBlock, cancelledStrip, eInvoiceBlock, esc, logoTag, reimbursementTable, cessTable, signatureTag, SUPPLY_NOTE } from '../blocks';
import { addressLines, baseCss, pageHtml, stepRows, titleOf, buyerBlock, consigneeBlock, footLine, headerFacts, hsnTable, leftFoot, onAccent, sellerBlock, titleNotes, type Fact } from './common';

export function boxedLayout(view: DocView, variant: 'classic' | 'detailed', copyLabel: string): string {
  const { doc, company, bi, tpl, language } = view;
  const accent = tpl.accentColor;
  const ink = onAccent(accent);
  const detailed = variant === 'detailed';
  const logo = tpl.showLogo ? logoTag(view.logoSrc ?? company?.logoUri, company?.name) : '';

  // The particulars in a strip across the page under the title, four to a row. Stacked beside the
  // parties they never matched their height, and ship-to on or off left one side half empty.
  const facts = headerFacts(view);
  const FACTS_PER_ROW = 4;
  const factRows: Fact[][] = [];
  for (let i = 0; i < facts.length; i += FACTS_PER_ROW) factRows.push(facts.slice(i, i + FACTS_PER_ROW));
  const factCell = (f?: Fact) => (f ? `<td><div class="flabel">${f.label}</div><div class="${f.strong ? 'b' : ''}">${f.value}</div></td>` : '<td></td>');
  const factGrid = `<table class="facts">${factRows.map((r) => `<tr>${Array.from({ length: FACTS_PER_ROW }, (_, i) => factCell(r[i])).join('')}</tr>`).join('')}</table>`;

  // The parties side by side, so a row is only as tall as its longest address: seller and buyer,
  // the consignee beside them when shipped to; with dispatch-from as well, from over to in two rows.
  const seller = sellerBlock(view);
  const buyer = `<div class="cap">${bi('sales:pdf.buyerBillTo')}</div>${buyerBlock(view)}`;
  const consignee = tpl.showShipTo ? `<div class="cap">${bi('sales:pdf.consigneeShipTo')}</div>${consigneeBlock(view)}` : '';
  const dispatchFrom =
    tpl.showShipTo && detailed
      ? `<div class="cap">${bi('sales:pdf.dispatchFrom')}</div><div class="pname">${esc(company?.name)}${view.branch?.name ? ` – ${esc(view.branch.name)}` : ''}</div>${addressLines(view.sellerAddress)}${view.sellerTaxId ? `<div><span class="b">GSTIN:</span> ${esc(view.sellerTaxId)}</div>` : ''}`
      : '';
  const partyRows = dispatchFrom ? [[seller, buyer], [dispatchFrom, consignee]] : [[seller, buyer, consignee].filter(Boolean)];
  const parties = `<table class="parties">${partyRows.map((r) => `<tr>${r.map((c) => `<td style="width:${(100 / r.length).toFixed(2)}%">${c}</td>`).join('')}</tr>`).join('')}</table>`;

  // Items. Classic: amount is quantity times rate, the taxes follow under the lines.
  // Detailed: each line carries its discount, taxable value, tax and total.
  const taxes = detailed ? view.lineTaxes() : [];
  const showDisc = detailed && tpl.showDiscountColumn;
  // Cess gets its own columns, beside GST, only when a line carries it.
  const showCess = detailed && taxes.some((x) => x.cess.minor !== 0);
  const head = detailed
    ? `<tr>
        <th rowspan="2" class="sl">${bi('sales:pdf.slNo')}</th>
        <th rowspan="2">${bi('sales:pdf.description')}</th>
        <th rowspan="2">${bi('sales:pdf.hsnSac')}</th>
        <th rowspan="2" class="num">${bi('sales:pdf.qty')}</th>
        <th rowspan="2">${bi('sales:pdf.unit')}</th>
        <th rowspan="2" class="num">${bi('sales:pdf.rate')}</th>
        <th rowspan="2" class="num">${bi('sales:pdf.amount')}</th>
        ${showDisc ? `<th colspan="2" class="ctr">${bi('sales:pdf.discount')}</th>` : ''}
        <th rowspan="2" class="num">${bi('sales:pdf.taxableAmount')}</th>
        <th colspan="2" class="ctr">${bi('sales:pdf.tax')}</th>
        ${showCess ? `<th colspan="2" class="ctr">${bi('sales:pdf.cess')}</th>` : ''}
        <th rowspan="2" class="num">${bi('sales:pdf.totalAmount')}</th>
      </tr>
      <tr>${showDisc ? `<th class="ctr">%</th><th class="num">${bi('sales:pdf.amt')}</th>` : ''}<th class="ctr">%</th><th class="num">${bi('sales:pdf.amt')}</th>${showCess ? `<th class="ctr">%</th><th class="num">${bi('sales:pdf.amt')}</th>` : ''}</tr>`
    : `<tr>
        <th class="sl">${bi('sales:pdf.slNo')}</th>
        <th>${bi('sales:pdf.description')}</th>
        <th>${bi('sales:pdf.hsnSac')}</th>
        <th class="num">${bi('sales:pdf.qty')}</th>
        <th class="num">${bi('sales:pdf.rate')}</th>
        <th>${bi('sales:pdf.per')}</th>
        <th class="num">${bi('sales:pdf.amount')}</th>
      </tr>`;
  const cols = detailed ? 11 + (showDisc ? 2 : 0) + (showCess ? 2 : 0) : 7;

  const describe = (line: (typeof view.items)[number]) =>
    `<div class="item">${esc(line.name)}</div>${line.description ? `<div class="sub">${esc(line.description)}</div>` : ''}${line.gst?.supplyType && line.gst.supplyType !== 'taxable' ? `<div class="sub">${SUPPLY_NOTE[line.gst.supplyType]}</div>` : ''}`;

  // The tax column is GST alone when cess has columns of its own.
  const gstOf = (t: (typeof taxes)[number]) => (showCess ? money(t.tax.minor - t.cess.minor, doc.currency) : t.tax);

  const rows = view.items
    .map((line, i) => {
      const gross = money(Math.round(line.unitPrice.minor * line.quantity), doc.currency);
      if (!detailed) {
        const disc = line.discountValue > 0 ? `<div class="sub">Less discount ${line.discountMode === 'percent' ? formatPercent(line.discountValue) : formatMoney(money(line.discountValue * 100, doc.currency))}</div>` : '';
        return `<tr>
        <td class="ctr">${i + 1}</td>
        <td>${describe(line)}${disc}</td>
        <td>${esc(line.hsnCode)}</td>
        <td class="num">${formatQty(line.quantity)}</td>
        <td class="num">${formatMoney(line.unitPrice)}</td>
        <td>${esc(unitShortName(line.unit))}</td>
        <td class="num">${formatMoney(gross)}</td>
      </tr>`;
      }
      const t = taxes.find((x) => x.lineId === line.id);
      const discPct = line.discountValue > 0 && line.discountMode === 'percent' ? formatPercent(line.discountValue) : '';
      return `<tr>
        <td class="ctr">${i + 1}</td>
        <td>${describe(line)}</td>
        <td>${esc(line.hsnCode)}</td>
        <td class="num">${formatQty(line.quantity)}</td>
        <td>${esc(unitShortName(line.unit))}</td>
        <td class="num">${formatMoney(line.unitPrice)}</td>
        <td class="num">${formatMoney(gross)}</td>
        ${showDisc ? `<td class="num">${discPct}</td><td class="num">${t && t.discount.minor ? formatMoney(t.discount) : ''}</td>` : ''}
        <td class="num">${t ? formatMoney(t.taxable) : ''}</td>
        <td class="num">${t?.rate ? formatPercent(t.rate) : ''}</td>
        <td class="num">${t && gstOf(t).minor ? formatMoney(gstOf(t)) : ''}</td>
        ${showCess ? `<td class="num">${t?.cessRate && t.cess.minor ? formatPercent(t.cessRate) : ''}</td><td class="num">${t && t.cess.minor ? formatMoney(t.cess) : ''}</td>` : ''}
        <td class="num b">${t ? formatMoney(money(t.taxable.minor + (t.reverseCharge ? 0 : t.tax.minor), doc.currency)) : ''}</td>
      </tr>`;
    })
    .join('');

  // Under the lines: what turns their sum into the total. Classic lists every step after the
  // gross amounts; detailed has the line discounts, charges and taxes in the columns already.
  const skip = detailed ? ['subtotal', 'lineDiscount', 'chargesTaxed', 'taxable', 'tax', 'total'] : ['subtotal', 'taxable', 'total'];
  const steps: TotalEntry[] = view.totals.filter((r) => !skip.includes(r.key));
  if (detailed && view.chargesTaxed.minor) steps.unshift({ key: 'chargesTaxed', name: esc('Taxable amounts include freight and other charges of'), value: formatMoney(view.chargesTaxed) });
  const total = view.totals.find((r) => r.key === 'total')!;
  const qtyTotal = view.items.every((l) => l.unit === view.items[0]?.unit) && view.items.length ? formatQty(view.items.reduce((a, l) => a + l.quantity, 0)) : '';
  const totalRow = `<tr class="grand">
        <td></td>
        <td class="num" colspan="2">${total.name}</td>
        <td class="num">${qtyTotal}</td>
        <td colspan="${cols - 5}"></td>
        <td class="num">${total.value}</td>
      </tr>`;

  const bank = tpl.showBank ? bankBlock(doc, company, bi) : '';
  const lf = leftFoot(view, { terms: !detailed });
  const terms = detailed && doc.terms ? `<div class="row pad"><div class="cap">${bi('sales:pdf.terms')}</div><div class="pre">${esc(doc.terms)}</div></div>` : '';
  const einv = eInvoiceBlock(doc, bi, view.ewayBill);
  const cess = cessTable(view);

  const page = `
  ${copyLabel ? `<div class="copy-label">${esc(copyLabel)}</div>` : ''}
  ${cancelledStrip(doc)}
  <div class="sheet">
    <div class="titlebar ${tpl.logoPosition}">
      <div class="logo-slot">${logo}</div>
      <div class="title">${titleOf(view)}</div>
      <div class="logo-slot"></div>
    </div>
    ${titleNotes(view)}
    ${factGrid}
    ${parties}
    <table class="items">
      <thead>${head}</thead>
      <tbody>${rows}${stepRows(steps, cols - 2)}${totalRow}</tbody>
    </table>
    ${view.reimbursed.length ? `<div class="row pad">${reimbursementTable(view)}</div>` : ''}
    <div class="row pad words"><span class="cap">${bi('sales:pdf.amountChargeable')}</span> <span class="b">${esc(amountInWords(doc.totals.grandTotal))}</span><span class="eoe">E. &amp; O.E</span></div>
    ${hsnTable(view, 'hsn')}${cess ? `<div class="row pad">${cess}</div>` : ''}
    ${terms}
    ${einv ? `<div class="row">${einv}</div>` : ''}
    <table class="foot-grid"><tr>
      <td class="half">${lf}</td>
      <td class="half">${bank}</td>
    </tr></table>
    <table class="sign-grid"><tr>
      <td class="half">${tpl.showCustomerSeal ? `<div class="cap">${bi('sales:pdf.customerSeal')}</div>` : ''}</td>
      <td class="half signbox">
        <div class="b">For ${esc(company?.name)}</div>
        ${tpl.showSignature ? signatureTag(view.signatureSrc ?? company?.signatureUri) : ''}
        <div class="signline">${bi('sales:pdf.authorisedSignatory')}</div>
      </td>
    </tr></table>
  </div>
  <div class="foot">${footLine(view)}</div>`;

  const line = '#5B6475';
  const css = `${baseCss(view)}
  .sheet { border: 1px solid ${line}; }
  .titlebar { display: flex; align-items: center; padding: 6px 10px; border-bottom: 1px solid ${line}; }
  .titlebar.right { flex-direction: row-reverse; }
  .titlebar .logo-slot { flex: 1; display: flex; }
  .titlebar.right .logo-slot:first-child { justify-content: flex-end; }
  .title { font-size: 1.55em; font-weight: 700; text-align: center; padding: 0 8px; letter-spacing: 0.3px; }
  .pname { font-weight: 700; font-size: 1.08em; }
  .gstin { margin-top: 2px; }
  .facts { table-layout: fixed; }
  .facts td { width: 25%; padding: 3px 8px; border-bottom: 1px solid ${line}; overflow-wrap: anywhere; }
  .facts td + td { border-left: 1px solid ${line}; }
  .parties { table-layout: fixed; border-bottom: 1px solid ${line}; }
  .parties td { padding: 4px 8px; overflow-wrap: anywhere; }
  .parties td + td { border-left: 1px solid ${line}; }
  .parties tr + tr td { border-top: 1px solid ${line}; }
  .flabel { color: #4A5468; font-size: 0.92em; }
  .items th { background: ${accent}; color: ${ink}; padding: 5px 5px; font-weight: 700; font-size: 0.92em; border: 1px solid ${line}; text-align: left; }
  .items th.num { text-align: right; } .items th.ctr { text-align: center; }
  .items td { padding: 5px 5px; border-left: 1px solid ${line}; border-right: 1px solid ${line}; }
  .items tbody tr:not(.step):not(.grand) td { border-bottom: 1px solid ${tint('#5B6475', 0.25)}; }
  .items .sl { width: 30px; }
  .items tr.step td { font-style: italic; padding-top: 1px; padding-bottom: 1px; }
  .items tr.step.first td { border-top: 1px solid ${line}; padding-top: 8px; }
  .items tr.step.last td { padding-bottom: 8px; }
  .items tr.grand td { border-top: 1px solid ${line}; border-bottom: 1px solid ${line}; font-weight: 700; font-size: 1.05em; }
  .row { border-bottom: 1px solid ${line}; }
  .pad { padding: 5px 8px; }
  .words { display: flex; gap: 12px; align-items: baseline; }
  .words .b { flex: 1; }
  .eoe { font-style: italic; color: #4A5468; white-space: nowrap; }
  .hsn th { background: ${accent}; color: ${ink}; padding: 4px 5px; border: 1px solid ${line}; font-size: 0.92em; }
  .hsn td { padding: 3px 5px; border: 1px solid ${tint('#5B6475', 0.45)}; }
  .hsn tr.sum td { background: #ECEEF2; }
  .words-tax { padding: 5px 8px; border-bottom: 1px solid ${line}; }
  .foot-grid { border-bottom: 1px solid ${line}; }
  .foot-grid .half, .sign-grid .half { width: 50%; padding: 6px 8px; }
  .foot-grid .half + .half, .sign-grid .half + .half { border-left: 1px solid ${line}; }
  .sign-grid td { height: 64px; }
  .signbox { text-align: right; display: table-cell; }
  .signline { margin-top: 22px; }
  .signature + .signline { margin-top: 2px; }
  .kv { width: auto; }
  .kv td { padding: 1px 12px 1px 0; }
  .gap { height: 6px; }
  .decl { text-decoration: underline; }
  .pre { white-space: pre-wrap; }
  .bank .cap { font-weight: 700; }
  .einv { border: 0; }
  .foot { font-style: normal; }`;

  return pageHtml(view, language, css, page);
}
