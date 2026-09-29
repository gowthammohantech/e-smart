#!/usr/bin/env node
/**
 * Rewrites `@/…` imports that point at code which has moved into a workspace
 * package. Run it after moving files, then let typecheck catch anything left:
 *
 *   node tools/codemods/alias-to-packages.mjs
 *
 * Inside a package, a specifier that points back into the same package becomes
 * relative, because a package can't lean on an app's `@/` alias. Everywhere
 * else it becomes the package's public subpath (`@esmart/core/domain/plan`).
 *
 * The rules are data: when a later step moves more code, add rules here and
 * run it again. It is idempotent.
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

/**
 * Longest prefix first. `to` is the package specifier. `src` is the path, inside
 * the package, that `@/<from>` now lives at, used for relative rewrites.
 */
export const RULES = [
  { from: 'i18n/labels', to: '@esmart/core/labels', pkg: 'packages/core', src: 'src/labels' },
  { from: 'i18n/config', to: '@esmart/i18n/config', pkg: 'packages/i18n', src: 'src/config' },
  { from: 'i18n/locales', to: '@esmart/i18n/locales', pkg: 'packages/i18n', src: 'src/locales' },
  { from: 'i18n', exact: true, to: '@esmart/i18n', pkg: 'packages/i18n', src: 'src/index' },
  { from: 'domain', to: '@esmart/core/domain', pkg: 'packages/core', src: 'src/domain' },
  { from: 'lib', to: '@esmart/core/lib', pkg: 'packages/core', src: 'src/lib' },
  { from: 'data', to: '@esmart/core/data', pkg: 'packages/core', src: 'src/data' },
  { from: 'types', to: '@esmart/core/types', pkg: 'packages/core', src: 'src/types' },
];

const SPEC = /(['"])@\/([^'"]+)\1/g;

function rewrite(spec, file) {
  for (const r of RULES) {
    const hit = r.exact ? spec === r.from : spec === r.from || spec.startsWith(r.from + '/');
    if (!hit) continue;
    const rest = spec.slice(r.from.length); // '' or '/x/y'
    const pkgRoot = join(ROOT, r.pkg);
    if (file.startsWith(pkgRoot + '/')) {
      let rel = relative(dirname(file), join(pkgRoot, r.src + rest));
      if (!rel.startsWith('.')) rel = './' + rel;
      return rel;
    }
    return r.to + rest;
  }
  return null;
}

function walk(dir, out) {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(tsx?|jsx?|mjs)$/.test(entry)) out.push(full);
  }
  return out;
}

let changed = 0;
for (const file of [...walk(join(ROOT, 'apps'), []), ...walk(join(ROOT, 'packages'), [])]) {
  const before = readFileSync(file, 'utf8');
  const after = before.replace(SPEC, (m, q, spec) => {
    const next = rewrite(spec, file);
    return next ? `${q}${next}${q}` : m;
  });
  if (after !== before) {
    writeFileSync(file, after);
    changed++;
  }
}
console.log(`Rewrote imports in ${changed} files.`);
