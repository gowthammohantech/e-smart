import { buildDocView, COPY_LABEL, type CopyKind, type DocumentHtmlInput, type DocView } from './docView';
import { standardLayout } from './layouts/standard';
import { boxedLayout } from './layouts/boxed';
import { modernLayout } from './layouts/modern';

export { upiPayLink } from './blocks';
export { COPY_LABEL } from './docView';
export type { CopyKind, DocumentHtmlInput } from './docView';

/** One copy of the page in the chosen layout. */
function renderCopy(view: DocView, copy: CopyKind | undefined): string {
  switch (view.tpl.layout) {
    case 'classic':
    case 'detailed':
      return boxedLayout(view, view.tpl.layout, copy ? COPY_LABEL[copy] : '');
    case 'modern':
      return modernLayout(view, copy ? COPY_LABEL[copy] : '');
    default: {
      // The standard page has always printed the original unlabelled, and the others above its head.
      const html = standardLayout(view);
      return copy && copy !== 'original'
        ? html.replace('<div class="head">', `<div class="muted" style="text-align:right;font-weight:700">${COPY_LABEL[copy]}</div><div class="head">`)
        : html;
    }
  }
}

const BODY = /<body([^>]*)>([\s\S]*)<\/body>/;

/**
 * Print-ready HTML for a business document. Rendered to PDF with expo-print
 * for sharing and shown in the in-app preview by the app, and rendered to PDF
 * by the API (`getDocumentPdf`), so both print the same page.
 *
 * The figures are worked out once (`buildDocView`); the business's chosen
 * layout only arranges them. `copy: 'all'` prints the original, duplicate and
 * triplicate one after another, each starting a new sheet (Rule 48).
 */
export function buildDocumentHtml(input: DocumentHtmlInput): string {
  const view = buildDocView(input);
  if (input.copy !== 'all') return renderCopy(view, input.copy);
  const pages = (['original', 'duplicate', 'triplicate'] as const).map((c) => renderCopy(view, c));
  const bodies = pages.map((p) => BODY.exec(p)?.[2] ?? '');
  const joined = bodies.map((b, i) => (i ? `<div style="page-break-before:always;break-before:page"></div>${b}` : b)).join('');
  return pages[0].replace(BODY, (_m, attrs: string) => `<body${attrs}>${joined}</body>`);
}
