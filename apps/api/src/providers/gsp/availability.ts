import type { Config } from '../../config';
import { gspBaseUrl } from '../../config';
import { configFor } from './build';
import { GSP_GATEWAYS, SANDBOX_ONLY_GATEWAYS, gspApplication, type GspGatewayName } from './provider-name';

export type GspAvailability = {
  gateway: GspGatewayName;
  /** Whether this deployment can file through it: allowed here, and its URL and application credentials are set. */
  available: boolean;
  /** Why not, for the operator choosing a gateway. */
  reason?: string;
  sandboxOnly: boolean;
};

/**
 * Which gateways a platform operator may choose for a company. A gateway is offered only when a filing through
 * it could work: choosing one the deployment cannot run would leave the company unable to file.
 */
export function gspAvailability(config: Config): GspAvailability[] {
  return GSP_GATEWAYS.map((gateway) => {
    const sandboxOnly = SANDBOX_ONLY_GATEWAYS.includes(gateway);
    const base = { gateway, sandboxOnly };
    if (sandboxOnly && !config.TAXATION_GSTIN_ALLOW_SANDBOX) {
      return { ...base, available: false, reason: 'Sandbox only. This deployment does not allow the sandbox (TAXATION_GSTIN_ALLOW_SANDBOX).' };
    }
    if (!gspBaseUrl(configFor(config, gateway))) {
      return { ...base, available: false, reason: `Not set up here: TAXATION_${gateway.toUpperCase()}_BASE_URL is missing.` };
    }
    const app = gspApplication(config, gateway, gateway === 'whitebooks' ? 'EINVOICE' : 'TAXPAYER');
    if (!app.clientId || !app.clientSecret) return { ...base, available: false, reason: `Not set up here: ${app.variable} is missing.` };
    return { ...base, available: true };
  });
}
