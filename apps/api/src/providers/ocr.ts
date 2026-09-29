import { parseReceiptText, type OcrResult } from '@esmart/core/domain/parseReceipt';
import type { Config } from '../config';

export type OcrKind = OcrResult['kind'];

export type OcrInput = {
  kind: OcrKind;
  /** The stored file. */
  file: { body: Buffer; mimeType: string } | null;
  /** Text already read off the image (on-device OCR, or a test), which skips recognition. */
  text?: string;
};

/**
 * Bill and receipt extraction. Recognition turns the image into text; the
 * fields come out of core's `parseReceiptText`, the same rules the app runs
 * on device, so both read a bill the same way.
 */
export interface OcrProvider {
  readonly name: string;
  /** The parsed fields, plus the text they were read from. */
  extract(input: OcrInput): Promise<OcrResult & { text: string }>;
}

/** Stand-ins for a scanned image, one per kind, matching the app's mockExtract. */
export const SAMPLE_RECEIPTS: Record<OcrKind, string> = {
  expense: `Urban Logistics
GSTIN: 27AABCU9603R1ZX
Bill No: UL/2026/4471
Date: 14/05/2026
Local freight Mumbai - Bhiwandi
Taxable value 4,000.00
Total GST 720.00
Grand Total 4,720.00`,
  purchaseBill: `TAX INVOICE
Precision Components
GSTIN: 24AABCP1234F1ZQ
Invoice No: PC-2026-1183
Date: 14/05/2026
Steel Ball Bearing 6203 240 118.00 28,320.00
Hex Bolt M10x50 (100 pk) 60 420.00 25,200.00
Washer M10 (500 pk) 80 175.00 14,000.00
Sub Total 67,520.00
CGST 9% 6,076.80
SGST 9% 6,076.80
Grand Total 79,673.60`,
};

/**
 * Runs in-process and at once. It has no recognition engine: it parses the
 * text it is given, or a sample receipt when there is none.
 */
class SimulatedOcrProvider implements OcrProvider {
  readonly name = 'simulator';
  async extract(input: OcrInput) {
    const text = input.text?.trim() ? input.text : SAMPLE_RECEIPTS[input.kind];
    return { ...parseReceiptText(text, input.kind), text };
  }
}

/**
 * Google Document AI needs a service account and a processor per region; no
 * adapter is wired in yet, so asking for it fails at boot.
 */
export function createOcrProvider(config: Config): OcrProvider {
  if (config.OCR_PROVIDER === 'document-ai') throw new Error('OCR_PROVIDER=document-ai has no adapter yet; use the simulator.');
  return new SimulatedOcrProvider();
}
