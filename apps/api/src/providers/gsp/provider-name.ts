/**
 * Which GSP, and which NIC environment, a filing goes through.
 *
 * A GSP sells a sandbox and a production API as two separate products, each with its own base URL and its own
 * application credentials. So a gateway (`adaequare`, `whitebooks`) is only half a choice: the other half is the
 * environment (`sandbox`, `production`). The two together are a `GspTarget`, and everything that is specific to
 * one (URL, credentials, sandbox stand-ins, cached tokens) is looked up by the target.
 *
 * `TAXATION_GSP_PROVIDER_CODE` names the default gateway and `TAXATION_GSP_ENVIRONMENT` its environment. One
 * target picks the e-invoice, e-way bill and taxpayer lookup clients together: an e-way bill by IRN is raised
 * under the session that registered the IRN, so the halves cannot be configured apart and a deployment cannot
 * send one gateway's credentials down the other's routes.
 *
 * Kept free of imports so `config.ts` can use it at boot.
 */
export const GSP_GATEWAYS = ['adaequare', 'whitebooks'] as const;
export type GspGatewayName = (typeof GSP_GATEWAYS)[number];

export const GSP_ENVIRONMENTS = ['sandbox', 'production'] as const;
export type GspEnvironment = (typeof GSP_ENVIRONMENTS)[number];

export type GspTarget = { gateway: GspGatewayName; environment: GspEnvironment };

/** Every target, in the order an operator sees them. Whether one can be used is `gspAvailability`'s question. */
export const GSP_TARGETS: readonly GspTarget[] = [
  { gateway: 'adaequare', environment: 'production' },
  { gateway: 'adaequare', environment: 'sandbox' },
  { gateway: 'whitebooks', environment: 'sandbox' },
  { gateway: 'whitebooks', environment: 'production' },
];

/**
 * The environment a gateway's un-suffixed settings (`TAXATION_ADAEQUARE_BASE_URL`, `TAXATION_WHITEBOOKS_APP_ID`, the
 * un-prefixed `TAXATION_GSP_*`) have always meant: Adaequare was only ever run live, Whitebooks only ever on the
 * sandbox. They keep that meaning, so a deployment set up before environments existed needs no change.
 */
export const LEGACY_ENVIRONMENT: Readonly<Record<GspGatewayName, GspEnvironment>> = { adaequare: 'production', whitebooks: 'sandbox' };

export const targetKey = (target: GspTarget) => `${target.gateway}:${target.environment}`;
export const sameTarget = (a: GspTarget, b: GspTarget) => a.gateway === b.gateway && a.environment === b.environment;
export const isGspEnvironment = (value: unknown): value is GspEnvironment => (GSP_ENVIRONMENTS as readonly unknown[]).includes(value);

/** A bare gateway name (a login stamped before environments existed) is the gateway's legacy environment. */
export const toTarget = (value: GspGatewayName | GspTarget): GspTarget => (typeof value === 'string' ? { gateway: value, environment: LEGACY_ENVIRONMENT[value] } : value);

/** The GSP account code for each gateway, as `TAXATION_GSP_PROVIDER_CODE` spells it. */
export const GSP_GATEWAY_CODES: Readonly<Record<GspGatewayName, string>> = { adaequare: 'ADAEQUARE_GSP', whitebooks: 'WHITE_BOOKS_GSP' };

/** Adaequare, and deliberately so: what an unrecognised provider code falls back to. */
export const DEFAULT_GSP_GATEWAY: GspGatewayName = 'adaequare';

const CODE_ALIASES: Readonly<Record<string, GspGatewayName>> = {
  adaequare: 'adaequare',
  adaequaregsp: 'adaequare',
  whitebooks: 'whitebooks',
  whitebooksgsp: 'whitebooks',
};

/** `WHITE_BOOKS_GSP` and `whitebooks-gsp` are the same word wearing two hats. */
const normalise = (code: string) => code.toLowerCase().replace(/[^a-z]/g, '');

/**
 * `explicit` (`TAXATION_TAXPAYER_PROVIDER`) wins when set, for a deployment
 * whose code names neither gateway. Otherwise the code is read, and an
 * unrecognised one falls back to Adaequare.
 */
export function resolveGspGateway(explicit: string | undefined, providerCode: string): GspGatewayName {
  const named = (explicit ?? '').trim().toLowerCase();
  if (named !== '') {
    if (!(GSP_GATEWAYS as readonly string[]).includes(named)) {
      throw new Error(`TAXATION_TAXPAYER_PROVIDER must be one of ${GSP_GATEWAYS.join(', ')} — got "${explicit ?? ''}".`);
    }
    return named as GspGatewayName;
  }
  return CODE_ALIASES[normalise(providerCode)] ?? DEFAULT_GSP_GATEWAY;
}

/** `explicit` (`TAXATION_GSP_ENVIRONMENT`) when set, otherwise the gateway's legacy environment. */
export function resolveGspEnvironment(explicit: string | undefined, gateway: GspGatewayName): GspEnvironment {
  const named = (explicit ?? '').trim().toLowerCase();
  if (named === '') return LEGACY_ENVIRONMENT[gateway];
  if (!isGspEnvironment(named)) throw new Error(`TAXATION_GSP_ENVIRONMENT must be one of ${GSP_ENVIRONMENTS.join(', ')} — got "${explicit ?? ''}".`);
  return named;
}

type DefaultTargetEnv = { TAXATION_TAXPAYER_PROVIDER: string; TAXATION_GSP_PROVIDER_CODE: string; TAXATION_GSP_ENVIRONMENT: string };

/** The deployment's default target: what a company with no choice of its own files through. */
export function defaultGspTarget(env: DefaultTargetEnv): GspTarget {
  const gateway = resolveGspGateway(env.TAXATION_TAXPAYER_PROVIDER, env.TAXATION_GSP_PROVIDER_CODE);
  return { gateway, environment: resolveGspEnvironment(env.TAXATION_GSP_ENVIRONMENT, gateway) };
}

/**
 * Whitebooks issues a separate application credential pair per product API:
 * GST taxpayer lookup, the e-invoice API (which also raises e-way bills by IRN,
 * on the same taxpayer session), and the standalone e-way bill API. Adaequare
 * has one pair for everything.
 */
export type GspProduct = 'TAXPAYER' | 'EINVOICE' | 'EWAYBILL';

export type GspApplicationEnv = {
  TAXATION_ADAEQUARE_APP_ID: string;
  TAXATION_ADAEQUARE_APP_SECRET: string;
  TAXATION_ADAEQUARE_PRODUCTION_APP_ID: string;
  TAXATION_ADAEQUARE_PRODUCTION_APP_SECRET: string;
  TAXATION_ADAEQUARE_SANDBOX_APP_ID: string;
  TAXATION_ADAEQUARE_SANDBOX_APP_SECRET: string;
  TAXATION_WHITEBOOKS_APP_ID: string;
  TAXATION_WHITEBOOKS_APP_SECRET: string;
  TAXATION_WHITEBOOKS_EINVOICE_APP_ID: string;
  TAXATION_WHITEBOOKS_EINVOICE_APP_SECRET: string;
  TAXATION_WHITEBOOKS_EWAYBILL_APP_ID: string;
  TAXATION_WHITEBOOKS_EWAYBILL_APP_SECRET: string;
  TAXATION_WHITEBOOKS_SANDBOX_APP_ID: string;
  TAXATION_WHITEBOOKS_SANDBOX_APP_SECRET: string;
  TAXATION_WHITEBOOKS_SANDBOX_EINVOICE_APP_ID: string;
  TAXATION_WHITEBOOKS_SANDBOX_EINVOICE_APP_SECRET: string;
  TAXATION_WHITEBOOKS_SANDBOX_EWAYBILL_APP_ID: string;
  TAXATION_WHITEBOOKS_SANDBOX_EWAYBILL_APP_SECRET: string;
  TAXATION_WHITEBOOKS_PRODUCTION_APP_ID: string;
  TAXATION_WHITEBOOKS_PRODUCTION_APP_SECRET: string;
  TAXATION_WHITEBOOKS_PRODUCTION_EINVOICE_APP_ID: string;
  TAXATION_WHITEBOOKS_PRODUCTION_EINVOICE_APP_SECRET: string;
  TAXATION_WHITEBOOKS_PRODUCTION_EWAYBILL_APP_ID: string;
  TAXATION_WHITEBOOKS_PRODUCTION_EWAYBILL_APP_SECRET: string;
  /** The un-prefixed names the platform's taxation service uses; read when a provider-specific one is blank. */
  TAXATION_GSP_APP_ID: string;
  TAXATION_GSP_APP_SECRET: string;
  TAXATION_GSP_EINVOICE_APP_ID: string;
  TAXATION_GSP_EINVOICE_APP_SECRET: string;
  TAXATION_GSP_EWAYBILL_APP_ID: string;
  TAXATION_GSP_EWAYBILL_APP_SECRET: string;
};

export type GspApplication = { clientId: string; clientSecret: string; variable: string };

type Candidate = [id: string, secret: string, variable: string];

/**
 * The application pair for a target and product, read from the environment.
 *
 * Each target has its own variables (`TAXATION_ADAEQUARE_SANDBOX_APP_ID`,
 * `TAXATION_WHITEBOOKS_PRODUCTION_EINVOICE_APP_ID`, …), all set side by side, so choosing a target for a company
 * needs no change to the deployment. For a gateway's legacy environment (see `LEGACY_ENVIRONMENT`) the older
 * un-suffixed variables, and then the un-prefixed `TAXATION_GSP_*` names, are read when the target's own are
 * blank. They are never read for the other environment: a live pair must not stand in for a sandbox one, or the
 * reverse.
 *
 * A pair is taken whole from one source: an id from one and a secret from the
 * other would send the gateway a combination nobody issued.
 */
export function gspApplication(env: GspApplicationEnv, target: GspTarget, product: GspProduct): GspApplication {
  const legacy = target.environment === LEGACY_ENVIRONMENT[target.gateway];
  const sandbox = target.environment === 'sandbox';
  const candidates: Candidate[] = [];

  if (target.gateway === 'adaequare') {
    candidates.push(
      sandbox
        ? [env.TAXATION_ADAEQUARE_SANDBOX_APP_ID, env.TAXATION_ADAEQUARE_SANDBOX_APP_SECRET, 'TAXATION_ADAEQUARE_SANDBOX_APP_ID/_SECRET']
        : [env.TAXATION_ADAEQUARE_PRODUCTION_APP_ID, env.TAXATION_ADAEQUARE_PRODUCTION_APP_SECRET, 'TAXATION_ADAEQUARE_PRODUCTION_APP_ID/_SECRET'],
    );
    if (legacy) {
      candidates.push([env.TAXATION_ADAEQUARE_APP_ID, env.TAXATION_ADAEQUARE_APP_SECRET, 'TAXATION_ADAEQUARE_APP_ID/_SECRET']);
      candidates.push([env.TAXATION_GSP_APP_ID, env.TAXATION_GSP_APP_SECRET, 'TAXATION_GSP_APP_ID/_SECRET']);
    }
  } else {
    const part = product === 'EINVOICE' ? 'EINVOICE_APP' : product === 'EWAYBILL' ? 'EWAYBILL_APP' : 'APP';
    const own: Record<GspProduct, [string, string]> = sandbox
      ? {
          TAXPAYER: [env.TAXATION_WHITEBOOKS_SANDBOX_APP_ID, env.TAXATION_WHITEBOOKS_SANDBOX_APP_SECRET],
          EINVOICE: [env.TAXATION_WHITEBOOKS_SANDBOX_EINVOICE_APP_ID, env.TAXATION_WHITEBOOKS_SANDBOX_EINVOICE_APP_SECRET],
          EWAYBILL: [env.TAXATION_WHITEBOOKS_SANDBOX_EWAYBILL_APP_ID, env.TAXATION_WHITEBOOKS_SANDBOX_EWAYBILL_APP_SECRET],
        }
      : {
          TAXPAYER: [env.TAXATION_WHITEBOOKS_PRODUCTION_APP_ID, env.TAXATION_WHITEBOOKS_PRODUCTION_APP_SECRET],
          EINVOICE: [env.TAXATION_WHITEBOOKS_PRODUCTION_EINVOICE_APP_ID, env.TAXATION_WHITEBOOKS_PRODUCTION_EINVOICE_APP_SECRET],
          EWAYBILL: [env.TAXATION_WHITEBOOKS_PRODUCTION_EWAYBILL_APP_ID, env.TAXATION_WHITEBOOKS_PRODUCTION_EWAYBILL_APP_SECRET],
        };
    candidates.push([...own[product], `TAXATION_WHITEBOOKS_${target.environment.toUpperCase()}_${part}_ID/_SECRET`]);
    if (legacy) {
      const older: Record<GspProduct, [string, string]> = {
        TAXPAYER: [env.TAXATION_WHITEBOOKS_APP_ID, env.TAXATION_WHITEBOOKS_APP_SECRET],
        EINVOICE: [env.TAXATION_WHITEBOOKS_EINVOICE_APP_ID, env.TAXATION_WHITEBOOKS_EINVOICE_APP_SECRET],
        EWAYBILL: [env.TAXATION_WHITEBOOKS_EWAYBILL_APP_ID, env.TAXATION_WHITEBOOKS_EWAYBILL_APP_SECRET],
      };
      const unprefixed: Record<GspProduct, [string, string]> = {
        TAXPAYER: [env.TAXATION_GSP_APP_ID, env.TAXATION_GSP_APP_SECRET],
        EINVOICE: [env.TAXATION_GSP_EINVOICE_APP_ID, env.TAXATION_GSP_EINVOICE_APP_SECRET],
        EWAYBILL: [env.TAXATION_GSP_EWAYBILL_APP_ID, env.TAXATION_GSP_EWAYBILL_APP_SECRET],
      };
      candidates.push([...older[product], `TAXATION_WHITEBOOKS_${part}_ID/_SECRET`]);
      candidates.push([...unprefixed[product], `TAXATION_GSP_${part}_ID/_SECRET`]);
    }
  }

  const set = candidates.find(([id, secret]) => id && secret);
  // Unset: name the target's own variable, which is the one to fill in.
  const [clientId, clientSecret, variable] = set ?? ['', '', candidates[0][2]];
  return { clientId, clientSecret, variable };
}
