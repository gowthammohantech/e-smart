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
export default defineRailway(() => {
  const api = service('api', {
    build: 'npm run build -w @esmart/api',
    start: 'npm run start -w @esmart/api',
    // Schema and reference data, applied between build and deploy, then the
    // demo account when SEED_DEMO_ACCOUNT=true. Idempotent: Drizzle skips
    // migrations already applied, and an existing demo account is left alone.
    preDeploy: 'npm run db:migrate -w @esmart/db',
    healthcheck: '/health',
    healthcheckTimeout: 120,
    env: {
      NODE_ENV: 'production',
      LOG_LEVEL: 'info',
      PUBLIC_BASE_URL: 'https://api-production-4abd.up.railway.app',
      // The web app, for the links people open: password resets and invites.
      // Point this at the deployed web app once it has a URL.
      APP_URL: 'http://localhost:8081',
      // Production refuses '*': list the web and admin origins in Railway.
      CORS_ORIGINS: preserve(),
      // Secrets stay in Railway: set once, never committed here.
      DATABASE_URL: preserve(),
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
      ASSISTANT_PROVIDER: preserve(),
      // The demo account (packages/db/src/seed.ts). Unset unless this
      // environment is a demo: SEED_DEMO_ACCOUNT=true and a strong password.
      SEED_DEMO_ACCOUNT: preserve(),
      DEMO_ACCOUNT_EMAIL: preserve(),
      DEMO_ACCOUNT_PASSWORD: preserve(),
    },
  });

  /**
   * The web app: Expo's static single-page export, served by apps/web/serve.mjs.
   * EXPO_PUBLIC_* values are inlined into the bundle at build time, so a change
   * to them needs a rebuild, not just a restart.
   */
  const web = service('web', {
    build: 'npm run build -w @esmart/web',
    start: 'npm run serve -w @esmart/web',
    healthcheck: '/health',
    env: {
      NODE_ENV: 'production',
      EXPO_PUBLIC_API_URL: 'https://api-production-4abd.up.railway.app',
      // Sign-in prefill, compiled into the bundle where anyone can read it.
      // Unset unless this is a demo deployment.
      EXPO_PUBLIC_DEMO_LOGIN_EMAIL: preserve(),
      EXPO_PUBLIC_DEMO_LOGIN_PASSWORD: preserve(),
    },
  });

  /**
   * The platform admin console: a static Vite build, served with an SPA
   * fallback. VITE_API_URL is read at build time, so changing it needs a
   * rebuild, not just a restart.
   */
  const admin = service('admin', {
    build: 'npm run build -w @esmart/admin',
    start: 'npm run start -w @esmart/admin',
    healthcheck: '/',
    env: {
      NODE_ENV: 'production',
      VITE_API_URL: 'https://api-production-4abd.up.railway.app',
      // Sign-in prefill, compiled into the bundle. Unset unless this is a demo deployment.
      VITE_DEMO_LOGIN_EMAIL: preserve(),
      VITE_DEMO_LOGIN_PASSWORD: preserve(),
    },
  });

  return project('e-smart', { resources: [api, web, admin] });
});
