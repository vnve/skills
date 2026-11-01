import { expect, it } from "vitest";
import { createDefaultProject } from "../../core/src/helpers";
import { buildAnimation } from "../../authoring/src";
import { applyCompiledProjectPatchPlan as applyProjectPatchPlan } from "./project-patch";
import { collectProjectReferences } from "../../core/src/references";
const clip = (sceneId: string) =>
  buildAnimation(
    {
      sdkVersion: 2,
      sceneId,
      id: "impact",
      name: "Impact",
      width: 1920,
      height: 1080,
      duration: 0.5,
      build({ scene }) {
        scene.circle({ id: "halo", radius: 20 });
      },
    },
    "",
    { width: 1920, height: 1080, cues: [] },
  );
it("applies visuals without altering dialogue, and rejects incompatible overrides atomically", () => {
  const project = createDefaultProject(),
    scene = project.acts[0].scenes[0];
  scene.script.nodes = [
    {
      id: "line",
      type: "text",
      text: "Hello world",
      timing: { revealDuration: 2 },
    },
  ];
  const first = applyProjectPatchPlan(project, {
    summary: "Add impact",
    operations: [
      { type: "animation.set", sceneId: scene.id, clip: clip(scene.id) },
    ],
  });
  expect(first.ok).toBe(true);
  if (!first.ok) return;
  const edited = applyProjectPatchPlan(first.project, {
    summary: "Move impact",
    operations: [
      {
        type: "animation.override",
        sceneId: scene.id,
        animationId: "impact",
        overrides: { x: 50 },
      },
    ],
  });
  expect(edited.ok).toBe(true);
  if (!edited.ok) return;
  const replaced = applyProjectPatchPlan(edited.project, {
    summary: "Rebuild",
    operations: [
      { type: "animation.set", sceneId: scene.id, clip: clip(scene.id) },
    ],
  });
  expect(replaced.ok).toBe(true);
  if (!replaced.ok) return;
  expect(
    replaced.project.acts[0].scenes[0].animationClips?.[0].overrides,
  ).toEqual({ x: 50 });
  expect(replaced.project.acts[0].scenes[0].script).toEqual(scene.script);
  const failed = applyProjectPatchPlan(edited.project, {
    summary: "Bad rebuild",
    operations: [
      { type: "scene.update", sceneId: scene.id, name: "Must roll back" },
      {
        type: "animation.set",
        sceneId: scene.id,
        clip: { ...clip(scene.id), width: 100 },
      },
    ],
  });
  expect(failed).toMatchObject({
    ok: false,
    project: edited.project,
    errors: [{ code: "ANIMATION_OVERRIDE_CONFLICT" }],
  });
});
it("protects disabled image references and rejects dangling animation tags atomically", () => {
  const project = createDefaultProject(),
    scene = project.acts[0].scenes[0];
  scene.script.nodes = [
    {
      id: "line",
      type: "text",
      text: "Hello world",
      timing: { revealDuration: 2 },
    },
  ];
  const image = {
    ...clip(scene.id),
    nodes: [
      {
        id: "image",
        type: "Image" as const,
        attrs: { assetId: "missing", width: 100, height: 100 },
      },
    ],
    overrides: { enabled: false },
  };
  expect(
    applyProjectPatchPlan(project, {
      summary: "Missing image",
      operations: [{ type: "animation.set", sceneId: scene.id, clip: image }],
    }),
  ).toMatchObject({ ok: false });
  scene.animationClips = [image];
  expect(
    collectProjectReferences(project, [scene]).variants.has("missing"),
  ).toBe(true);
  scene.animationClips = [];
  expect(
    applyProjectPatchPlan(project, {
      summary: "Overflow",
      operations: [
        {
          type: "animation.set",
          sceneId: scene.id,
          clip: clip(scene.id),
        },
        {
          type: "dialogue.content.update",
          sceneId: scene.id,
          nodeId: "line",
          content: [
            { type: "tag", name: "animation", params: { clipId: "missing" } },
            { type: "text", text: "Hello world" },
          ],
        },
      ],
    }),
  ).toMatchObject({ ok: false });
});
it("resolves dialogue anchors again after moving or deleting a line", () => {
  const project = createDefaultProject(),
    scene = project.acts[0].scenes[0];
  scene.script.nodes = [
    { id: "a", type: "text", text: "A", timing: { revealDuration: 1 } },
    { id: "b", type: "text", text: "B", timing: { revealDuration: 1 } },
  ];
  const first = applyProjectPatchPlan(project, {
    summary: "Anchor",
    operations: [
      {
        type: "animation.set",
        sceneId: scene.id,
        clip: { ...clip(scene.id), anchor: { nodeId: "b", edge: "start" } },
      },
    ],
  });
  expect(first.ok).toBe(true);
  if (!first.ok) return;
  const moved = applyProjectPatchPlan(first.project, {
    summary: "Move",
    operations: [
      { type: "dialogue.move", sceneId: scene.id, nodeId: "b", index: 0 },
    ],
  });
  expect(moved.ok).toBe(true);
  expect(
    applyProjectPatchPlan(first.project, {
      summary: "Delete",
      operations: [{ type: "dialogue.remove", sceneId: scene.id, nodeId: "b" }],
    }),
  ).toMatchObject({ ok: false, project: first.project });
});
