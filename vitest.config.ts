import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    projects: [
      "packages/compiler",
      "packages/core",
      "packages/parser",
      "packages/runtime",
      "packages/renderer",
      "packages/media",
      "apps/cli",
      "apps/editor",
      "tests/integration",
    ],
  },
});
