import { afterEach, expect, it } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { openLocalWorkspace } from "../workspace/workspace";
import { importMedia } from "./media-import";
const roots: string[] = [];
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==",
  "base64",
);
async function setup() {
  const root = await mkdtemp(path.join(tmpdir(), "vnve-theme-"));
  roots.push(root);
  const workspace = await openLocalWorkspace(root);
  const created = (await workspace.execute({
    op: "create",
    title: "Theme",
  })) as any;
  const file = path.join(root, "frame.png");
  await writeFile(file, png);
  return { root, workspace, created, file };
}
it("imports a PNG theme without applying it, then persists theme creation and application together", async () => {
  const { root, workspace, created, file } = await setup();
  const projectId = created.entry.projectId;
  const input = {
    file,
    kind: "dialogue-frame" as const,
    theme: {
      id: "frame",
      name: "Frame",
      data: { boxImageSlice: { left: 0, right: 0, top: 0, bottom: 0 } },
    },
  };
  const imported = await importMedia(workspace, projectId, input);
  expect(imported).toMatchObject({ themeId: "frame", width: 1, height: 1 });
  const loaded = await workspace.loadProject(projectId);
  expect(loaded.project.acts[0]!.scenes[0]!.dialogueThemeId).toBeUndefined();
  const original = loaded.assets.themes[0]!;
  const sceneId = loaded.project.acts[0]!.scenes[0]!.id;
  const plan = {
    summary: "New typography",
    operations: [
      {
        type: "dialogue.theme.create" as const,
        sceneId,
        theme: {
          ...original,
          id: "variant",
          baseThemeId: "classic" as const,
          data: { ...original.data, fontSize: 42 },
        },
      },
      { type: "dialogue.theme.apply" as const, sceneId, themeId: "variant" },
    ],
  };
  const preview = (await workspace.execute({
    op: "patch",
    projectId,
    plan,
  })) as any;
  expect(preview.assets.themes).toHaveLength(2);
  await workspace.execute({
    op: "patch",
    projectId,
    plan,
    expected: preview.expected,
    apply: true,
  });
  const reopened = await (
    await openLocalWorkspace(root)
  ).loadProject(projectId);
  expect(
    reopened.assets.themes.find((theme) => theme.id === "variant")?.data
      .fontSize,
  ).toBe(42);
  expect(reopened.project.acts[0]!.scenes[0]!.dialogueThemeId).toBe("variant");
  expect(reopened.assets.themes[0]).toEqual(original);
  await expect(importMedia(workspace, projectId, input)).rejects.toThrow(
    "new theme ID",
  );
});
it("rejects misleading dimensions and nine-slice boundaries before registering a theme", async () => {
  const { workspace, created, file } = await setup();
  const input = {
    file,
    kind: "dialogue-frame" as const,
    theme: { id: "frame", name: "Frame", data: {} },
  };
  await expect(
    importMedia(workspace, created.entry.projectId, { ...input, width: 2 }),
  ).rejects.toThrow("dimensions");
  await expect(
    importMedia(workspace, created.entry.projectId, {
      ...input,
      theme: {
        ...input.theme,
        data: { boxImageSlice: { left: 1, right: 0, top: 0, bottom: 0 } },
      },
    }),
  ).rejects.toThrow("Nine-slice");
  expect(
    (await workspace.loadProject(created.entry.projectId)).assets.themes,
  ).toHaveLength(0);
});

it("rejects animated PNG before registering a nondeterministic frame", async () => {
  const { workspace, created, file } = await setup();
  const animation = Buffer.alloc(20);
  animation.writeUInt32BE(8);
  animation.write("acTL", 4, "ascii");
  await writeFile(
    file,
    Buffer.concat([png.subarray(0, 33), animation, png.subarray(33)]),
  );
  await expect(
    importMedia(workspace, created.entry.projectId, {
      file,
      kind: "dialogue-frame",
      theme: { id: "animated", name: "Animated", data: {} },
    }),
  ).rejects.toThrow("Animated PNG");
  expect(
    (await workspace.loadProject(created.entry.projectId)).assets.themes,
  ).toHaveLength(0);
});
