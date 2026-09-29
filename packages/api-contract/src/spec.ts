import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';

/** Absolute path to openapi.yaml, for tools that read the file themselves. */
export const specPath = fileURLToPath(new URL('../openapi.yaml', import.meta.url));

/** The contract as a plain object. Node only: the apps import types, not this. */
export function loadSpec(): Record<string, unknown> {
  return parse(readFileSync(specPath, 'utf8')) as Record<string, unknown>;
}
