import type { Config } from '../../config';
import { gspBaseUrl, gspBaseUrlVariable } from '../../config';
import { configFor } from './build';
import { GSP_TARGETS, gspApplication, type GspTarget } from './provider-name';

export type GspAvailability = GspTarget & {
  /** Whether this deployment can file through it: its base URL and application credentials are set. */
  available: boolean;
  /** Why not, for the operator choosing a target. */
  reason?: string;
};

/**
 * Whether this deployment files through a GSP and has any sandbox target it can run. NIC's sandbox test GSTINs
 * (which have no valid check digit) are admitted by the GSTIN validator only then; a deployment that cannot reach a
 * sandbox keeps the strict rule.
 */
export function sandboxTargetAvailable(config: Config): boolean {
  if (config.COMPLIANCE_PROVIDER !== 'gsp' && config.GSTIN_PROVIDER !== 'gsp') return false;
  return gspAvailability(config).some((t) => t.environment === 'sandbox' && t.available);
}

/**
 * Which targets a platform operator may choose for a company. A target is offered only when a filing through it
 * could work: choosing one the deployment cannot run would leave the company unable to file. There is no
 * hard-coded list of what is switched on: a target becomes selectable the moment its settings are filled in
 * (Whitebooks production, once there is a subscription), with no code change.
 */
export function gspAvailability(config: Config): GspAvailability[] {
  return GSP_TARGETS.map((target) => {
    const base = { gateway: target.gateway, environment: target.environment };
    if (!gspBaseUrl(configFor(config, target), target)) {
      return { ...base, available: false, reason: `Not set up here: ${gspBaseUrlVariable(target)} is missing.` };
    }
    const app = gspApplication(config, target, target.gateway === 'whitebooks' ? 'EINVOICE' : 'TAXPAYER');
    if (!app.clientId || !app.clientSecret) return { ...base, available: false, reason: `Not set up here: ${app.variable} is missing.` };
    return { ...base, available: true };
  });
}
