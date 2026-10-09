import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Two builds from one codebase:
//   npm run dev / npm run build      → the full designer workspace (runs on your computer)
//   npm run build:client             → only the client questionnaire (goes on GitHub Pages)
//
// `base: './'` keeps both portable: routing lives in the URL hash, so any static host works.
export default defineConfig(({ mode }) => {
  const client = mode === 'client';
  return {
    base: './',
    plugins: [react()],
    server: {
      // Your workspace is stored per address. A fixed port keeps it at the same
      // address every time; if 5173 is busy, Vite stops instead of moving to a new
      // port where your projects would seem to be missing.
      port: 5173,
      strictPort: true,
    },
    preview: { port: 4173, strictPort: true },
    build: client
      ? { outDir: 'dist-client', emptyOutDir: true, rollupOptions: { input: 'client.html' } }
      : { outDir: 'dist', emptyOutDir: true },
  };
});
