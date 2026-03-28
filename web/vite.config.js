import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import wasm from 'vite-plugin-wasm';
import topLevelAwait from 'vite-plugin-top-level-await';
import path from 'path';

export default defineConfig(({ mode }) => ({
  base: mode === 'read_only' ? '/latent-scope/' : '/',
  plugins: [react(), wasm(), topLevelAwait()],
  build: {
    outDir: `dist/${mode}`,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.js'],
    exclude: ['node_modules', 'dist'],
  },
}));
