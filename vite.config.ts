import { defineConfig } from 'vitest/config'
import mdx from '@mdx-js/rollup'
import react from '@vitejs/plugin-react'

const docsApiTarget = process.env.DOCS_API_TARGET ?? 'http://localhost:3000'

export default defineConfig({
  plugins: [
    mdx({
      include: /src[\\/]features[\\/]docs[\\/]generated[\\/]pages[\\/].*\.mdx$/,
      providerImportSource: '@mdx-js/react',
    }),
    react(),
  ],
  server: {
    proxy: {
      '/api': {
        target: docsApiTarget,
        changeOrigin: true,
      },
    },
  },
  preview: {
    proxy: {
      '/api': {
        target: docsApiTarget,
        changeOrigin: true,
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.ts',
    css: true,
    coverage: {
      reporter: ['text', 'html'],
    },
  },
})
