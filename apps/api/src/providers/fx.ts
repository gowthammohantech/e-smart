import type { Config } from '../config';

/**
 * Exchange rates for refreshExchangeRates. The static provider returns fixed reference rates.
 *
 * Owned by the Settings module; shape it to what its handlers need.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface FxProvider {}

export function createFxProvider(_config: Config): FxProvider {
  return {};
}
