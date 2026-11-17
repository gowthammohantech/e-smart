import type { Config } from '../../config';
import { gspBaseUrl, gspBaseUrlVariable } from '../../config';
import { AdaequareGateway } from './adaequare';
import type { GspGateway } from './common';
import { toTarget, type GspGatewayName, type GspTarget } from './provider-name';
import { GspConfigError, type GspTransport } from './transport';
import { WhitebooksGateway } from './whitebooks';

/**
 * `config`, read as if `target` were the deployment's one target: its base URL, credentials and environment, not the
 * default's. This is how a gateway client learns which gateway and environment it is: from its own config.
 */
export const configFor = (config: Config, target: GspGatewayName | GspTarget): Config => {
  const { gateway, environment } = toTarget(target);
  return { ...config, TAXATION_TAXPAYER_PROVIDER: gateway, TAXATION_GSP_ENVIRONMENT: environment };
};

/**
 * One gateway client for one target, with the checks every gateway shares: the target must have its base URL set.
 * Which targets exist and which are usable is the deployment's settings, not a switch: a target whose URL and
 * credentials are blank (Whitebooks production, until there is a subscription) cannot be built.
 */
export function buildGateway(config: Config, target: GspGatewayName | GspTarget, opts: { transport?: GspTransport; log?: (message: string) => void } = {}): GspGateway {
  const wanted = toTarget(target);
  const own = configFor(config, wanted);
  if (!gspBaseUrl(own, wanted)) throw new GspConfigError(`The ${wanted.gateway} ${wanted.environment} target needs ${gspBaseUrlVariable(wanted)}.`);
  return wanted.gateway === 'whitebooks' ? new WhitebooksGateway(own, opts.transport, undefined, opts.log) : new AdaequareGateway(own, opts.transport, undefined, opts.log);
}
