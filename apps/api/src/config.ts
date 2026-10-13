import { z } from 'zod';

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
  RATE_LIMIT_PER_MINUTE: z.coerce.number().int().default(300),

  SMS_PROVIDER: z.enum(['log', 'msg91', 'pay4sms']).default('log'),
  MSG91_AUTH_KEY: z.string().optional(),
  MSG91_TEMPLATE_ID: z.string().optional(),
  /** The only Pay4SMS secret; sender, template and URL are fixed in providers/pay4sms.ts. */
  PAY4SMS_TOKEN: z.string().optional(),
  EMAIL_PROVIDER: z.enum(['log', 'ses', 'acs']).default('log'),
  /** Azure Communication Services: `endpoint=https://…;accesskey=…`. */
  ACS_CONNECTION_STRING: z.string().optional(),
  EMAIL_FROM: z.string().default('Elixir Books <no-reply@elixirbooks.example>'),
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
  GSP_BASE_URL: z.string().optional(),
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
  need(config.EMAIL_PROVIDER === 'acs' && !config.ACS_CONNECTION_STRING, 'ACS_CONNECTION_STRING must be set for EMAIL_PROVIDER=acs.');
  need(
    config.EMAIL_PROVIDER === 'ses' && !((env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY) || env.AWS_WEB_IDENTITY_TOKEN_FILE || env.AWS_PROFILE),
    'AWS credentials (AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY, or a role) must be set for EMAIL_PROVIDER=ses.',
  );
  need(config.EMAIL_PROVIDER !== 'log' && config.EMAIL_FROM === EXAMPLE_EMAIL_FROM, 'EMAIL_FROM must be a verified sender in production, not the example address.');
  need(config.WHATSAPP_PROVIDER === 'meta' && (!config.WHATSAPP_TOKEN || !config.WHATSAPP_PHONE_NUMBER_ID), 'WHATSAPP_TOKEN and WHATSAPP_PHONE_NUMBER_ID must be set for WHATSAPP_PROVIDER=meta.');
  need(config.STORAGE_PROVIDER === 'azure' && !config.AZURE_STORAGE_CONNECTION_STRING, 'AZURE_STORAGE_CONNECTION_STRING must be set for STORAGE_PROVIDER=azure.');
  need(config.COMPLIANCE_PROVIDER === 'gsp' && !config.GSP_BASE_URL, 'GSP_BASE_URL must be set for COMPLIANCE_PROVIDER=gsp.');
  need(config.PAYMENTS_PROVIDER === 'razorpay' && (!config.RAZORPAY_KEY_ID || !config.RAZORPAY_KEY_SECRET), 'RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET must be set for PAYMENTS_PROVIDER=razorpay.');
  need(config.FX_PROVIDER === 'openexchangerates' && !config.OPENEXCHANGERATES_APP_ID, 'OPENEXCHANGERATES_APP_ID must be set for FX_PROVIDER=openexchangerates.');
  need(config.ASSISTANT_PROVIDER === 'anthropic' && !config.ANTHROPIC_API_KEY, 'ANTHROPIC_API_KEY must be set for ASSISTANT_PROVIDER=anthropic.');

  // Webhook secrets still at their development defaults.
  for (const [key, dev] of Object.entries(DEV_WEBHOOK_SECRETS) as [keyof typeof DEV_WEBHOOK_SECRETS, string][]) {
    need(config[key] === dev, `${key} is still the development default; set the secret from the provider's dashboard.`);
  }
  return problems;
}

export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const config = Env.parse(env);
  if (config.NODE_ENV === 'production') {
    const problems = productionProblems(config, env);
    if (problems.length) throw new Error(`Refusing to start in production:\n- ${problems.join('\n- ')}`);
  }
  return config;
}
