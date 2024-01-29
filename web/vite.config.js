import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
const mode = process.env.MODE || 'development';
// import wasm from 'vite-plugin-wasm'
// import topLevelAwait from "vite-plugin-top-level-await";
export default defineConfig(({ mode }) => ({
  base: mode === 'read_only' ? '/latent-scope/' : '/',
  plugins: [react()],
  build: {
    outDir: `dist/${mode}`,
  },
}));
