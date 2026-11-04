// Serves the built console in dist/ for the Railway deploy, with the security headers and
// compression in tools/static-server.mjs.
//
//   VITE_API_URL     the API this build talks to; its origin is the only one scripts may call
//   CSP_REPORT_ONLY  `true` reports Content-Security-Policy violations without blocking
import { fileURLToPath } from 'node:url';
import { contentSecurityPolicy, createStaticServer, originOf, securityHeaders } from '../../tools/static-server.mjs';

const root = fileURLToPath(new URL('./dist', import.meta.url));
const port = Number(process.env.PORT ?? 5174);

const csp = contentSecurityPolicy({ connect: [originOf(process.env.VITE_API_URL)] });
const headers = securityHeaders({ csp, cspReportOnly: process.env.CSP_REPORT_ONLY === 'true' });

createStaticServer({ root, hashedPrefixes: ['/assets/'], headers }).listen(port, '0.0.0.0', () => {
  console.log(`admin listening on :${port}`);
});
