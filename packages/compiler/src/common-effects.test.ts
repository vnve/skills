import { it, expect } from "vitest";
import { parse } from "@vnve/parser";
import { type InlineTag } from "@vnve/core";
const events = (tag: InlineTag) =>
  parse({
    nodes: [{ id: "direction", type: "text", text: "", content: [tag] }],
  }).events;
it("common presence and reaction commands preserve the existing actor event semantics", () => {
  expect(
    events({
      type: "tag",
      name: "presence",
      params: { action: "hide", actor: "hero", dur: 0.4 },
    } as InlineTag),
  ).toEqual(
    events({ type: "tag", name: "hide", params: { actor: "hero", dur: 0.4 } }),
  );
  expect(
    events({
      type: "tag",
      name: "reaction",
      params: { action: "hop", actor: "hero", amp: 12, dur: 0.5 },
    } as InlineTag),
  ).toEqual(
    events({
      type: "tag",
      name: "hop",
      params: { actor: "hero", amp: 12, dur: 0.5 },
    }),
  );
});
it("common weather reuses rain events and camera supports pulls and real two-person framing", () => {
  expect(
    events({
      type: "tag",
      name: "weather",
      params: { kind: "rain", intensity: "light", dur: 1 },
    }),
  ).toEqual(
    events({
      type: "tag",
      name: "rain",
      params: { intensity: "light", dur: 1 },
    }),
  );
  const pull = events({
    type: "tag",
    name: "camera",
    params: { action: "pull" },
  })[0];
  expect(pull.type).toBe("camera-focus");
  expect(pull.params).toMatchObject({ zoom: 1 });
  const pair = events({
    type: "tag",
    name: "camera",
    params: { action: "duo", actor: "a", other: "b" },
  })[0];
  expect(pair.params).toMatchObject({ other: "b", fitPair: true });
});
it("transition direction selects soft dissolve on real adjacent scenes with no duplicate wait", async () => {
  const { createDefaultProject } = await import("@vnve/core");
  const { compilePlaybackScope } =
    await import("../../renderer/src/playback/compile-playback-scope");
  const project = createDefaultProject(),
    scene = project.acts[0].scenes[0],
    next = structuredClone(scene);
  next.id = "next";
  project.acts[0].scenes.push(next);
  scene.script.nodes = [
    {
      id: "before",
      type: "text",
      text: "",
      content: [{ type: "tag", name: "wait", params: { seconds: 1 } }],
    },
    {
      id: "exit",
      type: "text",
      text: "",
      content: [
        {
          type: "tag",
          name: "transition",
          params: { nextScene: "next", effect: "soft-dissolve", dur: 1 },
        },
      ],
    },
  ];
  next.script.nodes = [
    {
      id: "after",
      type: "text",
      text: "",
      content: [{ type: "tag", name: "wait", params: { seconds: 1 } }],
    },
  ];
  const result = compilePlaybackScope({
    project,
    scope: { type: "project" },
    resolvedUrlMap: new Map(),
  });
  expect(result.sequence.transitions[0].effect).toBe("soft-dissolve");
  expect(result.sequence.duration).toBe(3);
  scene.script.nodes[1].content = [
    {
      type: "tag",
      name: "transition",
      params: { nextScene: "next", effect: "dissolve", dur: 1 },
    },
  ];
  const plain = compilePlaybackScope({
    project,
    scope: { type: "project" },
    resolvedUrlMap: new Map(),
  });
  expect(result.sequence.transitions[0].startTime).toBe(
    plain.sequence.transitions[0].startTime,
  );

  expect(() =>
    compilePlaybackScope({
      project,
      scope: { type: "scene", sceneId: scene.id },
      resolvedUrlMap: new Map(),
    }),
  ).not.toThrow();
});
it("unified camera depth preserves the existing baked sampling and lock protection", async () => {
  const { createDefaultProject } = await import("@vnve/core");
  const { compilePlaybackScope } =
    await import("../../renderer/src/playback/compile-playback-scope");
  const { sampleSequence } =
    await import("../../renderer/src/sequence-evaluator");
  const { applyCompiledProjectPatchPlan } = await import("./project-patch");
  const project = createDefaultProject(),
    scene = project.acts[0].scenes[0];
  project.assets.visual.character = [
    {
      id: "cast",
      name: "Hero",
      defaultVariantId: "portrait",
      variants: [{ id: "portrait", name: "Portrait", url: "/hero.webp" }],
    },
  ];
  scene.actors = [
    {
      id: "hero",
      characterId: "cast",
      variantId: "portrait",
      x: 50,
      y: 100,
      scale: 1,
      visible: true,
      zIndex: 0,
    },
  ];
  scene.script.nodes = [
    {
      id: "line",
      type: "text",
      text: "Keep",
      audioUrl: "/voice.wav",
      audioDuration: 2,
    },
  ];
  const plan = {
    summary: "Depth camera",
    operations: [
      {
        type: "direction.insert" as const,
        sceneId: scene.id,
        nodeId: "line",
        contentIndex: 0,
        direction: {
          name: "camera" as const,
          params: { action: "parallax" as const, moveX: 3, dur: 4 },
        },
      },
    ],
  };
  scene.actors[0].locked = true;
  expect(applyCompiledProjectPatchPlan(project, plan).ok).toBe(false);
  scene.actors[0].locked = false;
  const result = applyCompiledProjectPatchPlan(project, plan);
  expect(result.ok).toBe(true);
  expect(result.project.acts[0].scenes[0].script.nodes[0].audioUrl).toBe(
    "/voice.wav",
  );
  const compiled = compilePlaybackScope({
    project: result.project,
    scope: { type: "project" },
    resolvedUrlMap: new Map(),
  });
  expect(
    sampleSequence({ sequence: compiled.sequence, time: 2 }).single!
      .nextRenderState.visuals,
  ).toHaveLength(1);
});
it("duo framing samples actual actor positions and protects the second actor", async () => {
  const { createDefaultProject } = await import("@vnve/core");
  const { compilePlaybackScope } =
    await import("../../renderer/src/playback/compile-playback-scope");
  const { sampleSequence } =
    await import("../../renderer/src/sequence-evaluator");
  const { applyCompiledProjectPatchPlan } = await import("./project-patch");
  const project = createDefaultProject(),
    scene = project.acts[0].scenes[0];
  project.assets.visual.character = [
    {
      id: "cast",
      name: "Cast",
      defaultVariantId: "portrait",
      variants: [{ id: "portrait", name: "Portrait", url: "/hero.webp" }],
    },
  ];
  scene.actors = ["a", "b"].map((id, i) => ({
    id,
    characterId: "cast",
    variantId: "portrait",
    x: i ? 70 : 30,
    y: 100,
    scale: 1,
    visible: true,
    zIndex: i,
  }));
  scene.script.nodes = [
    {
      id: "line",
      type: "text",
      text: "Keep",
      content: [
        {
          type: "tag",
          name: "camera",
          params: { action: "duo", actor: "a", other: "b", dur: 1 },
        },
        { type: "text", text: "Keep" },
      ],
    },
  ];
  const compiled = compilePlaybackScope({
    project,
    scope: { type: "project" },
    resolvedUrlMap: new Map(),
  });
  const camera = sampleSequence({ sequence: compiled.sequence, time: 1.2 })
    .single!.nextRenderState.camera;
  expect(camera.x).toBe(50);
  expect(camera.scale).toBeCloseTo(1.0588235, 5);
  scene.actors[1].locked = true;
  scene.script.nodes = [{ id: "line", type: "text", text: "Keep" }];
  expect(
    applyCompiledProjectPatchPlan(project, {
      summary: "Duo",
      operations: [
        {
          type: "direction.insert",
          sceneId: scene.id,
          nodeId: "line",
          contentIndex: 0,
          direction: {
            name: "camera",
            params: { action: "duo", actor: "a", other: "b" },
          },
        },
      ],
    }).ok,
  ).toBe(false);
});

it("reaction amplitude follows its underlying action contract", async () => {
  const { inlineTagSchema } = await import("@vnve/core");
  expect(
    inlineTagSchema.safeParse({
      type: "tag",
      name: "reaction",
      params: { action: "shake", actor: "a", amp: 0 },
    }).success,
  ).toBe(false);
  expect(
    inlineTagSchema.safeParse({
      type: "tag",
      name: "reaction",
      params: { action: "hop", actor: "a", amp: 0 },
    }).success,
  ).toBe(true);
});
