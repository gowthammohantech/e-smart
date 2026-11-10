// Serves the static export in dist/ for the Railway deploy, with the security headers and
// compression in tools/static-server.mjs. The export is a single-page app (web.output: "single").
//
//   EXPO_PUBLIC_API_URL  the API this build talks to; its origin is the only one scripts may call
//   STORAGE_ORIGIN       where uploads go directly (S3 or https://<account>.blob.core.windows.net)
//   EXPO_PUBLIC_POSTHOG_HOST  product analytics (PostHog EU unless set); allowed only when a
//                        EXPO_PUBLIC_POSTHOG_KEY is set, as the app sends nothing without one
//   CSP_REPORT_ONLY      `true` reports Content-Security-Policy violations in the console without
//                        blocking: for checking a new policy before enforcing it
import { fileURLToPath } from 'node:url';
import { contentSecurityPolicy, createStaticServer, originOf, securityHeaders } from '../../tools/static-server.mjs';

const root = fileURLToPath(new URL('./dist', import.meta.url));
const port = Number(process.env.PORT ?? 8080);

const analytics = process.env.EXPO_PUBLIC_POSTHOG_KEY?.trim() ? originOf(process.env.EXPO_PUBLIC_POSTHOG_HOST?.trim() || 'https://eu.i.posthog.com') : undefined;
const csp = contentSecurityPolicy({ connect: [originOf(process.env.EXPO_PUBLIC_API_URL), originOf(process.env.STORAGE_ORIGIN), analytics] });
// The camera is for scanning barcodes and bills on the page.
const headers = securityHeaders({ csp, cspReportOnly: process.env.CSP_REPORT_ONLY === 'true', camera: true });

createStaticServer({ root, hashedPrefixes: ['/_expo/', '/assets/'], headers }).listen(port, () => {
  console.log(`web listening on :${port}`);
});
