import { it, expect } from "vitest";
import {
  createDefaultProject,
  applyProjectPatchPlan,
  getTextNodeContent,
  collectProjectReferences,
} from "@vnve/core";
import { canvasAssetPlan } from "./canvas-assets";
function seed() {
  const p = createDefaultProject(),
    scene = p.acts[0].scenes[0];
  const group = {
    id: "people",
    name: "People",
    defaultVariantId: "neutral",
    variants: [
      { id: "neutral", name: "Normal", url: "assets/visual/normal.webp" },
      { id: "happy", name: "Happy", url: "assets/visual/happy.webp" },
    ],
  };
  const result = applyProjectPatchPlan(p, {
    summary: "seed",
    operations: [
      { type: "asset.group.create", assetType: "character", group },
      ...canvasAssetPlan(
        {
          ...p,
          assets: {
            ...p.assets,
            visual: { ...p.assets.visual, character: [group] },
          },
        },
        scene,
        "character",
        group,
        "happy",
      ),
    ],
  });
  if (!result.ok) throw Error(JSON.stringify(result.errors));
  return result.project;
}
it("places an existing material as an identity and preserves the selected nondefault look", () => {
  const p = seed(),
    actor = p.acts[0].scenes[0].actors[0];
  expect(actor.variantId).toBe("happy");
  expect(actor.visualSubjectId).toBe(p.visualSubjects[0].id);
  expect(p.assets.visual.character).toHaveLength(1);
});
it("appends all imported looks to one identity without replacing another actor or media", () => {
  const p = seed(),
    scene = p.acts[0].scenes[0],
    before = structuredClone(p.visualSubjects[0]);
  const imported = {
    id: "temp",
    name: "new looks",
    defaultVariantId: "v1",
    variants: [
      { id: "v1", name: "a", url: "assets/visual/a.webp" },
      { id: "v2", name: "b", url: "assets/visual/b.webp" },
    ],
  };
  const result = applyProjectPatchPlan(p, {
    summary: "looks",
    operations: canvasAssetPlan(
      p,
      scene,
      "actor",
      imported,
      "v1",
      scene.actors[0].id,
      true,
    ),
  });
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  expect(result.project.assets.visual.character[0].variants).toHaveLength(4);
  expect(result.project.visualSubjects[0].id).toBe(before.id);
  expect(result.project.visualSubjects[0].name).toBe(before.name);
  expect(result.project.visualSubjects[0].binding?.stateMap).toMatchObject(
    before.binding!.stateMap,
  );
});
it("locks and unlocks actors and atomically removes only scene placement references", () => {
  const p = seed(),
    scene = p.acts[0].scenes[0],
    actor = scene.actors[0];
  scene.script.nodes = [
    {
      id: "line",
      type: "text",
      actorId: actor.id,
      text: "hello",
      audioUrl: "assets/audio/voice.wav",
      audioDuration: 1,
      audioImportSnapshot: { text: "hello", actorId: actor.id },
      content: [
        { type: "text", text: "hello" },
        { type: "tag", name: "show", params: { actor: actor.id } },
      ],
    },
  ];
  const lock = applyProjectPatchPlan(p, {
    summary: "lock",
    operations: [
      {
        type: "actor.lock",
        sceneId: scene.id,
        actorId: actor.id,
        locked: true,
      },
    ],
  });
  expect(lock.ok).toBe(true);
  if (!lock.ok) return;
  const blocked = applyProjectPatchPlan(lock.project, {
    summary: "blocked",
    operations: [
      { type: "actor.remove", sceneId: scene.id, actorId: actor.id },
    ],
  });
  expect(blocked.ok).toBe(false);
  expect(blocked.project).toBe(lock.project);
  const removed = applyProjectPatchPlan(lock.project, {
    summary: "remove",
    operations: [
      {
        type: "actor.lock",
        sceneId: scene.id,
        actorId: actor.id,
        locked: false,
      },
      { type: "actor.remove", sceneId: scene.id, actorId: actor.id },
    ],
  });
  expect(removed.ok).toBe(true);
  if (!removed.ok) return;
  const after = removed.project.acts[0].scenes[0];
  expect(after.actors).toHaveLength(0);
  expect(after.script.nodes[0].actorId).toBeUndefined();
  expect(after.script.nodes[0].audioUrl).toBeUndefined();
  expect(after.script.nodes[0].audioImportSnapshot).toBeUndefined();
  expect(getTextNodeContent(after.script.nodes[0])).toEqual([
    { type: "text", text: "hello" },
  ]);
  expect(removed.project.visualSubjects).toEqual(p.visualSubjects);
  expect(removed.project.assets).toBe(p.assets);
});

it("clears a layer and its set cues while preserving shared media and identities", () => {
  const p = createDefaultProject(),
    scene = p.acts[0].scenes[0];
  scene.backgroundId = "bg";
  scene.backgroundSubjectId = "place";
  scene.backgroundStateId = "day";
  scene.script.nodes = [
    {
      id: "line",
      type: "text",
      text: "Keep me",
      content: [
        { type: "text", text: "Keep me" },
        {
          type: "tag",
          name: "set",
          params: { target: "$background", variant: "bg" },
        },
      ],
    },
  ];
  const result = applyProjectPatchPlan(p, {
    summary: "clear",
    operations: [
      { type: "scene.layer.clear", sceneId: scene.id, layer: "background" },
    ],
  });
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  const after = result.project.acts[0].scenes[0];
  expect(after.backgroundId).toBeUndefined();
  expect(after.backgroundSubjectId).toBeUndefined();
  expect(after.backgroundStateId).toBeUndefined();
  expect(getTextNodeContent(after.script.nodes[0])).toEqual([
    { type: "text", text: "Keep me" },
  ]);
  expect(result.project.assets).toBe(p.assets);
});
it("keeps unlinked scene settings independent while linked scenes follow global changes", () => {
  const p = createDefaultProject(),
    scene = p.acts[0].scenes[0];
  const result = applyProjectPatchPlan(p, {
    summary: "scene defaults",
    operations: [
      { type: "scene.props.link", sceneId: scene.id, linked: false },
      {
        type: "scene.defaults.update",
        sceneId: scene.id,
        defaults: {
          speakerScale: true,
          autoEntrance: false,
          entranceEffect: "fade",
          transition: { type: "dissolve", duration: 0.6 },
        },
      },
    ],
  });
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  expect(result.project.meta.sceneDefaults?.speakerScale).toBe(true);
  expect(result.project.acts[0].scenes[0].scenePropsLinked).toBe(false);
  expect(result.project.acts[0].scenes[0].speakerScale).toBe(false);
  const relink = applyProjectPatchPlan(result.project, {
    summary: "relink",
    operations: [{ type: "scene.props.link", sceneId: scene.id, linked: true }],
  });
  expect(relink.ok).toBe(true);
  if (relink.ok)
    expect(relink.project.acts[0].scenes[0].scenePropsLinked).toBe(true);
});
