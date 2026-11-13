/**
 * What the ready-made layouts (classic, detailed, modern) share beyond the statutory blocks:
 * the base type and print styles, the header facts, the party blocks, the HSN-wise tax table and
 * the foot. A layout picks and arranges these; the figures all come from the view.
 */
import type { Address, Party } from '../../types';
import { formatMoney, formatPercent } from '../../lib/format';
import { formatDate } from '../../lib/date';
import { amountInWords } from '../../lib/amountInWords';
import { INDIAN_STATES } from '../../data/masters';
import type { DocView } from '../docView';
import { esc, NOTE_REASON, printedCustomFields, crossBorderNote } from '../blocks';

/** Text that reads on the accent: white on a dark one, near-black on a light one (WCAG contrast). */
export function onAccent(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const lin = (c: number) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const l = 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
  // Contrast with white is 1.05 / (l + 0.05); with #111 about (l + 0.05) / 0.056.
  return 1.05 / (l + 0.05) >= (l + 0.05) / 0.056 ? '#FFFFFF' : '#111111';
}

/** The accent darkened for text on white, so a light accent (gold) still reads as a heading. */
export function accentText(hex: string): string {
  if (onAccent(hex) === '#FFFFFF') return hex;
  const n = parseInt(hex.slice(1), 16);
  const d = (c: number) => Math.round(c * 0.62).toString(16).padStart(2, '0');
  return `#${d((n >> 16) & 255)}${d((n >> 8) & 255)}${d(n & 255)}`;
}

/** Type, print and statutory-block styles every ready-made layout starts from. */
export function baseCss(view: DocView): string {
  const { tpl } = view;
  return `
  * { box-sizing: border-box; }
  @page { size: A4; margin: 10mm; }
  body {
    font-family: -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial,
                 "Noto Sans Tamil", "Tamil Sangam MN", Latha, sans-serif;
    color: #111111; margin: 0; padding: 14px; background: #FFFFFF;
    font-size: ${tpl.compact ? 9.5 : 10.5}px; line-height: ${tpl.compact ? 1.25 : 1.38};
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  table { width: 100%; border-collapse: collapse; }
  td, th { vertical-align: top; }
  .num, table th.num, table td.num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
  .ctr, table th.ctr, table td.ctr { text-align: center; }
  .muted { color: #4A5468; }
  .strong, .b { font-weight: 700; }
  .item { font-weight: 600; }
  .sub { color: #4A5468; font-size: 0.86em; margin-top: 1px; }
  .cap { font-size: 0.86em; font-weight: 700; color: #4A5468; margin-bottom: 2px; }
  .copy-label { text-align: right; font-size: 0.86em; font-weight: 700; letter-spacing: 0.4px; margin-bottom: 3px; }
  .logo { display: block; max-width: 170px; max-height: 58px; object-fit: contain; }
  .signature { display: block; max-width: 170px; max-height: 52px; object-fit: contain; margin: 4px 0 4px auto; }
  .alt { display: block; font-size: 0.72em; font-weight: 400; opacity: 0.66; text-transform: none; letter-spacing: 0.2px; }
  body.ta { line-height: 1.55; }
  body.ta .cap, body.ta th, body.ta .title { letter-spacing: 0; }
  .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 0.9em; line-height: 1.45; word-break: break-all; }
  .reimbursements { margin-top: 6px; }
  .reimbursements th { text-align: left; padding: 4px 6px; border: 1px solid #9AA3B2; font-size: 0.86em; }
  .reimbursements td { padding: 4px 6px; border: 1px solid #9AA3B2; }
  .bank-body { display: flex; gap: 12px; align-items: flex-start; }
  .bank-rows td { padding: 1px 10px 1px 0; border: 0; }
  .upi-qr { text-align: center; font-size: 0.8em; max-width: 116px; }
  .upi-qr svg { display: block; margin: 0 auto 3px; }
  .einv { display: flex; gap: 14px; padding: 6px 8px; align-items: flex-start; page-break-inside: avoid; }
  .einv-qr svg { display: block; }
  .einv-body { flex: 1; }
  .einv-grid { display: flex; gap: 22px; margin-top: 6px; }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 99px; background: #EEF1F6; font-size: 0.86em; font-weight: 700; }
  .cancelled-strip { margin-bottom: 8px; padding: 6px 10px; border-radius: 4px; background: rgba(255,59,48,0.10); color: #C62F26; font-weight: 700; }
  .keep, tr, .foot-grid, .sign-grid, .closing, .signs, .cards, .hsn { page-break-inside: avoid; break-inside: avoid; }
  /* The sheet's own margin (@page) frames the printout; the padding is for the on-screen preview. */
  @media print { body { padding: 0; } }
  .foot { margin-top: 8px; text-align: center; color: #4A5468; font-size: 0.86em; }`;
}

/** An address as lines: street, then city and PIN, then state. */
export function addressLines(a?: Address): string {
  if (!a) return '';
  const cityPin = [a.city, a.postalCode].filter(Boolean).join(' – ');
  return [a.line1, a.line2, cityPin, a.state].filter(Boolean).map((l) => `<div>${esc(l)}</div>`).join('');
}

/** A party (or the seller) as a block: name, address, contact, GSTIN. */
export function partyBlock(opts: { name?: string; address?: Address; gstin?: string; gstinLabel?: string; phone?: string; email?: string; stateCode?: string }): string {
  const state = !opts.address?.state && opts.stateCode ? INDIAN_STATES.find((s) => s.code === opts.stateCode)?.name : undefined;
  return `<div class="pname">${esc(opts.name)}</div>
      ${addressLines(opts.address)}${state ? `<div>${esc(state)}</div>` : ''}
      ${opts.phone ? `<div>Mobile: ${esc(opts.phone)}</div>` : ''}
      ${opts.email ? `<div>E-mail: ${esc(opts.email)}</div>` : ''}
      <div class="gstin"><span class="b">${esc(opts.gstinLabel ?? 'GSTIN')}:</span> ${esc(opts.gstin)}</div>`;
}

/** The buyer, by its billing address. */
export function buyerBlock(view: DocView): string {
  const p: Party | undefined = view.party;
  return partyBlock({ name: p?.name, address: p?.billingAddress, gstin: view.doc.partyGstin ?? p?.taxId, phone: p?.phone, email: p?.email });
}

/** The consignee: the party's shipping address, or its billing one when it has none. */
export function consigneeBlock(view: DocView): string {
  const p = view.party;
  // The document's own consignee when it names one, else the buyer at their shipping (or billing) address.
  const ship = view.doc.shipTo;
  if (ship) return partyBlock({ name: ship.name || p?.name, address: ship.address, gstin: ship.gstin });
  return partyBlock({ name: p?.name, address: p?.shippingAddress?.line1 ? p.shippingAddress : p?.billingAddress, gstin: view.doc.partyGstin ?? p?.taxId });
}

/** The seller, with the issuing branch's address and GSTIN when it has its own. */
export function sellerBlock(view: DocView): string {
  const c = view.company;
  return partyBlock({ name: c?.name, address: view.sellerAddress, gstin: view.sellerTaxId, gstinLabel: c?.taxRegistration?.identifierLabel, phone: view.branch?.phone ?? c?.phone, email: c?.email });
}

export type Fact = { label: string; value: string; strong?: boolean };

/**
 * The header facts in the order the boxed layouts lay them out in pairs: number and date,
 * reference, the order or invoice it came from, dispatch and the e-way bill, place of supply.
 * Values come escaped.
 */
export function headerFacts(view: DocView): Fact[] {
  const { doc, bi, source, origin, ewayBill, pos, party } = view;
  const note = ['creditNote', 'debitNote', 'salesReturn', 'purchaseReturn', 'supplierCreditNote', 'supplierDebitNote'].includes(doc.kind);
  const destination = doc.shipTo?.address.city || party?.shippingAddress?.city || party?.billingAddress?.city;
  const transport = ewayBill ? [ewayBill.transportMode ? capital(String(ewayBill.transportMode)) : '', ewayBill.vehicleNumber, ewayBill.transporterName].filter(Boolean).join(' · ') : '';
  const facts: (Fact | null)[] = [
    { label: bi('sales:pdf.number'), value: esc(view.shownNumber), strong: true },
    { label: bi('sales:pdf.dated'), value: esc(formatDate(doc.date)), strong: true },
    doc.reference ? { label: bi('sales:pdf.reference'), value: esc(doc.reference) } : null,
    doc.supplierDocNumber ? { label: bi('sales:pdf.supplierDocument'), value: esc(doc.supplierDocNumber) } : null,
    doc.dueDate ? { label: bi('sales:pdf.dueDate'), value: esc(formatDate(doc.dueDate)) } : null,
    doc.validUntil ? { label: bi('sales:pdf.validUntil'), value: esc(formatDate(doc.validUntil)) } : null,
    source ? { label: note ? bi('sales:pdf.againstInvoice') : bi('sales:pdf.orderChallan'), value: `${esc(source.number)} · ${esc(formatDate(source.date))}` } : null,
    !source && origin ? { label: origin.kind === 'quote' || origin.kind === 'proforma' ? bi('sales:pdf.reference') : bi('sales:pdf.orderChallan'), value: `${esc(origin.number)} · ${esc(formatDate(origin.date))}` } : null,
    !source && doc.originalNumber ? { label: bi('sales:pdf.againstInvoice'), value: `${esc(doc.originalNumber)}${doc.originalDate ? ` · ${esc(formatDate(doc.originalDate))}` : ''}` } : null,
    doc.noteReason ? { label: bi('sales:pdf.reason'), value: esc(NOTE_REASON[doc.noteReason]) } : null,
    pos ? { label: bi('sales:pdf.placeOfSupply'), value: esc(pos) } : null,
    destination ? { label: bi('sales:pdf.destination'), value: esc(destination) } : null,
    transport ? { label: bi('sales:pdf.dispatchedThrough'), value: esc(transport) } : null,
    ewayBill ? { label: bi('sales:pdf.ewayBill'), value: `${esc(ewayBill.ewayBillNumber)}${ewayBill.validUpto ? ` · ${bi('sales:pdf.validUntil')} ${esc(formatDate(ewayBill.validUpto.slice(0, 10)))}` : ''}` } : null,
    doc.currency !== (view.company?.baseCurrency ?? 'INR') ? { label: bi('sales:pdf.currency'), value: `${esc(doc.currency)} @ ${doc.exchangeRate.toFixed(4)} ${esc(view.company?.baseCurrency)}` } : null,
    view.branchLabel ? { label: bi('sales:pdf.branch'), value: esc(view.branchLabel) } : null,
  ];
  return facts.filter((f): f is Fact => !!f);
}

function capital(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** The heading: a registered seller's invoice is a tax invoice (Rule 46), the rest by their kind. */
export function titleOf(view: DocView): string {
  // In the business's own currency a registered seller's invoice is a tax invoice; in another, a commercial invoice.
  return view.doc.kind === 'invoice' && !view.billOfSupply && !view.commercial && view.sellerTaxId ? 'TAX INVOICE' : view.label;
}

/** The steps from the lines' sum to the total, a row each, under the items. */
export function stepRows(steps: { name: string; value: string }[], span: number): string {
  return steps.map((s, i) => `<tr class="step${i === 0 ? ' first' : ''}${i === steps.length - 1 ? ' last' : ''}"><td></td><td colspan="${span}" class="num">${s.name}</td><td class="num">${s.value}</td></tr>`).join('');
}

/** Lines under the title that the law asks for on some documents. */
export function titleNotes(view: DocView): string {
  const { doc, billOfSupply } = view;
  return [
    doc.kind === 'proforma' ? '<div class="sub ctr">Not a tax invoice. A tax invoice follows on supply or on receipt of payment.</div>' : '',
    billOfSupply ? '<div class="sub ctr">Composition taxable person, not eligible to collect tax on supplies</div>' : '',
    doc.reverseCharge ? '<div class="sub ctr">Tax is payable on reverse charge by the recipient</div>' : '',
    crossBorderNote(doc) ? `<div class="sub ctr">${esc(crossBorderNote(doc))}</div>` : '',
  ].join('');
}

/** The HSN/SAC-wise tax table and the tax in words; empty when no tax was charged. */
export function hsnTable(view: DocView, cls: string): string {
  const { bi, doc } = view;
  if (!view.tpl.showHsnSummary || !doc.totals.taxLines.length) return '';
  const s = view.hsnSummary();
  if (!s.rows.length) return '';
  const cess = s.total.cess.minor !== 0;
  const cols: { head: string; pct: (r: (typeof s.rows)[number]) => string; amt: 'cgst' | 'sgst' | 'igst' }[] = s.interState
    ? [{ head: 'IGST', pct: (r) => formatPercent(r.rate), amt: 'igst' }]
    : [
        { head: 'CGST', pct: (r) => formatPercent(r.rate / 2), amt: 'cgst' },
        { head: 'SGST/UTGST', pct: (r) => formatPercent(r.rate / 2), amt: 'sgst' },
      ];
  const body = s.rows
    .map(
      (r) => `<tr>
        <td>${esc(r.hsnCode) || '—'}${r.reverseCharge ? ' <span class="sub">(RCM)</span>' : ''}</td>
        <td class="num">${formatMoney(r.taxable)}</td>
        ${cols.map((c) => `<td class="num">${r.rate ? c.pct(r) : '—'}</td><td class="num">${formatMoney(r[c.amt])}</td>`).join('')}
        ${cess ? `<td class="num">${formatMoney(r.cess)}</td>` : ''}
        <td class="num">${formatMoney(r.totalTax)}</td>
      </tr>`,
    )
    .join('');
  return `<table class="${cls}">
    <thead>
      <tr>
        <th rowspan="2">${bi('sales:pdf.hsnSac')}</th>
        <th rowspan="2" class="num">${bi('sales:pdf.taxableValue')}</th>
        ${cols.map((c) => `<th colspan="2" class="ctr">${c.head}</th>`).join('')}
        ${cess ? '<th rowspan="2" class="num">Cess</th>' : ''}
        <th rowspan="2" class="num">${bi('sales:pdf.totalTaxAmount')}</th>
      </tr>
      <tr>${cols.map(() => `<th class="ctr">%</th><th class="num">${bi('sales:pdf.amount')}</th>`).join('')}</tr>
    </thead>
    <tbody>${body}
      <tr class="sum">
        <td class="b">${bi('sales:pdf.total')}</td>
        <td class="num b">${formatMoney(s.total.taxable)}</td>
        ${cols.map((c) => `<td></td><td class="num b">${formatMoney(s.total[c.amt])}</td>`).join('')}
        ${cess ? `<td class="num b">${formatMoney(s.total.cess)}</td>` : ''}
        <td class="num b">${formatMoney(s.total.totalTax)}</td>
      </tr>
    </tbody>
  </table>
  <div class="words-tax"><span class="cap">${bi('sales:pdf.taxAmountInWords')}</span> <span class="b">${esc(amountInWords(s.total.totalTax))}</span></div>`;
}

/** Narration, the printable custom fields, PAN and TAN, the declaration and the terms. */
export function leftFoot(view: DocView, opts: { terms: boolean }): string {
  const { doc, bi, tpl } = view;
  const fields = printedCustomFields(view);
  return [
    doc.notes ? `<div class="cap">${bi('sales:pdf.narration')}</div><div class="b">${esc(doc.notes)}</div>` : '',
    fields.length ? `<table class="kv">${fields.map((f) => `<tr><td class="muted">${esc(f.label)}</td><td>${esc(f.text)}</td></tr>`).join('')}</table>` : '',
    tpl.showPanTan && (view.pan || view.tan)
      ? `<table class="kv">${view.pan ? `<tr><td class="muted">${bi('sales:pdf.companyPan')}</td><td class="b">${esc(view.pan)}</td></tr>` : ''}${view.tan ? `<tr><td class="muted">${bi('sales:pdf.companyTan')}</td><td class="b">${esc(view.tan)}</td></tr>` : ''}</table>`
      : '',
    opts.terms && doc.terms ? `<div class="cap">${bi('sales:pdf.terms')}</div><div class="muted pre">${esc(doc.terms)}</div>` : '',
    tpl.showDeclaration ? `<div class="cap decl">${bi('sales:pdf.declaration')}</div><div>${esc(tpl.declarationText)}</div>` : '',
  ]
    .filter(Boolean)
    .join('<div class="gap"></div>');
}

/** The line at the very foot. */
export function footLine(view: DocView): string {
  return esc(view.tpl.footerText ?? view.t('sales:pdf.computerGenerated'));
}

/** The page around a layout's body: one copy, or the three of `all` one after another. */
export function pageHtml(view: DocView, language: string, css: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="${language}">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${view.label} ${esc(view.shownNumber)}</title>
<style>${css}</style>
</head>
<body class="${language}">${body}
</body>
</html>`;
}
