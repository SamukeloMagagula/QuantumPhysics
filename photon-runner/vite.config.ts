/// <reference types="vitest/config" />
import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  server: {
    port: 3100,
    host: '0.0.0.0',
    proxy: {
      '/api': {
        // API_PORT lets the browser tests run their own API beside a dev server.
        target: `http://localhost:${process.env.API_PORT ?? 8787}`,
        changeOrigin: true,
        // The campus floor's WebSocket (/api/floor/ws) rides the same proxy.
        ws: true,
      },
    },
  },
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
    // A second copy of `three` pulled in by a dependency would break
    // `instanceof` checks across the boundary. One copy, always.
    dedupe: ['three'],
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setupStorage.ts'],
    // Browser tests in e2e/ belong to Playwright.
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
