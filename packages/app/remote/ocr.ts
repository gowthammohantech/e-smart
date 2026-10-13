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

/**
 * Reads a bill: uploads the image as an attachment, then asks the server to
 * extract it. Text the device already read (ML Kit) goes along, so the server
 * only parses it; without it, the server's OCR provider reads the image.
 */
export async function extractBill(input: { companyId: string; uri: string; kind: OcrKind; text?: string | null }): Promise<OcrResult> {
  const attachment = await uploadAttachment({ companyId: input.companyId, uri: input.uri, name: input.kind === 'expense' ? 'Receipt' : 'Supplier bill' });
  try {
    const { data } = await api.POST('/companies/{companyId}/ocr/extractions', {
      params: { path: { companyId: input.companyId } },
      body: { attachmentId: attachment.id, kind: input.kind, ...(input.text?.trim() ? { text: input.text } : {}) },
    });
    if (!data || data.status === 'failed') throw new Error(data?.error || 'The bill could not be read');
    return {
      imageUri: input.uri,
      attachmentId: attachment.id,
      kind: input.kind,
      fields: (data.fields ?? []).map((f) => ({ key: f.key ?? '', label: f.label ?? '', value: f.value ?? '', confidence: f.confidence ?? 0 })),
      lines: (data.lines ?? []).map((l) => ({ name: l.name ?? '', quantity: l.quantity ?? 0, unitPrice: l.unitPrice ?? 0, confidence: l.confidence ?? 0 })),
    };
  } catch (err) {
    if (err instanceof ApiError && err.code === 'FEATURE_UNAVAILABLE') throw new OcrUnavailableError(err.message);
    throw err;
  }
}
