import { defineRailway, preserve, project, service } from 'railway/iac';

/**
 * The API service. The monorepo deploys from the repository root, because
 * apps/api resolves its workspace dependencies — and openapi.yaml, which the
 * contract loads at runtime — through the npm workspace symlinks.
 *
 * The install stays Railpack's default. Narrowing it with RAILPACK_INSTALL_CMD
 * skips the corepack setup that root package.json's `packageManager` field
 * asks for, and the image export then fails on a missing /opt/corepack.
 */
/**
 * Every service builds with Railpack. The Dockerfile for local Docker runs stays
 * in docker/: at the repository root Railway builds it whatever this says, and its
 * last stage (the admin static server) has no package.json to start from.
 */
const railpack = (buildCommand: string) => ({ builder: 'RAILPACK' as const, buildCommand });

export default defineRailway((ctx) => {
  /**
   * Production's addresses are fixed here. Any other environment (staging, demo) sets its own in
   * Railway, so a staging deploy never points its links or its web build at production's API.
   */
  const production = !ctx.isEnvironment('staging') && !ctx.isEnvironment('demo');
  const live = (value: string) => (production ? value : preserve());

  /** The API's settings, shared by the worker: both run the same code against the same database. */
  const apiEnv = {
    NODE_ENV: 'production',
    LOG_LEVEL: 'info',
    // The slim runtime image has no fonts, so headless Chromium prints Tamil
    // (labels, and names typed in Tamil on English documents) as empty boxes.
    // fonts-noto-core carries Noto Sans Tamil alongside the Latin faces.
    RAILPACK_DEPLOY_APT_PACKAGES: 'fonts-noto-core',
    PUBLIC_BASE_URL: live('https://api-production-4abd.up.railway.app'),
    // The web app, for the links people open: password resets and invites.
    // The API refuses to start in production with a localhost or http:// value here.
    APP_URL: live('https://smart.elixir-books.com'),
    // Production refuses '*': list the web and admin origins in Railway.
    CORS_ORIGINS: preserve(),
    // Secrets stay in Railway: set once, never committed here.
    // Row-level security (docs/database/rls.md): DATABASE_URL is the request role (esmart_app),
    // SYSTEM_DATABASE_URL the BYPASSRLS role (esmart_system), MIGRATION_DATABASE_URL the owner.
    // db:roles sets the two roles' passwords from APP_DB_PASSWORD / SYSTEM_DB_PASSWORD.
    DATABASE_URL: preserve(),
    SYSTEM_DATABASE_URL: preserve(),
    MIGRATION_DATABASE_URL: preserve(),
    APP_DB_PASSWORD: preserve(),
    SYSTEM_DB_PASSWORD: preserve(),
    RLS_ENFORCE: preserve(),
    JWT_SECRET: preserve(),
    CREDENTIALS_KEY: preserve(),
    // Production refuses every simulator and log-only provider: each one is
    // chosen, with its credentials, in Railway (see apps/api/.env.example
    // and docs/PRODUCTION_READINESS.md for the checklist).
    SMS_PROVIDER: preserve(),
    EMAIL_PROVIDER: preserve(),
    WHATSAPP_PROVIDER: preserve(),
    PUSH_PROVIDER: preserve(),
    STORAGE_PROVIDER: preserve(),
    PDF_PROVIDER: preserve(),
    COMPLIANCE_PROVIDER: preserve(),
    GSTIN_PROVIDER: preserve(),
    // The GSP gateway for COMPLIANCE_PROVIDER / GSTIN_PROVIDER = gsp. Production
    // is Adaequare; the sandbox-only switches are refused there, so none is listed.
    TAXATION_GSP_PROVIDER_CODE: preserve(),
    TAXATION_ADAEQUARE_BASE_URL: preserve(),
    TAXATION_ADAEQUARE_APP_ID: preserve(),
    TAXATION_ADAEQUARE_APP_SECRET: preserve(),
    // A staging deployment that files against NIC's sandbox through Whitebooks opts in with
    // TAXATION_GSTIN_ALLOW_SANDBOX; the live deployment leaves all of these unset.
    TAXATION_GSTIN_ALLOW_SANDBOX: preserve(),
    TAXATION_SANDBOX_BUYER_GSTIN: preserve(),
    TAXATION_WHITEBOOKS_BASE_URL: preserve(),
    TAXATION_WHITEBOOKS_ACCOUNT_EMAIL: preserve(),
    TAXATION_WHITEBOOKS_IP_ADDRESS: preserve(),
    TAXATION_WHITEBOOKS_APP_ID: preserve(),
    TAXATION_WHITEBOOKS_APP_SECRET: preserve(),
    TAXATION_WHITEBOOKS_EINVOICE_APP_ID: preserve(),
    TAXATION_WHITEBOOKS_EINVOICE_APP_SECRET: preserve(),
    TAXATION_WHITEBOOKS_EWAYBILL_APP_ID: preserve(),
    TAXATION_WHITEBOOKS_EWAYBILL_APP_SECRET: preserve(),
    OCR_PROVIDER: preserve(),
    FX_PROVIDER: preserve(),
    PAYMENTS_PROVIDER: preserve(),
    // Lixi's model: anthropic, or any OpenAI-compatible server (see apps/api/.env.example).
    ASSISTANT_PROVIDER: preserve(),
    LIXI_MODEL: preserve(),
    LIXI_SECONDARY_MODEL: preserve(),
    ANTHROPIC_API_KEY: preserve(),
    OPENAI_BASE_URL: preserve(),
    OPENAI_API_KEY: preserve(),
    OPENAI_RESPONSE_FORMAT: preserve(),
    OPENAI_REASONING_EFFORT: preserve(),
    // The demo account (packages/db/src/seed.ts). Unset unless this
    // environment is a demo: SEED_DEMO_ACCOUNT=true and a strong password.
    SEED_DEMO_ACCOUNT: preserve(),
    DEMO_ACCOUNT_EMAIL: preserve(),
    DEMO_ACCOUNT_PASSWORD: preserve(),
  };

  const api = service('api', {
    build: railpack('npm run build -w @esmart/api'),
    start: 'npm run start -w @esmart/api',
    // Schema and reference data, applied between build and deploy, then the
    // demo account when SEED_DEMO_ACCOUNT=true. Idempotent: Drizzle skips
    // migrations already applied, and an existing demo account is left alone.
    // Then the app's database roles and their grants, on every table including new ones.
    preDeploy: 'npm run db:migrate -w @esmart/db && npm run db:roles -w @esmart/db',
    healthcheck: '/health',
    healthcheckTimeout: 120,
    env: {
      ...apiEnv,
      // Jobs run here until the worker service below has its variables; then set this to 'off'
      // in Railway so long exports and PDFs never compete with requests.
      WORKER: preserve(),
    },
  });

  /**
   * Background jobs (apps/api/src/jobs): the same build with WORKER=only, so it serves only /health.
   * Railway starts a new service without the API's secrets: copy them over (Shared Variables) before
   * relying on it. Migrations stay with the API's preDeploy.
   */
  const worker = service('worker', {
    build: railpack('npm run build -w @esmart/api'),
    start: 'npm run start -w @esmart/api',
    healthcheck: '/health',
    env: {
      ...apiEnv,
      WORKER: 'only',
      WORKER_CONCURRENCY: '4',
    },
  });

  /**
   * The web app: Expo's static single-page export, served by apps/web/serve.mjs.
   * EXPO_PUBLIC_* values are inlined into the bundle at build time, so a change
   * to them needs a rebuild, not just a restart.
   */
  const web = service('web', {
    build: railpack('npm run build -w @esmart/web'),
    start: 'npm run serve -w @esmart/web',
    healthcheck: '/health',
    env: {
      NODE_ENV: 'production',
      EXPO_PUBLIC_API_URL: live('https://api-production-4abd.up.railway.app'),
      // Sign-in prefill, compiled into the bundle where anyone can read it.
      // Unset unless this is a demo deployment.
      EXPO_PUBLIC_DEMO_LOGIN_EMAIL: preserve(),
      EXPO_PUBLIC_DEMO_LOGIN_PASSWORD: preserve(),
      // Read by serve.mjs at runtime for the Content-Security-Policy: where uploads go directly
      // (https://<account>.blob.core.windows.net or the S3 endpoint).
      STORAGE_ORIGIN: preserve(),
      // `true` reports policy violations in the browser console without blocking. Start here; set
      // it to `false` once invoices, uploads, PDFs and printing were checked on the deployed site.
      CSP_REPORT_ONLY: 'true',
    },
  });

  /**
   * The platform admin console: a static Vite build, served by apps/admin/serve.mjs
   * with an SPA fallback. VITE_API_URL is read at build time, so changing it needs a
   * rebuild, not just a restart.
   */
  const admin = service('admin', {
    build: railpack('npm run build -w @esmart/admin'),
    start: 'npm run start -w @esmart/admin',
    healthcheck: '/health',
    env: {
      NODE_ENV: 'production',
      VITE_API_URL: live('https://api-production-4abd.up.railway.app'),
      // Sign-in prefill, compiled into the bundle. Unset unless this is a demo deployment.
      VITE_DEMO_LOGIN_EMAIL: preserve(),
      VITE_DEMO_LOGIN_PASSWORD: preserve(),
      // See the web service: report first, enforce once checked.
      CSP_REPORT_ONLY: 'true',
    },
  });

  /**
   * The marketing site: a static Next.js export in apps/site/out, served
   * by sirv. It reads no API and has no secrets. The NEXT_PUBLIC_* links
   * are compiled in at build time, so changing one needs a rebuild.
   */
  const site = service('site', {
    build: railpack('npm run build -w @esmart/site'),
    start: 'npm run start -w @esmart/site',
    healthcheck: '/',
    env: {
      NODE_ENV: 'production',
      NEXT_PUBLIC_WEB_APP_URL: live('https://smart.elixir-books.com/sign-in'),
      NEXT_PUBLIC_APP_STORE_URL: 'https://apps.apple.com/in/app/elixir-books-smart/id6822206449',
      NEXT_PUBLIC_PLAY_STORE_URL: 'https://play.google.com/store/apps/details?id=com.elixir.bookssmart',
    },
  });

  return project('e-smart', { resources: [api, worker, web, admin, site] });
});
