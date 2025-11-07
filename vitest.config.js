// vite.config.js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@components': path.resolve(__dirname, 'frontend/src/components'),
      '@context': path.resolve(__dirname, 'frontend/src/context'),
      '@styles': path.resolve(__dirname, 'frontend/src/styles'),
      '@public': path.resolve(__dirname, 'frontend/public'),
      '@utils': path.resolve(__dirname, 'frontend/src/utils')
    }
  },
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'frontend/index.html')
      }
    }
  },
  server: {
    port: 3001,
    open: true
  }
})