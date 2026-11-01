import { compilePlaybackScope } from "../../packages/renderer/src/playback/compile-playback-scope";
import { sampleSequence } from "../../packages/renderer/src/sequence-evaluator";
import { createExporter } from "../../packages/media/src";
import { compileAnimation } from "../../packages/compiler/src/animation";
import { disposeTimeline } from "../../packages/parser/src";
import {
  applyAnimations,
  computeRenderState,
  createDefaultActor,
} from "../../packages/runtime/src";
import { KonvaFrameRenderer } from "../../packages/renderer/src";
const clips = await (await fetch("/fixture.json")).json();
const checks: Array<{ name: string; status: string }> = [];
const status = document.querySelector("#status")!;
const canvasImage = (color: string) => {
  const c = document.createElement("canvas");
  c.width = 100;
  c.height = 100;
  const x = c.getContext("2d")!;
  x.fillStyle = color;
  x.fillRect(0, 0, 100, 100);
  return c;
};
const red = canvasImage("#ff0000"),
  blue = canvasImage("#0000ff");
const alpha = canvasImage("#ffffff");
alpha.getContext("2d")!.clearRect(50, 0, 50, 100);
const images = {
  actors: new Map([["hero", red]]),
  actorPrevious: new Map([["hero", red]]),
  background: null,
  cg: null,
  layerVariants: new Map([
    ["a", red],
    ["b", blue],
    ["mask", alpha],
  ]),
};
const renderer = new KonvaFrameRenderer({
  width: 320,
  height: 180,
  mode: "visible",
  mountTarget: document.querySelector("#preview") as HTMLDivElement,
});
const base = () => {
  const state = computeRenderState([], 0);
  state.actors = [
    {
      ...createDefaultActor("hero"),
      visible: true,
      opacity: 1,
      sprite: "a",
      x: 50,
      y: 100,
    },
  ];
  return state;
};
const compiled = new Map<string, any>();
for (const [key, clip] of Object.entries(clips)) {
  const result = compileAnimation(clip as any, [], key === "stress" ? 30 : 2);
  compiled.set(key, result.compiled);
  disposeTimeline(result.tree);
}
const render = (name: string, time = 1, alter?: (s: any) => void) => {
  const state = base();
  if (!["actor", "actorLocal", "subjectBlend"].includes(name))
    state.actors = [];
  alter?.(state);
  if (name === "cg") state.cg = { asset: "b" };
  if (name === "dialogue")
    state.dialogue = {
      speaker: "Hero",
      text: "Hello visual novel",
      progress: 1,
    };
  const result = applyAnimations(state, [compiled.get(name)], time);
  return renderer.renderFrame(
    result,
    {
      ...images,
      cg: name === "cg" ? blue : null,
      background: name === "background" ? blue : null,
    },
    {
      backgroundColor: "#000000",
      dimBrightness: 1,
    },
  );
};
const pixel = (canvas: HTMLCanvasElement, x: number, y: number) =>
  Array.from(canvas.getContext("2d")!.getImageData(x, y, 1, 1).data).slice(
    0,
    3,
  );
const near = (actual: number[], expected: number[], message: string) => {
  if (actual.some((v, i) => Math.abs(v - expected[i]) > 3))
    throw Error(`${message}: ${actual} != ${expected}`);
};
const check = async (name: string, fn: () => void | Promise<void>) => {
  try {
    await fn();
    checks.push({ name, status: "passed" });
  } catch (e) {
    checks.push({ name, status: String(e) });
  }
  status.textContent = JSON.stringify(checks, null, 2);
};
const save = async (name: string, canvas: HTMLCanvasElement) => {
  const blob = await new Promise<Blob>((r) => canvas.toBlob((b) => r(b!)));
  await fetch(`/frame/${name}.png`, { method: "POST", body: blob });
};
await check("rect mask", () => {
  const c = render("mask");
  near(pixel(c, 40, 40), [255, 0, 0], "inside");
  near(pixel(c, 200, 40), [0, 0, 0], "outside");
});
await check("inverse mask", () => {
  const c = render("inverse");
  near(pixel(c, 80, 90), [0, 0, 0], "hole");
  near(pixel(c, 30, 40), [255, 0, 0], "outside hole");
});
await check("isolated multiply", () =>
  near(pixel(render("blend"), 20, 20), [64, 64, 64], "multiply"),
);
await check("group opacity once", () => {
  const c = render("opacity");
  near(pixel(c, 30, 30), [128, 0, 0], "single");
  near(pixel(c, 90, 30), [128, 0, 0], "overlap");
});
await check("real actor mask and restore", () => {
  const c = render("actor");
  near(pixel(c, 130, 100), [255, 0, 0], "left actor");
  near(pixel(c, 190, 100), [0, 0, 0], "right actor");
  const after = render("actor", 2);
  near(pixel(after, 190, 100), [255, 0, 0], "restored actor");
  near(pixel(render("actor"), 190, 100), [0, 0, 0], "seek");
});
await check("background restore preserves original stacking", () => {
  near(
    pixel(render("background", 1), 80, 90),
    [0, 0, 255],
    "masked background",
  );
  near(
    pixel(render("background", 2), 80, 90),
    [0, 0, 255],
    "restored background",
  );
  near(pixel(render("background", 1), 80, 90), [0, 0, 255], "repeat mask");
});
await check("cg mask", () => {
  const c = render("cg");
  near(pixel(c, 80, 90), [0, 0, 255], "inside cg");
  near(pixel(c, 240, 90), [0, 0, 0], "outside cg");
});
await check("dialogue mask", () => {
  const c = render("dialogue");
  near(pixel(c, 250, 160), [0, 0, 0], "masked dialogue");
});
await check("actor local coordinates", () => {
  const c = render("actorLocal");
  near(pixel(c, 130, 100), [255, 0, 0], "left actor");
  near(pixel(c, 190, 100), [0, 0, 0], "right actor");
});
await check("camera parallax endpoints", () => {
  const c = render(
    "parallax",
    1,
    (s) => (s.screenShake = { offsetX: -32, offsetY: 0 }),
  );
  near(pixel(c, 35, 25), [255, 0, 0], "screen");
  near(pixel(c, 19, 75), [255, 0, 0], "half");
  near(pixel(c, 3, 125), [255, 0, 0], "stage");
});
await check("particle lifecycle and mask", () => {
  near(pixel(render("particles", 0.49), 80, 90), [0, 0, 0], "unborn");
  near(pixel(render("particles", 0.5), 80, 90), [255, 255, 255], "born");
  near(pixel(render("particles", 1.2), 192, 90), [0, 0, 0], "masked");
  near(pixel(render("particles", 1.5), 80, 90), [0, 0, 0], "dead");
});
await check("nested masks", () => {
  const c = render("nested");
  near(pixel(c, 80, 90), [255, 0, 0], "inside");
  near(pixel(c, 140, 90), [0, 0, 0], "outside inner");
});
await check("alpha image mask", () => {
  const c = render("imageMask");
  near(pixel(c, 40, 40), [255, 0, 0], "alpha one");
  near(pixel(c, 200, 40), [0, 0, 0], "alpha zero");
});
await check("expression premultiplied blend", () => {
  const s = base();
  s.actors[0].sprite = "b";
  s.actors[0].spriteMix = [
    { variant: "a", weight: 0.5 },
    { variant: "b", weight: 0.5 },
  ];
  const c = renderer.renderFrame(s, images, {
    backgroundColor: "#00ff00",
    dimBrightness: 1,
  });
  near(pixel(c, 160, 100), [128, 0, 128], "opaque blend");
});
await check("missing expression contribution fails explicitly", () => {
  const s = base();
  s.actors[0].sprite = "c";
  s.actors[0].previousSprite = "b";
  s.actors[0].spriteMix = [
    { variant: "missing-a", weight: 0.25 },
    { variant: "b", weight: 0.25 },
    { variant: "c", weight: 0.5 },
  ];
  let message = "";
  try {
    renderer.renderFrame(s, images, { backgroundColor: "#000000" });
  } catch (e) {
    message = String(e);
  }
  if (!message.includes("missing-a"))
    throw Error("Missing contribution was substituted");
});
await check("mixed frame screenshot", async () => {
  await save("actor-mask", render("actor"));
  await save("nested-mask", render("nested"));
});
const scenarios = await (await fetch("/scenarios.json")).json();
for (const { name, project } of scenarios)
  await check(`real-media ${name} preview and MP4`, async () => {
    const compiled = compilePlaybackScope({
      project,
      scope: { type: "project" },
      resolvedUrlMap: new Map(),
    });
    const loaded = new Map<string, HTMLImageElement>();
    for (const url of compiled.sequence.renderContext.imageUrls) {
      const image = new Image();
      image.src = url;
      await image.decode();
      loaded.set(url, image);
    }
    const realRenderer = new KonvaFrameRenderer({
      width: 1920,
      height: 1080,
      mode: "offscreen",
    });
    try {
      for (const [i, time] of [0, 0.2, 1, 2.5, 89 / 30].entries()) {
        const frame = sampleSequence({
          sequence: compiled.sequence,
          time,
          imageResolver: (url) => loaded.get(url) ?? null,
        }).single!;
        await save(
          `${name}-${i}`,
          realRenderer.renderFrame(
            frame.nextRenderState,
            frame.imageMap,
            frame.frameOptions,
          ),
        );
      }
      const exporter = createExporter();
      const video = await exporter.export({
        width: 1920,
        height: 1080,
        fps: 30,
        sequence: compiled.sequence,
        assets: { renderContext: compiled.sequence.renderContext },
        frameRenderer: realRenderer,
      });
      await fetch(`/video/${name}.mp4`, { method: "POST", body: video });
    } finally {
      realRenderer.dispose();
    }
  });
const memorySamples: Array<{ elapsed: number; bytes: number }> = [];
const stressRenderer = new KonvaFrameRenderer({
  width: 1920,
  height: 1080,
  mode: "offscreen",
});
const durations: number[] = [];
await check("1080p 1000 particles two isolated groups", async () => {
  const start = performance.now();
  let memoryAt = 0;
  let frame = 0;
  while (performance.now() - start < 30000) {
    const time = (frame++ / 30) % 30;
    const state = applyAnimations(
      computeRenderState([], 0),
      [compiled.get("stress")],
      time,
    );
    const before = performance.now();
    stressRenderer.renderFrame(
      state,
      { actors: new Map(), background: null },
      { backgroundColor: "#000000" },
    );
    if (frame > 10) durations.push(performance.now() - before);
    if (performance.now() - memoryAt > 2000) {
      memoryAt = performance.now();
      const memory = (performance as any).memory;
      if (memory)
        memorySamples.push({
          elapsed: memoryAt - start,
          bytes: memory.usedJSHeapSize,
        });
    }
    await new Promise((r) => setTimeout(r, 0));
  }
  durations.sort((a, b) => a - b);
  const p95 = durations[Math.floor(durations.length * 0.95)];
  checks.push({
    name: `p95 ${p95.toFixed(2)}ms / ${durations.length} frames`,
    status: p95 <= 33.3 ? "passed" : "over target",
  });
});
stressRenderer.dispose();
await save("final", render("actor"));
const report = {
  checks,
  memorySamples,
  memoryLimitations:
    "Chromium JS heap samples; excludes GPU and native codec allocations. Frame surfaces are released via clearCache and renderer disposal.",
  userAgent: navigator.userAgent,
  hardwareConcurrency: navigator.hardwareConcurrency,
  devicePixelRatio,
  passed: checks.every((c) => c.status === "passed"),
};
status.textContent = JSON.stringify(report, null, 2);
await fetch("/report", {
  method: "POST",
  body: JSON.stringify(report, null, 2),
});
