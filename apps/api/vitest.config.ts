import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globalSetup: ['./test/global-setup.ts'],
    // One database per run, truncated between tests: files run one at a time.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 120_000,
    include: ['test/**/*.test.ts', 'src/**/*.test.ts'],
  },
});
