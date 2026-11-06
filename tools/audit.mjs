// npm run audit: fails on any high or critical advisory in production dependencies, except those
// listed below. Each allowance says why and when it goes; review the list at every Expo SDK upgrade.
import { execFileSync } from 'node:child_process';

/**
 * Installed paths whose advisories are accepted for now. Only fixable by a major Expo SDK upgrade
 * (the advisories name expo@51 / expo-router@58 as the "fix", which are downgrades). Build tooling
 * and the app's router: none of it runs on the API server.
 */
const ALLOWED = [
  'node_modules/expo/', // @expo/cli and its own zod copy: the dev and build CLI
  'node_modules/@expo/',
  'node_modules/expo-router',
  'node_modules/query-string', // via expo-router
  'node_modules/decode-uri-component', // via query-string
];

let report;
try {
  report = execFileSync('npm', ['audit', '--omit=dev', '--json'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
} catch (err) {
  // npm audit exits non-zero when it finds anything; the JSON is still on stdout.
  report = err.stdout;
}
const { vulnerabilities = {} } = JSON.parse(report);
const serious = Object.entries(vulnerabilities).filter(([, v]) => v.severity === 'high' || v.severity === 'critical');
const blocking = serious.filter(([, v]) => !(v.nodes ?? []).every((n) => ALLOWED.some((a) => n.startsWith(a))));

for (const [name, v] of serious) console.log(`${blocking.some(([n]) => n === name) ? 'BLOCKS ' : 'allowed'}  ${v.severity.padEnd(8)} ${name}  (${(v.nodes ?? []).join(', ')})`);
if (blocking.length) {
  console.error(`\n${blocking.length} high or critical advisories in production dependencies. Fix them (npm audit fix), or, if only a major upgrade fixes one that never runs on the server, add it to tools/audit.mjs with the reason.`);
  process.exit(1);
}
console.log(`\nNo blocking advisories (${serious.length} allowed).`);
