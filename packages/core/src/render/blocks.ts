/**
 * The pieces every printed layout shares: escaping, addresses, bilingual labels, the logo and
 * signature, the bank block with its UPI QR, the e-invoice block, the cancelled strip, the
 * reimbursement table and the printable custom fields. The statutory ones (e-invoice, cancelled
 * strip, reimbursements) must print the same on every layout, so they live here and not in one.
 */
import { BankDetails, BusinessDocument, Company, DocumentKind, EwayBill } from '../types';
import type { Translate } from '../labels';
import { formatMoney } from '../lib/format';
import { formatDate } from '../lib/date';
import { money } from '../lib/money';
import { MIN_READABLE_QR_SIZE, qrMatrix, qrSvgString } from '../lib/qr';
import { E_INVOICE_CANCEL_REASONS } from '../domain/eInvoice';
import type { LanguageCode } from '@esmart/i18n/config';
import i18n from '@esmart/i18n';
import { printableFields } from '../domain/customFields';
import { TCS_SECTIONS } from '../data/tcsSections';
import type { DocView } from './docView';

export const TCS_LABEL: Record<string, string> = Object.fromEntries(TCS_SECTIONS.map((s) => [s.code, s.label.split(' ')[0]]));

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
export function bilingual(t: Translate, language: LanguageCode): (key: string) => string {
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

/** Statutory wording on the note, so English like the field names. */
export const NOTE_REASON = { discount: 'Discount after sale', priceChange: 'Price change', taxCorrection: 'Tax correction', deficiency: 'Short or faulty supply', other: 'Other' } as const;

export const SUPPLY_NOTE = { nil: 'Nil-rated supply', exempt: 'Exempt supply', nonGst: 'Non-GST supply' } as const;

export function esc(s: string | undefined | null): string {
  return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}

export function addressBlock(a?: { line1?: string; line2?: string; city?: string; state?: string; postalCode?: string }): string {
  if (!a) return '';
  return [a.line1, a.line2, [a.city, a.postalCode].filter(Boolean).join(' '), a.state]
    .filter(Boolean)
    .map((l) => esc(l))
    .join('<br/>');
}

/** The signatory's signature above the line, from the same kinds of source as the logo. */
export function signatureTag(src: string | undefined): string {
  if (!src || !/^(https?:|data:image\/|file:|blob:)/i.test(src)) return '';
  return `<img class="signature" src="${esc(src)}" alt="">`;
}

/** The business logo above its name, from a link, a data URI or a file just picked on the device. */
export function logoTag(src: string | undefined, name: string | undefined): string {
  if (!src || !/^(https?:|data:image\/|file:|blob:)/i.test(src)) return '';
  return `<img class="logo" src="${esc(src)}" alt="${esc(name)}">`;
}

/** Documents a customer pays against, which print the bank account (and a UPI QR) to pay into. */
export const PAYABLE_KINDS: DocumentKind[] = ['invoice', 'quote', 'proforma', 'salesOrder'];

/**
 * `upi://pay` for the amount, read by every UPI app: the payee address and name,
 * the amount in rupees, and the document number as the note, so the payment is
 * easy to match. INR only; UPI carries nothing else.
 */
export function upiPayLink(upiId: string, payee: string, amountMinor: number, note: string): string {
  // Spaces as '+', and the payee's '@' left as is: some UPI apps don't decode %40.
  const q = (s: string) => encodeURIComponent(s).replace(/%20/g, '+').replace(/%40/g, '@');
  return `upi://pay?pa=${q(upiId)}&pn=${q(payee)}&am=${(amountMinor / 100).toFixed(2)}&cu=INR&tn=${q(note)}`;
}

/** The bank account block beside the notes, with a UPI QR for the total when the document is in rupees. */
export function bankBlock(doc: BusinessDocument, company: Company | undefined, bi: (key: string) => string): string {
  const b: BankDetails | undefined = company?.bankDetails;
  if (!b || !PAYABLE_KINDS.includes(doc.kind) || !(b.accountNumber || b.upiId)) return '';
  const row = (key: string, value?: string) => (value ? `<tr><td class="muted">${bi(key)}</td><td>${esc(value)}</td></tr>` : '');
  let qr = '';
  if (b.upiId && doc.currency === 'INR' && doc.totals.grandTotal.minor > 0) {
    try {
      const link = upiPayLink(b.upiId, b.accountName || company?.name || '', doc.totals.grandTotal.minor, doc.number);
      qr = `<div class="upi-qr">${qrSvgString(qrMatrix(link, 'M'), { size: 112, quietZone: 2 })}<div class="muted">${bi('sales:pdf.scanToPay')}</div></div>`;
    } catch {
      qr = '';
    }
  }
  return `<div class="bank">
      <div class="cap">${bi('sales:pdf.bankDetails')}</div>
      <div class="bank-body">
        <table class="bank-rows"><tbody>
          ${row('sales:pdf.accountName', b.accountName)}
          ${row('sales:pdf.bank', b.bankName)}
          ${row('sales:pdf.accountNumber', b.accountNumber)}
          ${row('sales:pdf.ifsc', b.ifsc)}
          ${row('sales:pdf.branch', b.branch)}
          ${row('sales:pdf.upi', b.upiId)}
        </tbody></table>
        ${qr}
      </div>
    </div>`;
}

/** Pure-agent reimbursements sit outside the taxable value (Rule 33), so they get their own table. */
export function reimbursementTable({ reimbursed, bi, doc }: Pick<DocView, 'reimbursed' | 'bi' | 'doc'>): string {
  return reimbursed.length
    ? `<table class="reimbursements">
    <thead>
      <tr>
        <th style="width:26px">#</th>
        <th>Reimbursement of expenses (pure agent, at cost, not part of taxable value)</th>
        <th class="num">${bi('sales:pdf.amount')}</th>
      </tr>
    </thead>
    <tbody>${reimbursed
      .map(
        (line, i) => `<tr>
        <td class="num">${i + 1}</td>
        <td><div class="item">${esc(line.name)}</div>${line.description ? `<div class="sub">${esc(line.description)}</div>` : ''}</td>
        <td class="num strong">${formatMoney(money(Math.round(line.unitPrice.minor * line.quantity), doc.currency))}</td>
      </tr>`,
      )
      .join('')}</tbody>
  </table>`
    : '';
}

/** The company's own fields marked to print: this document's, then the party's. */
export function printedCustomFields({ customFields, doc, party }: Pick<DocView, 'customFields' | 'doc' | 'party'>): { label: string; text: string }[] {
  return [...printableFields(customFields, 'document', doc.customFields), ...printableFields(customFields, 'party', party?.customFields)];
}

/**
 * The e-invoice block on a printed document (FRD 16).
 *
 * The IRN, the acknowledgement number, the acknowledgement date and the signed
 * QR are all required on a printed e-invoice, and the e-way bill number must
 * appear on the document travelling with the consignment — so none of this is
 * decoration that can be dropped to save room.
 */
export function eInvoiceBlock(doc: BusinessDocument, bi: (key: string) => string, ewayBill?: EwayBill): string {
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
export function cancelledStrip(doc: BusinessDocument): string {
  const c = doc.compliance;
  if (c?.eInvoiceStatus !== 'cancelled') return '';
  const reason = c.irnCancelReasonCode ? E_INVOICE_CANCEL_REASONS[c.irnCancelReasonCode] : 'cancelled';
  const on = c.irnCancelledAt ? ` on ${formatDate(c.irnCancelledAt.slice(0, 10))}` : '';
  return `<div class="cancelled-strip">IRN CANCELLED — ${esc(reason)}${esc(on)}</div>`;
}
