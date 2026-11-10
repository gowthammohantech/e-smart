import { buildDocView, COPY_LABEL, type CopyKind, type DocumentHtmlInput, type DocView } from './docView';
import { standardLayout } from './layouts/standard';
import { boxedLayout } from './layouts/boxed';
import { modernLayout } from './layouts/modern';

import { esc } from './blocks';

export { upiPayLink } from './blocks';
export { COPY_LABEL } from './docView';
export type { CopyKind, DocumentHtmlInput } from './docView';

/**
 * Which copy this is, as Rule 48 names it: in the page's language, with the English wording after it
 * when that is another language (as the field labels carry theirs).
 */
export function copyLabel(view: Pick<DocView, 't' | 'language'>, copy: CopyKind): string {
  if (view.language === 'en') return COPY_LABEL[copy];
  const key = `sales:print.copies.${copy}`;
  const own = view.t(key);
  return own && own !== key ? `${own} · ${COPY_LABEL[copy]}` : COPY_LABEL[copy];
}

/** One copy of the page in the chosen layout. */
function renderCopy(view: DocView, copy: CopyKind | undefined): string {
  const label = copy ? copyLabel(view, copy) : '';
  switch (view.tpl.layout) {
    case 'classic':
    case 'detailed':
      return boxedLayout(view, view.tpl.layout, label);
    case 'modern':
      return modernLayout(view, label);
    default: {
      // The standard page has always printed the original unlabelled, and the others above its head.
      const html = standardLayout(view);
      return copy && copy !== 'original'
        ? html.replace('<div class="head">', `<div class="muted" style="text-align:right;font-weight:700">${esc(label)}</div><div class="head">`)
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
