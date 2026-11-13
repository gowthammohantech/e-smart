import type { Config } from '../../config';
import type { ComplianceProvider, ConnectionResult, PortalCredentials, PortalLogins } from '../compliance';
import { buildGateway } from './build';
import { failure, type GspGateway } from './common';
import { GSP_GATEWAYS, resolveGspGateway, type GspGatewayName } from './provider-name';
import { GspConfigError, type GspTransport } from './transport';

/** A stored choice that names no gateway is no choice: the deployment's default answers instead. */
export function parseGspGateway(value: string | null | undefined): GspGatewayName | undefined {
  return (GSP_GATEWAYS as readonly string[]).includes(value ?? '') ? (value as GspGatewayName) : undefined;
}

const unsupported = (what: string) => failure('GSP_UNSUPPORTED', `This GST gateway cannot ${what}`, 'document');

/**
 * Every GSP gateway this deployment is set up for, behind the one interface the rest of the app uses.
 *
 * A call is routed by the login it carries: `creds.gspGateway` is the company's own choice (set by a platform
 * operator), and a company with none follows the deployment's default (`TAXATION_GSP_PROVIDER_CODE`), so a
 * deployment that never sets a choice behaves exactly as a single gateway. Each gateway is built the first time
 * it is needed and then kept, so Whitebooks and Adaequare each hold their own tokens and sessions side by side.
 *
 * A company whose chosen gateway this deployment cannot run (the sandbox switch is off, or its settings are
 * missing) gets a `GSP_NOT_CONFIGURED` refusal. It is never quietly filed through the other gateway, which
 * would send its portal login to a GSP nobody chose for it.
 */
export class GspRouter implements GspGateway {
  readonly name = 'gsp' as const;
  /** The deployment's default gateway. */
  readonly gateway: GspGatewayName;
  private readonly built = new Map<GspGatewayName, GspGateway>();

  constructor(
    private readonly config: Config,
    private readonly opts: { transport?: GspTransport; log?: (message: string) => void } = {},
  ) {
    this.gateway = resolveGspGateway(config.TAXATION_TAXPAYER_PROVIDER, config.TAXATION_GSP_PROVIDER_CODE);
    // The default is built now, so a deployment that cannot run it refuses to start rather than on the first filing.
    this.gatewayFor(this.gateway);
  }

  /** The named gateway, or the default when none is named. Throws `GspConfigError` when it cannot be run here. */
  gatewayFor(name: GspGatewayName | undefined): GspGateway {
    const wanted = name ?? this.gateway;
    let gateway = this.built.get(wanted);
    if (!gateway) {
      gateway = buildGateway(this.config, wanted, this.opts);
      this.built.set(wanted, gateway);
    }
    return gateway;
  }

  /** Runs `call` on the gateway the login names; a gateway this deployment cannot run is the failure the caller records. */
  private async via<T>(creds: PortalCredentials | null, call: (gateway: GspGateway) => Promise<T>): Promise<T> {
    let gateway: GspGateway;
    try {
      gateway = this.gatewayFor(creds?.gspGateway);
    } catch (err) {
      if (err instanceof GspConfigError) return failure('GSP_NOT_CONFIGURED', err.message, 'credentials') as T;
      throw err;
    }
    return call(gateway);
  }

  async testConnection(logins: PortalLogins): Promise<ConnectionResult> {
    let gateway: GspGateway;
    try {
      gateway = this.gatewayFor((logins.einvoice ?? logins.ewaybill)?.gspGateway);
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

  /** The register is the deployment's, not a company's: there is no login to route by, so the default answers. */
  lookupTaxpayer(gstin: string) {
    return this.gatewayFor(undefined).lookupTaxpayer(gstin);
  }
}
