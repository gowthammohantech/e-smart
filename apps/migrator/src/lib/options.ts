import type { Ctx, Entity } from './kit';

/** The choices a sheet starts with, from what its kind of data offers. */
export function defaultOptions(entity: Entity | undefined, ctx: Ctx): Record<string, string> {
  return Object.fromEntries((entity?.options ?? []).map((o) => [o.key, typeof o.default === 'function' ? o.default(ctx) : o.default]));
}
