import { it, expect, afterEach } from "vitest";
import { mkdtemp, rm, writeFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { openLocalWorkspace } from "../workspace/workspace";
import { importMedia } from "./media-import";
import { probeMedia } from "./media-probe";
import { checkProjectMedia } from "./project-check";
import { png, wav } from "../__tests__/media-fixtures";
const roots: string[] = [];
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((r) => rm(r, { recursive: true, force: true })),
  );
});
async function setup() {
  const root = await mkdtemp(path.join(tmpdir(), "vnve-media-"));
  roots.push(root);
  const workspace = await openLocalWorkspace(root);
  const created = (await workspace.execute({
    op: "create",
    title: "Media",
  })) as any;
  return { root, workspace, id: created.entry.projectId, created };
}
it("probes real dimensions and registers a new group and expression without rewriting the story", async () => {
  const { root, workspace, id } = await setup();
  const file = path.join(root, "portrait.png");
  await writeFile(file, png);
  const a = await importMedia(workspace, id, {
    file,
    kind: "character",
    register: true,
    groupId: "hero",
    variantId: "neutral",
    name: "Hero",
  });
  const b = await importMedia(workspace, id, {
    file,
    kind: "character",
    register: true,
    groupId: "hero",
    variantId: "happy",
    name: "Happy",
  });
  expect(a).toMatchObject({
    groupId: "hero",
    variantId: "neutral",
    metadata: { width: 1, height: 1 },
  });
  expect(b).toMatchObject({ variantId: "happy" });
  const loaded = await workspace.loadProject(id);
  expect(loaded.assets.visual.character[0].variants).toHaveLength(2);
  expect(loaded.project.acts[0].scenes[0].actors).toHaveLength(0);
});
it("rejects bad media and metadata mismatches before copying files or changing revisions", async () => {
  const { root, workspace, id } = await setup();
  const bad = path.join(root, "bad.png");
  await writeFile(bad, "not an image");
  await expect(
    importMedia(workspace, id, {
      file: bad,
      kind: "character",
      register: true,
    }),
  ).rejects.toThrow();
  const file = path.join(root, "real.png");
  await writeFile(file, png);
  const before = await workspace.loadProject(id);
  await expect(
    importMedia(workspace, id, {
      file,
      kind: "character",
      register: true,
      width: 999,
      height: 1,
    }),
  ).rejects.toThrow("dimensions");
  const after = await workspace.loadProject(id);
  expect(after.assetsRevision).toBe(before.assetsRevision);
  expect(
    await readdir(path.join(root, "assets")).catch(
      (e: NodeJS.ErrnoException) => {
        if (e.code === "ENOENT") return [];
        throw e;
      },
    ),
  ).not.toContain("visual");
});
it("uses real audio duration and refuses stale dialogue snapshots", async () => {
  const { root, workspace, id, created } = await setup();
  const scene = created.project.acts[0].scenes[0];
  scene.script.nodes = [{ id: "line", type: "text", text: "Fresh" }];
  await workspace.execute({
    op: "save",
    projectId: id,
    project: created.project,
    expected: created,
  });
  const file = path.join(root, "voice.wav");
  await writeFile(file, wav(0.75));
  await expect(probeMedia(file, "audio")).resolves.toMatchObject({
    duration: 0.75,
  });
  await expect(
    importMedia(workspace, id, {
      file,
      kind: "voice",
      sceneId: scene.id,
      nodeId: "line",
      expectedText: "Old",
      expectedActorId: null,
    }),
  ).rejects.toThrow("snapshot");
  await expect(
    importMedia(workspace, id, {
      file,
      kind: "voice",
      sceneId: scene.id,
      nodeId: "line",
      expectedText: "Fresh",
      expectedActorId: null,
      duration: 5,
    }),
  ).rejects.toThrow("duration");
  const imported = await importMedia(workspace, id, {
    file,
    kind: "voice",
    sceneId: scene.id,
    nodeId: "line",
    expectedText: "Fresh",
    expectedActorId: null,
  });
  expect(imported.metadata).toMatchObject({ duration: 0.75 });
  expect(
    (await workspace.loadProject(id)).project.acts[0].scenes[0].script.nodes[0]
      .audioDuration,
  ).toBe(0.75);
});
it("checks only referenced files, reports a missing used file, and never mutates project revisions", async () => {
  const { root, workspace, id, created } = await setup();
  const loaded = await workspace.loadProject(id),
    project = { ...loaded.project, assets: loaded.assets };
  project.assets.visual.background = [
    {
      id: "unused",
      name: "Unused",
      defaultVariantId: "bad",
      variants: [
        { id: "bad", name: "Missing", url: "assets/visual/missing.png" },
      ],
    },
  ];
  const before = await workspace.loadProject(id);
  const result = await checkProjectMedia(project, {
    directory: root,
    webRoot: root,
    files: workspace.files,
  });
  expect(result.issues.some((i) => i.code === "MEDIA_MISSING")).toBe(false);
  project.acts[0].scenes[0].backgroundId = "bad";
  const missing = await checkProjectMedia(project, {
    directory: root,
    webRoot: root,
    files: workspace.files,
  });
  expect(missing.ok).toBe(false);
  expect(missing.issues).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ code: "MEDIA_MISSING", assetId: "bad" }),
    ]),
  );
  expect((await workspace.loadProject(id)).projectRevision).toBe(
    before.projectRevision,
  );
});
it("materializes inserted IDs in a real preview and rejects unimported image references atomically", async () => {
  const { workspace, id, created } = await setup();
  const scene = created.project.acts[0].scenes[0];
  const preview = (await workspace.execute({
    op: "patch",
    projectId: id,
    plan: {
      summary: "Insert",
      operations: [
        {
          type: "dialogue.insert",
          sceneId: scene.id,
          index: 0,
          text: "Stable",
        },
      ],
    },
  })) as any;
  await workspace.execute({
    op: "patch",
    projectId: id,
    plan: preview.plan,
    expected: preview.expected,
    apply: true,
  });
  expect(
    (await workspace.loadProject(id)).project.acts[0].scenes[0].script.nodes[0]
      .id,
  ).toBe(preview.project.acts[0].scenes[0].script.nodes[0].id);
  const before = await workspace.loadProject(id);
  await expect(
    workspace.execute({
      op: "patch",
      projectId: id,
      plan: {
        summary: "Bad file",
        operations: [
          {
            type: "asset.group.create",
            assetType: "character",
            group: {
              id: "new",
              name: "Missing",
              defaultVariantId: "v",
              variants: [
                {
                  id: "v",
                  name: "Default",
                  url: "assets/visual/not-imported.png",
                },
              ],
            },
          },
        ],
      },
    }),
  ).rejects.toThrow("Import media");
  expect((await workspace.loadProject(id)).assetsRevision).toBe(
    before.assetsRevision,
  );
});
