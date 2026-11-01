import { it, expect } from "vitest";
import {
  createDefaultProject,
  applyProjectPatchPlan,
  resolveDialogueProps,
} from "@vnve/core";
import { Session } from "./session";
function session() {
  const p = createDefaultProject();
  p.meta.defaultDialogueThemeId = "scifi";
  p.meta.sceneDefaults = { speakerScale: false, autoEntrance: true };
  const { assets, ...project } = p;
  return new Session(p.meta.id, {
    project,
    assets,
    projectRevision: "p",
    assetsRevision: "a",
  });
}
it("moving the dialogue preserves the inherited theme and creates no shared asset or theme", () => {
  const s = session(),
    scene = s.project.acts[0].scenes[0];
  const before = s.project;
  for (const x of [40, 60])
    s.edit({
      summary: "Move dialogue",
      operations: [
        { type: "dialogue.layout.update", sceneId: scene.id, x, y: 80 },
      ],
    });
  const after = s.project.acts[0].scenes[0];
  expect(s.project.assets.themes).toHaveLength(0);
  expect(resolveDialogueProps(after, s.project.meta)).toMatchObject({
    dialogueThemeId: "scifi",
    dialogueX: 60,
    dialogueY: 80,
  });
  s.undo();
  expect(
    resolveDialogueProps(s.project.acts[0].scenes[0], s.project.meta).dialogueX,
  ).toBe(40);
  s.undo();
  expect(s.project).toBe(before);
});
it("persists layer locks with the project and rejects layout edits atomically", () => {
  const s = session(),
    scene = s.project.acts[0].scenes[0];
  s.edit({
    summary: "Lock",
    operations: [
      {
        type: "scene.layer.lock",
        sceneId: scene.id,
        layer: "dialogue",
        locked: true,
      },
    ],
  });
  const locked = s.project;
  const reopened = JSON.parse(JSON.stringify(locked));
  expect(reopened.acts[0].scenes[0].lockedElements.dialogue).toBe(true);
  expect(() =>
    s.edit({
      summary: "Blocked move",
      operations: [
        { type: "dialogue.layout.update", sceneId: scene.id, x: 20, y: 70 },
      ],
    }),
  ).toThrow("Unlock");
  expect(s.project).toBe(locked);
  s.undo();
  expect(s.project.acts[0].scenes[0].lockedElements).toBeUndefined();
});
it("makes a local scene setting independent in one undo without changing global defaults", () => {
  const s = session(),
    scene = s.project.acts[0].scenes[0],
    before = s.project;
  s.edit({
    summary: "Local setting",
    operations: [
      { type: "scene.props.link", sceneId: scene.id, linked: false },
      { type: "scene.update", sceneId: scene.id, speakerScale: true },
    ],
  });
  expect(s.project.meta.sceneDefaults?.speakerScale).toBe(false);
  expect(s.project.acts[0].scenes[0].speakerScale).toBe(true);
  expect(s.undoStack).toHaveLength(1);
  s.undo();
  expect(s.project).toBe(before);
});

it("preserves locked layer directions during text edits but rejects removing them", () => {
  const s = session(),
    scene = s.project.acts[0].scenes[0];
  s.project.assets.visual.background = [
    {
      id: "bg-group",
      name: "Background",
      defaultVariantId: "unused",
      variants: [{ id: "unused", name: "Day", url: "assets/visual/day.webp" }],
    },
  ];
  scene.backgroundId = "unused";
  const tag = {
    type: "tag" as const,
    name: "set" as const,
    params: { target: "$background", variant: "unused" },
  };
  scene.script.nodes = [
    {
      id: "line",
      type: "text",
      text: "before",
      content: [tag, { type: "text", text: "before" }],
    },
  ];
  s.edit({
    summary: "lock background",
    operations: [
      {
        type: "scene.layer.lock",
        sceneId: scene.id,
        layer: "background",
        locked: true,
      },
    ],
  });
  s.edit({
    summary: "edit words",
    operations: [
      {
        type: "dialogue.content.update",
        sceneId: scene.id,
        nodeId: "line",
        content: [tag, { type: "text", text: "after" }],
      },
    ],
  });
  expect(s.project.acts[0].scenes[0].script.nodes[0].text).toBe("after");
  expect(() =>
    s.edit({
      summary: "remove cue",
      operations: [
        {
          type: "dialogue.content.update",
          sceneId: scene.id,
          nodeId: "line",
          content: [{ type: "text", text: "after" }],
        },
      ],
    }),
  ).toThrow("locked");
});
