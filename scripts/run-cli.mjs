import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const target = `${process.platform === "win32" ? "windows" : process.platform}-${process.arch}`;
const executable = new URL(
  `../dist/vnve-${target}${process.platform === "win32" ? ".exe" : ""}`,
  import.meta.url,
);
const result = spawnSync(fileURLToPath(executable), process.argv.slice(2), {
  stdio: "inherit",
});
if (result.error)
  throw new Error("Local vnve binary not available. Run pnpm build first.");
process.exitCode = result.status ?? 1;
