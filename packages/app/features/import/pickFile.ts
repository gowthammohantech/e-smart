import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';

/**
 * Picking a file to import on a phone: the system document picker (expo-document-picker, a native
 * module, so a phone needs a store build that includes it), read with expo-file-system.
 * pickFile.web.ts is the browser's version.
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
export const CAN_PICK_FILES = true;

/** MIME types for the extensions imports ask for; the picker filters by type, not by name. */
const MIME: Record<string, string[]> = {
  '.csv': ['text/csv', 'text/comma-separated-values', 'application/csv', 'text/plain'],
  '.xlsx': ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
  '.xls': ['application/vnd.ms-excel'],
  '.json': ['application/json', 'text/plain'],
};

/** Asks for a file of one of the `accept` kinds (extensions or MIME types); null when none was chosen. */
export async function pickFile(accept: string[]): Promise<PickedFile | null> {
  const types = accept.flatMap((a) => (a.startsWith('.') ? (MIME[a.toLowerCase()] ?? ['*/*']) : [a]));
  const result = await DocumentPicker.getDocumentAsync({ type: types.length ? types : '*/*', copyToCacheDirectory: true, multiple: false });
  if (result.canceled || !result.assets?.length) return null;
  const asset = result.assets[0];
  const file = new File(asset.uri);
  return {
    name: asset.name,
    size: asset.size ?? file.size ?? 0,
    text: () => file.text(),
    base64: () => file.base64(),
  };
}
