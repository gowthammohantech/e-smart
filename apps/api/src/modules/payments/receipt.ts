import { eq } from 'drizzle-orm';
import type { Schema } from '@esmart/api-contract';
import { formatDate } from '@esmart/core/lib/date';
import { formatMoney } from '@esmart/core/lib/format';
import { schema } from '@esmart/db';
import type { CompanyRow } from '../../context';
import type { DbOrTx } from '../../lib/audit';

export function esc(s: unknown): string {
  return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}

/** A plain printable page in the house style of `documentHtml`, for receipts and statements. */
export function printablePage(title: string, company: CompanyRow, body: string): string {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"/><title>${esc(title)}</title>
<style>
  body { font-family: -apple-system, "Segoe UI", Roboto, Arial, sans-serif; color: #0E121A; padding: 28px; font-size: 12px; }
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

/** The printed receipt for a payment. */
export async function receiptHtml(db: DbOrTx, company: CompanyRow, p: Schema<'Payment'>): Promise<string> {
  const [party] = await db.select().from(schema.parties).where(eq(schema.parties.id, p.partyId));
  const rows = (p.allocations ?? [])
    .map((a) => `<tr><td>${esc(a.documentNumber)}</td><td class="num">${formatMoney(a.amount)}</td></tr>`)
    .join('');
  const body = `
  <h1>${p.direction === 'received' ? 'PAYMENT RECEIPT' : 'PAYMENT VOUCHER'}</h1>
  <div><span class="strong">${esc(p.number)}</span> · ${formatDate(p.date)}</div>
  <p>${p.direction === 'received' ? 'Received from' : 'Paid to'} <span class="strong">${esc(party?.name)}</span>
     the sum of <span class="strong">${formatMoney(p.amount)}</span> by ${esc(p.method)}${p.reference ? ` (ref. ${esc(p.reference)})` : ''}.</p>
  ${rows ? `<table><thead><tr><th>Against</th><th class="num">Amount</th></tr></thead><tbody>${rows}</tbody></table>` : ''}
  ${p.unallocated && p.unallocated.minor > 0 ? `<p class="muted">Held as an advance: ${formatMoney(p.unallocated)}</p>` : ''}
  ${p.notes ? `<p class="muted">${esc(p.notes)}</p>` : ''}
  <p style="margin-top:40px;text-align:right" class="muted">For ${esc(company.name)}<br/><br/>Authorised signatory</p>`;
  return printablePage(`${p.number}`, company, body);
}
