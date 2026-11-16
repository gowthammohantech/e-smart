/**
 * The e-way bill as the portal prints it, to travel with the goods: the bill's details, the
 * addresses, the goods, the transporter and the vehicle, its number as a QR at the top and as a
 * barcode at the foot. Statutory, so English. Rendered to PDF by the app as an invoice is.
 */
import type { BusinessDocument, EwayBill, EwayDocType, EwayPlace, EwaySubSupplyType } from '../types';
import { formatMoney } from '../lib/format';
import { money } from '../lib/money';
import { qrMatrix, qrSvgString } from '../lib/qr';
import { code128Svg } from '../lib/barcode';
import { INDIAN_STATES, unitShortName } from '../data/masters';
import { lineTaxes } from '../domain/hsnSummary';
import { esc } from './blocks';

export type EwayBillHtmlInput = {
  bill: EwayBill;
  /** The document the goods move under: its lines are the goods, its IRN printed at the top. */
  document?: BusinessDocument;
};

const DOC_TYPE: Record<EwayDocType, string> = {
  INV: 'Tax Invoice',
  BIL: 'Bill of Supply',
  BOE: 'Bill of Entry',
  CHL: 'Delivery Challan',
  CNT: 'Credit Note',
  OTH: 'Others',
};

const SUB_SUPPLY: Record<EwaySubSupplyType, string> = {
  supply: 'Supply',
  export: 'Export',
  jobWork: 'Job Work',
  ownUse: 'For Own Use',
  jobWorkReturn: 'Job Work Returns',
  salesReturn: 'Sales Return',
  exhibition: 'Exhibition or Fairs',
  lineSales: 'Line Sales',
  recipientNotKnown: 'Recipient Not Known',
  others: 'Others',
};

const TRANSACTION_TYPE: Record<EwayBill['transactionType'], string> = {
  1: 'Regular',
  2: 'Bill To - Ship To',
  3: 'Bill From - Dispatch From',
  4: 'Combination of 2 and 3',
};

const IST_MINUTES = 330;
const pad = (n: number) => String(n).padStart(2, '0');

/** A calendar date (2026-11-11) as the portal prints it: 11/11/2026. */
function dmy(date: string | undefined): string {
  if (!date) return '';
  const [y, m, d] = date.slice(0, 10).split('-');
  return d && m && y ? `${d}/${m}/${y}` : date;
}

/** An instant in India time, as the portal prints it: 11/11/2026 04:58:00 PM. */
export function ewayDateTime(iso: string | undefined): string {
  if (!iso) return '';
  const at = new Date(Date.parse(iso) + IST_MINUTES * 60_000);
  if (Number.isNaN(at.getTime())) return iso;
  const h = at.getUTCHours();
  const h12 = h % 12 || 12;
  return `${pad(at.getUTCDate())}/${pad(at.getUTCMonth() + 1)}/${at.getUTCFullYear()} ${pad(h12)}:${pad(at.getUTCMinutes())}:${pad(at.getUTCSeconds())} ${h < 12 ? 'AM' : 'PM'}`;
}

const stateName = (code: string) => INDIAN_STATES.find((s) => s.code === code)?.name.toUpperCase() ?? code;
const amount = (m: EwayBill['taxableValue']) => formatMoney(m, { symbol: false });

/** Who generated the bill: the supplier on an outward movement, the recipient on an inward one. */
function generatorGstin(bill: EwayBill): string {
  return bill.supplyType === 'inward' ? bill.to.gstin : bill.from.gstin;
}

/** The QR the portal prints: the bill number, who generated it and when. */
export function ewayBillQrPayload(bill: EwayBill): string {
  return `${bill.ewayBillNumber}/${generatorGstin(bill)}/${ewayDateTime(bill.generatedAt)}`;
}

function svgOrNothing(draw: () => string): string {
  try {
    return draw();
  } catch {
    return '';
  }
}

/** Label and value pairs, `perRow` to a row, each in its own two cells. */
function pairs(rows: [label: string, value: string][], perRow: number): string {
  const out: string[] = [];
  for (let i = 0; i < rows.length; i += perRow) {
    const cells = Array.from({ length: perRow }, (_, j) => rows[i + j]);
    out.push(`<tr>${cells.map((c) => (c ? `<td class="l">${esc(c[0])}</td><td class="v">: ${c[1] ? `<b>${esc(c[1])}</b>` : ''}</td>` : '<td></td><td></td>')).join('')}</tr>`);
  }
  return `<table class="kv">${out.join('')}</table>`;
}

function party(place: EwayPlace): string {
  return `<div class="b">${esc(place.legalName)}</div><div>GSTIN :${esc(place.gstin)}</div><div>${esc(stateName(place.stateCode))}</div>`;
}

function address(place: EwayPlace): string {
  return [place.address1, place.address2].filter(Boolean).map((l) => `<div>${esc(l)}</div>`).join('') + `<div class="gap"></div><div>${esc([place.place, place.pincode].filter(Boolean).join('-'))}</div>`;
}

/** The goods, line by line from the document; without it, the one line the portal was sent. */
function goodsRows(bill: EwayBill, doc: BusinessDocument | undefined): string {
  const lines = doc?.lines.filter((l) => !l.gst?.reimbursement) ?? [];
  if (!lines.length) {
    return `<tr><td>${esc(bill.mainHsnCode)}</td><td></td><td></td><td class="num"></td><td class="num">${amount(bill.taxableValue)}</td><td class="num"></td></tr>`;
  }
  const taxes = lineTaxes(doc!);
  return lines
    .map((line) => {
      const t = taxes.find((x) => x.lineId === line.id);
      const rate = t ? `${t.rate.toFixed(2)}${t.cessRate ? ` + ${t.cessRate.toFixed(2)}` : ''}` : '';
      return `<tr>
        <td class="ctr">${esc(line.hsnCode)}</td>
        <td>${esc([line.name, line.description].filter(Boolean).join(' '))}</td>
        <td class="ctr">${esc(unitShortName(line.unit))}</td>
        <td class="num">${line.quantity.toFixed(3)}</td>
        <td class="num">${t ? amount(t.taxable) : ''}</td>
        <td class="num">${rate}</td>
      </tr>`;
    })
    .join('');
}

/** Print-ready HTML for an e-way bill. */
export function buildEwayBillHtml({ bill, document: doc }: EwayBillHtmlInput): string {
  const c = doc?.compliance;
  const qr = svgOrNothing(() => qrSvgString(qrMatrix(ewayBillQrPayload(bill), 'M'), { size: 96, quietZone: 2 }));
  const barcode = svgOrNothing(() => code128Svg(bill.ewayBillNumber, { height: 42 }));
  const other = money(bill.consignmentValue.minor - bill.taxableValue.minor - bill.cgst.minor - bill.sgst.minor - bill.igst.minor, bill.consignmentValue.currency);
  // Each leg the goods have gone on, newest first; before any Part-B update, the first.
  const legs = bill.partBUpdates.length
    ? [...bill.partBUpdates].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).map((u) => ({ mode: u.mode, vehicle: u.vehicleNumber ?? u.transportDocNumber, from: u.fromPlace, at: u.updatedAt }))
    : [{ mode: bill.transportMode, vehicle: bill.vehicleNumber ?? bill.transportDocNumber, from: [bill.from.place, bill.from.pincode].filter(Boolean).join('-'), at: bill.generatedAt }];

  const body = `
  ${bill.status === 'cancelled' ? `<div class="cancelled">CANCELLED${bill.cancelledAt ? ` ON ${esc(ewayDateTime(bill.cancelledAt))}` : ''}</div>` : ''}
  <div class="top">
    <div></div>
    <div class="title">e-Way Bill</div>
    <div class="tag">e-Way Bill</div>
  </div>
  <div class="head">
    ${pairs(
      [
        ['Doc No.', `${DOC_TYPE[bill.docType] ?? bill.docType} - ${bill.documentNumber}`],
        ['Doc Date', dmy(bill.documentDate)],
        ['IRN', c?.irn ?? ''],
        ['Ack No.', c?.ackNo ?? ''],
        ['Ack Date', c?.ackDate ?? ''],
      ],
      1,
    )}
    ${qr ? `<div class="qr">${qr}</div>` : ''}
  </div>

  <div class="sec">1.e-Way Bill Details</div>
  ${pairs(
    [
      ['e-Way Bill No.', bill.ewayBillNumber],
      ['Mode', String(bill.transportMode).toUpperCase()],
      ['Generated Date', ewayDateTime(bill.generatedAt)],
      ['Generated By', generatorGstin(bill)],
      ['Approx Distance', `${bill.distanceKm} km`],
      ['Valid Upto', bill.status === 'cancelled' ? '' : ewayDateTime(bill.validUpto)],
      ['Supply Type', `${bill.supplyType === 'inward' ? 'Inward' : 'Outward'} - ${SUB_SUPPLY[bill.subSupplyType] ?? bill.subSupplyType}${bill.subSupplyDescription ? ` (${bill.subSupplyDescription})` : ''}`],
      ['Transaction Type', TRANSACTION_TYPE[bill.transactionType] ?? ''],
      ['Cargo', bill.vehicleType === 'overDimensional' ? 'Over Dimensional Cargo' : 'Regular'],
    ],
    3,
  )}

  <div class="sec">2.Address Details</div>
  <table class="addr">
    <tr><th>From</th><th>To</th></tr>
    <tr><td>${party(bill.from)}</td><td>${party(bill.to)}</td></tr>
    <tr><td><div class="b">Dispatch From</div>${address(bill.from)}<div>${esc(stateName(bill.from.stateCode))}</div></td><td><div class="b">Ship To</div>${address(bill.to)}<div>${esc(stateName(bill.to.stateCode))}<span class="pin">Pin Code : ${esc(bill.to.pincode)}</span></div></td></tr>
  </table>

  <div class="sec">3.Goods Details</div>
  <table class="goods">
    <thead><tr><th style="width:14%">HSN / SAC</th><th>Product Name &amp; Description</th><th style="width:9%">Unit</th><th style="width:12%" class="num">Quantity</th><th style="width:15%" class="num">Taxable Amount</th><th style="width:11%" class="num">Tax Rate</th></tr></thead>
    <tbody>${goodsRows(bill, doc)}</tbody>
  </table>
  <table class="sums">
    <tr><td class="l">Total Taxable Amount</td><td>: ${amount(bill.taxableValue)}</td><td class="l">Other Amount</td><td>: ${amount(other)}</td><td class="l">Total Invoice Amount</td><td>: ${amount(bill.consignmentValue)}</td></tr>
    <tr><td class="l">CGST Amount</td><td>: ${amount(bill.cgst)}</td><td class="l">SGST Amount</td><td>: ${amount(bill.sgst)}</td><td class="l">IGST Amount</td><td>: ${amount(bill.igst)}</td></tr>
  </table>

  <div class="sec">4.Transporter Details</div>
  ${pairs(
    [
      ['Transporter ID', bill.transporterId ?? ''],
      ['Doc No.', bill.transportDocNumber ?? ''],
      ['Name', bill.transporterName ?? ''],
      ['Date', dmy(bill.transportDocDate)],
    ],
    2,
  )}

  <div class="sec">5.Vehicle Details</div>
  <table class="goods legs">
    <thead><tr><th>Mode</th><th>Vehicle No. / Transport Doc</th><th>From</th><th>Entered Date</th><th>CEWB No.</th></tr></thead>
    <tbody>${legs.map((l) => `<tr><td>${esc(String(l.mode).toUpperCase())}</td><td>${esc(l.vehicle)}</td><td>${esc(l.from)}</td><td>${esc(ewayDateTime(l.at))}</td><td></td></tr>`).join('')}</tbody>
  </table>

  ${barcode ? `<div class="barcode">${barcode}<div class="b">${esc(bill.ewayBillNumber)}</div></div>` : ''}`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>e-Way Bill ${esc(bill.ewayBillNumber)}</title>
<style>
  @page { size: A4; margin: 12mm; }
  * { box-sizing: border-box; }
  body { margin: 0; padding: 16px; background: #fff; color: #111; font-family: Calibri, 'Segoe UI', Arial, sans-serif; font-size: 11px; line-height: 1.35; }
  table { width: 100%; border-collapse: collapse; }
  td, th { vertical-align: top; }
  .b, b { font-weight: 700; }
  .num { text-align: right; } .ctr { text-align: center; }
  .top { display: flex; align-items: flex-end; border-bottom: 1px solid #999; padding-bottom: 4px; }
  .top > div { flex: 1; }
  .title { text-align: center; font-size: 17px; font-weight: 700; text-decoration: underline; flex: 2 !important; }
  .tag { text-align: right; font-weight: 700; font-size: 9px; }
  .head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; padding: 6px 0; }
  .head .kv { width: auto; flex: 1; }
  .qr svg { display: block; }
  .kv td { padding: 2px 4px 2px 0; }
  .kv td.l { width: 1%; white-space: nowrap; padding-right: 10px; }
  .kv td.v { overflow-wrap: anywhere; }
  .sec { margin-top: 8px; padding: 3px 6px; background: #E6E6E6; font-weight: 700; font-size: 11.5px; border-top: 1px solid #bbb; border-bottom: 1px solid #bbb; }
  .addr th { text-align: left; background: #F3F3F3; padding: 3px 6px; border: 1px solid #ccc; width: 50%; }
  .addr td { padding: 4px 6px; border: 1px solid #ccc; }
  .addr .pin { float: right; }
  .gap { height: 8px; }
  .goods th { background: #F3F3F3; border: 1px solid #ccc; padding: 4px; font-weight: 700; text-align: center; }
  .goods td { border: 1px solid #ccc; padding: 4px; }
  .sums { margin-top: 6px; }
  .sums td { padding: 2px 4px; }
  .sums td.l { white-space: nowrap; }
  .barcode { margin-top: 18px; text-align: center; }
  .barcode svg { display: block; margin: 0 auto 2px; }
  .cancelled { margin-bottom: 8px; padding: 6px 10px; background: rgba(255,59,48,0.10); color: #C62F26; font-weight: 700; letter-spacing: 0.4px; }
</style>
</head>
<body>${body}
</body>
</html>`;
}
