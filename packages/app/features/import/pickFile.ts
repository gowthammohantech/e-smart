/**
 * Picking a file to import. The phone apps have no document picker yet
 * (expo-document-picker isn't in the store build), so imports there say to
 * use the web app instead; pickFile.web.ts is the browser's version.
 */

/** A file the person chose, read on demand. */
export type PickedFile = {
  name: string;
  /** Bytes. */
  size: number;
  /** The file as UTF-8 text (a CSV). */
  text: () => Promise<string>;
  /** The file as base64, for the server to read (an Excel workbook). */
  base64: () => Promise<string>;
};

/** Whether this platform can pick a file at all. */
export const CAN_PICK_FILES = false;

/** Asks for a file of one of the `accept` kinds; null when none was chosen (always, here). */
export async function pickFile(_accept: string[]): Promise<PickedFile | null> {
  return null;
}
