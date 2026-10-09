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
    // Schema and reference data, applied between build and deploy. Idempotent:
    // Drizzle skips migrations already in drizzle.__drizzle_migrations.
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
      CORS_ORIGINS: '*',
      // Secrets stay in Railway: set once, never committed here.
      DATABASE_URL: preserve(),
      JWT_SECRET: preserve(),
      CREDENTIALS_KEY: preserve(),
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
      EXPO_PUBLIC_DATA_SOURCE: 'remote',
      EXPO_PUBLIC_API_URL: 'https://api-production-4abd.up.railway.app',
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
    },
  });

  return project('e-smart', { resources: [api, web, admin] });
});
