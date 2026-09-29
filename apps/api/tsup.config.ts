import { defineConfig } from 'tsup';

// One ESM bundle. Workspace packages ship TypeScript source, so they are
// bundled in; npm dependencies stay external and install as usual.
export default defineConfig({
  entry: ['src/server.ts'],
  format: ['esm'],
  platform: 'node',
  target: 'node22',
  sourcemap: true,
  clean: true,
  skipNodeModulesBundle: true,
  noExternal: [/^@esmart\//],
});
