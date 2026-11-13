import type { Config } from '../../config';
import { gspBaseUrl } from '../../config';
import { buildGateway } from './build';
import type { GspGateway } from './common';
import { SANDBOX_ONLY_GATEWAYS, resolveGspGateway } from './provider-name';
import { GspRouter } from './router';
import type { GspTransport } from './transport';

export type { GspGateway } from './common';
export { gspAvailability, type GspAvailability } from './availability';
export { GspRouter, parseGspGateway } from './router';
export { GspConfigError } from './transport';

const built = new WeakMap<Config, GspGateway>();
const routers = new WeakMap<Config, GspRouter>();

/**
 * Every gateway the deployment is set up for, behind one instance: a company is routed to the gateway a
 * platform operator chose for it, or to the deployment's default. E-invoice, e-way bill and GSTIN lookup share
 * the instance, so each gateway keeps one session rather than one per feature.
 */
export function createGspRouter(config: Config, opts: { transport?: GspTransport; log?: (message: string) => void } = {}): GspRouter {
  const cached = routers.get(config);
  if (cached && !opts.transport) return cached;
  const router = new GspRouter(config, opts);
  if (!opts.transport) routers.set(config, router);
  return router;
}

/**
 * The one place a GSP gateway is chosen. E-invoice, e-way bill and GSTIN lookup
 * share the instance, so Whitebooks mints one taxpayer token per GSTIN rather
 * than one per feature.
 *
 * Sandbox-only gateways are refused here as well as in `loadConfig`, unless TAXATION_GSTIN_ALLOW_SANDBOX=true:
 * a filing against a sandbox produces an IRN nobody can present, and the
 * operator finds out from the customer.
 */
export function createGspGateway(config: Config, opts: { transport?: GspTransport; log?: (message: string) => void } = {}): GspGateway {
  const cached = built.get(config);
  if (cached && !opts.transport) return cached;

  const name = resolveGspGateway(config.TAXATION_TAXPAYER_PROVIDER, config.TAXATION_GSP_PROVIDER_CODE);
  if (!config.TAXATION_GSTIN_ALLOW_SANDBOX && SANDBOX_ONLY_GATEWAYS.includes(name)) {
    throw new Error(`The "${name}" gateway is sandbox only: set TAXATION_GSTIN_ALLOW_SANDBOX=true to use it, or point TAXATION_GSP_PROVIDER_CODE at a production gateway.`);
  }
  if (!gspBaseUrl(config)) throw new Error('A GSP provider needs TAXATION_GSP_BASE_URL.');
  if (config.TAXATION_SANDBOX_BUYER_GSTIN && name !== 'whitebooks') {
    // A substitution that silently did not happen would look like a broken sandbox on every filing.
    throw new Error(`TAXATION_SANDBOX_BUYER_GSTIN is set, but the "${name}" gateway cannot look a taxpayer up to substitute one. Unset it, or use Whitebooks.`);
  }

  const gateway = buildGateway(config, name, opts);
  if (!opts.transport) built.set(config, gateway);
  return gateway;
}
