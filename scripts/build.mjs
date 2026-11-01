import { mkdir, readdir, readFile, writeFile, rm } from "node:fs/promises";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { sourceDigest } from "./source-digest.mjs";
const root = new URL("../", import.meta.url),
  runtime = new URL(".dev/runtime/", root);
const supported = [
  "darwin-arm64",
  "darwin-x64",
  "linux-x64",
  "linux-arm64",
  "windows-x64",
];
const target =
  process.argv[2] ??
  `${process.platform === "win32" ? "windows" : process.platform}-${process.arch}`;
if (!supported.includes(target))
  throw new Error(`Unsupported target: ${target}`);
const executable = `vnve-${target}${target.startsWith("windows-") ? ".exe" : ""}`;
const pkg = JSON.parse(await readFile(new URL("package.json", root), "utf8"));
const require = createRequire(import.meta.url);
const editorRequire = createRequire(new URL("apps/editor/package.json", root));
const viteCli = path.join(
  path.dirname(editorRequire.resolve("vite/package.json")),
  "bin/vite.js",
);
await rm(runtime, { recursive: true, force: true });
await mkdir(runtime, { recursive: true });
const web = spawnSync(process.execPath, [viteCli, "build"], {
  cwd: new URL("apps/editor/", root),
  stdio: "inherit",
});
if (web.status !== 0) process.exit(web.status ?? 1);
const files = {};
async function collect(dir = "") {
  for (const e of await readdir(new URL(dir, runtime), {
    withFileTypes: true,
  })) {
    const name = dir + e.name;
    if (e.isDirectory()) await collect(name + "/");
    else
      files[name] = createHash("sha256")
        .update(await readFile(new URL(name, runtime)))
        .digest("hex");
  }
}
await collect();
const metadata = {
  version: pkg.version,
  apiVersion: 2,
  sourceDigest: await sourceDigest(root),
  target,
  files: Object.fromEntries(
    Object.entries(files)
      .filter(([name]) => name.startsWith("web/"))
      .map(([name, hash]) => [name.slice(4), hash]),
  ),
};
const imports = Object.keys(metadata.files).map(
  (name, index) =>
    `import resource${index} from ${JSON.stringify(`./web/${name}`)} with { type: "file" };`,
);
const entry = `${imports.join("\n")}\nimport { runCli, writeCliError } from "../../apps/cli/src/cli/cli.ts";\nconst webFiles = {${Object.keys(
  metadata.files,
)
  .map((name, index) => `${JSON.stringify(name)}:resource${index}`)
  .join(
    ",",
  )}};\nrunCli({webFiles,build:${JSON.stringify(metadata)}}).catch(writeCliError);\n`;
await writeFile(new URL("entry.ts", runtime), entry);
await mkdir(new URL("dist/", root), { recursive: true });
const compile = spawnSync(
  require.resolve("bun/bin/bun.exe"),
  [
    "build",
    "--compile",
    `--target=bun-${target}`,
    "--no-compile-autoload-dotenv",
    "--no-compile-autoload-bunfig",
    ".dev/runtime/entry.ts",
    "--outfile",
    `dist/${executable}`,
  ],
  { cwd: root, stdio: "inherit" },
);
if (compile.status !== 0) process.exit(compile.status ?? 1);
const binaryHash = createHash("sha256")
  .update(await readFile(new URL(`dist/${executable}`, root)))
  .digest("hex");
await writeFile(
  new URL(`dist/${executable}.sha256`, root),
  `${binaryHash}  ${executable}\n`,
);
await writeFile(
  new URL(`dist/${executable}.json`, root),
  JSON.stringify({ ...metadata, executable, sha256: binaryHash }, null, 2) +
    "\n",
);
console.log(`Standalone CLI built: dist/${executable}`);
