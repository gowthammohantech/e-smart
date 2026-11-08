import { readdirSync, readFileSync } from 'node:fs';
import { join, posix } from 'node:path';

import { Marked, Renderer, type Tokens } from 'marked';

/**
 * The application cookbook, read from docs/cookbook at build time so the
 * Markdown in the repo stays the one source. Pages are addressed by their
 * path inside the cookbook without `.md`: `part-a-user-guide/05-sales`.
 * The cookbook's own README is the guide's index page.
 */

// `next build` and `next dev` run from apps/site.
const ROOT = join(process.cwd(), '../../docs/cookbook');

/**
 * The parts published on the site. Part B (part-b-test-scenarios) is the internal QA/UAT script:
 * it stays in the repo but is never built, listed or linked here.
 */
export const PARTS = [{ dir: 'part-a-user-guide', title: 'Part A — User guide' }] as const;

const INTERNAL_DIR = 'part-b-test-scenarios';

/** Links into internal pages, resolved to a site route; these render as plain text. */
const isInternal = (href: string) => href.startsWith(`/docs/${INTERNAL_DIR}`) || href === '#part-b--test-scenarios';

/** Drops the internal part's section and its pointers from a page before rendering. */
function stripInternal(markdown: string): string {
  return (
    markdown
      // The "## Part B …" section, up to the next rule or second-level heading.
      .replace(/^## Part B[^\n]*\n[\s\S]*?(?=^---\s*$|^## )/m, '')
      // Bullets that only point at Part B.
      .replace(/^- \*\*\[Part B[^\n]*\n/m, '')
  );
}

export type CookbookPage = { slug: string; title: string; html: string };

/** The anchor GitHub gives a heading, so links written for the repo keep working here. */
function anchorOf(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^\w\- ]/g, '')
    .replace(/ /g, '-');
}

/** `05-sales.md#x` seen from `part-a-user-guide/01-getting-started` becomes `/docs/part-a-user-guide/05-sales#x`. */
function siteHref(href: string, from: string): string {
  if (/^[a-z]+:/i.test(href) || href.startsWith('#')) return href;
  const [path, hash] = href.split('#');
  if (!path.endsWith('.md')) return href;
  const target = posix.normalize(posix.join(posix.dirname(from), path)).replace(/\.md$/, '');
  const route = target === 'README' ? '/docs' : `/docs/${target}`;
  return hash ? `${route}#${hash}` : route;
}

function render(markdown: string, slug: string): string {
  const renderer = new Renderer();
  renderer.heading = function ({ tokens, depth, text }: Tokens.Heading) {
    const id = anchorOf(text);
    return `<h${depth} id="${id}"><a class="anchor" href="#${id}" aria-hidden="true">#</a>${this.parser.parseInline(tokens)}</h${depth}>\n`;
  };
  // Scenario tables are wide; they scroll inside the column rather than the page.
  renderer.table = function (token: Tokens.Table) {
    return `<div class="table-wrap">${Renderer.prototype.table.call(this, token)}</div>`;
  };
  // Links into the internal part read as plain text.
  renderer.link = function (token: Tokens.Link) {
    return isInternal(token.href) ? this.parser.parseInline(token.tokens) : Renderer.prototype.link.call(this, token);
  };

  const marked = new Marked({
    gfm: true,
    renderer,
    walkTokens(token) {
      if (token.type === 'link') token.href = siteHref(token.href, slug);
    },
  });
  return marked.parse(stripInternal(markdown), { async: false });
}

function read(slug: string): CookbookPage {
  const markdown = readFileSync(join(ROOT, `${slug}.md`), 'utf8');
  const title = /^#\s+(.+)$/m.exec(markdown)?.[1].trim() ?? slug;
  return { slug, title, html: render(markdown, slug) };
}

export function cookbookIndex(): CookbookPage {
  return read('README');
}

export function cookbookPage(part: string, page: string): CookbookPage {
  return read(`${part}/${page}`);
}

/** Every page, in reading order, for the sidebar and for static generation. */
export function cookbookNav(): { dir: string; title: string; pages: { slug: string; page: string; title: string }[] }[] {
  return PARTS.map(({ dir, title }) => ({
    dir,
    title,
    pages: readdirSync(join(ROOT, dir))
      .filter((f) => f.endsWith('.md'))
      .sort()
      .map((f) => {
        const page = f.replace(/\.md$/, '');
        const heading = /^#\s+(.+)$/m.exec(readFileSync(join(ROOT, dir, f), 'utf8'))?.[1].trim() ?? page;
        return { slug: `${dir}/${page}`, page, title: heading };
      }),
  }));
}
