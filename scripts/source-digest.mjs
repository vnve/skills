import { readdir, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
export async function sourceDigest(root) {
  const hash = createHash("sha256");
  async function walk(relative) {
    for (const e of (
      await readdir(new URL(relative, root), { withFileTypes: true })
    ).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))) {
      if (["node_modules", "dist", ".dev"].includes(e.name)) continue;
      const name = `${relative}${e.name}`;
      if (e.isDirectory()) await walk(name + "/");
      else if (!name.includes(".test.") && !name.includes("/__tests__/"))
        hash.update(name).update(await readFile(new URL(name, root)));
    }
  }
  for (const p of [
    "apps/editor/",
    "packages/core/",
    "packages/authoring/",
    "packages/compiler/",
    "packages/parser/",
    "packages/runtime/",
    "packages/renderer/",
    "packages/media/",
    "apps/cli/",
    "skills/vnve/assets/",
  ])
    await walk(p);
  for (const p of [
    "scripts/build.mjs",
    "scripts/source-digest.mjs",
    "package.json",
    "pnpm-lock.yaml",
  ])
    hash.update(await readFile(new URL(p, root)));
  return hash.digest("hex");
}
