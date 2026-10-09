// Serves the static export in dist/ for the Railway deploy. The export is a
// single-page app (web.output: "single"), so any path that is not a file falls
// back to index.html and expo-router resolves the route in the browser.
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('./dist', import.meta.url));
const port = Number(process.env.PORT ?? 8080);

const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

async function resolveFile(urlPath) {
  const path = normalize(join(root, decodeURIComponent(urlPath)));
  if (path !== root && !path.startsWith(root + sep)) return null;
  try {
    const info = await stat(path);
    if (info.isFile()) return path;
  } catch {
    // Not a file: fall through to the SPA fallback.
  }
  return null;
}

createServer(async (req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { Allow: 'GET, HEAD' }).end();
    return;
  }
  const urlPath = new URL(req.url ?? '/', 'http://localhost').pathname;
  if (urlPath === '/health') {
    res.writeHead(200, { 'Content-Type': 'text/plain' }).end('ok');
    return;
  }
  const file = (await resolveFile(urlPath)) ?? join(root, 'index.html');
  const hashed = urlPath.startsWith('/_expo/') || urlPath.startsWith('/assets/');
  res.writeHead(200, {
    'Content-Type': types[extname(file)] ?? 'application/octet-stream',
    'Cache-Control': hashed ? 'public, max-age=31536000, immutable' : 'no-cache',
  });
  if (req.method === 'HEAD') res.end();
  else createReadStream(file).pipe(res);
}).listen(port, () => {
  console.log(`web listening on :${port}`);
});
