import type { Config } from '../config';

/**
 * Bill and receipt extraction. The simulator parses text with the same rules as the app's parseReceipt.
 *
 * Owned by the OCR module; shape it to what its handlers need.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface OcrProvider {}

export function createOcrProvider(_config: Config): OcrProvider {
  return {};
}
