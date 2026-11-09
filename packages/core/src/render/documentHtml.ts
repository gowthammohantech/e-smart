import { buildDocView, type DocumentHtmlInput } from './docView';
import { standardLayout } from './layouts/standard';

export { upiPayLink } from './blocks';
export type { DocumentHtmlInput } from './docView';

/**
 * Print-ready HTML for a business document. Rendered to PDF with expo-print
 * for sharing and shown in the in-app preview by the app, and rendered to PDF
 * by the API (`getDocumentPdf`), so both print the same page.
 *
 * The figures are worked out once (`buildDocView`); the business's chosen
 * layout only arranges them.
 */
export function buildDocumentHtml(input: DocumentHtmlInput): string {
  const view = buildDocView(input);
  return standardLayout(view);
}
