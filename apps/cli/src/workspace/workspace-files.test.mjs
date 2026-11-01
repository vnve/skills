import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { openWorkspaceFiles } from "./workspace-files.mjs";

async function fixture(t) {
  const root = await mkdtemp(path.join(tmpdir(), "vnve-files-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  return { root, files: await openWorkspaceFiles(root) };
}
test("round trips existing layout and requires revisions before overwriting", async (t) => {
  const { root, files } = await fixture(t);
  const name = "projects/story/project.json";
  const first = await files.write(name, Buffer.from('{"title":"初稿"}'), null);
  assert.equal((await files.read(name)).bytes.toString(), '{"title":"初稿"}');
  await assert.rejects(files.write(name, Buffer.from("overwrite"), null), {
    code: "CONFLICT",
  });
  await files.write(name, Buffer.from("updated"), first.revision);
  assert.equal(await readFile(path.join(root, name), "utf8"), "updated");
});
test("concurrent stale saves cannot both succeed and queue survives conflict", async (t) => {
  const { files } = await fixture(t);
  const name = ".vnve/assets.json";
  const first = await files.write(name, Buffer.from("{}"), null);
  const results = await Promise.allSettled(
    ["a", "b"].map((value) =>
      files.write(name, Buffer.from(value), first.revision),
    ),
  );
  assert.equal(
    results.filter((result) => result.status === "fulfilled").length,
    1,
  );
  const current = await files.read(name);
  await files.write(name, Buffer.from("next"), current.revision);
});
test("external changes and corrupt bytes are preserved on stale writes", async (t) => {
  const { root, files } = await fixture(t);
  const name = ".vnve/workspace.json";
  const first = await files.write(name, Buffer.from("{}"), null);
  await writeFile(path.join(root, name), "broken json");
  await assert.rejects(files.write(name, Buffer.from("{}"), first.revision), {
    code: "CONFLICT",
  });
  assert.equal((await files.read(name)).bytes.toString(), "broken json");
});
test("rejects traversal, unsupported files and symlink escape", async (t) => {
  const { root, files } = await fixture(t);
  for (const name of [
    "../secret",
    "/etc/passwd",
    "assets/../secret",
    "assets\\secret",
    ".git/config",
    "projects/x/other.json",
  ]) {
    await assert.rejects(files.read(name), { code: "INVALID_PATH" });
  }
  await mkdir(path.join(root, "assets"));
  await symlink(tmpdir(), path.join(root, "assets", "escape"));
  await assert.rejects(
    files.write("assets/escape/test", Buffer.from("bad"), null),
    { code: "INVALID_PATH" },
  );
});
