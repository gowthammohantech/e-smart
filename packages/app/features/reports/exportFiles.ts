import { Platform } from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { File, Paths } from 'expo-file-system';
import { printHtml } from '../documents/HtmlPreview';

/**
 * Hands a file to the person: a download in a browser, the share sheet on a
 * phone (from where it can be saved, mailed or opened in Excel).
 */
export async function deliverFile(fileName: string, bytes: Uint8Array, mimeType: string): Promise<void> {
  if (Platform.OS === 'web') {
    const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: mimeType }));
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return;
  }
  const file = new File(Paths.cache, fileName);
  if (file.exists) file.delete();
  file.create();
  file.write(bytes);
  await Sharing.shareAsync(file.uri, { mimeType, dialogTitle: fileName });
}

/** A PDF of the page: the browser's print dialog saves it; a phone shares the file. */
export async function deliverPdf(fileName: string, html: string): Promise<void> {
  // expo-print on the web ignores `html` and prints the whole app page, so the
  // report goes through a hidden frame of its own, like a document preview.
  if (Platform.OS === 'web') return printHtml(html);
  // The share sheet may not read where expo-print leaves its file ("Not allowed
  // to read file under given URL"), so the PDF is taken as data and saved into
  // the app's own cache, the same place deliverFile shares from.
  const { base64 } = await Print.printToFileAsync({ html, base64: true });
  if (!base64) throw new Error('The PDF came back empty');
  const file = new File(Paths.cache, fileName);
  if (file.exists) file.delete();
  file.create();
  file.write(base64, { encoding: 'base64' });
  await Sharing.shareAsync(file.uri, { mimeType: 'application/pdf', dialogTitle: fileName, UTI: 'com.adobe.pdf' });
}
