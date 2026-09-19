#!/usr/bin/env node
/**
 * Counts user-facing string literals that have not moved into the catalogue
 * yet, per file. Run it to see what a stage has left to do:
 *
 *   node tools/i18n/report.mjs            # files with the most left
 *   node tools/i18n/report.mjs app/\(app\)/sales   # one subtree
 *
 * It reports; it never rewrites. Key naming needs judgement, and the
 * interpolated sentences — the ones that actually matter — have to be shaped
 * by hand.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOTS = process.argv.slice(2).length ? process.argv.slice(2) : ['app', 'src'];

/** Props whose string value is shown to a person. */
const PROP = /\b(title|subtitle|label|placeholder|hint|description|message|caption|actionLabel|emptyAction|confirmLabel|cancelLabel|accessibilityLabel|emptyTitle)=["']([^"']{2,})["']/g;
/** `toast.show('…')`, the app's other main copy site. */
const TOAST = /toast\.show\(\s*['"]([^'"]{2,})['"]/g;
/** Text sitting directly in JSX. */
const JSX_TEXT = />\s*([A-Z][A-Za-z0-9 ,.'’&%/:()?!—·-]{4,})\s*</g;

/** Values that are data or identifiers rather than prose. */
const SKIP = [
  /^[a-z][a-z0-9]*(-[a-z0-9]+)+$/, // icon names, kebab-case
  /^[A-Z0-9/+.-]+$/,               // INV, PUN, GSTR-1, format examples
  /^\d/,                           // 400001
  /^[#@/.]/,                       // colours, routes
];

const files = [];
const walk = (dir) => {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '__tests__' || entry.startsWith('.')) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full);
    else if (/\.tsx?$/.test(full) && !/\.d\.ts$/.test(full)) files.push(full);
  }
};
for (const root of ROOTS) walk(root);

// Seed fixtures are demo data, and state names are legal names — neither is copy.
const EXCLUDED = /src\/(data\/seed|data\/seedTransactions|domain\/stateCodes|i18n\/)/;

/**
 * Deliberately untranslated, with the reason. Anything else showing up here
 * is work left to do.
 */
const KEPT_ENGLISH = new Set([
  'Elixir Books', // the product name
  'TAX INVOICE', // drawn inside the welcome artwork at fontSize 7; also the statutory title
]);

const rows = [];
let total = 0;
for (const file of files) {
  if (EXCLUDED.test(file)) continue;
  const src = readFileSync(file, 'utf8');
  const hits = new Set();
  for (const re of [PROP, TOAST, JSX_TEXT]) {
    re.lastIndex = 0;
    for (const m of src.matchAll(re)) {
      const value = (m[2] ?? m[1]).trim();
      if (!/[A-Za-z]/.test(value)) continue;
      if (SKIP.some((s) => s.test(value))) continue;
      if (KEPT_ENGLISH.has(value)) continue;
      hits.add(value);
    }
  }
  if (hits.size) {
    rows.push({ file, count: hits.size, sample: [...hits].slice(0, 3) });
    total += hits.size;
  }
}

rows.sort((a, b) => b.count - a.count);
for (const r of rows) {
  console.log(`${String(r.count).padStart(4)}  ${r.file}`);
  for (const s of r.sample) console.log(`      · ${s}`);
}
console.log(`\n${total} literals left across ${rows.length} files.`);
