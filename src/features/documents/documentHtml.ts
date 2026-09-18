import { BusinessDocument, Company, Party } from '@/types';
import { DOCUMENT_LABELS } from '@/domain/documentStates';
import { flattenTaxComponents } from '@/domain/lineCalc';
import { amountInWords, formatMoney, formatPercent, formatQty } from '@/lib/format';
import { formatDate } from '@/lib/date';
import { money } from '@/lib/money';
import { INDIAN_STATES } from '@/data/masters';
import { formatGstin } from '@/domain/gst/gstin';

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
}: {
  document: BusinessDocument;
  company?: Company;
  party?: Party;
  branchName?: string;
}): string {
  const label = DOCUMENT_LABELS[doc.kind].singular.toUpperCase();
  const currency = doc.totals.grandTotal.currency;
  const components = flattenTaxComponents(doc.totals.taxLines, currency);
  const pos = INDIAN_STATES.find((s) => s.code === doc.placeOfSupplyStateCode)?.name;
  const eInvoice = doc.compliance?.eInvoice;
  const eWayBill = doc.compliance?.eWayBill;

  const rows = doc.lines
    .map((line, i) => {
      const gross = money(Math.round(line.unitPrice.minor * line.quantity), currency);
      const discount =
        line.discountValue > 0
          ? line.discountMode === 'percent'
            ? formatPercent(line.discountValue)
            : formatMoney(money(line.discountValue * 100, currency))
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
    totalRow('Subtotal', formatMoney(doc.totals.subtotal)),
    doc.totals.lineDiscount.minor > 0 ? totalRow('Line discounts', `− ${formatMoney(doc.totals.lineDiscount)}`) : '',
    totalRow('Taxable value', formatMoney(doc.totals.taxableAmount)),
    ...components.map((c) => totalRow(c.label, formatMoney(c.amount))),
    doc.totals.documentDiscount.minor > 0 ? totalRow('Discount on total', `− ${formatMoney(doc.totals.documentDiscount)}`) : '',
    doc.totals.charges.minor > 0 ? totalRow('Other charges', formatMoney(doc.totals.charges)) : '',
    doc.totals.roundOff.minor !== 0 ? totalRow('Round off', formatMoney(doc.totals.roundOff, { signed: true })) : '',
    totalRow('Total', formatMoney(doc.totals.grandTotal), true),
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
    font-family: -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
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
  .mono { font-family: 'SFMono-Regular', Menlo, Consolas, monospace; font-size: 10px; word-break: break-all; }
  .words { margin-top: 14px; padding: 10px 12px; border: 1px solid #E4E7EE; border-radius: 8px; }
  .compliance { margin-top: 12px; padding: 10px 12px; background: #F6F8FB; border-radius: 8px; line-height: 1.6; }
</style>
</head>
<body>
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
      <div class="cap">Bill to</div>
      <div class="name">${esc(party?.name)}</div>
      <div class="muted">${addressBlock(party?.billingAddress)}</div>
      ${party?.taxId ? `<div style="margin-top:4px"><strong>GSTIN:</strong> ${esc(formatGstin(party.taxId))}</div>` : '<div style="margin-top:4px" class="muted">Unregistered (URP)</div>'}
      ${party?.phone ? `<div class="muted">${esc(party.phone)}</div>` : ''}
      ${party?.shippingAddress ? `<div class="cap" style="margin-top:10px">Ship to</div><div class="muted">${addressBlock(party.shippingAddress)}</div>` : ''}
    </div>
    <div>
      ${pos ? `<div class="cap">Place of supply</div><div>${esc(pos)}</div>` : ''}
      ${doc.reference ? `<div class="cap" style="margin-top:10px">Reference</div><div>${esc(doc.reference)}</div>` : ''}
      ${doc.reverseCharge ? `<div class="cap" style="margin-top:10px">Reverse charge</div><div>Yes — tax payable by the recipient</div>` : ''}
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th style="width:26px">#</th>
        <th>Description</th>
        <th class="num">Qty</th>
        <th class="num">Rate</th>
        <th class="num">Disc.</th>
        <th class="num">Tax</th>
        <th class="num">Amount</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>

  <table class="totals"><tbody>${totalRows}</tbody></table>

  <div class="words"><span class="cap">Amount in words</span><div>${esc(amountInWords(doc.totals.grandTotal))}</div></div>

  ${
    eInvoice?.status === 'generated'
      ? `<div class="compliance">
           <div class="cap">E-invoice</div>
           <div><strong>IRN</strong> <span class="mono">${esc(eInvoice.irn)}</span></div>
           <div><strong>Ack no.</strong> ${esc(eInvoice.ackNo)} &nbsp;·&nbsp; <strong>Ack date</strong> ${esc(eInvoice.ackDate)}</div>
         </div>`
      : ''
  }

  ${
    eWayBill?.status === 'generated'
      ? `<div class="compliance">
           <div class="cap">E-way bill</div>
           <div><strong>No.</strong> <span class="mono">${esc(eWayBill.ewbNo)}</span> &nbsp;·&nbsp; <strong>Valid until</strong> ${esc(
             eWayBill.validUpto ? formatDate(eWayBill.validUpto.slice(0, 10)) : '',
           )}</div>
           ${eWayBill.partB?.vehicleNo ? `<div><strong>Vehicle</strong> ${esc(eWayBill.partB.vehicleNo)} &nbsp;·&nbsp; ${eWayBill.distanceKm} km</div>` : ''}
         </div>`
      : ''
  }

  <div class="notes">
    <div>
      ${doc.notes ? `<div class="cap">Notes</div><div>${esc(doc.notes)}</div>` : ''}
      ${doc.terms ? `<div class="cap" style="margin-top:12px">Terms &amp; conditions</div><div class="muted">${esc(doc.terms)}</div>` : ''}
    </div>
  </div>

  <div class="sign">
    <div class="muted">For ${esc(company?.name)}</div>
    <div class="line muted">Authorised signatory</div>
  </div>

  <div class="foot">Generated with Elixir Books Smart</div>
</body>
</html>`;
}
