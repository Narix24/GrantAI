import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [
    react({
      jsxImportSource: '@emotion/react',
      babel: {
        plugins: ['@emotion/babel-plugin'],
      },
    }),
  ],
  root: './frontend',
  base: './',
  server: {
    port: 3001,
    open: true,
  },
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    sourcemap: true,
    commonjsOptions: {
      ignoreTryCatch: false, // avoid MUI warnings
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './frontend/src'),
    },
  },
  optimizeDeps: {
    exclude: ['@mui/material', '@mui/icons-material', '@emotion/react', '@emotion/styled'],
  },
  esbuild: {
    jsx: 'automatic',
  },
})