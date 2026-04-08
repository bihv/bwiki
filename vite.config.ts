import { defineConfig } from 'vitest/config'
import mdx from '@mdx-js/rollup'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [
    mdx({
      include: /src[\\/]features[\\/]docs[\\/]generated[\\/]pages[\\/].*\.mdx$/,
      providerImportSource: '@mdx-js/react',
    }),
    react(),
  ],
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
