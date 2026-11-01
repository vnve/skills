import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    include: ['src/**/*.test.ts'],
    coverage: {
      thresholds: {
        lines: 90,
        statements: 90,
        branches: 88,
        functions: 90,
      },
    },
  },
})
