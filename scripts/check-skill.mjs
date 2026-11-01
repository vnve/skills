import { readFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { sourceDigest } from "./source-digest.mjs";

const root = new URL("../", import.meta.url);
const target =
  process.argv[2] ??
  `${process.platform === "win32" ? "windows" : process.platform}-${process.arch}`;
const name = `vnve-${target}${target.startsWith("windows-") ? ".exe" : ""}`;
const manifest = JSON.parse(
  await readFile(new URL(`dist/${name}.json`, root), "utf8"),
);
if (
  manifest.apiVersion !== 2 ||
  manifest.target !== target ||
  manifest.sourceDigest !== (await sourceDigest(root))
)
  throw new Error("CLI is stale or incompatible. Run pnpm build.");
if (
  createHash("sha256")
    .update(await readFile(new URL(`dist/${name}`, root)))
    .digest("hex") !== manifest.sha256
)
  throw new Error("CLI binary integrity check failed");
const skill = await readFile(new URL("skills/vnve/SKILL.md", root), "utf8");
if (
  !/^---\r?\nname: vnve\r?\ndescription: [^\r\n]+\r?\n---(?:\r?\n|$)/.test(
    skill,
  )
)
  throw new Error("Invalid Skill frontmatter");
const compatibility = JSON.parse(
  await readFile(new URL("skills/vnve/cli.json", root), "utf8"),
);
if (
  compatibility.apiVersion !== manifest.apiVersion ||
  compatibility.version !== manifest.version
)
  throw new Error("Skill and CLI versions do not match");
const entries = await readdir(new URL("skills/vnve/", root));
if (entries.includes("runtime"))
  throw new Error("Skill must not contain the old Node runtime");
const assetRoot = new URL("skills/vnve/assets/", root);
const assets = JSON.parse(
  await readFile(new URL("manifest.json", assetRoot), "utf8"),
);
const media = new Set(assets.media);
if (media.size !== assets.media.length)
  throw new Error("Duplicate bundled media path");
for (const relative of media) {
  if (
    !/^(character|background|bgm|sfx)\//.test(relative) ||
    relative.includes("..")
  )
    throw new Error(`Invalid bundled media path: ${relative}`);
  await readFile(new URL(relative, assetRoot));
}
for (const item of assets.audio) {
  const bytes = await readFile(new URL(item.path, assetRoot));
  if (
    !media.has(item.path) ||
    bytes.length !== item.fileSize ||
    createHash("sha256").update(bytes).digest("hex") !== item.sha256
  )
    throw new Error(`Bundled audio integrity mismatch: ${item.path}`);
}
console.log(
  "Skill compatibility, binary integrity, source freshness and bundled assets OK.",
);
