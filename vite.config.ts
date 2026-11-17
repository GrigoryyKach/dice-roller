/// <reference types="vitest/config" />
import { defineConfig } from 'vite';

// Tauri expects the dev server on a fixed port.
export default defineConfig({
  clearScreen: false,
  server: { port: 1421, strictPort: true, watch: { ignored: ['**/src-tauri/**'] } },
  build: { target: 'es2022', outDir: 'dist', emptyOutDir: true, chunkSizeWarningLimit: 6000 },
  test: { include: ['src/**/*.test.ts'], environment: 'node', testTimeout: 120000 },
});
