import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    name: "@vnve/editor-app",
    environment: "node",
    include: ["src/**/*.test.ts"],
    passWithNoTests: true,
  },
});
