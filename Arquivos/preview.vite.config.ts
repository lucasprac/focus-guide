import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { resolve } from 'node:path';

export default defineConfig({
  root: resolve(__dirname, 'src/renderer'),
  plugins: [react(), tailwindcss()],
  resolve: { alias: { 'node:crypto': resolve(__dirname, 'src/renderer/src/preview-crypto.ts') } },
  server: { host: '127.0.0.1', port: 4173, strictPort: true },
  define: { 'import.meta.env.FOCUS_GUIDE_PREVIEW': 'true' }
});
