import { z } from 'zod';
import { SANDBOX_ONLY_GATEWAYS, gspApplication, resolveGspGateway } from './providers/gsp/provider-name';

const bool = z
  .enum(['true', 'false', '1', '0'])
  .transform((v) => v === 'true' || v === '1');

/**
 * Every setting the server reads, validated once at boot. Providers default
 * to in-process simulators, so `npm run dev` works with nothing but Postgres;
 * production must switch each one to a real adapter, and refuses to start
 * until it has (see `productionProblems`).
 */
const Env = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().int().default(4000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  DATABASE_URL: z.string().default('postgres://esmart:esmart@localhost:5432/esmart'),
  /** Where the API is reachable from outside; used in share links and upload URLs. */
  PUBLIC_BASE_URL: z.string().default('http://localhost:4000'),
  /** The web app, for links people open: password resets and invitations. */
  APP_URL: z.string().default('http://localhost:8081'),
  /** Comma-separated origins allowed by CORS. `*` in development. */
  CORS_ORIGINS: z.string().default('*'),

  JWT_SECRET: z.string().min(32).default('dev-only-secret-change-me-dev-only-secret'),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().default(900),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().default(30),
  /** 32-byte key, base64, for AES-256-GCM on stored portal credentials. */
  CREDENTIALS_KEY: z.string().default(Buffer.alloc(32, 7).toString('base64')),
  /** Accept `123456` as the OTP, as the prototype does. Never in production. */
  DEMO_OTP: bool.default(false),
  /**
   * Start in production even while providers are still simulators, log-only or
   * unconfigured: those problems are logged as warnings instead. The secrets
   * and DEMO_OTP checks still refuse to start. A stopgap until every provider
   * is set up; remove it from the environment once they are.
   */
  ALLOW_UNCONFIGURED_PROVIDERS: bool.default(false),
  /**
   * Comma-separated phone numbers that always get the code `123456` and are never sent an SMS or
   * WhatsApp, whatever DEMO_OTP says. For test accounts on a live deployment. Compared by last 10 digits.
   */
  TEST_OTP_PHONES: z
    .string()
    .default('')
    .transform((v) => v.split(',').map((p) => p.replace(/\D/g, '').slice(-10)).filter(Boolean)),
  RATE_LIMIT_PER_MINUTE: z.coerce.number().int().default(300),

  SMS_PROVIDER: z.enum(['log', 'msg91', 'pay4sms']).default('log'),
  MSG91_AUTH_KEY: z.string().optional(),
  MSG91_TEMPLATE_ID: z.string().optional(),
  /** The only Pay4SMS secret; sender, template and URL are fixed in providers/pay4sms.ts. */
  PAY4SMS_TOKEN: z.string().optional(),
  EMAIL_PROVIDER: z.enum(['log', 'resend', 'ses', 'acs']).default('log'),
  /** Resend: an API key from resend.com/api-keys. EMAIL_FROM must be on a domain verified there. */
  RESEND_API_KEY: z.string().optional(),
  /** Azure Communication Services: `endpoint=https://…;accesskey=…`. */
  ACS_CONNECTION_STRING: z.string().optional(),
  EMAIL_FROM: z.string().default('Elixir Books <no-reply@elixirbooks.example>'),
  /** Optional: where replies to our emails go (works with Resend and Azure). */
  EMAIL_REPLY_TO: z.string().email().optional(),
  WHATSAPP_PROVIDER: z.enum(['log', 'meta']).default('log'),
  WHATSAPP_TOKEN: z.string().optional(),
  WHATSAPP_PHONE_NUMBER_ID: z.string().optional(),
  WHATSAPP_WEBHOOK_SECRET: z.string().default('dev-whatsapp-secret'),
  PUSH_PROVIDER: z.enum(['log', 'expo']).default('log'),

  STORAGE_PROVIDER: z.enum(['memory', 's3', 'azure']).default('memory'),
  /** Needs the account key: SAS upload and download links are signed with it. */
  AZURE_STORAGE_CONNECTION_STRING: z.string().optional(),
  AZURE_STORAGE_CONTAINER: z.string().default('esmart'),
  S3_BUCKET: z.string().default('esmart'),
  S3_REGION: z.string().default('ap-south-1'),
  S3_ENDPOINT: z.string().optional(),
  S3_FORCE_PATH_STYLE: bool.default(false),

  PDF_PROVIDER: z.enum(['stub', 'chromium']).default('stub'),
  CHROMIUM_PATH: z.string().optional(),

  COMPLIANCE_PROVIDER: z.enum(['simulator', 'gsp']).default('simulator'),
  /** Legacy name for `TAXATION_GSP_BASE_URL`; the latter wins when both are set. */
  GSP_BASE_URL: z.string().optional(),

  // GSP gateway (Adaequare / Whitebooks) for e-invoice, e-way bill and GSTIN
  // lookup. Names match the Elixir Books platform's taxation service, so the
  // same values drop in. Read when COMPLIANCE_PROVIDER or GSTIN_PROVIDER is `gsp`.
  /** The GSP account: `ADAEQUARE_GSP` or `WHITE_BOOKS_GSP`. Picks the gateway client too. */
  TAXATION_GSP_PROVIDER_CODE: z.string().min(1).default('ADAEQUARE_GSP'),
  /** `adaequare` or `whitebooks`. Blank (normal) reads the code above. Whitebooks needs TAXATION_GSTIN_ALLOW_SANDBOX=true. */
  TAXATION_TAXPAYER_PROVIDER: z.string().default(''),
  /** The gateway's base URL, e.g. https://gsp.adaequare.com/test/ or https://apisandbox.whitebooks.in */
  TAXATION_GSP_BASE_URL: z.string().optional(),
  /** Whitebooks only: the GSP account email, sent as `?email=`. */
  TAXATION_GSP_ACCOUNT_EMAIL: z.string().default(''),
  /** Whitebooks only: the public IP this server files from, as registered with the GSP. */
  TAXATION_GSP_IP_ADDRESS: z.string().default(''),
  /** `false` skips the GSP token exchange, for stand-in gateways that mint nothing. Needs TAXATION_GSTIN_ALLOW_SANDBOX=true. */
  TAXATION_GSP_AUTH_REQUIRED: bool.default(true),
  /**
   * The one switch for NIC's sandbox. `true` admits the sandbox GSTIN shape (`29AAGCB1286Q000`) and is what allows
   * the sandbox-only settings: the Whitebooks gateway, TAXATION_SANDBOX_BUYER_GSTIN and TAXATION_GSP_AUTH_REQUIRED=false.
   * It is the deployment's own choice, whatever NODE_ENV says: leave it `false` on a live deployment.
   */
  TAXATION_GSTIN_ALLOW_SANDBOX: bool.default(false),
  /** Sandbox only: file every e-invoice against this buyer, looked up from NIC's register. Whitebooks only; needs TAXATION_GSTIN_ALLOW_SANDBOX=true. */
  TAXATION_SANDBOX_BUYER_GSTIN: z.string().trim().toUpperCase().default(''),
  /** Adaequare's only pair, and Whitebooks' GST taxpayer lookup pair. */
  TAXATION_GSP_APP_ID: z.string().trim().default(''),
  TAXATION_GSP_APP_SECRET: z.string().trim().default(''),
  /** Whitebooks: the e-invoice API pair (IRN generate/cancel, e-way bill by IRN). */
  TAXATION_GSP_EINVOICE_APP_ID: z.string().trim().default(''),
  TAXATION_GSP_EINVOICE_APP_SECRET: z.string().trim().default(''),
  /** Whitebooks: the standalone e-way bill API pair. */
  TAXATION_GSP_EWAYBILL_APP_ID: z.string().trim().default(''),
  TAXATION_GSP_EWAYBILL_APP_SECRET: z.string().trim().default(''),

  // Per-provider settings. Fill in every provider you may use, side by side:
  // switching GSP is then the one TAXATION_GSP_PROVIDER_CODE change. The
  // un-prefixed TAXATION_GSP_* values above are the fallback when one is blank.
  TAXATION_ADAEQUARE_BASE_URL: z.string().trim().default(''),
  TAXATION_ADAEQUARE_APP_ID: z.string().trim().default(''),
  TAXATION_ADAEQUARE_APP_SECRET: z.string().trim().default(''),
  TAXATION_WHITEBOOKS_BASE_URL: z.string().trim().default(''),
  TAXATION_WHITEBOOKS_ACCOUNT_EMAIL: z.string().trim().default(''),
  TAXATION_WHITEBOOKS_IP_ADDRESS: z.string().trim().default(''),
  /** Whitebooks' GST taxpayer lookup pair. */
  TAXATION_WHITEBOOKS_APP_ID: z.string().trim().default(''),
  TAXATION_WHITEBOOKS_APP_SECRET: z.string().trim().default(''),
  TAXATION_WHITEBOOKS_EINVOICE_APP_ID: z.string().trim().default(''),
  TAXATION_WHITEBOOKS_EINVOICE_APP_SECRET: z.string().trim().default(''),
  TAXATION_WHITEBOOKS_EWAYBILL_APP_ID: z.string().trim().default(''),
  TAXATION_WHITEBOOKS_EWAYBILL_APP_SECRET: z.string().trim().default(''),
  /** `disabled` answers 503 FEATURE_UNAVAILABLE; the one choice production has until a GSP adapter exists. */
  GSTIN_PROVIDER: z.enum(['simulator', 'disabled', 'gsp']).default('simulator'),
  /** `disabled` parses text the device read, and answers 503 for an image alone. */
  OCR_PROVIDER: z.enum(['simulator', 'disabled', 'document-ai']).default('simulator'),
  FX_PROVIDER: z.enum(['static', 'openexchangerates']).default('static'),
  OPENEXCHANGERATES_APP_ID: z.string().optional(),

  PAYMENTS_PROVIDER: z.enum(['simulator', 'razorpay']).default('simulator'),
  RAZORPAY_KEY_ID: z.string().optional(),
  RAZORPAY_KEY_SECRET: z.string().optional(),
  RAZORPAY_WEBHOOK_SECRET: z.string().default('dev-razorpay-secret'),

  /** The model behind Lixi. The simulator needs no key and no network. */
  ASSISTANT_PROVIDER: z.enum(['simulator', 'anthropic']).default('simulator'),
  ANTHROPIC_API_KEY: z.string().optional(),
  LIXI_MODEL: z.string().default('claude-opus-5-5'),
  LIXI_EFFORT: z.enum(['low', 'medium', 'high', 'xhigh', 'max']).default('low'),
  LIXI_MAX_TOOL_ROUNDS: z.coerce.number().int().min(1).max(20).default(8),
  /** Lixi questions per user per minute; each one can cost several model calls. */
  LIXI_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().default(20),
}).superRefine((env, ctx) => {
  if (env.SMS_PROVIDER === 'pay4sms' && !env.PAY4SMS_TOKEN?.trim()) {
    ctx.addIssue({ code: 'custom', path: ['PAY4SMS_TOKEN'], message: 'PAY4SMS_TOKEN must be set for SMS_PROVIDER=pay4sms.' });
  }
  // A half-set pair would send a blank secret to the gateway and fail with a 401 that names nothing.
  for (const prefix of ['TAXATION_GSP_APP', 'TAXATION_GSP_EINVOICE_APP', 'TAXATION_GSP_EWAYBILL_APP', 'TAXATION_ADAEQUARE_APP', 'TAXATION_WHITEBOOKS_APP', 'TAXATION_WHITEBOOKS_EINVOICE_APP', 'TAXATION_WHITEBOOKS_EWAYBILL_APP'] as const) {
    const id = env[`${prefix}_ID`];
    const secret = env[`${prefix}_SECRET`];
    if ((id === '') !== (secret === '')) {
      ctx.addIssue({ code: 'custom', path: [`${prefix}_${id === '' ? 'ID' : 'SECRET'}`], message: `${prefix}_ID and ${prefix}_SECRET must be set together.` });
    }
  }
  try {
    resolveGspGateway(env.TAXATION_TAXPAYER_PROVIDER, env.TAXATION_GSP_PROVIDER_CODE);
  } catch (err) {
    ctx.addIssue({ code: 'custom', path: ['TAXATION_TAXPAYER_PROVIDER'], message: (err as Error).message });
  }
  // The sandbox-only settings are allowed by TAXATION_GSTIN_ALLOW_SANDBOX and by nothing else, in any NODE_ENV.
  for (const message of sandboxProblems(env)) ctx.addIssue({ code: 'custom', path: ['TAXATION_GSTIN_ALLOW_SANDBOX'], message });
});

export type Config = z.infer<typeof Env>;

/** Dev defaults that must never reach production. */
const DEV_WEBHOOK_SECRETS = { RAZORPAY_WEBHOOK_SECRET: 'dev-razorpay-secret', WHATSAPP_WEBHOOK_SECRET: 'dev-whatsapp-secret' } as const;
const EXAMPLE_EMAIL_FROM = 'Elixir Books <no-reply@elixirbooks.example>';

/**
 * Everything that keeps a config from running in production: simulators and
 * log-only providers, a selected provider without its credentials, dev
 * secrets, and open CORS. Empty when the config is fit for production.
 */
export function productionProblems(config: Config, env: Record<string, string | undefined>): string[] {
  const problems: string[] = [];
  const need = (when: boolean, message: string) => {
    if (when) problems.push(message);
  };

  need(config.JWT_SECRET.startsWith('dev-only'), 'JWT_SECRET must be set in production.');
  need(config.DEMO_OTP, 'DEMO_OTP must be off in production.');
  need(env.CREDENTIALS_KEY === undefined, 'CREDENTIALS_KEY must be set in production.');
  need(config.CORS_ORIGINS.split(',').some((o) => o.trim() === '*'), "CORS_ORIGINS='*' is not allowed in production; list the web and admin origins.");

  // Simulators and log-only providers.
  for (const key of ['SMS_PROVIDER', 'EMAIL_PROVIDER', 'WHATSAPP_PROVIDER', 'PUSH_PROVIDER'] as const) {
    need(config[key] === 'log', `${key}=log only writes to the log; choose a real provider in production.`);
  }
  need(config.PDF_PROVIDER === 'stub', 'PDF_PROVIDER=stub renders placeholder PDFs; use chromium in production.');
  for (const key of ['COMPLIANCE_PROVIDER', 'PAYMENTS_PROVIDER', 'ASSISTANT_PROVIDER', 'GSTIN_PROVIDER', 'OCR_PROVIDER'] as const) {
    need(config[key] === 'simulator', `${key}=simulator is for development and tests; choose a real provider${key === 'GSTIN_PROVIDER' || key === 'OCR_PROVIDER' ? ' or disabled' : ''} in production.`);
  }
  need(config.FX_PROVIDER === 'static', 'FX_PROVIDER=static serves fixed rates; use openexchangerates in production.');
  need(config.STORAGE_PROVIDER === 'memory', 'STORAGE_PROVIDER=memory loses uploads on restart; use azure or s3 in production.');

  // Credentials for the providers that were chosen.
  need(config.SMS_PROVIDER === 'msg91' && (!config.MSG91_AUTH_KEY || !config.MSG91_TEMPLATE_ID), 'MSG91_AUTH_KEY and MSG91_TEMPLATE_ID must be set for SMS_PROVIDER=msg91.');
  need(config.EMAIL_PROVIDER === 'resend' && !config.RESEND_API_KEY, 'RESEND_API_KEY must be set for EMAIL_PROVIDER=resend.');
  need(config.EMAIL_PROVIDER === 'acs' && !config.ACS_CONNECTION_STRING, 'ACS_CONNECTION_STRING must be set for EMAIL_PROVIDER=acs.');
  need(
    config.EMAIL_PROVIDER === 'acs' && !!config.ACS_CONNECTION_STRING && !/endpoint=https?:\/\/[^;]+;\s*accesskey=.+/i.test(config.ACS_CONNECTION_STRING),
    'ACS_CONNECTION_STRING must look like endpoint=https://<resource>.communication.azure.com/;accesskey=<key> (copy it from the Keys page of the Azure resource).',
  );
  need(
    config.EMAIL_PROVIDER === 'ses' && !((env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY) || env.AWS_WEB_IDENTITY_TOKEN_FILE || env.AWS_PROFILE),
    'AWS credentials (AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY, or a role) must be set for EMAIL_PROVIDER=ses.',
  );
  need(config.EMAIL_PROVIDER !== 'log' && config.EMAIL_FROM === EXAMPLE_EMAIL_FROM, 'EMAIL_FROM must be a verified sender in production, not the example address.');
  need(config.WHATSAPP_PROVIDER === 'meta' && (!config.WHATSAPP_TOKEN || !config.WHATSAPP_PHONE_NUMBER_ID), 'WHATSAPP_TOKEN and WHATSAPP_PHONE_NUMBER_ID must be set for WHATSAPP_PROVIDER=meta.');
  need(config.STORAGE_PROVIDER === 'azure' && !config.AZURE_STORAGE_CONNECTION_STRING, 'AZURE_STORAGE_CONNECTION_STRING must be set for STORAGE_PROVIDER=azure.');
  problems.push(...gspProblems(config));
  need(config.PAYMENTS_PROVIDER === 'razorpay' && (!config.RAZORPAY_KEY_ID || !config.RAZORPAY_KEY_SECRET), 'RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET must be set for PAYMENTS_PROVIDER=razorpay.');
  need(config.FX_PROVIDER === 'openexchangerates' && !config.OPENEXCHANGERATES_APP_ID, 'OPENEXCHANGERATES_APP_ID must be set for FX_PROVIDER=openexchangerates.');
  need(config.ASSISTANT_PROVIDER === 'anthropic' && !config.ANTHROPIC_API_KEY, 'ANTHROPIC_API_KEY must be set for ASSISTANT_PROVIDER=anthropic.');

  // Webhook secrets still at their development defaults.
  for (const [key, dev] of Object.entries(DEV_WEBHOOK_SECRETS) as [keyof typeof DEV_WEBHOOK_SECRETS, string][]) {
    need(config[key] === dev, `${key} is still the development default; set the secret from the provider's dashboard.`);
  }
  return problems;
}

/**
 * The settings that only make sense against NIC's sandbox, each refused unless `TAXATION_GSTIN_ALLOW_SANDBOX=true`.
 * That flag is the deployment's own declaration that it files against the sandbox, so none of this looks at
 * `NODE_ENV`: a hosted staging deployment may run with NODE_ENV=production and still use Whitebooks.
 */
function sandboxProblems(env: {
  COMPLIANCE_PROVIDER: string;
  GSTIN_PROVIDER: string;
  TAXATION_GSTIN_ALLOW_SANDBOX: boolean;
  TAXATION_SANDBOX_BUYER_GSTIN: string;
  TAXATION_GSP_AUTH_REQUIRED: boolean;
  TAXATION_TAXPAYER_PROVIDER: string;
  TAXATION_GSP_PROVIDER_CODE: string;
}): string[] {
  if (env.TAXATION_GSTIN_ALLOW_SANDBOX) return [];
  const problems: string[] = [];
  const usesGsp = env.COMPLIANCE_PROVIDER === 'gsp' || env.GSTIN_PROVIDER === 'gsp';
  try {
    const gateway = resolveGspGateway(env.TAXATION_TAXPAYER_PROVIDER, env.TAXATION_GSP_PROVIDER_CODE);
    if (usesGsp && SANDBOX_ONLY_GATEWAYS.includes(gateway)) {
      problems.push(`The "${gateway}" gateway is sandbox only: set TAXATION_GSTIN_ALLOW_SANDBOX=true to use it, or point TAXATION_GSP_PROVIDER_CODE at a production gateway.`);
    }
  } catch {
    // An unknown gateway name is reported on its own, above.
  }
  if (env.TAXATION_SANDBOX_BUYER_GSTIN) problems.push('TAXATION_SANDBOX_BUYER_GSTIN files every e-invoice against a test buyer: it needs TAXATION_GSTIN_ALLOW_SANDBOX=true.');
  if (!env.TAXATION_GSP_AUTH_REQUIRED) problems.push('TAXATION_GSP_AUTH_REQUIRED=false is for stand-in test gateways: it needs TAXATION_GSTIN_ALLOW_SANDBOX=true.');
  return problems;
}

/** The GSP gateway settings a production `gsp` provider needs. The sandbox-only ones are `sandboxProblems`. */
function gspProblems(config: Config): string[] {
  const problems: string[] = [];
  const uses = config.COMPLIANCE_PROVIDER === 'gsp' || config.GSTIN_PROVIDER === 'gsp';
  if (!uses) return problems;
  const gateway = resolveGspGateway(config.TAXATION_TAXPAYER_PROVIDER, config.TAXATION_GSP_PROVIDER_CODE);
  if (!gspBaseUrl(config)) problems.push(`TAXATION_${gateway.toUpperCase()}_BASE_URL (or TAXATION_GSP_BASE_URL) must be set for COMPLIANCE_PROVIDER=gsp or GSTIN_PROVIDER=gsp.`);
  const app = gspApplication(config, gateway, config.COMPLIANCE_PROVIDER === 'gsp' && gateway === 'whitebooks' ? 'EINVOICE' : 'TAXPAYER');
  if (!app.clientId || !app.clientSecret) problems.push(`${app.variable} must be set for the ${gateway} gateway.`);
  return problems;
}

/**
 * The selected gateway's base URL: its own variable first, then
 * `TAXATION_GSP_BASE_URL`, then the older `GSP_BASE_URL`.
 */
export function gspBaseUrl(
  config: Pick<Config, 'TAXATION_GSP_BASE_URL' | 'GSP_BASE_URL' | 'TAXATION_ADAEQUARE_BASE_URL' | 'TAXATION_WHITEBOOKS_BASE_URL' | 'TAXATION_TAXPAYER_PROVIDER' | 'TAXATION_GSP_PROVIDER_CODE'>,
): string | undefined {
  const own =
    resolveGspGateway(config.TAXATION_TAXPAYER_PROVIDER, config.TAXATION_GSP_PROVIDER_CODE) === 'whitebooks'
      ? config.TAXATION_WHITEBOOKS_BASE_URL
      : config.TAXATION_ADAEQUARE_BASE_URL;
  return own.trim() || config.TAXATION_GSP_BASE_URL?.trim() || config.GSP_BASE_URL?.trim() || undefined;
}

/** Whitebooks' account email and registered IP: its own variable first, then the un-prefixed one. */
export function whitebooksSettings(
  config: Pick<Config, 'TAXATION_WHITEBOOKS_ACCOUNT_EMAIL' | 'TAXATION_WHITEBOOKS_IP_ADDRESS' | 'TAXATION_GSP_ACCOUNT_EMAIL' | 'TAXATION_GSP_IP_ADDRESS'>,
) {
  return {
    email: (config.TAXATION_WHITEBOOKS_ACCOUNT_EMAIL || config.TAXATION_GSP_ACCOUNT_EMAIL).trim(),
    ipAddress: (config.TAXATION_WHITEBOOKS_IP_ADDRESS || config.TAXATION_GSP_IP_ADDRESS).trim(),
  };
}

/** Problems ALLOW_UNCONFIGURED_PROVIDERS never waives: forged tokens, readable credentials, a guessable OTP. */
const ALWAYS_FATAL = /^(JWT_SECRET|CREDENTIALS_KEY|DEMO_OTP)\b/;

export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const config = Env.parse(env);
  if (config.NODE_ENV === 'production') {
    let problems = productionProblems(config, env);
    if (config.ALLOW_UNCONFIGURED_PROVIDERS) {
      const waived = problems.filter((p) => !ALWAYS_FATAL.test(p));
      if (waived.length) console.warn(`ALLOW_UNCONFIGURED_PROVIDERS: starting in production with:\n- ${waived.join('\n- ')}`);
      problems = problems.filter((p) => ALWAYS_FATAL.test(p));
    }
    if (problems.length) throw new Error(`Refusing to start in production:\n- ${problems.join('\n- ')}`);
  }
  return config;
}
