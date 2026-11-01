import { expect, it } from "vitest";
import { createDefaultProject } from "@vnve/core";
import { buildAnimation } from "../../../authoring/src";
import { compilePlaybackScope } from "../playback/compile-playback-scope";
import { sampleSequence } from "../sequence-evaluator";
it("samples visual base, animation, held endpoint and lifetime independently of seek order", () => {
  const project = createDefaultProject(),
    scene = project.acts[0].scenes[0];
  scene.script.nodes = [
    {
      id: "line",
      type: "text",
      text: "A long enough line",
      timing: { revealDuration: 3 },
    },
  ];
  scene.animationClips = [
    buildAnimation(
      {
        sdkVersion: 2,
        sceneId: scene.id,
        id: "impact",
        name: "Impact",
        width: 1920,
        height: 1080,
        duration: 2,
        sampleRate: 10,
        build({ scene, timeline, target }) {
          const n = scene.circle({ id: "halo", radius: 10, x: 12 });
          timeline().fromTo(
            target(n, { x: 12 }),
            { x: 20 },
            { x: 40, duration: 0.5, ease: "none" },
            0.5,
          );
        },
      },
      "",
      { width: 1920, height: 1080, cues: [] },
    ),
  ];
  scene.script.nodes[0].content = [
    {
      type: "tag",
      name: "animation",
      params: { clipId: scene.animationClips[0].id, await: false },
    },
    { type: "text", text: scene.script.nodes[0].text },
  ];
  const compiled = compilePlaybackScope({
    project,
    scope: { type: "project" },
    resolvedUrlMap: new Map(),
  });
  const sample = (time: number) =>
    sampleSequence({ sequence: compiled.sequence, time }).single!
      .nextRenderState.visuals ?? [];
  expect(sample(0)[0].nodes[0].attrs.x).toBe(12);
  expect(sample(0.75)[0].nodes[0].attrs.x).toBeCloseTo(30);
  expect(sample(1.5)[0].nodes[0].attrs.x).toBe(40);
  expect(sample(2)).toEqual([]);
  expect(sample(0.75)[0].nodes[0].attrs.x).toBeCloseTo(30);
});

it("keeps follow anchors separate from screen-space user offsets", () => {
  const project = createDefaultProject(),
    scene = project.acts[0].scenes[0];
  scene.script.nodes = [
    { id: "line", type: "text", text: "Follow", timing: { revealDuration: 3 } },
  ];
  project.assets.visual.character = [
    {
      id: "group",
      name: "Hero",
      defaultVariantId: "portrait",
      variants: [{ id: "portrait", name: "Default", url: "/portrait.webp" }],
    },
  ];
  scene.actors = [
    {
      id: "hero",
      characterId: "group",
      variantId: "portrait",
      x: 50,
      y: 100,
      scale: 1,
      visible: true,
      zIndex: 0,
    },
  ];
  scene.animationClips = [
    buildAnimation(
      {
        sdkVersion: 2,
        sceneId: scene.id,
        id: "follow",
        name: "Follow",
        width: 1000,
        height: 1000,
        duration: 2,
        space: "screen",
        follow: { actorId: "hero", point: "center" },
        overrides: { x: 20 },
        build({ scene }) {
          scene.circle({ id: "n", radius: 10 });
        },
      },
      "",
      { width: 1920, height: 1080, cues: [] },
    ),
  ];
  scene.script.nodes[0].content = [
    {
      type: "tag",
      name: "animation",
      params: { clipId: scene.animationClips[0].id, await: false },
    },
    { type: "text", text: scene.script.nodes[0].text },
  ];
  const compiled = compilePlaybackScope({
    project,
    scope: { type: "project" },
    resolvedUrlMap: new Map(),
  });
  const frame = sampleSequence({ sequence: compiled.sequence, time: 1 }).single!
    .nextRenderState.visuals![0];
  expect(frame.x).toBe(20);
  expect(frame.anchor).toEqual({
    x: 0.5,
    y: 1,
    centerOffset: -0.4,
    rotation: 0,
    actorId: "hero",
  });
});

it("fades the first expression switch from the scene actor default", () => {
  const project = createDefaultProject(),
    scene = project.acts[0].scenes[0];
  project.assets.visual.character = [
    {
      id: "group",
      name: "Hero",
      defaultVariantId: "a",
      variants: [
        { id: "a", name: "A", url: "/a.webp" },
        { id: "b", name: "B", url: "/b.webp" },
      ],
    },
  ];
  scene.actors = [
    {
      id: "hero",
      characterId: "group",
      variantId: "a",
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
      text: "Hello",
      content: [
        {
          type: "tag",
          name: "set",
          params: {
            target: "hero",
            variant: "b",
            with: "fade",
            dur: 1,
            await: false,
          },
        },
        { type: "text", text: "Hello" },
      ],
      timing: { revealDuration: 2 },
    },
  ];
  const compiled = compilePlaybackScope({
    project,
    scope: { type: "project" },
    resolvedUrlMap: new Map(),
  });
  expect(
    sampleSequence({ sequence: compiled.sequence, time: 0.5 }).single!
      .nextRenderState.actors[0].spriteMix,
  ).toEqual([
    { variant: "a", weight: 0.5 },
    { variant: "b", weight: 0.5 },
  ]);
});

it("rejects simultaneous expression switches before playback", () => {
  const project = createDefaultProject(),
    scene = project.acts[0].scenes[0];
  project.assets.visual.character = [
    {
      id: "group",
      name: "Hero",
      defaultVariantId: "a",
      variants: [
        { id: "a", name: "A", url: "/a.webp" },
        { id: "b", name: "B", url: "/b.webp" },
      ],
    },
  ];
  scene.actors = [
    {
      id: "hero",
      characterId: "group",
      variantId: "a",
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
      text: "Hello",
      content: [
        {
          type: "tag",
          name: "set",
          params: {
            target: "hero",
            variant: "b",
            with: "fade",
            dur: 1,
            await: false,
          },
        },
        {
          type: "tag",
          name: "set",
          params: {
            target: "hero",
            variant: "a",
            with: "fade",
            dur: 1,
            await: false,
          },
        },
        { type: "text", text: "Hello" },
      ],
    },
  ];
  expect(() =>
    compilePlaybackScope({
      project,
      scope: { type: "project" },
      resolvedUrlMap: new Map(),
    }),
  ).toThrow(/simultaneous/i);
});
