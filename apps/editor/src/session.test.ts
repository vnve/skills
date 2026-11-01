import { describe, it, expect, vi, afterEach } from "vitest";
import { createDefaultProject } from "@vnve/core";
import { Session } from "./session";
function make() {
  const p = createDefaultProject();
  p.acts[0].scenes[0].script.nodes = [
    {
      id: "line",
      type: "text",
      text: "old",
      audioUrl: "assets/audio/old.wav",
      content: [
        { type: "text", text: "old" },
        { type: "tag", name: "wait", params: { seconds: 1 } },
      ],
    },
  ];
  const { assets, ...project } = p;
  return new Session(p.meta.id, {
    project,
    assets,
    projectRevision: "p0",
    assetsRevision: "a0",
  });
}
afterEach(() => vi.unstubAllGlobals());
describe("editor sessions", () => {
  it("preserves inline directions, invalidates audio, and restores the complete edit on undo", () => {
    const s = make(),
      scene = s.project.acts[0].scenes[0];
    s.edit({
      summary: "text",
      operations: [
        {
          type: "dialogue.segment.update",
          sceneId: scene.id,
          nodeId: "line",
          contentIndex: 0,
          text: "new",
        },
      ],
    });
    expect(s.project.acts[0].scenes[0].script.nodes[0]).toMatchObject({
      content: [
        { type: "text", text: "new" },
        { type: "tag", name: "wait" },
      ],
    });
    expect(
      s.project.acts[0].scenes[0].script.nodes[0].audioUrl,
    ).toBeUndefined();
    s.undo();
    expect(s.project.acts[0].scenes[0].script.nodes[0].audioUrl).toContain(
      "old.wav",
    );
    expect(s.dirty).toBe(false);
  });
  it("keeps edits made during save dirty, advances revisions, and separates shared assets", async () => {
    const s = make();
    let resolve!: (r: Response) => void;
    const fetch = vi.fn(
      () =>
        new Promise<Response>((r) => {
          resolve = r;
        }),
    );
    vi.stubGlobal("fetch", fetch);
    const saving = s.save();
    const next = { ...s.project, meta: { ...s.project.meta, title: "newer" } };
    s.replace(next);
    resolve(
      new Response(
        JSON.stringify({ projectRevision: "p1", assetsRevision: "a1" }),
      ),
    );
    await saving;
    expect(s.dirty).toBe(true);
    expect(s.project).toBe(next);
    expect(s.revision.projectRevision).toBe("p1");
    const sent = JSON.parse(fetch.mock.calls[0][1].body);
    expect(sent.project.assets).toBeUndefined();
    expect(sent.assets).toBeDefined();
    expect(sent.expected.projectRevision).toBe("p0");
  });
  it("does not discard local content after a save conflict", async () => {
    const s = make();
    s.replace({ ...s.project, meta: { ...s.project.meta, title: "unsaved" } });
    vi.stubGlobal(
      "fetch",
      async () =>
        new Response(
          JSON.stringify({ code: "CONFLICT", message: "revision changed" }),
          { status: 409 },
        ),
    );
    await expect(s.save()).rejects.toThrow("revision changed");
    expect(s.dirty).toBe(true);
    expect(s.project.meta.title).toBe("unsaved");
    expect(s.revision.projectRevision).toBe("p0");
  });
});

it("undoes a custom scene theme and its shared definition together", () => {
  const session = make();
  const scene = session.project.acts[0].scenes[0];
  const original = session.project;
  session.edit({
    summary: "Customize dialogue",
    operations: [
      {
        type: "dialogue.theme.create",
        sceneId: scene.id,
        theme: {
          id: "custom",
          name: "Custom",
          baseThemeId: "classic",
          data: { fontSize: 42 },
        },
      },
      {
        type: "dialogue.theme.apply",
        sceneId: scene.id,
        themeId: "custom",
        scope: "scene",
      },
    ],
  });
  expect(session.undoStack).toHaveLength(1);
  expect(session.project.assets.themes).toHaveLength(1);
  expect(session.project.acts[0].scenes[0].dialogueThemeId).toBe("custom");
  session.undo();
  expect(session.project).toBe(original);
  session.redo();
  expect(session.project.acts[0].scenes[0].dialogueThemeId).toBe("custom");
});

it("commits a staged local frame and its theme in one undo node, or leaves both unchanged", () => {
  const s = make(),
    original = s.project,
    scene = original.acts[0].scenes[0];
  const assets = structuredClone(original.assets);
  assets.visual.prop.push({
    id: "frame-group",
    name: "Frame",
    defaultVariantId: "frame",
    variants: [{ id: "frame", name: "Frame", url: "assets/visual/frame.webp" }],
  });
  const operations = [
    {
      type: "dialogue.theme.create" as const,
      sceneId: scene.id,
      theme: {
        id: "image-theme",
        name: "Frame",
        baseThemeId: "classic" as const,
        data: {
          boxImageAssetId: "frame",
          boxImageUrl: "assets/visual/frame.webp",
        },
      },
    },
    {
      type: "dialogue.theme.apply" as const,
      sceneId: scene.id,
      themeId: "image-theme",
      scope: "scene" as const,
    },
  ];
  expect(() => s.edit({ summary: "Invalid frame", operations })).toThrow(
    "Import the frame",
  );
  expect(s.project).toBe(original);
  expect(s.undoStack).toHaveLength(0);
  s.edit({ summary: "Frame theme", operations }, assets);
  expect(s.undoStack).toHaveLength(1);
  expect(s.project.assets.visual.prop).toHaveLength(
    original.assets.visual.prop.length + 1,
  );
  expect(s.project.acts[0].scenes[0].dialogueThemeId).toBe("image-theme");
  s.undo();
  expect(s.project).toBe(original);
});
