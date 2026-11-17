import type { Config } from '../../config';
import type { ComplianceProvider, ConnectionResult, PortalCredentials, PortalLogins } from '../compliance';
import { buildGateway } from './build';
import { failure, type GspGateway } from './common';
import { GSP_GATEWAYS, LEGACY_ENVIRONMENT, defaultGspTarget, isGspEnvironment, targetKey, type GspGatewayName, type GspTarget } from './provider-name';
import { GspConfigError, type GspTransport } from './transport';

/** A stored choice that names no gateway is no choice: the deployment's default answers instead. */
export function parseGspGateway(value: string | null | undefined): GspGatewayName | undefined {
  return (GSP_GATEWAYS as readonly string[]).includes(value ?? '') ? (value as GspGatewayName) : undefined;
}

/**
 * A company's stored choice as a target, or undefined when it has none (so the deployment's default answers).
 * A gateway with no environment beside it is a choice made before environments existed, and means the gateway's
 * usual one: Whitebooks was only ever the sandbox, Adaequare only ever live.
 */
export function parseGspTarget(provider: string | null | undefined, environment: string | null | undefined): GspTarget | undefined {
  const gateway = parseGspGateway(provider);
  if (!gateway) return undefined;
  return { gateway, environment: isGspEnvironment(environment) ? environment : LEGACY_ENVIRONMENT[gateway] };
}

const unsupported = (what: string) => failure('GSP_UNSUPPORTED', `This GST gateway cannot ${what}`, 'document');

/**
 * Every GSP target this deployment is set up for, behind the one interface the rest of the app uses.
 *
 * A call is routed by the login it carries: `creds.gspGateway` and `creds.gspEnvironment` are the company's own
 * choice (set by a platform operator), and a company with none follows the deployment's default target, so a
 * deployment that never sets a choice behaves exactly as a single gateway. Each target is built the first time it
 * is needed and then kept, so Whitebooks sandbox, Adaequare sandbox and Adaequare production each hold their own
 * base URL, application credentials, tokens and sessions side by side: a sandbox token is never presented to
 * production, nor the reverse.
 *
 * A company whose chosen target this deployment cannot run (its settings are missing) gets a `GSP_NOT_CONFIGURED`
 * refusal. It is never quietly filed through another target, which would send its portal login to a GSP, or a
 * NIC environment, nobody chose for it.
 */
export class GspRouter implements GspGateway {
  readonly name = 'gsp' as const;
  /** The deployment's default target. */
  readonly target: GspTarget;
  /** The deployment's default gateway. */
  readonly gateway: GspGatewayName;
  private readonly built = new Map<string, GspGateway>();

  constructor(
    private readonly config: Config,
    private readonly opts: { transport?: GspTransport; log?: (message: string) => void } = {},
  ) {
    this.target = defaultGspTarget(config);
    this.gateway = this.target.gateway;
    // The default is built now, so a deployment that cannot run it refuses to start rather than on the first filing.
    this.gatewayFor(this.target);
  }

  /** The target a login names, or the deployment's default when it names none. */
  targetOf(creds: Pick<PortalCredentials, 'gspGateway' | 'gspEnvironment'> | null | undefined): GspTarget {
    if (!creds?.gspGateway) return this.target;
    return { gateway: creds.gspGateway, environment: creds.gspEnvironment ?? LEGACY_ENVIRONMENT[creds.gspGateway] };
  }

  /** The gateway for a target, or for the default when none is named. Throws `GspConfigError` when it cannot be run here. */
  gatewayFor(target: GspTarget | GspGatewayName | undefined): GspGateway {
    const wanted = typeof target === 'string' ? { gateway: target, environment: LEGACY_ENVIRONMENT[target] } : (target ?? this.target);
    const key = targetKey(wanted);
    let gateway = this.built.get(key);
    if (!gateway) {
      gateway = buildGateway(this.config, wanted, this.opts);
      this.built.set(key, gateway);
    }
    return gateway;
  }

  /** Runs `call` on the target the login names; a target this deployment cannot run is the failure the caller records. */
  private async via<T>(creds: PortalCredentials | null, call: (gateway: GspGateway) => Promise<T>): Promise<T> {
    let gateway: GspGateway;
    try {
      gateway = this.gatewayFor(this.targetOf(creds));
    } catch (err) {
      if (err instanceof GspConfigError) return failure('GSP_NOT_CONFIGURED', err.message, 'credentials') as T;
      throw err;
    }
    return call(gateway);
  }

  async testConnection(logins: PortalLogins): Promise<ConnectionResult> {
    let gateway: GspGateway;
    try {
      gateway = this.gatewayFor(this.targetOf(logins.einvoice ?? logins.ewaybill));
    } catch (err) {
      if (!(err instanceof GspConfigError)) throw err;
      return { irp: { ok: false, message: err.message }, ewb: { ok: false, message: err.message } };
    }
    return gateway.testConnection(logins);
  }

  submitInvoice(creds: PortalCredentials | null, req: Parameters<ComplianceProvider['submitInvoice']>[1]) {
    return this.via(creds, (g) => g.submitInvoice(creds, req));
  }

  cancelIrn(creds: PortalCredentials | null, req: Parameters<ComplianceProvider['cancelIrn']>[1]) {
    return this.via(creds, (g) => g.cancelIrn(creds, req));
  }

  submitEwayBill(creds: PortalCredentials | null, req: Parameters<ComplianceProvider['submitEwayBill']>[1]) {
    return this.via(creds, (g) => g.submitEwayBill(creds, req));
  }

  updatePartB(creds: PortalCredentials | null, req: Parameters<ComplianceProvider['updatePartB']>[1]) {
    return this.via(creds, (g) => g.updatePartB(creds, req));
  }

  extend(creds: PortalCredentials | null, req: Parameters<ComplianceProvider['extend']>[1]) {
    return this.via(creds, (g) => g.extend(creds, req));
  }

  cancelEwayBill(creds: PortalCredentials | null, req: Parameters<ComplianceProvider['cancelEwayBill']>[1]) {
    return this.via(creds, (g) => g.cancelEwayBill(creds, req));
  }

  /** Whitebooks has no such lookup: the answer is `GSP_UNSUPPORTED`, which recovery reads as it reads a missing method. */
  findEwayBillByDocument(creds: PortalCredentials | null, req: Parameters<NonNullable<ComplianceProvider['findEwayBillByDocument']>>[1]) {
    return this.via(creds, (g) => (g.findEwayBillByDocument ? g.findEwayBillByDocument(creds, req) : Promise.resolve(unsupported('look up an e-way bill by document'))));
  }

  getIrnStatus(creds: PortalCredentials | null, req: Parameters<NonNullable<ComplianceProvider['getIrnStatus']>>[1]) {
    return this.via(creds, (g) => (g.getIrnStatus ? g.getIrnStatus(creds, req) : Promise.resolve(unsupported('look up an IRN'))));
  }

  /**
   * The register is the deployment's, not a company's: there is no login to route by, so the register's own target
   * answers. That is the default target unless `TAXATION_GSTIN_LOOKUP_TARGET` names another (see `lookupTarget`), so
   * a sandbox default does not answer a real signup with a sandbox register's four test taxpayers.
   */
  lookupTaxpayer(gstin: string) {
    return this.gatewayFor(lookupTarget(this.config, this.target)).lookupTaxpayer(gstin);
  }
}

/**
 * Which target answers a GSTIN lookup that belongs to no company (signup, the party form). The default target,
 * unless `TAXATION_GSTIN_LOOKUP_TARGET` (`adaequare:production`, `whitebooks:sandbox`, …) names another and that one
 * can be run. A sandbox register knows a handful of test taxpayers, so a deployment whose default is a sandbox
 * but which has a live gateway set up should point the lookup at it.
 */
export function lookupTarget(config: Pick<Config, 'TAXATION_GSTIN_LOOKUP_TARGET'>, fallback: GspTarget): GspTarget {
  const [gateway, environment] = (config.TAXATION_GSTIN_LOOKUP_TARGET ?? '').split(':');
  const named = parseGspGateway(gateway);
  return named && isGspEnvironment(environment) ? { gateway: named, environment } : fallback;
}
