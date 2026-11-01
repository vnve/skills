import { it, expect } from "vitest";
import { buildAnimation } from "../../authoring/src";
import { compileAnimation } from "./animation";
import {
  sampleAnimationTrack,
  applyAnimations,
  computeRenderState,
  createDefaultActor,
} from "@vnve/runtime";
import { disposeTimeline } from "@vnve/parser";
it.each([1, 2])(
  "hands algorithm final state to GSAP starting at %s",
  (nextStart) => {
    const clip = buildAnimation(
      {
        sdkVersion: 2,
        id: "test",
        name: "test",
        sceneId: "scene",
        duration: 4,
        build({ camera, sample, timeline }: any) {
          const c = camera();
          sample(c, {
            duration: 1,
            sampleRate: 60,
            sample: ({ time }: any) => ({ x: 10 * time }),
          });
          timeline().to(c, { x: 30, duration: 1, ease: "none" }, nextStart);
        },
      },
      "",
      { width: 1920, height: 1080, cues: [] },
    );
    const { compiled } = compileAnimation(clip, [], 4);
    const track = compiled.tracks.find((t) => t.property === "x")!;
    expect(
      [0.5, nextStart, nextStart + 0.5, 3.5].map((t) =>
        sampleAnimationTrack(track, t),
      ),
    ).toEqual([5, 10, 20, 30]);
  },
);
it("preserves an exact algorithm start between frame-grid samples", () => {
  const clip = buildAnimation(
    {
      sdkVersion: 2,
      id: "test",
      name: "test",
      sceneId: "scene",
      duration: 2,
      build({ camera, sample }: any) {
        sample(camera(), {
          start: 0.505,
          duration: 1,
          sampleRate: 60,
          sample: () => ({ x: 10 }),
        });
      },
    },
    "",
    { width: 1920, height: 1080, cues: [] },
  );
  const { compiled } = compileAnimation(clip, [], 2);
  const track = compiled.tracks.find((t) => t.property === "x")!;
  expect(sampleAnimationTrack(track, 0.504)).toBe(0);
  expect(sampleAnimationTrack(track, 0.505)).toBe(10);
  expect(sampleAnimationTrack(track, 1.506)).toBe(10);
});

it("resolves following visuals from final actor state regardless of clip order", () => {
  const context = { width: 1920, height: 1080, cues: [] };
  const visual = compileAnimation(
    buildAnimation(
      {
        sdkVersion: 2,
        id: "visual",
        name: "visual",
        sceneId: "scene",
        duration: 2,
        follow: { actorId: "hero", point: "center" },
        build({ scene }: any) {
          scene.circle({ id: "ring", x: 0, y: 0, radius: 10 });
        },
      },
      "",
      context,
    ),
    [],
    2,
  );
  const motion = compileAnimation(
    buildAnimation(
      {
        sdkVersion: 2,
        id: "motion",
        name: "motion",
        sceneId: "scene",
        duration: 2,
        build({ actor, timeline }: any) {
          timeline().to(actor("hero"), {
            x: 20,
            scale: 2,
            rotation: 30,
            duration: 1,
            ease: "none",
          });
        },
      },
      "",
      context,
    ),
    [],
    2,
  );
  const state = computeRenderState([], 0);
  state.actors = [{ ...createDefaultActor("hero"), x: 25 }];
  const a = applyAnimations(state, [visual.compiled, motion.compiled], 0.5);
  const b = applyAnimations(state, [motion.compiled, visual.compiled], 0.5);
  expect(a).toEqual(b);
  expect(a.actors[0].x).toBe(35);
  expect(a.visuals![0].anchor).toMatchObject({
    x: 0.35,
    centerOffset: -0.4 * a.actors[0].scale,
    rotation: 15,
  });
  disposeTimeline(visual.tree);
  disposeTimeline(motion.tree);
});
