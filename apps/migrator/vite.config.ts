import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// Tauri loads this app from a fixed port in development and from dist/ in a build.
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: { port: 5175, strictPort: true },
  preview: { port: 5175 },
  build: { target: 'es2022', chunkSizeWarningLimit: 1500 },
  test: { environment: 'node', include: ['src/**/*.test.{ts,tsx}'] },
});
