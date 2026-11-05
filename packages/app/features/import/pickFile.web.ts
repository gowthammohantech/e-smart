import { base64OfDataUrl } from './importMapping';
import type { PickedFile } from './pickFile';

export type { PickedFile } from './pickFile';

/** A browser always has its file chooser. */
export const CAN_PICK_FILES = true;

/**
 * The browser's file chooser, through a hidden `<input type="file">` that is
 * never put on the page. Resolves null when the chooser is cancelled
 * (browsers that fire `cancel`; the rest simply never resolve, as before).
 */
export function pickFile(accept: string[]): Promise<PickedFile | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept.join(',');
    input.addEventListener('cancel', () => resolve(null));
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return resolve(null);
      resolve({
        name: file.name,
        size: file.size,
        text: () => file.text(),
        base64: () =>
          new Promise<string>((ok, fail) => {
            const reader = new FileReader();
            reader.onload = () => ok(base64OfDataUrl(String(reader.result ?? '')));
            reader.onerror = () => fail(reader.error ?? new Error('Could not read the file'));
            reader.readAsDataURL(file);
          }),
      });
    };
    input.click();
  });
}
