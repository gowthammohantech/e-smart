import type { DocumentKind } from '@esmart/core/types';
import type { Money } from '@esmart/core/lib/money';
import { api } from './api';

const path = (companyId: string, id: string) => ({ path: { companyId, id } });

/** The server-rendered PDF (IRN, signed QR, e-way bill number, UPI QR), as bytes. */
export async function documentPdf(companyId: string, id: string, locale?: 'en' | 'ta'): Promise<Uint8Array> {
  const { data } = await api.GET('/companies/{companyId}/documents/{id}/pdf', {
    params: { ...path(companyId, id), query: locale ? { locale } : {} },
    parseAs: 'arrayBuffer',
  });
  if (!data) throw new Error('The server returned no PDF');
  return new Uint8Array(data as unknown as ArrayBuffer);
}

/** A public, expiring link where the customer can view, download and pay. */
export async function shareLink(companyId: string, id: string): Promise<string> {
  const { data } = await api.POST('/companies/{companyId}/documents/{id}/share-link', { params: path(companyId, id) });
  if (!data?.url) throw new Error('The server returned no link');
  return data.url;
}

export type SendChannel = 'email' | 'whatsapp' | 'sms';

/** Emails, WhatsApps or texts the document to the party; the server moves a draft quote or an issued invoice to sent. */
export async function sendDocument(companyId: string, id: string, channel: SendChannel, opts: { includePaymentLink?: boolean } = {}): Promise<void> {
  await api.POST('/companies/{companyId}/documents/{id}/send', {
    params: path(companyId, id),
    body: { channel, attachPdf: true, includePaymentLink: opts.includePaymentLink ?? false },
  });
}

/** A gateway payment link for what is still owed (or `amount`); a payment the gateway records is allocated here. */
export async function paymentLink(companyId: string, id: string, amount?: Money): Promise<{ url: string; upiUri?: string }> {
  const { data } = await api.POST('/companies/{companyId}/documents/{id}/payment-link', { params: path(companyId, id), body: amount ? { amount } : {} });
  if (!data?.url) throw new Error('The server returned no link');
  return { url: data.url, upiUri: data.upiUri };
}

/** A file name for a document's PDF: `INV-26-27-0042.pdf`. */
export const pdfFileName = (kind: DocumentKind, number: string) => `${(number || kind).replace(/[^A-Za-z0-9-]+/g, '-')}.pdf`;
