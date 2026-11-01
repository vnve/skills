import { context } from "esbuild";
import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
const args = process.argv.slice(2).filter((a) => a !== "--");
if (!args[0])
  throw new Error("Usage: pnpm dev -- /absolute/workspace [--project ID]");
const root = new URL("../", import.meta.url);
await mkdir(new URL(".dev/", root), { recursive: true });
const compiler = await context({
  absWorkingDir: root.pathname,
  entryPoints: ["apps/cli/src/cli/dev.ts"],
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  outfile: new URL(".dev/cli.mjs", root).pathname,
  sourcemap: true,
});
await compiler.rebuild();
await compiler.watch();
const vite = spawn("pnpm", ["--filter", "@vnve/editor-app", "dev"], {
  cwd: root,
  stdio: ["ignore", "pipe", "pipe"],
});
vite.stdout.pipe(process.stdout);
vite.stderr.pipe(process.stderr);
let service,
  stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  service?.kill("SIGTERM");
  vite.kill("SIGTERM");
  await compiler.dispose();
}
process.once("SIGINT", () => void stop());
process.once("SIGTERM", () => void stop());
try {
  await new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("Vite did not start")),
      15000,
    );
    vite.once("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`Vite exited (${code}); check port 5173`));
    });
    vite.stdout.on("data", (data) => {
      if (data.toString().includes("http://127.0.0.1:5173")) {
        clearTimeout(timer);
        resolve();
      }
    });
  });
  service = spawn(
    process.execPath,
    [
      "--watch",
      "--watch-preserve-output",
      "--enable-source-maps",
      new URL(".dev/cli.mjs", root).pathname,
      "serve",
      ...args,
      "--dev-origin",
      "http://127.0.0.1:5173",
    ],
    { cwd: root, stdio: "inherit" },
  );
  service.on("exit", (code) => {
    void stop();
    process.exitCode = code ?? 0;
  });
} catch (e) {
  await stop();
  throw e;
}
