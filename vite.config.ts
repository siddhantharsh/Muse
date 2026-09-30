import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  // './' for Electron file:// loading, '/' for web hosting
  base: process.env.ELECTRON_BUILD === '1' ? './' : '/',
  server: {
    port: 5173,
  },
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        // '/' — marketing landing page
        main: path.resolve(__dirname, 'index.html'),
        // '/app.html' — the actual scheduler app (Electron and the PWA launch here)
        app: path.resolve(__dirname, 'app.html'),
      },
    },
  },
});
