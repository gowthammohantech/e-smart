/**
 * The e-invoice print, laid out as the accounting package's tax invoice that businesses already file
 * and hand over: "Tax Invoice" with the IRN under it and the signed QR beside, the seller and the
 * buyer down the left and the invoice's particulars in a grid on the right (number and date,
 * reference, order or challan, destination, the IRN acknowledgement, the e-way bill), the items with
 * the taxes and round-off under them, the HSN-wise table with CGST, SGST and IGST, the narration and
 * declaration beside the bank, and the signatures.
 */
import { formatDate } from '../../lib/date';
import { formatMoney, formatPercent } from '../../lib/format';
import { money } from '../../lib/money';
import { amountInWords } from '../../lib/amountInWords';
import { INDIAN_STATES, unitShortName } from '../../data/masters';
import type { Address, BusinessDocument } from '../../types';
import type { DocView, TotalEntry } from '../docView';
import { cancelledStrip, eInvoiceQr, esc, logoTag, reimbursementTable, cessTable, signatureTag, SUPPLY_NOTE } from '../blocks';
import { baseCss, onAccent, pageHtml, titleNotes } from './common';

/** "INR Four Thousand Five Hundred Only /-", as the package prints an amount in words. */
function inWords(m: BusinessDocument['totals']['grandTotal']): string {
  const words = amountInWords(m).replace(/^Rupees\b/, 'INR');
  return `${words} /-`;
}

/** A quantity to three places, as the package prints it (1.000). */
const qty3 = (q: number) => q.toFixed(3);

/** Street lines, then "City : X  Pin : Y". */
function addressRows(a?: Address): string {
  if (!a) return '';
  const street = [a.line1, a.line2].filter(Boolean).map((l) => `<div>${esc(l)}</div>`).join('');
  const city = a.city || a.postalCode ? `<div>${a.city ? `City : ${esc(a.city.toUpperCase())}` : ''}${a.postalCode ? `${a.city ? '&nbsp; ' : ''}Pin : ${esc(a.postalCode)}` : ''}</div>` : '';
  return street + city;
}

export function eInvoiceLayout(view: DocView, copyLabel: string): string {
  const { doc, company, bi, tpl, language, party } = view;
  const accent = tpl.accentColor;
  const ink = onAccent(accent);
  const ack = doc.compliance;
  const logo = tpl.showLogo ? logoTag(view.logoSrc ?? company?.logoUri, company?.name) : '';

  // The seller, then the buyer under it, as the package stacks them on the left.
  const seller = `
    <div class="b">${esc(company?.name)}</div>
    ${addressRows(view.sellerAddress)}
    ${view.branch?.phone ?? company?.phone ? `<div>Mobile : ${esc(view.branch?.phone ?? company?.phone)}</div>` : ''}
    ${company?.email ? `<div>E-Mail : ${esc(company.email)}</div>` : ''}
    ${view.sellerTaxId ? `<div class="gstin">GSTIN : &nbsp;${esc(view.sellerTaxId)}</div>` : ''}`;
  const billing = party?.billingAddress;
  const state = billing?.state || (billing?.stateCode ? INDIAN_STATES.find((s) => s.code === billing.stateCode)?.name : undefined);
  const buyerGstin = doc.partyGstin ?? party?.taxId;
  const buyer = `
    <div class="b">${bi('sales:pdf.buyerBillTo')}</div>
    <div class="b">M/S.&nbsp; ${esc(party?.name)}</div>
    ${[billing?.line1, billing?.line2].filter(Boolean).map((l) => `<div>${esc(l)}</div>`).join('')}
    ${billing?.city ? `<div>City : ${esc(billing.city.toUpperCase())}</div>` : ''}
    ${state || billing?.postalCode ? `<div class="split"><span>${state ? `State : ${esc(state.toUpperCase())}` : ''}</span><span>${billing?.postalCode ? `Pin Code : ${esc(billing.postalCode)}` : ''}</span></div>` : ''}
    ${party?.phone || party?.email ? `<div class="split"><span>${party?.phone ? `Mobile : ${esc(party.phone)}` : ''}</span><span>${party?.email ? `E-Mail : ${esc(party.email)}` : ''}</span></div>` : ''}
    ${buyerGstin ? `<div class="gstin">GSTIN : &nbsp;${esc(buyerGstin)}</div>` : ''}`;

  // The particulars on the right, two to a row.
  const order = view.source ?? view.origin;
  const destination = doc.shipTo?.address.city || party?.shippingAddress?.city || billing?.city;
  const eway = view.ewayBill;
  const cell = (label: string, value = '', strong = true) => `<td><div>${label}</div><div class="${strong ? 'b' : ''}">${value}</div></td>`;
  const particulars = `<table class="grid">
      <tr>${cell(bi('sales:pdf.invoiceNo'), esc(view.shownNumber))}${cell(bi('sales:pdf.dated'), esc(formatDate(doc.date, 'dd-MMM-yy')))}</tr>
      <tr>${cell(bi('sales:pdf.referenceNo'), esc(doc.reference), false)}${cell(bi('sales:pdf.referenceDate'))}</tr>
      <tr>${cell(bi('sales:pdf.soDcNo'), esc(order?.number), false)}${cell(bi('sales:pdf.soDcDate'), order ? esc(formatDate(order.date, 'dd-MMM-yy')) : '', false)}</tr>
      <tr><td></td>${cell(bi('sales:pdf.destination'), esc(destination?.toUpperCase()))}</tr>
      <tr>
        <td class="ack"><div class="b">${bi('sales:pdf.irnAcknowledgement')} :</div><div>${esc(ack?.ackNo)}</div><div><span class="b">${bi('sales:pdf.date')} :</span> ${ack?.ackDate ? esc(formatDate(ack.ackDate.slice(0, 10), 'dd-MMM-yy')) : ''}</div></td>
        ${cell(bi('sales:pdf.ewayBillNoDate'), eway ? `${esc(eway.ewayBillNumber)}${eway.generatedAt ? ` · ${esc(formatDate(eway.generatedAt.slice(0, 10), 'dd-MMM-yy'))}` : ''}` : '', false)}
      </tr>
    </table>`;

  // The items: quantity times rate, then the taxes and round-off under them, then the total.
  const describe = (line: (typeof view.items)[number]) =>
    `<div class="b">${esc(line.name)}</div>${line.description ? `<div class="sub">${esc(line.description)}</div>` : ''}${line.gst?.supplyType && line.gst.supplyType !== 'taxable' ? `<div class="sub">${SUPPLY_NOTE[line.gst.supplyType]}</div>` : ''}`;
  const rows = view.items
    .map((line, i) => {
      const gross = money(Math.round(line.unitPrice.minor * line.quantity), doc.currency);
      return `<tr class="line">
        <td class="ctr">${i + 1}</td>
        <td>${describe(line)}</td>
        <td>${esc(line.hsnCode)}</td>
        <td class="num">${qty3(line.quantity)}</td>
        <td class="num">${formatMoney(line.unitPrice, { symbol: false })}</td>
        <td>${esc(unitShortName(line.unit)).toUpperCase()}</td>
        <td class="num">${formatMoney(gross, { symbol: false })}</td>
      </tr>`;
    })
    .join('');
  const steps: TotalEntry[] = view.totals.filter((r) => !['subtotal', 'taxable', 'total'].includes(r.key));
  const stepRows = steps
    .map(
      (s) => `<tr class="step"><td></td><td class="num">${s.key === 'tax' ? `${s.name.replace(/\s*\d+(\.\d+)?%$/, '')} OUTPUT`.toUpperCase() : s.name.toUpperCase()}</td><td></td><td></td><td></td><td></td><td class="num">${s.value}</td></tr>`,
    )
    .join('');
  const qtyTotal = view.items.length && view.items.every((l) => l.unit === view.items[0]?.unit) ? qty3(view.items.reduce((a, l) => a + l.quantity, 0)) : '';
  const items = `<table class="items">
      <thead><tr>
        <th class="sl">${bi('sales:pdf.slNo')}</th>
        <th class="ctr">${bi('sales:pdf.description')}</th>
        <th class="ctr">${bi('sales:pdf.hsnSac')}</th>
        <th class="ctr">${bi('sales:pdf.qty')}</th>
        <th class="ctr">${bi('sales:pdf.rate')}</th>
        <th class="ctr">${bi('sales:pdf.per')}</th>
        <th class="ctr">${bi('sales:pdf.amount')}</th>
      </tr></thead>
      <tbody>${rows}
        <tr class="filler"><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>
        ${stepRows}
        <tr class="grand"><td></td><td class="num">${bi('sales:pdf.total').toUpperCase()}</td><td></td><td class="num">${qtyTotal}</td><td></td><td></td><td class="num">${formatMoney(doc.totals.grandTotal, { symbol: false })}</td></tr>
      </tbody>
    </table>`;

  // HSN/SAC-wise: CGST, SGST and IGST always, the ones that don't apply left empty.
  const s = view.hsnSummary();
  const showHsn = tpl.showHsnSummary && doc.totals.taxLines.length && s.rows.length;
  const pct = (v: number) => (v ? formatPercent(v).replace('%', '') : '');
  const amt = (m: { minor: number; currency: string }) => (m.minor ? formatMoney(m, { symbol: false }) : '');
  const hsn = showHsn
    ? `<table class="hsn">
      <thead>
        <tr><th rowspan="2">${bi('sales:pdf.hsnSac')}</th><th rowspan="2">${bi('sales:pdf.taxableValue')}</th><th colspan="2">CGST</th><th colspan="2">SGST</th><th colspan="2">IGST</th><th rowspan="2">${bi('sales:pdf.totalTaxAmount')}</th></tr>
        <tr><th>%</th><th>${bi('sales:pdf.amount')}</th><th>%</th><th>${bi('sales:pdf.amount')}</th><th>%</th><th>${bi('sales:pdf.amount')}</th></tr>
      </thead>
      <tbody>${s.rows
        .map(
          (r) => `<tr>
          <td>${esc(r.hsnCode)}</td>
          <td class="num">${formatMoney(r.taxable, { symbol: false })}</td>
          <td class="num">${s.interState ? '' : pct(r.rate / 2)}</td><td class="num">${amt(r.cgst)}</td>
          <td class="num">${s.interState ? '' : pct(r.rate / 2)}</td><td class="num">${amt(r.sgst)}</td>
          <td class="num">${s.interState ? pct(r.rate) : ''}</td><td class="num">${amt(r.igst)}</td>
          <td class="num">${formatMoney(r.totalTax, { symbol: false })}</td>
        </tr>`,
        )
        .join('')}
        <tr class="sum"><td class="num">${bi('sales:pdf.total')}</td><td class="num">${formatMoney(s.total.taxable, { symbol: false })}</td><td></td><td class="num">${amt(s.total.cgst)}</td><td></td><td class="num">${amt(s.total.sgst)}</td><td></td><td class="num">${amt(s.total.igst)}</td><td class="num">${formatMoney(s.total.totalTax, { symbol: false })}</td></tr>
      </tbody>
    </table>
    <div class="row pad">${bi('sales:pdf.taxAmountInWords')} :<div class="b">${esc(inWords(s.total.totalTax))}</div></div>`
    : '';
  const cess = cessTable(view);

  // Narration and declaration on the left; the company's bank on the right.
  const b = company?.bankDetails;
  const bankRow = (label: string, value?: string) => (value ? `<tr><td>${label}</td><td>: <span class="b">${esc(value)}</span></td></tr>` : '');
  const bank =
    tpl.showBank && b && (b.accountNumber || b.bankName)
      ? `<div class="b">${bi('sales:pdf.companyBankDetails')} :</div>
         <table class="kv">${bankRow(bi('sales:pdf.bankName'), b.bankName)}${bankRow(bi('sales:pdf.accountNo'), b.accountNumber)}${bankRow(bi('sales:pdf.branch'), b.branch)}${bankRow(bi('sales:pdf.ifscCode'), b.ifsc)}</table>`
      : '';
  const left = [
    doc.notes ? `<div>${bi('sales:pdf.narration')} :</div><div class="b">${esc(doc.notes)}</div>` : '',
    tpl.showDeclaration ? `<div class="decl">${bi('sales:pdf.declaration')}</div><div>${esc(tpl.declarationText)}</div>` : '',
  ]
    .filter(Boolean)
    .join('<div class="gap"></div>');

  const page = `
  <div class="copy-label">${esc(copyLabel || 'ORIGINAL')}</div>
  ${cancelledStrip(doc)}
  <div class="sheet">
    <div class="titlebar">
      <div class="logo-slot">${logo}</div>
      <div class="title"><div class="name">${bi('sales:pdf.taxInvoice')}</div><div class="irn">IRN NO. : ${esc(ack?.irn)}</div></div>
      <div class="qr">${eInvoiceQr(doc)}</div>
    </div>
    ${titleNotes(view)}
    <table class="top"><tr>
      <td class="parties"><div class="seller">${seller}</div><div class="buyer">${buyer}</div></td>
      <td class="facts">${particulars}</td>
    </tr></table>
    ${items}
    ${view.reimbursed.length ? `<div class="row pad">${reimbursementTable(view)}</div>` : ''}
    <div class="row pad">${bi('sales:pdf.amountChargeable')} :<div class="b">${esc(inWords(doc.totals.grandTotal))}</div></div>
    ${hsn}${cess ? `<div class="row pad">${cess}</div>` : ''}
    <table class="foot-grid"><tr><td class="half">${left}</td><td class="half">${bank}</td></tr></table>
    <table class="sign-grid"><tr>
      <td class="half">${tpl.showCustomerSeal ? bi('sales:pdf.customerSealSignature') : ''}</td>
      <td class="half signbox">
        <div class="b">For ${esc(company?.name)}</div>
        ${tpl.showSignature ? signatureTag(view.signatureSrc ?? company?.signatureUri) : ''}
        <div class="signline">${bi('sales:pdf.authorisedSignatory')}</div>
      </td>
    </tr></table>
    <div class="powered">${bi('sales:pdf.poweredBy')} <span class="brand">Elixir Books</span></div>
  </div>`;

  const line = '#9AA3B2';
  const css = `${baseCss(view)}
  .copy-label { text-align: right; font-weight: 700; font-size: 0.95em; margin-bottom: 2px; }
  .sheet { border: 1px solid ${line}; }
  .titlebar { display: flex; align-items: center; padding: 6px 10px; border-bottom: 1px solid ${line}; }
  .titlebar .logo-slot { flex: 1; }
  .titlebar .title { flex: 3; text-align: center; }
  .titlebar .title .name { font-size: 1.5em; font-weight: 700; }
  .titlebar .title .irn { margin-top: 18px; font-size: 0.92em; overflow-wrap: anywhere; }
  .titlebar .qr { flex: 1; display: flex; justify-content: flex-end; }
  .titlebar .qr svg { width: 120px; height: 120px; }
  .top { table-layout: fixed; border-bottom: 1px solid ${line}; }
  .top td { vertical-align: top; }
  .top .parties { width: 50%; border-right: 1px solid ${line}; padding: 0; }
  .top .seller, .top .buyer { padding: 5px 8px; line-height: 1.6; }
  .top .buyer { border-top: 1px solid ${line}; }
  .split { display: flex; justify-content: space-between; gap: 10px; }
  .gstin { font-weight: 700; }
  .top .facts { padding: 0; }
  .grid { table-layout: fixed; height: 100%; }
  .grid td { width: 50%; padding: 5px 8px; border-bottom: 1px solid ${line}; vertical-align: top; height: 52px; }
  .grid td + td { border-left: 1px solid ${line}; }
  .grid tr:last-child td { border-bottom: 0; }
  .items th { background: ${accent}; color: ${ink}; padding: 6px 5px; font-weight: 500; border: 1px solid ${line}; }
  .items th.sl { width: 34px; } .items th.ctr { text-align: center; }
  .items td { padding: 6px 5px; border-left: 1px solid ${line}; border-right: 1px solid ${line}; vertical-align: top; }
  .items tr.line td { border-bottom: 1px solid ${line}; }
  .items tr.filler td { height: 90px; }
  .items tr.step td { font-style: italic; padding-top: 2px; padding-bottom: 6px; }
  .items tr.grand td { border-top: 1px solid ${line}; border-bottom: 1px solid ${line}; font-weight: 700; }
  .row { border-bottom: 1px solid ${line}; }
  .pad { padding: 5px 8px; }
  .hsn th { background: ${accent}; color: ${ink}; padding: 3px 5px; border: 1px solid ${line}; font-weight: 500; text-align: center; }
  .hsn td { padding: 3px 5px; border: 1px solid ${line}; }
  .hsn tr.sum td { background: #D5D8DE; font-weight: 600; }
  .foot-grid { border-bottom: 1px solid ${line}; }
  .foot-grid .half, .sign-grid .half { width: 50%; padding: 6px 10px; vertical-align: top; }
  .foot-grid .half + .half, .sign-grid .half + .half { border-left: 1px solid ${line}; }
  .foot-grid .kv td { padding: 6px 16px 6px 0; }
  .sign-grid td { height: 80px; }
  .signbox { text-align: right; }
  .signline { margin-top: 34px; }
  .signature + .signline { margin-top: 2px; }
  .decl { text-decoration: underline; }
  .gap { height: 14px; }
  .powered { border-top: 1px solid ${line}; margin-top: 120px; padding: 8px; text-align: center; color: #3B3BB5; }
  .powered .brand { font-weight: 700; }`;

  return pageHtml(view, language, css, page);
}
