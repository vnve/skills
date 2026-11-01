import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    include: ['src/**/*.test.ts'],
    coverage: {
      thresholds: {
        lines: 80,
        statements: 80,
        branches: 70,
        functions: 75,
      },
    },
  },
})
