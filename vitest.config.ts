import { resolve } from 'node:path'

import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@typed-api-contract-kit/core': resolve(import.meta.dirname, 'packages/core/src/index.ts'),
    },
  },
  test: {
    coverage: {
      exclude: ['packages/core/src/index.ts'],
      include: ['packages/*/src/**/*.ts'],
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      thresholds: {
        branches: 95,
        functions: 95,
        lines: 95,
        statements: 95,
      },
    },
    include: ['packages/*/test/**/*.test.ts'],
  },
})
