import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { parse } from 'yaml';

/**
 * Absolute path to openapi.yaml, resolved through the package's exports so
 * it holds from source and from a bundled server alike.
 */
export const specPath = createRequire(import.meta.url).resolve('@esmart/api-contract/openapi.yaml');

/** The contract as a plain object. Node only: the apps import types, not this. */
export function loadSpec(): Record<string, unknown> {
  return parse(readFileSync(specPath, 'utf8')) as Record<string, unknown>;
}
