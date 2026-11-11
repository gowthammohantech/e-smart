import { eq } from 'drizzle-orm';
import type { Schema } from '@esmart/api-contract';
import { formatDate } from '@esmart/core/lib/date';
import { formatMoney } from '@esmart/core/lib/format';
import { amountInWords } from '@esmart/core/lib/amountInWords';
import { INDIAN_STATES } from '@esmart/core/data/masters';
import { schema } from '@esmart/db';
import type { CompanyRow } from '../../context';
import type { DbOrTx } from '../../lib/audit';
import { loadAdvanceEvents } from '../gst/advances';

export function esc(s: unknown): string {
  return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}

/** A plain printable page in the house style of `documentHtml`, for receipts and statements. */
export function printablePage(title: string, company: CompanyRow, body: string): string {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"/><title>${esc(title)}</title>
<style>
  body { font-family: -apple-system, "Segoe UI", Roboto, Arial, "Noto Sans Tamil", "Tamil Sangam MN", sans-serif; color: #0E121A; padding: 28px; font-size: 12px; }
  h1 { font-size: 20px; color: #007AFF; margin: 0 0 4px; letter-spacing: 1px; }
  .muted { color: #5A6478; }
  .rule { height: 2px; background: #007AFF; margin: 16px 0; }
  table { width: 100%; border-collapse: collapse; margin-top: 12px; }
  th { text-align: left; background: #F4F6FA; padding: 7px; font-size: 10px; text-transform: uppercase; color: #5A6478; }
  td { padding: 7px; border-bottom: 1px solid #E2E8F1; }
  .num { text-align: right; white-space: nowrap; }
  .strong { font-weight: 700; }
</style></head>
<body>
  <div class="strong" style="font-size:17px">${esc(company.name)}</div>
  <div class="muted">${esc([company.addressLine1, company.addressCity, company.addressPostalCode].filter(Boolean).join(', '))}</div>
  ${company.taxIdentifier ? `<div>${esc(company.taxIdentifierLabel)}: ${esc(company.taxIdentifier)}</div>` : ''}
  <div class="rule"></div>
  ${body}
</body></html>`;
}

/**
 * The receipt voucher an advance for services needs (CGST Rule 50): who paid, the advance, the rate
 * and the tax on it, and the place of supply. Empty when the payment carries no tax on an advance.
 */
async function advanceVoucher(db: DbOrTx, company: CompanyRow, p: Schema<'Payment'>, party: { name: string; taxId: string | null; billingLine1: string; billingCity: string } | undefined): Promise<string> {
  if (p.direction !== 'received' || !p.advanceTax) return '';
  if (p.advanceTax.reverseCharge) return reverseChargeVoucher(company, p, party);
  const [received] = (await loadAdvanceEvents(db, company, p.date)).filter((e) => e.paymentId === p.id && e.kind === 'received');
  if (!received) return '';
  const base = company.baseCurrency.trim();
  const m = (minor: number) => formatMoney({ minor, currency: base });
  const pos = INDIAN_STATES.find((s) => s.code === received.placeOfSupply)?.name ?? received.placeOfSupply;
  const taxRows = received.interState
    ? `<tr><td>IGST @ ${received.rate}%</td><td class="num">${m(received.igst)}</td></tr>`
    : `<tr><td>CGST @ ${received.rate / 2}%</td><td class="num">${m(received.cgst)}</td></tr><tr><td>SGST @ ${received.rate / 2}%</td><td class="num">${m(received.sgst)}</td></tr>`;
  const cessRow = received.cess ? `<tr><td>Cess @ ${p.advanceTax.cessRate ?? 0}%</td><td class="num">${m(received.cess)}</td></tr>` : '';
  return `
  <h1 style="margin-top:24px">RECEIPT VOUCHER</h1>
  <div class="muted">Advance received for services: CGST Act s.31(3)(d), Rule 50</div>
  <p>Recipient: <span class="strong">${esc(party?.name)}</span>${party?.taxId ? `, GSTIN ${esc(party.taxId)}` : ''}${party?.billingLine1 ? `<br/>${esc([party.billingLine1, party.billingCity].filter(Boolean).join(', '))}` : ''}</p>
  <p>Place of supply: <span class="strong">${esc(pos)} (${esc(received.placeOfSupply)})</span>${received.hsn ? `<br/>SAC: <span class="strong">${esc(received.hsn)}</span>` : ''}</p>
  <table><thead><tr><th>Advance for services</th><th class="num">Amount</th></tr></thead><tbody>
    <tr><td>Value of the advance (taxable)</td><td class="num">${m(received.taxable)}</td></tr>
    ${taxRows}${cessRow}
    <tr><td class="strong">Advance received</td><td class="num strong">${m(received.taxable + received.igst + received.cgst + received.sgst + received.cess)}</td></tr>
  </tbody></table>
  <p class="muted">Tax payable on reverse charge: No. The tax is adjusted against the invoice raised for these services.</p>`;
}

/**
 * The receipt voucher for an advance on a service the recipient pays GST on (reverse charge): the
 * advance, the rate the recipient pays at and the place of supply, no tax charged, and Rule 50(f)'s
 * "tax payable on reverse charge: Yes".
 */
function reverseChargeVoucher(company: CompanyRow, p: Schema<'Payment'>, party: { name: string; taxId: string | null; billingLine1: string; billingCity: string } | undefined): string {
  const at = p.advanceTax!;
  const m = (minor: number) => formatMoney({ minor, currency: company.baseCurrency.trim() });
  const pos = INDIAN_STATES.find((s) => s.code === at.placeOfSupplyStateCode)?.name ?? at.placeOfSupplyStateCode;
  const value = p.amount.minor + (p.advanceTds?.minor ?? 0);
  return `
  <h1 style="margin-top:24px">RECEIPT VOUCHER</h1>
  <div class="muted">Advance received for services: CGST Act s.31(3)(d), Rule 50</div>
  <p>Recipient: <span class="strong">${esc(party?.name)}</span>${party?.taxId ? `, GSTIN ${esc(party.taxId)}` : ''}${party?.billingLine1 ? `<br/>${esc([party.billingLine1, party.billingCity].filter(Boolean).join(', '))}` : ''}</p>
  <p>Place of supply: <span class="strong">${esc(pos)} (${esc(at.placeOfSupplyStateCode)})</span>${at.hsn ? `<br/>SAC: <span class="strong">${esc(at.hsn)}</span>` : ''}</p>
  <table><thead><tr><th>Advance for services</th><th class="num">Amount</th></tr></thead><tbody>
    <tr><td>Value of the advance</td><td class="num">${m(value)}</td></tr>
    <tr><td>GST @ ${at.rate}%: payable by the recipient on reverse charge</td><td class="num">${m(0)}</td></tr>
    <tr><td class="strong">Advance received</td><td class="num strong">${m(value)}</td></tr>
  </tbody></table>
  <p class="muted">Tax payable on reverse charge: Yes. The recipient pays the GST on this advance; none is charged here.</p>`;
}

/**
 * The refund voucher (CGST Rule 51) for money paid back out of an advance: the receipt voucher it
 * refers to, the recipient, the amount refunded and, on a service advance, the tax it takes back.
 */
async function refundVoucher(db: DbOrTx, company: CompanyRow, p: Schema<'Payment'>, party: { name: string; taxId: string | null; billingLine1: string; billingCity: string } | undefined): Promise<string> {
  if (!p.refundOf) return '';
  const [receipt] = await db.select({ number: schema.payments.number, date: schema.payments.date, reverseCharge: schema.payments.advanceReverseCharge }).from(schema.payments).where(eq(schema.payments.id, p.refundOf));
  const [refunded] = (await loadAdvanceEvents(db, company, p.date)).filter((e) => e.kind === 'refunded' && e.refundId === p.id);
  const base = company.baseCurrency.trim();
  const m = (minor: number) => formatMoney({ minor, currency: base });
  const taxRows = !refunded
    ? ''
    : refunded.interState
      ? `<tr><td>IGST @ ${refunded.rate}%</td><td class="num">${m(refunded.igst)}</td></tr>`
      : `<tr><td>CGST @ ${refunded.rate / 2}%</td><td class="num">${m(refunded.cgst)}</td></tr><tr><td>SGST @ ${refunded.rate / 2}%</td><td class="num">${m(refunded.sgst)}</td></tr>`;
  const pos = refunded ? (INDIAN_STATES.find((s) => s.code === refunded.placeOfSupply)?.name ?? refunded.placeOfSupply) : undefined;
  return `
  <h1 style="margin-top:24px">REFUND VOUCHER</h1>
  <div class="muted">Refund of an advance with no supply made: CGST Act s.34, Rule 51</div>
  <p>Against receipt voucher <span class="strong">${esc(receipt?.number)}</span>${receipt ? ` dated ${formatDate(receipt.date)}` : ''}</p>
  <p>Recipient: <span class="strong">${esc(party?.name)}</span>${party?.taxId ? `, GSTIN ${esc(party.taxId)}` : ''}${party?.billingLine1 ? `<br/>${esc([party.billingLine1, party.billingCity].filter(Boolean).join(', '))}` : ''}</p>
  ${pos ? `<p>Place of supply: <span class="strong">${esc(pos)} (${esc(refunded!.placeOfSupply)})</span></p>` : ''}
  <table><thead><tr><th>Refund</th><th class="num">Amount</th></tr></thead><tbody>
    ${refunded ? `<tr><td>Value of the advance refunded (taxable)</td><td class="num">${m(refunded.taxable)}</td></tr>${taxRows}` : ''}
    <tr><td class="strong">Amount refunded</td><td class="num strong">${formatMoney(p.amount)}</td></tr>
  </tbody></table>
  <p class="muted">Tax payable on reverse charge: ${receipt?.reverseCharge ? 'Yes' : 'No'}.</p>`;
}

/** The printed receipt for a payment. */
export async function receiptHtml(db: DbOrTx, company: CompanyRow, p: Schema<'Payment'>): Promise<string> {
  const [party] = await db.select().from(schema.parties).where(eq(schema.parties.id, p.partyId));
  const voucher = p.refundOf ? await refundVoucher(db, company, p, party) : await advanceVoucher(db, company, p, party);
  const rows = (p.allocations ?? [])
    .map((a) => `<tr><td>${esc(a.documentNumber)}</td><td class="num">${formatMoney(a.amount)}</td></tr>`)
    .join('');
  const body = `
  <h1>${p.direction === 'received' ? 'PAYMENT RECEIPT' : 'PAYMENT VOUCHER'}</h1>
  <div><span class="strong">${esc(p.number)}</span> · ${formatDate(p.date)}</div>
  <p>${p.direction === 'received' ? 'Received from' : 'Paid to'} <span class="strong">${esc(party?.name)}</span>
     the sum of <span class="strong">${formatMoney(p.amount)}</span> by ${esc(p.method)}${p.reference ? ` (ref. ${esc(p.reference)})` : ''}.</p>
  <p class="muted">${esc(amountInWords(p.amount))}</p>
  ${rows ? `<table><thead><tr><th>Against</th><th class="num">Amount</th></tr></thead><tbody>${rows}</tbody></table>` : ''}
  ${p.unallocated && p.unallocated.minor > 0 ? `<p class="muted">Held as an advance: ${formatMoney(p.unallocated)}</p>` : ''}
  ${p.notes ? `<p class="muted">${esc(p.notes)}</p>` : ''}
  ${voucher}
  <p style="margin-top:40px;text-align:right" class="muted">For ${esc(company.name)}<br/><br/>Authorised signatory</p>`;
  return printablePage(`${p.number}`, company, body);
}
