import type { Config } from '../../config';
import { gspBaseUrl } from '../../config';
import { AdaequareGateway } from './adaequare';
import type { GspGateway } from './common';
import { SANDBOX_ONLY_GATEWAYS, type GspGatewayName } from './provider-name';
import { GspConfigError, type GspTransport } from './transport';
import { WhitebooksGateway } from './whitebooks';

/** `config`, read as if `gateway` were the deployment's one gateway: its base URL and settings, not the default's. */
export const configFor = (config: Config, gateway: GspGatewayName): Config => ({ ...config, TAXATION_TAXPAYER_PROVIDER: gateway });

/**
 * One gateway client, named, with the checks every gateway shares.
 *
 * Sandbox-only gateways are refused unless TAXATION_GSTIN_ALLOW_SANDBOX=true: a filing against a sandbox
 * produces an IRN nobody can present, and the operator finds out from the customer.
 */
export function buildGateway(config: Config, name: GspGatewayName, opts: { transport?: GspTransport; log?: (message: string) => void } = {}): GspGateway {
  if (!config.TAXATION_GSTIN_ALLOW_SANDBOX && SANDBOX_ONLY_GATEWAYS.includes(name)) {
    throw new GspConfigError(`The "${name}" gateway is sandbox only: set TAXATION_GSTIN_ALLOW_SANDBOX=true to use it, or point TAXATION_GSP_PROVIDER_CODE at a production gateway.`);
  }
  const own = configFor(config, name);
  if (!gspBaseUrl(own)) throw new GspConfigError(`The "${name}" gateway needs TAXATION_${name.toUpperCase()}_BASE_URL (or TAXATION_GSP_BASE_URL).`);
  return name === 'whitebooks' ? new WhitebooksGateway(own, opts.transport, undefined, opts.log) : new AdaequareGateway(own, opts.transport, undefined, opts.log);
}
