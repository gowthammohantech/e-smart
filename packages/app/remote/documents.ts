import type { DocumentKind } from '@esmart/core/types';
import type { Money } from '@esmart/core/lib/money';
import { api } from './api';
import { RemoteError } from './errors';

const path = (companyId: string, id: string) => ({ path: { companyId, id } });

export type PrintCopy = 'original' | 'duplicate' | 'triplicate' | 'all';

/** The server-rendered PDF (IRN, signed QR, e-way bill number, UPI QR), as bytes; `copy` labels it, `all` gives the three. */
export async function documentPdf(companyId: string, id: string, locale?: 'en' | 'ta', copy?: PrintCopy): Promise<Uint8Array> {
  const { data } = await api.GET('/companies/{companyId}/documents/{id}/pdf', {
    params: { ...path(companyId, id), query: { ...(locale && { locale }), ...(copy && { copy }) } },
    parseAs: 'arrayBuffer',
  });
  if (!data) throw new RemoteError('noPdf', 'The server returned no PDF');
  return new Uint8Array(data as unknown as ArrayBuffer);
}

/** A public, expiring link where the customer can view, download and pay. */
export async function shareLink(companyId: string, id: string): Promise<string> {
  const { data } = await api.POST('/companies/{companyId}/documents/{id}/share-link', { params: path(companyId, id) });
  if (!data?.url) throw new RemoteError('noLink', 'The server returned no link');
  return data.url;
}

/** The view link and, where the server could render it, the PDF link, from one request. */
export async function shareLinks(companyId: string, id: string): Promise<{ url: string; pdfUrl?: string }> {
  const { data } = await api.POST('/companies/{companyId}/documents/{id}/share-link', { params: path(companyId, id) });
  if (!data?.url) throw new RemoteError('noLink', 'The server returned no link');
  return { url: data.url, pdfUrl: data.pdfUrl };
}

/** A signed, expiring link straight to the invoice PDF in blob storage. */
export async function pdfLink(companyId: string, id: string): Promise<string> {
  const { data } = await api.POST('/companies/{companyId}/documents/{id}/share-link', { params: path(companyId, id) });
  if (!data?.pdfUrl) throw new RemoteError('noLink', 'The server returned no link');
  return data.pdfUrl;
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
  if (!data?.url) throw new RemoteError('noLink', 'The server returned no link');
  return { url: data.url, upiUri: data.upiUri };
}

/** A file name for a document's PDF: `INV-26-27-0042.pdf`. */
export const pdfFileName = (kind: DocumentKind, number: string) => `${(number || kind).replace(/[^A-Za-z0-9-]+/g, '-')}.pdf`;

/** Takes back a credit note applied to an invoice or bill (adjustAdvances); refused in a closed period. */
export async function removeCreditApplication(companyId: string, applicationId: string): Promise<void> {
  await api.DELETE('/companies/{companyId}/credit-applications/{applicationId}', { params: { path: { companyId, applicationId } } });
}
