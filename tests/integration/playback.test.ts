import { buildAnimation } from "../../packages/authoring/src";
import { describe, it, expect } from "vitest";
import {
  createDefaultProject,
  createDefaultScene,
  type Project,
} from "@vnve/core";
import { sampleSequence } from "@vnve/renderer/sequence";
import {
  compilePlaybackScope,
  createProjectReport,
} from "@vnve/renderer/playback";
function story() {
  const p = createDefaultProject();
  p.acts[0].scenes[0].script.nodes = [
    {
      id: "a",
      type: "text",
      text: "第一句",
      audioUrl: "assets/audio/a.wav",
      audioDuration: 1,
    },
    {
      id: "b",
      type: "text",
      text: "第二句",
      audioUrl: "assets/audio/b.wav",
      audioDuration: 1,
    },
  ];
  return p;
}
const compile = (project: Project) =>
  compilePlaybackScope({
    project,
    scope: { type: "project" },
    resolvedUrlMap: new Map(),
  });
describe("shared production compiler", () => {
  it("moves inline reactions with voice timing without rewriting authored motion", () => {
    const p = story(),
      scene = p.acts[0].scenes[0];
    scene.animationClips = [
      buildAnimation(
        {
          sdkVersion: 2,
          sceneId: scene.id,
          id: "reaction",
          name: "Reaction",
          duration: 1,
          build({ camera, timeline }) {
            timeline().set(camera(), { x: 2 }, 0);
          },
        },
        "",
        { width: 1920, height: 1080, cues: [] },
      ),
    ];
    scene.script.nodes[1].content = [
      { type: "tag", name: "wait", params: { seconds: 0.2 } },
      {
        type: "tag",
        name: "animation",
        params: { clipId: "reaction", await: false },
      },
      { type: "text", text: "第二句" },
    ];
    const source = JSON.stringify(scene.animationClips);
    const before = compile(p);
    expect(before.cues[1].start).toBeCloseTo(1.15);
    expect(
      before.sequence.renderContext.sceneAnimations?.get(scene.id)?.[0].start,
    ).toBeCloseTo(1.35);
    scene.script.nodes[0].audioDuration = 4;
    const after = compile(p);
    expect(after.cues[1].start).toBeCloseTo(4.15);
    expect(
      after.sequence.renderContext.sceneAnimations?.get(scene.id)?.[0].start,
    ).toBeCloseTo(4.35);
    expect(JSON.stringify(scene.animationClips)).toBe(source);
    expect(
      sampleSequence({ sequence: after.sequence, time: 4.5 }).single
        ?.nextRenderState.camera.x,
    ).toBe(52);
    expect(
      sampleSequence({ sequence: after.sequence, time: 2 }).single
        ?.nextRenderState.camera.x,
    ).toBe(50);
  });
  it("keeps voice length independent of lead-in, text reveal and hold", () => {
    const p = story();
    const scene = p.acts[0].scenes[0];
    scene.script.nodes = [
      {
        id: "a",
        type: "text",
        text: "Hello",
        audioUrl: "assets/audio/a.wav",
        audioDuration: 0.5,
        timing: { leadIn: 0.2, revealDuration: 1, holdDuration: 0.8 },
      },
    ];
    const result = compile(p);
    expect(result.cues[0]).toMatchObject({
      start: 0.2,
      end: 2,
      voice: { start: 0.2, end: 0.7 },
    });
    expect(result.audioPlan.voiceSegments[0].end).toBe(0.7);
    expect(result.sequence.duration).toBe(2);
    expect(
      sampleSequence({ sequence: result.sequence, time: 1.8 }).single
        ?.nextRenderState.narration?.progress,
    ).toBe(1);
  });
  it("collects future state switches and transition scenes, but not unrelated shared images or fonts", () => {
    const p = story(),
      scene = p.acts[0].scenes[0];
    p.assets.visual.character = [
      {
        id: "hero",
        name: "Hero",
        defaultVariantId: "neutral",
        variants: [
          { id: "neutral", name: "Neutral", url: "assets/visual/neutral.png" },
          { id: "happy", name: "Happy", url: "assets/visual/happy.png" },
          { id: "unused", name: "Unused", url: "assets/visual/unused.png" },
        ],
      },
      {
        id: "unrelated",
        name: "Elsewhere",
        defaultVariantId: "other",
        variants: [
          {
            id: "other",
            name: "Other",
            url: "assets/visual/missing.png",
            mediaType: "video",
          },
        ],
      },
    ];
    scene.actors = [
      {
        id: "actor",
        characterId: "hero",
        variantId: "neutral",
        x: 25,
        y: 100,
        scale: 1,
        visible: true,
        zIndex: 0,
      },
    ];
    scene.script.nodes[0].content = [
      {
        type: "tag",
        name: "set",
        params: { target: "actor", variant: "happy" },
      },
      { type: "text", text: "第一句" },
    ];
    const second = createDefaultScene("Second");
    second.scenePropsLinked = false;
    second.transition = { type: "dissolve", duration: 0.4 };
    second.script.nodes = [{ id: "c", type: "text", text: "End" }];
    p.acts[0].scenes.push(second);
    p.assets.fonts = [
      {
        id: "unused-font",
        name: "Elsewhere",
        url: "assets/fonts/missing.woff2",
      },
    ];
    const result = compile(p);
    expect(result.sequence.renderContext.imageUrls).toEqual(
      expect.arrayContaining([
        "assets/visual/neutral.png",
        "assets/visual/happy.png",
      ]),
    );
    expect(result.sequence.renderContext.imageUrls).not.toContain(
      "assets/visual/unused.png",
    );
    expect(result.sequence.renderContext.imageUrls).not.toContain(
      "assets/visual/missing.png",
    );
    expect(
      result.sequence.renderContext.variantMediaTypesByUrl.has(
        "assets/visual/missing.png",
      ),
    ).toBe(false);
    expect(
      createProjectReport(p).resources.some((r) => r.kind === "font"),
    ).toBe(false);
    expect(result.sequence.transitions).toHaveLength(1);
  });
  it("reports a missing cue and invalid speaker with stable scene and node targets", () => {
    const p = story(),
      scene = p.acts[0].scenes[0];
    scene.animationClips = [
      buildAnimation(
        {
          sdkVersion: 2,
          sceneId: scene.id,
          id: "bad",
          name: "bad",
          duration: 1,
          anchor: { nodeId: "missing", edge: "end" },
          build({ camera, timeline }) {
            timeline().set(camera(), { x: 1 }, 0);
          },
        },
        "",
        { width: 1920, height: 1080, cues: [] },
      ),
    ];
    scene.script.nodes[0].actorId = "missing-actor";
    const report = createProjectReport(p);
    expect(report.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "ANIMATION_CUE_INVALID",
          sceneId: scene.id,
          nodeId: "missing",
        }),
        expect.objectContaining({
          code: "ACTOR_NOT_FOUND",
          nodeId: "a",
          sceneId: scene.id,
        }),
      ]),
    );
    expect(() => compile(p)).toThrow();
  });
  it("surfaces placeholders and stale audio without calling them a finished work", () => {
    const p = story();
    p.assets.visual.background = [
      {
        id: "bg",
        name: "BG",
        defaultVariantId: "bg-default",
        variants: [
          {
            id: "bg-default",
            name: "Default",
            url: "/placeholders/background-1.avif",
          },
        ],
      },
    ];
    p.acts[0].scenes[0].backgroundId = "bg-default";
    const report = createProjectReport(p);
    expect(report.issues.map((i) => i.code)).toEqual(
      expect.arrayContaining(["PLACEHOLDER_MEDIA", "VOICE_STALE"]),
    );
    expect(report.pending[0].code).toBe("BROWSER_LAYOUT_REQUIRED");
  });
});
