import { expect, it } from "vitest";
import { buildAnimation } from "../../authoring/src";
import { compileAnimation } from "./animation";
import { applyAnimations, computeRenderState } from "@vnve/runtime";
import { disposeTimeline } from "@vnve/parser";

const context = { width: 320, height: 180, cues: [] };
const build = (fn: (sdk: any) => void) =>
  buildAnimation(
    {
      sdkVersion: 2,
      id: "visuals",
      name: "Visuals",
      sceneId: "scene",
      duration: 2,
      build: fn,
    },
    "",
    context,
  );

it("builds and samples animated masks without mutating the stored definition", () => {
  const clip = build(({ scene, mask, timeline }: any) => {
    const group = scene.group({
      id: "light",
      bounds: { x: 0, y: 0, width: 320, height: 180 },
      cameraFactor: 0.5,
      blendMode: "screen",
      mask: { type: "ellipse", radiusX: 10, radiusY: 20 },
    });
    scene.rect({
      id: "color",
      parentId: group.id,
      width: 320,
      height: 180,
      fill: "#ffffff",
    });
    timeline().to(mask(group), { radiusX: 30, duration: 2, ease: "none" });
  });
  const { compiled, tree } = compileAnimation(clip, [], 2);
  try {
    const state = applyAnimations(computeRenderState([], 0), [compiled], 1);
    expect(state.visuals![0].nodes[0].attrs.mask.radiusX).toBeCloseTo(20);
    expect(clip.nodes[0].attrs.mask.radiusX).toBe(10);
  } finally {
    disposeTimeline(tree);
  }
});

it("bakes arbitrary particle trajectories with stable ID randomness and finite lifetimes", () => {
  const make = (ids: string[]) =>
    build(({ scene }: any) => {
      scene.particles({
        id: "dust",
        particles: ids.map((id) => ({
          id,
          birth: 0.5,
          lifetime: 1,
          radius: 2,
          sampleRate: 2,
          sample: ({ localTime, random }: any) => ({
            x: localTime * 10,
            y: random(7) * 100,
          }),
        })),
      });
    });
  const first = make(["a", "b"]),
    second = make(["b", "a"]);
  expect(first.nodes[0].attrs.particles[0].values.x).toEqual([0, 5, 10]);
  expect(first.nodes[0].attrs.particles[0].values.y).toEqual(
    second.nodes[0].attrs.particles[1].values.y,
  );
  expect(first.nodes[0].type).toBe("Particles");
});

it("keeps the in-progress expression as the source of an interrupted fade", () => {
  const events: any[] = [
    { type: "set", at: 0, dur: 0, params: { target: "hero", variant: "a" } },
    {
      type: "set",
      at: 1,
      dur: 1,
      params: { target: "hero", variant: "b", with: "fade" },
    },
    {
      type: "set",
      at: 1.5,
      dur: 1,
      params: { target: "hero", variant: "c", with: "fade" },
    },
  ];
  const at = (t: number) => computeRenderState(events, t).actors[0].spriteMix;
  expect(at(1.5)).toEqual([
    { variant: "a", weight: 0.5 },
    { variant: "b", weight: 0.5 },
  ]);
  expect(at(2)).toEqual([
    { variant: "a", weight: 0.25 },
    { variant: "b", weight: 0.25 },
    { variant: "c", weight: 0.5 },
  ]);
  expect(at(1.5)).toEqual([
    { variant: "a", weight: 0.5 },
    { variant: "b", weight: 0.5 },
  ]);
});

it("rejects composition cycles through ordinary child groups", () => {
  expect(() =>
    build(({ scene }: any) => {
      scene.group({ id: "outer" });
      scene.group({
        id: "inner",
        parentId: "outer",
        bounds: { x: 0, y: 0, width: 320, height: 180 },
        members: [{ kind: "visual", nodeId: "outer" }],
      });
    }),
  ).toThrow(/cycle/i);
});

it("rejects an animated mask with negative geometry before rendering", () => {
  const clip = build(({ scene, mask, timeline }: any) => {
    const g = scene.group({
      id: "g",
      bounds: { x: 0, y: 0, width: 320, height: 180 },
      mask: { type: "rect", width: 40, height: 180 },
    });
    timeline().to(mask(g), { width: -20, duration: 1 });
  });
  expect(() => compileAnimation(clip, [], 2)).toThrow(/mask/i);
});
