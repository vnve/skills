import { expect, it } from "vitest";
import { createDefaultProject, commandParamsSchemas } from "@vnve/core";
import { compilePlaybackScope } from "../../renderer/src/playback/compile-playback-scope";
import { sampleSequence } from "../../renderer/src/sequence-evaluator";
const setup = () => {
  const project = createDefaultProject(),
    scene = project.acts[0].scenes[0];
  project.assets.visual.character = [
    {
      id: "media",
      name: "Hero",
      defaultVariantId: "portrait",
      variants: [{ id: "portrait", name: "Default", url: "/portrait.webp" }],
    },
  ];
  scene.actors = [
    {
      id: "hero",
      characterId: "media",
      variantId: "portrait",
      visible: true,
      x: 50,
      y: 100,
      scale: 1,
      zIndex: 0,
    },
  ];
  return { project, scene };
};
it("compiles a comic InlineTag into seekable visuals without stored clips or identity edits", () => {
  const { project, scene } = setup();
  scene.script.nodes = [
    {
      id: "line",
      type: "text",
      text: "Hello",
      content: [
        {
          type: "tag",
          name: "comic",
          params: { actor: "hero", text: "Wait!", dur: 2 },
        },
        { type: "text", text: "Hello" },
      ],
    },
  ];
  const before = JSON.stringify(project);
  const compiled = compilePlaybackScope({
    project,
    scope: { type: "project" },
    resolvedUrlMap: new Map(),
  });
  const at = (time: number) =>
    sampleSequence({ sequence: compiled.sequence, time }).single!
      .nextRenderState;
  expect(
    at(0.8).visuals?.[0].nodes.some(
      (n) => n.type === "Text" && n.attrs.text === "Wait!",
    ),
  ).toBe(true);
  expect(at(2.1).visuals).toEqual([]);
  expect(at(0.8).actors[0].sprite).toBe("portrait");
  expect(JSON.stringify(project)).toBe(before);
});
it("uses a terminal wipe direction to transition between real adjacent scenes", () => {
  const { project, scene } = setup();
  const next = structuredClone(scene);
  next.id = "next";
  next.script.nodes = [{ id: "after", type: "text", text: "After" }];
  project.acts[0].scenes.push(next);
  scene.script.nodes = [
    { id: "before", type: "text", text: "Before" },
    {
      id: "wipe",
      type: "text",
      text: "",
      content: [
        {
          type: "tag",
          name: "wipe",
          params: { nextScene: "next", dur: 1, direction: "right" },
        },
      ],
    },
  ];
  const compiled = compilePlaybackScope({
    project,
    scope: { type: "project" },
    resolvedUrlMap: new Map(),
  });
  expect(compiled.sequence.transitions[0].effect).toBe("wipe-right");
  expect(scene.transition?.type).not.toBe("wipe-right");
});
it.each(["introduce", "duel", "memory", "awake"] as const)(
  "compiles %s from parameters and restores after its interval",
  (name) => {
    const { project, scene } = setup();
    scene.actors.push({ ...scene.actors[0], id: "other", x: 75 });
    project.assets.visual.background = [
      {
        id: "places",
        name: "Places",
        defaultVariantId: "room",
        variants: [{ id: "room", name: "Room", url: "/room.webp" }],
      },
    ];
    scene.backgroundId = "room";
    const params = {
      introduce: { actor: "hero", title: "小夏", subtitle: "同学" },
      duel: { actor: "hero", other: "other", pressure: 0.2 },
      memory: { images: ["room"], caption: "那一天" },
      awake: { blur: 12 },
    }[name];
    scene.script.nodes = [
      {
        id: "line",
        type: "text",
        text: "End",
        content: [
          { type: "tag", name, params: { ...params, dur: 2 } },
          { type: "text", text: "End" },
        ],
      },
    ];
    const result = compilePlaybackScope({
      project,
      scope: { type: "project" },
      resolvedUrlMap: new Map(),
    });
    const at = (t: number) =>
      sampleSequence({ sequence: result.sequence, time: t }).single!
        .nextRenderState;
    expect(at(0.7).visuals?.length).toBe(1);
    expect(at(2.1).visuals).toEqual([]);
    expect(at(0.7).visuals?.length).toBe(1);
    if (name === "awake")
      expect(
        at(0).visuals![0].nodes.find((n) => n.id === "content")?.attrs.blur,
      ).toBe(12);
  },
);
it("disabled commands do not wait or draw, while invalid references still fail", () => {
  const { project, scene } = setup();
  scene.script.nodes = [
    {
      id: "line",
      type: "text",
      text: "End",
      content: [
        {
          type: "tag",
          name: "comic",
          params: { actor: "hero", enabled: false, dur: 20 },
        },
        { type: "text", text: "End" },
      ],
    },
  ];
  const compiled = compilePlaybackScope({
    project,
    scope: { type: "project" },
    resolvedUrlMap: new Map(),
  });
  expect(compiled.sequence.duration).toBeLessThan(20);
  expect(
    sampleSequence({ sequence: compiled.sequence, time: 0 }).single!
      .nextRenderState.visuals,
  ).toEqual([]);
  scene.script.nodes[0].content![0] = {
    type: "tag",
    name: "comic",
    params: { actor: "missing", enabled: false },
  };
  expect(() =>
    compilePlaybackScope({
      project,
      scope: { type: "project" },
      resolvedUrlMap: new Map(),
    }),
  ).toThrow(/missing/);
});
it("rejects duplicate duel targets and invalid image lists at the shared schema", () => {
  expect(
    commandParamsSchemas.duel.safeParse({ actor: "hero", other: "hero" })
      .success,
  ).toBe(false);
  expect(
    commandParamsSchemas.memory.safeParse({ images: ["room", "room"] }).success,
  ).toBe(false);
  expect(
    commandParamsSchemas.comic.safeParse({ actor: "hero", dur: Infinity })
      .success,
  ).toBe(false);
});
it("protects a locked second actor when inserting duel and rolls the whole patch back", async () => {
  const { applyCompiledProjectPatchPlan } = await import("./project-patch");
  const { project, scene } = setup();
  scene.actors.push({ ...scene.actors[0], id: "other", locked: true });
  scene.script.nodes = [{ id: "line", type: "text", text: "Keep" }];
  const result = applyCompiledProjectPatchPlan(project, {
    summary: "Try locked duel",
    operations: [
      { type: "scene.update", sceneId: scene.id, name: "Must not apply" },
      {
        type: "direction.insert",
        sceneId: scene.id,
        nodeId: "line",
        contentIndex: 0,
        direction: { name: "duel", params: { actor: "hero", other: "other" } },
      },
    ],
  });
  expect(result.ok).toBe(false);
  expect(result.project).toBe(project);
});
it("keeps disabled memory references protected and rejects missing images atomically", async () => {
  const { applyCompiledProjectPatchPlan } = await import("./project-patch");
  const { project, scene } = setup();
  scene.script.nodes = [{ id: "line", type: "text", text: "Keep" }];
  const result = applyCompiledProjectPatchPlan(project, {
    summary: "Missing image",
    operations: [
      {
        type: "direction.insert",
        sceneId: scene.id,
        nodeId: "line",
        contentIndex: 0,
        direction: {
          name: "memory",
          params: { images: ["missing"], enabled: false },
        },
      },
    ],
  });
  expect(result.ok).toBe(false);
  expect(result.project).toBe(project);
});
it("rejects a wipe before the last node and preserves recorded dialogue when adding a native direction", async () => {
  const { applyCompiledProjectPatchPlan } = await import("./project-patch");
  const { project, scene } = setup();
  const next = structuredClone(scene);
  next.id = "next";
  project.acts[0].scenes.push(next);
  scene.script.nodes = [
    {
      id: "line",
      type: "text",
      text: "Keep",
      audioUrl: "/recorded.wav",
      audioDuration: 2,
    },
  ];
  const bad = applyCompiledProjectPatchPlan(project, {
    summary: "Invalid wipe",
    operations: [
      {
        type: "direction.insert",
        sceneId: scene.id,
        nodeId: "line",
        contentIndex: 0,
        direction: { name: "wipe", params: { nextScene: "next" } },
      },
    ],
  });
  expect(bad.ok).toBe(false);
  const good = applyCompiledProjectPatchPlan(project, {
    summary: "Add direction",
    operations: [
      {
        type: "direction.insert",
        sceneId: scene.id,
        nodeId: "line",
        contentIndex: 0,
        direction: { name: "comic", params: { actor: "hero", await: false } },
      },
    ],
  });
  expect(good.ok).toBe(true);
  expect(good.project.acts[0].scenes[0].script.nodes[0].audioUrl).toBe(
    "/recorded.wav",
  );
});
it("awake includes every actor in the blurred view and protects them when a focal actor is supplied", async () => {
  const { project, scene } = setup();
  scene.actors.push({ ...scene.actors[0], id: "other", locked: true });
  scene.script.nodes = [
    {
      id: "line",
      type: "text",
      text: "Keep",
      content: [{ type: "tag", name: "awake", params: { actor: "hero" } }],
    },
  ];
  const compiled = compilePlaybackScope({
    project,
    scope: { type: "project" },
    resolvedUrlMap: new Map(),
  });
  const state = sampleSequence({ sequence: compiled.sequence, time: 1 }).single!
    .nextRenderState;
  expect(
    state.visuals![0].nodes.find((n) => n.id === "content")?.attrs.members,
  ).toContainEqual({ kind: "actor", actorId: "other" });
  scene.script.nodes = [{ id: "line", type: "text", text: "Keep" }];
  const { applyCompiledProjectPatchPlan } = await import("./project-patch");
  expect(
    applyCompiledProjectPatchPlan(project, {
      summary: "Awake locked actor",
      operations: [
        {
          type: "direction.insert",
          sceneId: scene.id,
          nodeId: "line",
          contentIndex: 0,
          direction: { name: "awake", params: { actor: "hero" } },
        },
      ],
    }).ok,
  ).toBe(false);
});
it("compiles a source-scene scope with a valid cross-act wipe without importing the next scene", () => {
  const { project, scene } = setup();
  const next = structuredClone(scene);
  next.id = "next";
  project.acts.push({ ...project.acts[0], id: "act-next", scenes: [next] });
  scene.script.nodes = [
    {
      id: "exit",
      type: "text",
      text: "",
      content: [{ type: "tag", name: "wipe", params: { nextScene: "next" } }],
    },
  ];
  const result = compilePlaybackScope({
    project,
    scope: { type: "scene", sceneId: scene.id },
    resolvedUrlMap: new Map(),
  });
  expect(result.scenes.map((s) => s.id)).toEqual([scene.id]);
  expect(result.sequence.transitions).toHaveLength(0);
});
it("keeps repeated native instances independent and detects overlapping actor ownership", () => {
  const { project, scene } = setup();
  project.meta.width = 1080;
  project.meta.height = 1920;
  const comic = {
    type: "tag" as const,
    name: "comic" as const,
    params: { actor: "hero", dur: 1 },
  };
  scene.script.nodes = [
    { id: "line", type: "text", text: "", content: [comic, comic] },
  ];
  const result = compilePlaybackScope({
    project,
    scope: { type: "project" },
    resolvedUrlMap: new Map(),
  });
  const first = sampleSequence({ sequence: result.sequence, time: 0.5 }).single!
    .nextRenderState.visuals![0];
  const second = sampleSequence({ sequence: result.sequence, time: 1.5 })
    .single!.nextRenderState.visuals![0];
  expect(first.id).not.toBe(second.id);
  expect(result.sequence.duration).toBe(2);
  scene.script.nodes[0].content = [
    { ...comic, params: { ...comic.params, await: false } },
    comic,
  ];
  expect(() =>
    compilePlaybackScope({
      project,
      scope: { type: "project" },
      resolvedUrlMap: new Map(),
    }),
  ).toThrow(/overlap|重叠|归属|conflict/i);
});
