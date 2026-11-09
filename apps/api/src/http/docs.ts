import { timingSafeEqual } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { loadSpec } from '@esmart/api-contract/spec';
import type { Deps } from '../context';

/** Pinned to an exact version, so the page can't change under us. */
const SWAGGER_UI = 'https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.17.14';

function same(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Basic credentials match DOCS_USERNAME / DOCS_PASSWORD. Both are checked, so timing says nothing about which failed. */
function authorised(req: FastifyRequest, username: string, password: string): boolean {
  const header = req.headers.authorization;
  if (!header?.startsWith('Basic ')) return false;
  const decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
  const i = decoded.indexOf(':');
  if (i < 0) return false;
  const userOk = same(decoded.slice(0, i), username);
  const passOk = same(decoded.slice(i + 1), password);
  return userOk && passOk;
}

const page = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Elixir Books API</title>
<link rel="stylesheet" href="${SWAGGER_UI}/swagger-ui.css">
</head>
<body>
<div id="ui"></div>
<script src="${SWAGGER_UI}/swagger-ui-bundle.js"></script>
<script>
SwaggerUIBundle({ url: 'docs/openapi.json', dom_id: '#ui', deepLinking: true, persistAuthorization: false, tryItOutEnabled: false });
</script>
</body>
</html>`;

/**
 * Swagger UI for the OpenAPI contract at /docs, and the contract itself at /docs/openapi.json.
 * With DOCS_USERNAME and DOCS_PASSWORD set it asks for them (HTTP Basic); without them it is open
 * outside production and absent in production. "Try it out" calls this same server, with the
 * bearer token the reader pastes into Authorize.
 */
export function registerDocs(app: FastifyInstance, deps: Deps) {
  const { DOCS_USERNAME: username, DOCS_PASSWORD: password, NODE_ENV } = deps.config;
  const locked = Boolean(username && password);
  if (!locked && NODE_ENV === 'production') return;

  // The spec names placeholder hosts; point "Try it out" at whichever host served the page.
  const spec = { ...loadSpec(), servers: [{ url: '/v1', description: 'This server' }] };
  const json = JSON.stringify(spec);

  const guard = async (req: FastifyRequest, reply: FastifyReply) => {
    void reply.header('cache-control', 'no-store').header('x-robots-tag', 'noindex, nofollow').header('referrer-policy', 'no-referrer');
    if (locked && !authorised(req, username!, password!)) {
      return reply.status(401).header('www-authenticate', 'Basic realm="Elixir Books API docs", charset="UTF-8"').send({ code: 'UNAUTHORIZED', message: 'Docs need a username and password' });
    }
  };
  const rateLimit = { max: 60, timeWindow: '1 minute', keyGenerator: (req: FastifyRequest) => `docs:${req.ip}` };

  app.get('/docs', { onRequest: guard, config: { rateLimit } }, async (_req, reply) =>
    reply
      .type('text/html; charset=utf-8')
      .header('content-security-policy', `default-src 'none'; script-src ${SWAGGER_UI}/ 'unsafe-inline'; style-src ${SWAGGER_UI}/ 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'`)
      .send(page),
  );
  app.get('/docs/openapi.json', { onRequest: guard, config: { rateLimit } }, async (_req, reply) => reply.type('application/json').send(json));
}
