import type { Config } from '../config';

/**
 * GSTIN verification (GST public search through a GSP). The simulator validates the check digit and answers from seed data.
 *
 * Owned by the Reference module; shape it to what its handlers need.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface GstinProvider {}

export function createGstinProvider(_config: Config): GstinProvider {
  return {};
}
