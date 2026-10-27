import type { Config } from '../../config';
import { gspBaseUrl } from '../../config';
import { AdaequareGateway } from './adaequare';
import type { GspGateway } from './common';
import { SANDBOX_ONLY_GATEWAYS, resolveGspGateway } from './provider-name';
import type { GspTransport } from './transport';
import { WhitebooksGateway } from './whitebooks';

export type { GspGateway } from './common';
export { GspConfigError } from './transport';

const built = new WeakMap<Config, GspGateway>();

/**
 * The one place a GSP gateway is chosen. E-invoice, e-way bill and GSTIN lookup
 * share the instance, so Whitebooks mints one taxpayer token per GSTIN rather
 * than one per feature.
 *
 * Sandbox-only gateways are refused here as well as in `productionProblems`:
 * a filing against a sandbox produces an IRN nobody can present, and the
 * operator finds out from the customer.
 */
export function createGspGateway(config: Config, opts: { transport?: GspTransport; log?: (message: string) => void } = {}): GspGateway {
  const cached = built.get(config);
  if (cached && !opts.transport) return cached;

  const name = resolveGspGateway(config.TAXATION_TAXPAYER_PROVIDER, config.TAXATION_GSP_PROVIDER_CODE);
  if (config.NODE_ENV === 'production' && SANDBOX_ONLY_GATEWAYS.includes(name)) {
    throw new Error(`The "${name}" gateway is sandbox only and must not run in production. Point TAXATION_GSP_PROVIDER_CODE at a production gateway.`);
  }
  if (!gspBaseUrl(config)) throw new Error('A GSP provider needs TAXATION_GSP_BASE_URL.');
  if (config.TAXATION_SANDBOX_BUYER_GSTIN && name !== 'whitebooks') {
    // A substitution that silently did not happen would look like a broken sandbox on every filing.
    throw new Error(`TAXATION_SANDBOX_BUYER_GSTIN is set, but the "${name}" gateway cannot look a taxpayer up to substitute one. Unset it, or use Whitebooks.`);
  }

  const gateway: GspGateway =
    name === 'whitebooks' ? new WhitebooksGateway(config, opts.transport, undefined, opts.log) : new AdaequareGateway(config, opts.transport, undefined, opts.log);
  if (!opts.transport) built.set(config, gateway);
  return gateway;
}
