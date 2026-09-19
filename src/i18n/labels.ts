import type { DocStatus, DocumentKind } from '@/types';
import type { Module } from '@/domain/plan';
import type { SeriesKind } from '@/domain/numbering';

/**
 * Names for the codes the domain layer deals in. The domain returns a code and
 * a tone; the words live here, so no module under `src/domain` has to know a
 * translator exists.
 *
 * `Translate` is the one place where i18next's compile-time key union meets a
 * key built at runtime. Its `TFunction` only accepts literal keys it can see in
 * the catalogue, so a template over `DocStatus` can never satisfy it — hence
 * the loose signature here rather than a cast at each of the fourteen call
 * sites. It also lets a test pass a fake translator that echoes the key.
 *
 * What the types stop guaranteeing, `__tests__/labels.test.ts` does: it walks
 * every member of every union, in every locale, and fails if a key is missing.
 */
export type Translate = (key: any, options?: any) => string;

export function statusLabel(t: Translate, status: DocStatus): string {
  return t(`domain:status.${status}`);
}

/**
 * A document kind, named for a count: `count` picks the CLDR plural category,
 * so a list heading passes 2 and a sentence about one record passes 1.
 */
export function documentKindLabel(t: Translate, kind: DocumentKind, count = 1): string {
  return t(`domain:documentKind.${kind}`, { count });
}

export function seriesLabel(t: Translate, kind: SeriesKind): string {
  return t(`domain:series.${kind}`);
}

export function moduleLabel(t: Translate, module: Module): string {
  return t(`domain:module.${module}`);
}

export function paymentMethodLabel(t: Translate, method: string): string {
  return t(`domain:paymentMethod.${method}`, { defaultValue: method });
}

export function dateRangeLabel(t: Translate, preset: string): string {
  return t(`common:dateRange.${preset}`);
}
