import { expect, it } from "vitest";
import { createDefaultProject, type InlineTag } from "@vnve/core";
import { compilePlaybackScope } from "../../renderer/src/playback/compile-playback-scope";
import { sampleSequence } from "../../renderer/src/sequence-evaluator";
function fixture(tag: InlineTag) {
  const project = createDefaultProject(),
    scene = project.acts[0].scenes[0];
  project.assets.visual.background = [
    {
      id: "places",
      name: "Places",
      defaultVariantId: "room",
      variants: [{ id: "room", name: "Room", url: "/room.webp" }],
    },
  ];
  scene.backgroundId = "room";
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
      content: [tag, { type: "text", text: "Keep" }],
    },
  ];
  return { project, scene };
}
it("rackfocus changes sharpness between real background and actor, seeks deterministically and restores", () => {
  const { project } = fixture({
    type: "tag",
    name: "rackfocus",
    params: { fromTarget: "$background", toTarget: "hero", blur: 16, dur: 4 },
  } as InlineTag);
  const original = JSON.stringify(project);
  const result = compilePlaybackScope({
    project,
    scope: { type: "project" },
    resolvedUrlMap: new Map(),
  });
  const at = (t: number) =>
    sampleSequence({ sequence: result.sequence, time: t }).single!
      .nextRenderState;
  const sharpness = (t: number, kind: string) =>
    at(t).visuals![0].nodes.find((n) =>
      n.attrs.members?.some((m) => m.kind === kind),
    )?.attrs.blur;
  expect(sharpness(0.5, "background")).toBeLessThan(1);
  expect(sharpness(0.5, "actor")).toBeGreaterThan(15);
  expect(sharpness(3, "background")).toBeGreaterThan(15);
  expect(sharpness(3, "actor")).toBeLessThan(1);
  const reference = at(2);
  at(3);
  at(0.2);
  expect(at(2)).toEqual(reference);
  expect(at(4.1).visuals).toEqual([]);
  expect(JSON.stringify(project)).toBe(original);
});
it("parallax uses different depths for scene members, preserves identity and returns to the original composition", () => {
  const { project, scene } = fixture({
    type: "tag",
    name: "parallax",
    params: {
      moveX: 10,
      moveY: 2,
      dur: 5,
      backgroundDepth: 0.2,
      actorDepth: 0.8,
    },
  } as InlineTag);
  const before = structuredClone(scene.actors);
  const result = compilePlaybackScope({
    project,
    scope: { type: "project" },
    resolvedUrlMap: new Map(),
  });
  const at = (t: number) =>
    sampleSequence({ sequence: result.sequence, time: t }).single!
      .nextRenderState;
  const mid = at(3).visuals![0].nodes,
    bg = mid.find((n) =>
      n.attrs.members?.some((m) => m.kind === "background"),
    )!,
    actor = mid.find((n) => n.attrs.members?.some((m) => m.kind === "actor"))!;
  expect(Math.abs(Number(actor.attrs.x))).toBeGreaterThan(
    Math.abs(Number(bg.attrs.x)),
  );
  expect(at(5.1).visuals).toEqual([]);
  expect(scene.actors).toEqual(before);
  expect(at(2).actors[0].sprite).toBe("portrait");
});
it("protects all affected locked members atomically and preserves recorded speech for allowed directions", async () => {
  const { applyCompiledProjectPatchPlan } = await import("./project-patch");
  for (const tag of [
    { type: "tag", name: "rackfocus", params: { toTarget: "hero" } },
    { type: "tag", name: "parallax", params: {} },
  ] as InlineTag[]) {
    const { project, scene } = fixture(tag);
    scene.script.nodes = [
      {
        id: "line",
        type: "text",
        text: "Keep",
        audioUrl: "/voice.wav",
        audioDuration: 2,
      },
    ];
    scene.actors[0].locked = true;
    const plan = {
      summary: "Direction",
      operations: [
        {
          type: "scene.update" as const,
          sceneId: scene.id,
          name: "Must roll back",
        },
        {
          type: "direction.insert" as const,
          sceneId: scene.id,
          nodeId: "line",
          contentIndex: 0,
          direction: { name: tag.name, params: tag.params },
        },
      ],
    };
    const locked = applyCompiledProjectPatchPlan(project, plan);
    expect(locked.ok).toBe(false);
    expect(locked.project).toBe(project);
    scene.actors[0].locked = false;
    const allowed = applyCompiledProjectPatchPlan(project, plan);
    expect(allowed.ok).toBe(true);
    expect(allowed.project.acts[0].scenes[0].script.nodes[0].audioUrl).toBe(
      "/voice.wav",
    );
  }
});
it("rejects unavailable focus targets and foreground media even when disabled", () => {
  for (const tag of [
    {
      type: "tag",
      name: "rackfocus",
      params: { toTarget: "other-scene", enabled: false },
    },
    {
      type: "tag",
      name: "rackfocus",
      params: { toTarget: "$cg", enabled: false },
    },
    {
      type: "tag",
      name: "parallax",
      params: { foreground: "missing", enabled: false },
    },
  ] as InlineTag[]) {
    const { project } = fixture(tag);
    expect(() =>
      compilePlaybackScope({
        project,
        scope: { type: "project" },
        resolvedUrlMap: new Map(),
      }),
    ).toThrow();
  }
});
it("rejects independent overlapping rackfocus and parallax ownership", () => {
  const { project, scene } = fixture({
    type: "tag",
    name: "rackfocus",
    params: { toTarget: "hero", dur: 4, await: false },
  });
  scene.script.nodes[0].content!.splice(1, 0, {
    type: "tag",
    name: "parallax",
    params: { dur: 4, await: false },
  });
  expect(() =>
    compilePlaybackScope({
      project,
      scope: { type: "project" },
      resolvedUrlMap: new Map(),
    }),
  ).toThrow(/overlap|conflict|重叠|归属/i);
});
it("free SDK supports original actor placement and rejects ambiguous nested placement", async () => {
  const { buildAnimation } = await import("../../authoring/src");
  const make = (nested: boolean) =>
    buildAnimation(
      {
        sdkVersion: 2,
        id: "original",
        name: "Original actor placement",
        sceneId: "scene",
        duration: 1,
        build({ scene }: any) {
          scene.group({
            id: "subject",
            bounds: { x: 0, y: 0, width: 1920, height: 1080 },
            members: [{ kind: "actor", actorId: "hero" }],
            memberPlacement: "original",
          });
          if (nested)
            scene.group({
              id: "outer",
              bounds: { x: 0, y: 0, width: 1920, height: 1080 },
              members: [{ kind: "visual", nodeId: "subject" }],
            });
        },
      },
      "",
      { width: 1920, height: 1080, cues: [] },
    );
  expect(make(false).capabilities).toContain("visual-primitives-v1");
  expect(() => make(true)).toThrow(/Original placement cannot be nested/);
});
it("starts out of focus and combines depth movement with rack focus in a single owned composition", () => {
  const { project } = fixture({
    type: "tag",
    name: "rackfocus",
    params: { toTarget: "hero", blur: 16, moveX: 4, zoom: 1.06, dur: 4 },
  } as InlineTag);
  const result = compilePlaybackScope({
    project,
    scope: { type: "project" },
    resolvedUrlMap: new Map(),
  });
  const at = (t: number) =>
    sampleSequence({ sequence: result.sequence, time: t }).single!
      .nextRenderState;
  const actor = (t: number) =>
    at(t).visuals![0].nodes.find((n) =>
      n.attrs.members?.some((m) => m.kind === "actor"),
    )!;
  expect(actor(0).attrs.blur).toBe(16);
  expect(Number(actor(2).attrs.scaleX)).toBeGreaterThan(1);
  expect(Number(actor(2.8).attrs.blur)).toBeLessThan(0.1);
  expect(Number(actor(3.99).attrs.scaleX)).toBeCloseTo(1, 3);
  expect(at(4.1).visuals).toEqual([]);
});
it("rejects the removed lightpass command through normal validation without changing the input project", () => {
  const { project, scene } = fixture({
    type: "tag",
    name: "wait",
    params: { seconds: 1 },
  });
  scene.script.nodes[0].content = JSON.parse(
    '[{"type":"tag","name":"lightpass","params":{}}]',
  );
  const before = JSON.stringify(project);
  expect(() =>
    compilePlaybackScope({
      project,
      scope: { type: "project" },
      resolvedUrlMap: new Map(),
    }),
  ).toThrow(/Unknown command 'lightpass'/);
  expect(JSON.stringify(project)).toBe(before);
});
