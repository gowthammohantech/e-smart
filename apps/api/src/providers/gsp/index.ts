import type { Config } from '../../config';
import { buildGateway } from './build';
import type { GspGateway } from './common';
import { defaultGspTarget } from './provider-name';
import { GspRouter } from './router';
import type { GspTransport } from './transport';

export type { GspGateway } from './common';
export { gspAvailability, type GspAvailability } from './availability';
export { GspRouter, parseGspGateway, parseGspTarget } from './router';
export { GspConfigError } from './transport';

const built = new WeakMap<Config, GspGateway>();
const routers = new WeakMap<Config, GspRouter>();

/**
 * Every target the deployment is set up for, behind one instance: a company is routed to the target a platform
 * operator chose for it, or to the deployment's default. E-invoice, e-way bill and GSTIN lookup share
 * the instance, so each target keeps one session rather than one per feature.
 */
export function createGspRouter(config: Config, opts: { transport?: GspTransport; log?: (message: string) => void } = {}): GspRouter {
  const cached = routers.get(config);
  if (cached && !opts.transport) return cached;
  const router = new GspRouter(config, opts);
  if (!opts.transport) routers.set(config, router);
  return router;
}

/**
 * The deployment's default target as one gateway client, without the router. E-invoice, e-way bill and GSTIN
 * lookup share the instance, so Whitebooks mints one taxpayer token per GSTIN rather than one per feature.
 */
export function createGspGateway(config: Config, opts: { transport?: GspTransport; log?: (message: string) => void } = {}): GspGateway {
  const cached = built.get(config);
  if (cached && !opts.transport) return cached;
  const gateway = buildGateway(config, defaultGspTarget(config), opts);
  if (!opts.transport) built.set(config, gateway);
  return gateway;
}
