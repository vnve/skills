import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    name: "@vnve/cli",
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
