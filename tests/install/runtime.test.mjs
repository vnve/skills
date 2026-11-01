import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  copyFile,
  chmod,
  mkdir,
  rm,
  readFile,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync, spawn } from "node:child_process";

const target = `${process.platform === "win32" ? "windows" : process.platform}-${process.arch}`;
const source = new URL(
  `../../dist/vnve-${target}${process.platform === "win32" ? ".exe" : ""}`,
  import.meta.url,
);

test("standalone CLI works without source, modules, Node or Bun on PATH", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "vnve-binary-"));
  const executable = join(
    root,
    process.platform === "win32" ? "vnve.exe" : "vnve",
  );
  const emptyPath = join(root, "empty-path");
  await mkdir(emptyPath);
  await copyFile(source, executable);
  await chmod(executable, 0o755);
  let child;
  context.after(async () => {
    if (child && child.exitCode === null && child.signalCode === null) {
      const exited = new Promise((resolve) => child.once("exit", resolve));
      child.kill();
      await exited;
    }
    await rm(root, { recursive: true, force: true });
  });
  const env = { ...process.env, PATH: emptyPath, BUN_BE_BUN: "0" };
  const run = (...args) =>
    execFileSync(executable, args, { cwd: root, env, encoding: "utf8" });
  const doctor = JSON.parse(run("doctor"));
  assert.equal(doctor.ok, true);
  assert.equal(doctor.apiVersion, 2);
  assert.equal(doctor.target, target);
  assert.ok(doctor.embeddedFiles > 0);
  assert.doesNotMatch(run("--help"), /vnve licenses/);
  assert.ok(JSON.parse(run("schema", "animation")).properties);
  const created = JSON.parse(run("create", root, "Isolated"));
  const id = created.entry.projectId;
  assert.equal(
    JSON.parse(run("inspect", root, id)).project.meta.title,
    "Isolated",
  );
  const scene = created.project.acts[0].scenes[0];
  const planFile = join(root, "patch.json");
  const previewFile = join(root, "preview.json");
  await writeFile(
    planFile,
    JSON.stringify({
      summary: "Binary edit",
      operations: [
        {
          type: "dialogue.insert",
          sceneId: scene.id,
          index: 0,
          text: "独立运行",
        },
      ],
    }),
  );
  await writeFile(previewFile, run("patch", root, id, planFile));
  run("apply", root, previewFile);
  const compiled = JSON.parse(run("compile", root, id));
  assert.equal(compiled.ok, true);
  assert.equal(compiled.lines[0].text, "独立运行");
  const checked = JSON.parse(run("check", root, id));
  assert.equal(checked.ok, true);
  assert.ok(
    checked.pending.some((item) => item.code === "BROWSER_LAYOUT_REQUIRED"),
  );
  const storyFile = join(root, "story.json");
  await writeFile(
    storyFile,
    JSON.stringify({
      title: "Embedded media",
      characters: [{ name: "Hero", description: "Lead" }],
      backgrounds: [{ name: "Room", description: "Day" }],
      acts: [
        {
          name: "Act",
          scenes: [
            {
              name: "Scene",
              background: "Room",
              lines: [{ speaker: "Hero", text: "Hello" }],
            },
          ],
        },
      ],
    }),
  );
  const story = JSON.parse(
    run("create", root, "Embedded media", "--script", storyFile),
  );
  const storyId = story.entry.projectId;
  const brief = JSON.parse(run("inspect", root, storyId, "--brief"));
  assert.equal(brief.visual.character.length, 1);
  assert.equal(brief.scenes[0].nodes, 1);
  const summary = JSON.parse(run("check", root, storyId, "--issues=summary"));
  assert.equal(summary.ok, true);
  assert.equal(summary.issues, undefined);
  assert.ok(
    summary.issueSummary.some(
      (item) => item.code === "VOICE_MISSING" && item.count === 1,
    ),
  );
  assert.ok(
    summary.issueSummary.some((item) => item.code === "PLACEHOLDER_MEDIA"),
  );
  const script = join(root, "animation.js"),
    clipFile = join(root, "animation.json");
  await writeFile(
    script,
    `({sdkVersion:2,id:'binary-animation',name:'Camera',sceneId:${JSON.stringify(scene.id)},duration:1,build({camera,timeline}){timeline().to(camera(),{x:2,duration:1,ease:'power2.out'});}})`,
  );
  run("animation", "build", root, id, script, clipFile);
  const artifact = JSON.parse(await readFile(clipFile, "utf8")),
    clip = artifact.clip;
  assert.equal(clip.version, 2);
  assert.equal(artifact.projectId, id);
  assert.ok(artifact.expected.projectRevision);
  const secondFile = join(root, "second.json");
  run("animation", "build", root, id, script, secondFile);
  assert.deepEqual(JSON.parse(await readFile(secondFile, "utf8")), artifact);
  assert.throws(() => run("animation", "build", root, id, script, clipFile));
  await writeFile(
    planFile,
    JSON.stringify({
      summary: "Define animation without playing it",
      operations: [{ type: "animation.set", sceneId: scene.id, clip }],
    }),
  );
  await writeFile(previewFile, run("patch", root, id, planFile));
  run("apply", root, previewFile);
  const unreferenced = JSON.parse(run("compile", root, id));
  assert.equal(unreferenced.ok, true);
  assert.ok(
    unreferenced.issues.some(
      (issue) =>
        issue.code === "ANIMATION_UNREFERENCED" &&
        issue.animationId === clip.id,
    ),
  );
  const unreferencedCheck = JSON.parse(
    run("check", root, id, "--issues=summary"),
  );
  assert.ok(
    unreferencedCheck.issueSummary.some(
      (issue) => issue.code === "ANIMATION_UNREFERENCED",
    ),
  );
  await writeFile(
    planFile,
    JSON.stringify({
      summary: "Play animation and insert a mid-sentence direction",
      operations: [
        {
          type: "dialogue.insert",
          sceneId: scene.id,
          id: "animation-placement",
          index: 0,
          content: [
            {
              type: "tag",
              name: "animation",
              params: { clipId: clip.id, await: false },
            },
          ],
        },
        {
          type: "dialogue.content.update",
          sceneId: scene.id,
          nodeId: compiled.lines[0].nodeId,
          content: [
            { type: "text", text: "独立" },
            { type: "tag", name: "wait", params: { seconds: 0.1 } },
            { type: "text", text: "运行" },
          ],
        },
      ],
    }),
  );
  await writeFile(previewFile, run("patch", root, id, planFile));
  run("apply", root, previewFile);
  const activated = JSON.parse(run("compile", root, id));
  assert.equal(activated.ok, true);
  assert.equal(
    activated.issues.some((issue) => issue.code === "ANIMATION_UNREFERENCED"),
    false,
  );
  child = spawn(executable, ["serve", root, "--project", id], {
    cwd: root,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const launch = await new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("CLI server startup timed out")),
      15000,
    );
    let output = "";
    child.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`CLI exited: ${code}`));
    });
    child.stdout.on("data", (chunk) => {
      output += chunk.toString();
      if (output.includes("\n")) {
        clearTimeout(timer);
        resolve(new URL(output.trim()));
      }
    });
  });
  const html = await (await fetch(launch.origin)).text();
  assert.match(html, /data-vnve-local="true"/);
  const scriptPath = /src="([^"]+\.js)"/.exec(html)?.[1];
  assert.ok(scriptPath);
  assert.equal((await fetch(new URL(scriptPath, launch))).status, 200);
  assert.equal(
    (await fetch(`${launch.origin}/placeholders/background-1.avif`)).status,
    200,
  );
  assert.equal((await fetch(`${launch.origin}/__vnve/config`)).status, 401);
  const token = new URLSearchParams(launch.hash.slice(1)).get("session");
  assert.equal(
    (
      await fetch(`${launch.origin}/__vnve/config`, {
        headers: { Authorization: `Bearer ${token}` },
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await fetch(`${launch.origin}/__vnve/config`, {
        headers: {
          Authorization: `Bearer ${token}`,
          Origin: "https://other.example",
        },
      })
    ).status,
    403,
  );
});
