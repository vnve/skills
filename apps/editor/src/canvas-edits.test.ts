import { expect, it } from "vitest";
import {
  createDefaultProject,
  createDefaultScene,
  applyProjectPatchPlan,
} from "@vnve/core";
import { actorPlacementEdits, currentLookEdits } from "./canvas-edits";
it("updates the current explicit placement without replacing text, other tags, or future movement", () => {
  const p = createDefaultProject();
  const scene = p.acts[0].scenes[0];
  p.assets.visual.character = [
    {
      id: "g",
      name: "Hero",
      defaultVariantId: "v",
      variants: [{ id: "v", name: "Default", url: "assets/hero.webp" }],
    },
  ];
  scene.actors = [
    {
      id: "hero",
      characterId: "g",
      variantId: "v",
      x: 20,
      y: 100,
      scale: 1,
      visible: true,
      zIndex: 0,
    },
  ];
  scene.script.nodes = [
    {
      id: "one",
      type: "text",
      text: "First",
      content: [
        {
          type: "tag",
          name: "move",
          params: { actor: "hero", to: "left", dur: 0.4 },
        },
        { type: "text", text: "First" },
        { type: "tag", name: "wait", params: { seconds: 1 } },
      ],
    },
    {
      id: "two",
      type: "text",
      text: "Later",
      content: [
        { type: "tag", name: "move", params: { actor: "hero", to: "right" } },
        { type: "text", text: "Later" },
      ],
    },
  ];
  const result = applyProjectPatchPlan(p, {
    summary: "Drag",
    operations: actorPlacementEdits(scene, "hero", { x: 42, y: 95 }, 2, [
      { nodeId: "one", start: 0 },
      { nodeId: "two", start: 5 },
    ]),
  });
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  const updated = result.project.acts[0].scenes[0];
  expect(updated.script.nodes[0].content?.[0]).toMatchObject({
    name: "move",
    params: { toX: 42, toY: 95, dur: 0.4 },
  });
  expect(updated.script.nodes[0].content?.[2]).toEqual(
    scene.script.nodes[0].content?.[2],
  );
  expect(updated.script.nodes[1]).toEqual(scene.script.nodes[1]);
});

it("changes only the active look cue and keeps future scripted changes", () => {
  const scene = createDefaultScene();
  scene.script.nodes = [
    {
      id: "first",
      type: "text",
      text: "a",
      content: [
        {
          type: "tag",
          name: "set",
          params: { target: "actor", variant: "old", stateId: "old-state" },
        },
        { type: "text", text: "a" },
      ],
    },
    {
      id: "later",
      type: "text",
      text: "b",
      content: [
        {
          type: "tag",
          name: "set",
          params: { target: "actor", variant: "future" },
        },
        { type: "text", text: "b" },
      ],
    },
  ];
  const operations = currentLookEdits(scene, "actor", "new", 1, [
    { nodeId: "first", start: 0 },
    { nodeId: "later", start: 5 },
  ]);
  expect(operations).toEqual([
    {
      type: "direction.update",
      sceneId: scene.id,
      nodeId: "first",
      contentIndex: 0,
      direction: { name: "set", params: { target: "actor", variant: "new" } },
    },
  ]);
  expect(scene.script.nodes[1].content?.[0]).toMatchObject({
    params: { variant: "future" },
  });
});

it("places a visibility override after existing opening directions so show cannot override hide", () => {
  const scene = createDefaultScene();
  scene.script.nodes = [
    {
      id: "line",
      type: "text",
      text: "Hello",
      content: [
        {
          type: "tag",
          name: "show",
          params: { actor: "hero", dur: 0, with: "none" },
        },
        { type: "text", text: "Hello" },
      ],
    },
  ];
  const operations = actorPlacementEdits(scene, "hero", { visible: false }, 0, [
    { nodeId: "line", start: 0 },
  ]);
  expect(operations.find((op) => op.type === "direction.insert")).toMatchObject(
    {
      contentIndex: 1,
      direction: { name: "hide", params: { actor: "hero", dur: 0 } },
    },
  );
});

it("preserves the other move axis across sequential single-field edits", () => {
  const scene = createDefaultScene();
  scene.actors = [
    {
      id: "hero",
      characterId: "g",
      variantId: "v",
      x: 50,
      y: 100,
      scale: 1,
      visible: true,
      zIndex: 0,
    },
  ];
  scene.script.nodes = [
    {
      id: "one",
      type: "text",
      text: "Hello",
      content: [
        {
          type: "tag",
          name: "move",
          params: { actor: "hero", toX: 42, toY: 95, dur: 0.4 },
        },
        { type: "text", text: "Hello" },
      ],
    },
  ];
  const edits = actorPlacementEdits(scene, "hero", { y: 90 }, 1, [
    { nodeId: "one", start: 0 },
  ]);
  expect(edits[0]).toEqual({
    type: "actor.update",
    sceneId: scene.id,
    actorId: "hero",
    y: 90,
  });
  expect(edits[1]).toMatchObject({
    direction: { params: { toX: 42, toY: 90, dur: 0.4 } },
  });
});

it("preserves the portrait slot's horizontal position when editing only Y", () => {
  const scene = createDefaultScene();
  scene.actors = [
    {
      id: "hero",
      characterId: "g",
      variantId: "v",
      x: 50,
      y: 100,
      scale: 1,
      visible: true,
      zIndex: 0,
    },
  ];
  scene.script.nodes = [
    {
      id: "one",
      type: "text",
      text: "Hello",
      content: [
        { type: "tag", name: "move", params: { actor: "hero", to: "left" } },
        { type: "text", text: "Hello" },
      ],
    },
  ];
  const edits = actorPlacementEdits(
    scene,
    "hero",
    { y: 90 },
    1,
    [{ nodeId: "one", start: 0 }],
    { width: 1080, height: 1920 },
  );
  expect(edits[1]).toMatchObject({
    direction: { params: { toX: 30, toY: 90 } },
  });
});
