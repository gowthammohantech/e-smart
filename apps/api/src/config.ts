import { z } from 'zod';

const bool = z
  .enum(['true', 'false', '1', '0'])
  .transform((v) => v === 'true' || v === '1');

/**
 * Every setting the server reads, validated once at boot. Providers default
 * to in-process simulators, so `npm run dev` works with nothing but Postgres;
 * production switches each one to a real adapter.
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

  SMS_PROVIDER: z.enum(['log', 'msg91']).default('log'),
  MSG91_AUTH_KEY: z.string().optional(),
  MSG91_TEMPLATE_ID: z.string().optional(),
  EMAIL_PROVIDER: z.enum(['log', 'ses']).default('log'),
  EMAIL_FROM: z.string().default('Elixir Books <no-reply@elixirbooks.example>'),
  WHATSAPP_PROVIDER: z.enum(['log', 'meta']).default('log'),
  WHATSAPP_TOKEN: z.string().optional(),
  WHATSAPP_PHONE_NUMBER_ID: z.string().optional(),
  WHATSAPP_WEBHOOK_SECRET: z.string().default('dev-whatsapp-secret'),
  PUSH_PROVIDER: z.enum(['log', 'expo']).default('log'),

  STORAGE_PROVIDER: z.enum(['memory', 's3']).default('memory'),
  S3_BUCKET: z.string().default('esmart'),
  S3_REGION: z.string().default('ap-south-1'),
  S3_ENDPOINT: z.string().optional(),
  S3_FORCE_PATH_STYLE: bool.default(false),

  PDF_PROVIDER: z.enum(['stub', 'chromium']).default('stub'),
  CHROMIUM_PATH: z.string().optional(),

  COMPLIANCE_PROVIDER: z.enum(['simulator', 'gsp']).default('simulator'),
  GSP_BASE_URL: z.string().optional(),
  GSTIN_PROVIDER: z.enum(['simulator', 'gsp']).default('simulator'),
  OCR_PROVIDER: z.enum(['simulator', 'document-ai']).default('simulator'),
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
});

export type Config = z.infer<typeof Env>;

export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const config = Env.parse(env);
  if (config.NODE_ENV === 'production') {
    if (config.JWT_SECRET.startsWith('dev-only')) throw new Error('JWT_SECRET must be set in production.');
    if (config.DEMO_OTP) throw new Error('DEMO_OTP must be off in production.');
    if (env.CREDENTIALS_KEY === undefined) throw new Error('CREDENTIALS_KEY must be set in production.');
    if (config.ASSISTANT_PROVIDER === 'anthropic' && !config.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY must be set for ASSISTANT_PROVIDER=anthropic.');
  }
  return config;
}
