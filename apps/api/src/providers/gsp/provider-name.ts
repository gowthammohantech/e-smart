/**
 * Which GSP a deployment talks to.
 *
 * `TAXATION_GSP_PROVIDER_CODE` names the GSP account (`ADAEQUARE_GSP`,
 * `WHITE_BOOKS_GSP`) and one value picks the e-invoice, e-way bill and taxpayer
 * lookup clients together: an e-way bill by IRN is raised under the session that
 * registered the IRN, so the halves cannot be configured apart and a deployment
 * cannot send one gateway's credentials down the other's routes.
 *
 * Kept free of imports so `config.ts` can use it at boot.
 */
export const GSP_GATEWAYS = ['adaequare', 'whitebooks'] as const;
export type GspGatewayName = (typeof GSP_GATEWAYS)[number];

/** Adaequare, and deliberately so: the one gateway with a production entitlement. */
export const DEFAULT_GSP_GATEWAY: GspGatewayName = 'adaequare';

/** Whitebooks is sandbox only: refused at boot unless `TAXATION_GSTIN_ALLOW_SANDBOX=true`. */
export const SANDBOX_ONLY_GATEWAYS: readonly GspGatewayName[] = ['whitebooks'];

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
  TAXATION_WHITEBOOKS_APP_ID: string;
  TAXATION_WHITEBOOKS_APP_SECRET: string;
  TAXATION_WHITEBOOKS_EINVOICE_APP_ID: string;
  TAXATION_WHITEBOOKS_EINVOICE_APP_SECRET: string;
  TAXATION_WHITEBOOKS_EWAYBILL_APP_ID: string;
  TAXATION_WHITEBOOKS_EWAYBILL_APP_SECRET: string;
  /** The un-prefixed names the platform's taxation service uses; read when a provider-specific one is blank. */
  TAXATION_GSP_APP_ID: string;
  TAXATION_GSP_APP_SECRET: string;
  TAXATION_GSP_EINVOICE_APP_ID: string;
  TAXATION_GSP_EINVOICE_APP_SECRET: string;
  TAXATION_GSP_EWAYBILL_APP_ID: string;
  TAXATION_GSP_EWAYBILL_APP_SECRET: string;
};

export type GspApplication = { clientId: string; clientSecret: string; variable: string };

/**
 * The application pair for a product, read from the environment.
 *
 * Every provider keeps its own variables (`TAXATION_ADAEQUARE_*`,
 * `TAXATION_WHITEBOOKS_*`), all of them set side by side, so switching GSP is
 * the one `TAXATION_GSP_PROVIDER_CODE` change. The un-prefixed `TAXATION_GSP_*`
 * names are the fallback for a pair its provider-specific variable leaves blank.
 *
 * A pair is taken whole from one source: an id from one and a secret from the
 * other would send the gateway a combination nobody issued.
 */
export function gspApplication(env: GspApplicationEnv, gateway: GspGatewayName, product: GspProduct): GspApplication {
  const candidates: [string, string, string][] =
    gateway === 'adaequare'
      ? [
          [env.TAXATION_ADAEQUARE_APP_ID, env.TAXATION_ADAEQUARE_APP_SECRET, 'TAXATION_ADAEQUARE_APP_ID/_SECRET'],
          [env.TAXATION_GSP_APP_ID, env.TAXATION_GSP_APP_SECRET, 'TAXATION_GSP_APP_ID/_SECRET'],
        ]
      : product === 'EINVOICE'
        ? [
            [env.TAXATION_WHITEBOOKS_EINVOICE_APP_ID, env.TAXATION_WHITEBOOKS_EINVOICE_APP_SECRET, 'TAXATION_WHITEBOOKS_EINVOICE_APP_ID/_SECRET'],
            [env.TAXATION_GSP_EINVOICE_APP_ID, env.TAXATION_GSP_EINVOICE_APP_SECRET, 'TAXATION_GSP_EINVOICE_APP_ID/_SECRET'],
          ]
        : product === 'EWAYBILL'
          ? [
              [env.TAXATION_WHITEBOOKS_EWAYBILL_APP_ID, env.TAXATION_WHITEBOOKS_EWAYBILL_APP_SECRET, 'TAXATION_WHITEBOOKS_EWAYBILL_APP_ID/_SECRET'],
              [env.TAXATION_GSP_EWAYBILL_APP_ID, env.TAXATION_GSP_EWAYBILL_APP_SECRET, 'TAXATION_GSP_EWAYBILL_APP_ID/_SECRET'],
            ]
          : [
              [env.TAXATION_WHITEBOOKS_APP_ID, env.TAXATION_WHITEBOOKS_APP_SECRET, 'TAXATION_WHITEBOOKS_APP_ID/_SECRET'],
              [env.TAXATION_GSP_APP_ID, env.TAXATION_GSP_APP_SECRET, 'TAXATION_GSP_APP_ID/_SECRET'],
            ];
  const set = candidates.find(([id, secret]) => id && secret);
  // Unset: name the provider-specific variable, which is the one to fill in.
  const [clientId, clientSecret, variable] = set ?? ['', '', candidates[0][2]];
  return { clientId, clientSecret, variable };
}
