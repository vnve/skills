import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile, rm, lstat, cp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";

const source = new URL("../../skills/vnve/", import.meta.url);
const require = createRequire(import.meta.url);
const installer = require.resolve("skills/bin/cli.mjs");

test("standard skills CLI installs a portable Skill for the independent vnve binary", async () => {
  const root = await mkdtemp(join(tmpdir(), "vnve skills install "));
  try {
    const consumer = join(root, "consumer");
    const home = join(root, "home");
    const repository = join(root, "release repository");
    await mkdir(consumer);
    await mkdir(home);
    await mkdir(join(repository, "skills"), { recursive: true });
    await cp(source, join(repository, "skills/vnve"), { recursive: true });
    const env = {
      ...process.env,
      HOME: home,
      USERPROFILE: home,
      CODEX_HOME: join(home, ".codex"),
      XDG_CONFIG_HOME: join(home, ".config"),
      DISABLE_TELEMETRY: "1",
      DO_NOT_TRACK: "1",
      CI: "1",
    };
    const install = (...args) =>
      execFileSync(
        process.execPath,
        [
          installer,
          "add",
          repository,
          "--skill",
          "vnve",
          "--agent",
          "codex",
          ...args,
        ],
        {
          cwd: consumer,
          env,
          encoding: "utf8",
          stdio: ["pipe", "pipe", "pipe"],
        },
      );
    assert.match(install("--list"), /vnve/);
    // Exercise the default installation method used by the public one-line command.
    install("--yes");
    const local = join(consumer, ".agents/skills/vnve");
    assert.equal((await lstat(local)).isSymbolicLink(), false);
    install("--global", "--copy", "--yes");
    const global = join(home, ".agents/skills/vnve");
    assert.equal((await lstat(global)).isSymbolicLink(), false);
    install("--copy", "--yes");
    await rm(repository, { recursive: true });
    const target = `${process.platform === "win32" ? "windows" : process.platform}-${process.arch}`;
    const binaryName = `vnve-${target}${process.platform === "win32" ? ".exe" : ""}`;
    const binary = join(root, binaryName);
    await cp(new URL(`../../dist/${binaryName}`, import.meta.url), binary);
    const workspace = join(root, "workspace");
    await mkdir(workspace);
    const run = (dir, ...args) =>
      execFileSync(binary, args, {
        cwd: workspace,
        env,
        encoding: "utf8",
      });
    for (const dir of [local, global]) {
      const compatibility = JSON.parse(
        await readFile(join(dir, "cli.json"), "utf8"),
      );
      assert.equal(
        JSON.parse(run(dir, "doctor")).apiVersion,
        compatibility.apiVersion,
      );
      assert.equal(
        JSON.parse(run(dir, "doctor")).version,
        compatibility.version,
      );
    }
    const created = JSON.parse(
      run(local, "create", workspace, "Standard installation"),
    );
    assert.equal(
      JSON.parse(run(local, "inspect", workspace, created.entry.projectId))
        .project.meta.title,
      "Standard installation",
    );
    assert.equal(
      JSON.parse(run(local, "compile", workspace, created.entry.projectId)).ok,
      true,
    );
    assert.ok(await readFile(join(local, "references/runtime.md"), "utf8"));
    assert.ok(await readFile(join(local, "scripts/image_prep.py"), "utf8"));
    assert.ok(
      await readFile(join(local, "references/image-preparation.md"), "utf8"),
    );
    const example = await readFile(
      join(local, "examples/animation/gentle-camera.js"),
      "utf8",
    );
    const exampleFile = join(workspace, "example.js"),
      artifactFile = join(workspace, "example.json");
    await writeFile(
      exampleFile,
      `({...(${example.trim().replace(/;$/, "")}),sceneId:${JSON.stringify(created.project.acts[0].scenes[0].id)},extendScene:true})`,
    );
    run(
      local,
      "animation",
      "build",
      workspace,
      created.entry.projectId,
      exampleFile,
      artifactFile,
    );
    assert.equal(
      JSON.parse(await readFile(artifactFile, "utf8")).clip.sdkVersion,
      2,
    );
    await assert.rejects(lstat(join(local, "runtime")), { code: "ENOENT" });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
