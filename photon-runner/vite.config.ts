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
        target: 'http://localhost:8787',
        changeOrigin: true,
      },
    },
  },
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
    // troika-three-text resolves `three` itself, which can pull a second copy
    // into the bundle — Three.js warns about this, and it genuinely breaks
    // `instanceof` checks across the boundary (a Mesh from one copy isn't a
    // Mesh to the other). One copy, always.
    dedupe: ['three'],
  },
  test: {
    environment: 'jsdom',
  },
});
