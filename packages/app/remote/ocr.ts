import { ApiError } from '@esmart/api-client';
import type { OcrResult } from '@esmart/core/domain/parseReceipt';
import { api } from './api';
import { uploadAttachment } from './attachments';

export type OcrKind = OcrResult['kind'];

/** The server has no way to read this image (no OCR provider, and no text from the device). */
export class OcrUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OcrUnavailableError';
  }
}

const POLL_MS = 1500;
const POLL_FOR_MS = 90_000;

/** Asks for a queued extraction until it has finished or failed, or gives up after a while. */
async function waitForExtraction(companyId: string, id: string) {
  const until = Date.now() + POLL_FOR_MS;
  while (Date.now() < until) {
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
    const { data } = await api.GET('/companies/{companyId}/ocr/extractions/{id}', { params: { path: { companyId, id } } });
    if (data && data.status !== 'queued' && data.status !== 'processing') return data;
  }
  throw new Error('Reading the bill is taking too long. Try again in a moment.');
}

/**
 * Reads a bill: uploads the image as an attachment, then asks the server to
 * extract it. Text the device already read (ML Kit) goes along, so the server
 * only parses it; without it, the server's OCR provider reads the image.
 */
export async function extractBill(input: { companyId: string; uri: string; kind: OcrKind; text?: string | null }): Promise<OcrResult> {
  const attachment = await uploadAttachment({ companyId: input.companyId, uri: input.uri, name: input.kind === 'expense' ? 'Receipt' : 'Supplier bill' });
  try {
    const { data: started } = await api.POST('/companies/{companyId}/ocr/extractions', {
      params: { path: { companyId: input.companyId } },
      body: { attachmentId: attachment.id, kind: input.kind, ...(input.text?.trim() ? { text: input.text } : {}) },
    });
    // A provider that reads over the network answers "queued"; the result comes when its job has run.
    const data = started?.id && (started.status === 'queued' || started.status === 'processing') ? await waitForExtraction(input.companyId, started.id) : started;
    if (!data || data.status === 'failed') throw new Error(data?.error || 'The bill could not be read');
    return {
      imageUri: input.uri,
      attachmentId: attachment.id,
      kind: input.kind,
      fields: (data.fields ?? []).map((f) => ({ key: f.key ?? '', label: f.label ?? '', value: f.value ?? '', confidence: f.confidence ?? 0 })),
      // The catalogue item the server matched the line to, so a bill made from the scan moves its stock.
      lines: (data.lines ?? []).map((l) => ({ name: l.name ?? '', quantity: l.quantity ?? 0, unitPrice: l.unitPrice ?? 0, confidence: l.confidence ?? 0, ...(l.matchedItemId ? { itemId: l.matchedItemId } : {}) })),
    };
  } catch (err) {
    if (err instanceof ApiError && err.code === 'FEATURE_UNAVAILABLE') throw new OcrUnavailableError(err.message);
    throw err;
  }
}
