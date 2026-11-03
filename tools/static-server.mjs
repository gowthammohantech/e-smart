// The static server behind the web app and the admin console on Railway. Both are single-page apps:
// a path that is no file gets index.html and the client router takes over, except under the
// fingerprinted asset folders, where a missing file is a real 404 (a stale tab asking for an old
// bundle must not be handed HTML as JavaScript).
import { createReadStream } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, normalize, sep } from 'node:path';
import { promisify } from 'node:util';
import { brotliCompress, constants, gzip } from 'node:zlib';

const brotli = promisify(brotliCompress);
const gz = promisify(gzip);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.css': 'text/css; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

/** Worth compressing: text. Images and fonts are compressed already. */
const COMPRESSIBLE = new Set(['.html', '.js', '.mjs', '.json', '.map', '.css', '.svg', '.txt', '.webmanifest', '.ttf', '.otf']);

/** `https://api.example.in/v1` → `https://api.example.in`; anything unparseable is dropped. */
export function originOf(url) {
  if (!url) return null;
  try {
    return new URL(url).origin;
  } catch {
    return /^https:\/\/\*\.[a-z0-9.-]+$/i.test(url) ? url : null;
  }
}

/**
 * The page's Content-Security-Policy. Scripts only from this origin; styles may be inline because
 * react-native-web and the chart library write style tags at runtime. `connect` lists the API and,
 * for direct uploads, the storage account.
 */
export function contentSecurityPolicy({ connect = [], images = [] } = {}) {
  const extra = (list) => list.filter(Boolean).join(' ');
  return [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob: ${extra([...connect, ...images])}`.trim(),
    "font-src 'self' data:",
    `connect-src 'self' ${extra(connect)}`.trim(),
    "frame-src 'self' blob:",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ');
}

export function securityHeaders({ csp, cspReportOnly = false, camera = false }) {
  return {
    [cspReportOnly ? 'Content-Security-Policy-Report-Only' : 'Content-Security-Policy']: csp,
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': `camera=(${camera ? 'self' : ''}), microphone=(), geolocation=(), payment=()`,
    'Cross-Origin-Opener-Policy': 'same-origin',
  };
}

/** Picks the best encoding the browser takes. */
export function pickEncoding(acceptEncoding = '') {
  const accepted = String(acceptEncoding).toLowerCase();
  if (/\bbr\b/.test(accepted)) return 'br';
  if (/\bgzip\b/.test(accepted)) return 'gzip';
  return null;
}

/**
 * @param {{ root: string, port?: number, hashedPrefixes?: string[], headers: Record<string, string>, log?: (m: string) => void }} opts
 */
export function createStaticServer({ root, hashedPrefixes = [], headers, log = console.log }) {
  // Each file is compressed once per encoding; the bundles don't change while the process runs.
  const compressed = new Map();

  async function resolveFile(urlPath) {
    let decoded;
    try {
      decoded = decodeURIComponent(urlPath);
    } catch {
      return null;
    }
    const path = normalize(join(root, decoded));
    if (path !== root && !path.startsWith(root + sep)) return null;
    try {
      const info = await stat(path);
      if (info.isFile()) return { path, size: info.size };
    } catch {
      // Not a file.
    }
    return null;
  }

  async function body(path, encoding) {
    const key = `${encoding}:${path}`;
    let hit = compressed.get(key);
    if (!hit) {
      const raw = await readFile(path);
      // Quality 5 compresses a 5 MB bundle in well under a second; 11 takes many.
      hit = encoding === 'br' ? brotli(raw, { params: { [constants.BROTLI_PARAM_QUALITY]: 5 } }) : gz(raw);
      compressed.set(key, hit);
      hit.catch(() => compressed.delete(key));
    }
    return hit;
  }

  return createServer(async (req, res) => {
    try {
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.writeHead(405, { Allow: 'GET, HEAD', ...headers }).end();
        return;
      }
      const urlPath = new URL(req.url ?? '/', 'http://localhost').pathname;
      if (urlPath === '/health') {
        res.writeHead(200, { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' }).end('ok');
        return;
      }
      const hashed = hashedPrefixes.some((p) => urlPath.startsWith(p));
      let file = await resolveFile(urlPath);
      if (!file && hashed) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', ...headers }).end('Not found');
        return;
      }
      // Single-page app: the client router resolves every other path.
      file ??= await resolveFile('/index.html');
      if (!file) {
        res.writeHead(500, { 'Content-Type': 'text/plain' }).end('index.html is missing: build the app first');
        return;
      }
      const ext = extname(file.path).toLowerCase();
      const encoding = COMPRESSIBLE.has(ext) && file.size > 1024 ? pickEncoding(req.headers['accept-encoding']) : null;
      const common = {
        'Content-Type': TYPES[ext] ?? 'application/octet-stream',
        'Cache-Control': hashed ? 'public, max-age=31536000, immutable' : 'no-cache',
        Vary: 'Accept-Encoding',
        ...headers,
      };
      if (encoding) {
        const data = await body(file.path, encoding);
        res.writeHead(200, { ...common, 'Content-Encoding': encoding, 'Content-Length': data.length });
        res.end(req.method === 'HEAD' ? undefined : data);
        return;
      }
      res.writeHead(200, { ...common, 'Content-Length': file.size });
      if (req.method === 'HEAD') res.end();
      else createReadStream(file.path).pipe(res);
    } catch (err) {
      log(`static server error: ${err instanceof Error ? err.message : String(err)}`);
      if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end();
    }
  });
}
