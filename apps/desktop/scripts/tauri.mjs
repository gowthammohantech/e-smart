// Runs the Tauri CLI around the web app's static export (apps/web/dist). A build gets the same
// Content-Security-Policy the Railway deploy serves (tools/static-server.mjs); Tauri adds its own
// IPC origins to it. Dev runs without one so Metro's hot reload can connect.
//
//   EXPO_PUBLIC_API_URL  the API this build talks to, inlined into the bundle by Expo
//   STORAGE_ORIGIN       where uploads go directly (S3 or https://<account>.blob.core.windows.net)
//
// Both are read from the environment, or from apps/web/.env as `expo export` does.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { contentSecurityPolicy, originOf } from '../../../tools/static-server.mjs';

const [command, ...rest] = process.argv.slice(2);

function webEnv(name) {
  if (process.env[name]) return process.env[name];
  try {
    const file = readFileSync(fileURLToPath(new URL('../../web/.env', import.meta.url)), 'utf8');
    return file.match(new RegExp(`^${name}=(.*)$`, 'm'))?.[1].trim();
  } catch {
    return undefined;
  }
}

const args = [command, ...rest];
if (command === 'build') {
  const api = webEnv('EXPO_PUBLIC_API_URL');
  if (!api) {
    console.error('Set EXPO_PUBLIC_API_URL (or apps/web/.env) to the API this build should talk to.');
    process.exit(1);
  }
  console.log(`Desktop build talks to ${api}`);
  const csp = contentSecurityPolicy({ connect: [originOf(api), originOf(webEnv('STORAGE_ORIGIN'))] });
  args.push('--config', JSON.stringify({ app: { security: { csp } } }));
}

const result = spawnSync('tauri', args, { stdio: 'inherit', shell: process.platform === 'win32' });
process.exit(result.status ?? 1);
