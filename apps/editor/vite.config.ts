import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: "127.0.0.1",
    strictPort: true,
    hmr: { host: "127.0.0.1", port: 5173 },
  },
  build: {
    target: "es2022",
    outDir: "../../.dev/runtime/web",
    emptyOutDir: true,
  },
});
