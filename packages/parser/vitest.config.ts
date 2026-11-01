import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    include: ['src/**/*.test.ts'],
    coverage: {
      thresholds: {
        lines: 85,
        statements: 85,
        branches: 82,
        functions: 85,
      },
    },
  },
})
