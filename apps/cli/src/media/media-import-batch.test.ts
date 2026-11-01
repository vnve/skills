import { afterEach, expect, it, vi } from "vitest";
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { openLocalWorkspace } from "../workspace/workspace";
import { importMediaBatch } from "./media-import";

const roots: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});
async function setup() {
  const root = await mkdtemp(path.join(tmpdir(), "vnve-batch-"));
  roots.push(root);
  const workspace = await openLocalWorkspace(root);
  await workspace.execute({
    op: "create",
    title: "Batch",
    script: {
      title: "Batch",
      characters: [{ name: "Alice", description: "Hero" }],
      backgrounds: [{ name: "Park", description: "Day" }],
      acts: [
        {
          name: "Act",
          scenes: [
            {
              name: "Scene",
              background: "Park",
              lines: [{ speaker: "Alice", text: "Hello", variant: "happy" }],
            },
          ],
        },
      ],
    },
  });
  const list = await workspace.execute({ op: "list" });
  if (!("projects" in list)) throw new Error("Missing projects");
  const projectId = list.projects[0].projectId;
  const loaded = await workspace.loadProject(projectId);
  const group = loaded.assets.visual.character[0];
  const file = path.join(root, "image.png");
  await writeFile(
    file,
    Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==",
      "base64",
    ),
  );
  return { root, workspace, projectId, loaded, group, file };
}
it("imports a named replacement and new variant with one versioned save", async () => {
  const { workspace, projectId, loaded, group, file } = await setup();
  const execute = vi.spyOn(workspace, "execute");
  const result = await importMediaBatch(workspace, projectId, [
    {
      kind: "character",
      file,
      groupName: group.name,
      variantKey: group.variants[0].key ?? group.variants[0].name,
    },
    {
      kind: "character",
      file,
      groupId: group.id,
      register: true,
      name: "Extra",
    },
  ]);
  expect(execute).toHaveBeenCalledTimes(1);
  expect(result.items).toMatchObject([
    { groupId: group.id, replaced: true },
    { groupId: group.id, replaced: false },
  ]);
  const next = await workspace.loadProject(projectId);
  expect(next.assetsRevision).not.toBe(loaded.assetsRevision);
  expect(next.project).toEqual(loaded.project);
  expect(next.assets.visual.character[0].variants).toHaveLength(
    group.variants.length + 1,
  );
});
it("preserves both revisions and removes staged files if a later item fails", async () => {
  const { root, workspace, projectId, loaded, group, file } = await setup();
  await expect(
    importMediaBatch(workspace, projectId, [
      { kind: "character", file, groupId: group.id },
      {
        kind: "character",
        file: path.join(root, "missing.png"),
        groupId: group.id,
      },
    ]),
  ).rejects.toMatchObject({ path: "items[1].file" });
  expect(await workspace.loadProject(projectId)).toEqual(loaded);
  expect(await readdir(path.join(root, "assets/visual"))).toEqual([]);
  expect(await readdir(path.join(root, "assets/sources"))).toEqual([]);
});
it("does not overwrite concurrent asset changes at final commit", async () => {
  const { root, workspace, projectId, loaded, group, file } = await setup();
  const original = workspace.execute.bind(workspace);
  vi.spyOn(workspace, "execute").mockImplementation(async (input) => {
    if (input.op === "save") {
      const assets = structuredClone(loaded.assets);
      assets.visual.character[0].name = "Concurrent name";
      await original({
        op: "saveAssets",
        assets,
        expected: {
          projectRevision: loaded.projectRevision,
          assetsRevision: loaded.assetsRevision,
        },
      });
    }
    return original(input);
  });
  await expect(
    importMediaBatch(workspace, projectId, [
      { kind: "character", file, groupId: group.id },
    ]),
  ).rejects.toMatchObject({ code: "CONFLICT" });
  expect(
    (await workspace.loadProject(projectId)).assets.visual.character[0].name,
  ).toBe("Concurrent name");
  expect(await readdir(path.join(root, "assets/visual"))).toEqual([]);
});
