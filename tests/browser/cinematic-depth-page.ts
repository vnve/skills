import { compilePlaybackScope } from "../../packages/renderer/src/playback/compile-playback-scope";
import { sampleSequence } from "../../packages/renderer/src/sequence-evaluator";
import { KonvaFrameRenderer } from "../../packages/renderer/src";
import { createExporter } from "../../packages/media/src";
const status = document.querySelector("pre")!,
  results: any[] = [];
const save = async (name: string, canvas: HTMLCanvasElement) => {
  const b = await new Promise<Blob>((r) => canvas.toBlob((b) => r(b!)));
  await fetch("/out/" + name + ".png", { method: "POST", body: b });
};
try {
  const fixtures = await (await fetch("/projects.json")).json();
  for (const { name, project } of fixtures.filter(
    (f: any) =>
      !new URLSearchParams(location.search).has("only") ||
      f.name === new URLSearchParams(location.search).get("only"),
  )) {
    status.textContent = `编译／编码 ${name}`;
    const compiled = compilePlaybackScope({
      project,
      scope: { type: "project" },
      resolvedUrlMap: new Map(),
    });
    const images = new Map<string, HTMLImageElement>();
    for (const url of compiled.sequence.renderContext.imageUrls) {
      const img = new Image();
      img.src = url;
      await img.decode();
      images.set(url, img);
    }
    const renderer = new KonvaFrameRenderer({
      width: project.meta.width,
      height: project.meta.height,
      mode: "offscreen",
    });
    const times = [0.125, 0.5, 0.95].map((t) => t * compiled.sequence.duration);
    const sample = (time: number) => {
      const f = sampleSequence({
        sequence: compiled.sequence,
        time,
        imageResolver: (url) => images.get(url) ?? null,
      });
      if (f.transition)
        return renderer.renderTransitionFrame(
          {
            state: f.transition.outgoing.nextRenderState,
            images: f.transition.outgoing.imageMap,
            options: f.transition.outgoing.frameOptions,
          },
          {
            state: f.transition.incoming.nextRenderState,
            images: f.transition.incoming.imageMap,
            options: f.transition.incoming.frameOptions,
          },
          {
            effect: f.transition.compositorPlan.effect,
            progress: f.transition.progress,
            compositorPlan: f.transition.compositorPlan,
          },
        );
      const s = f.single!;
      return renderer.renderFrame(
        s.nextRenderState,
        s.imageMap,
        s.frameOptions,
      );
    };
    if (name.startsWith("cg-") || name === "sdk-offset") {
      const active = sample(2).toDataURL();
      const activePixels = sample(2)
        .getContext("2d")!
        .getImageData(0, 0, project.meta.width, project.meta.height).data;
      const baseline = structuredClone(project);
      if (name.startsWith("cg-"))
        baseline.acts[0].scenes[0].actors.forEach(
          (a: any) => (a.visible = false),
        );
      else
        baseline.acts[0].scenes[0].script.nodes[0].content = [
          { type: "tag", name: "wait", params: { seconds: 4 } },
        ];
      if (name === "sdk-offset")
        baseline.acts[0].scenes[0].actors[0].x += (80 / 1920) * 100;
      const base = compilePlaybackScope({
        project: baseline,
        scope: { type: "project" },
        resolvedUrlMap: new Map(),
      });
      const f = sampleSequence({
        sequence: base.sequence,
        time: 2,
        imageResolver: (url) => images.get(url) ?? null,
      }).single!;

      const baseCanvas = renderer.renderFrame(
        f.nextRenderState,
        f.imageMap,
        f.frameOptions,
      );
      if (name === "sdk-offset") {
        const pixels = baseCanvas
          .getContext("2d")!
          .getImageData(0, 0, project.meta.width, project.meta.height).data;
        // One alpha-cache round trip can change 8-bit edge rounding by one level.
        for (let i = 0; i < pixels.length; i++)
          if (Math.abs(pixels[i] - activePixels[i]) > 1)
            throw Error(name + " changed original scene occlusion");
      } else if (baseCanvas.toDataURL() !== active)
        throw Error(name + " changed original scene occlusion");
    }
    const reference = sample(times[1]).toDataURL();
    sample(times[2]);
    sample(times[0]);
    if (sample(times[1]).toDataURL() !== reference)
      throw Error(name + " depends on seek order");
    for (const [i, time] of times.entries())
      await save(`${name}-${i}`, sample(time));
    const exporter = createExporter();
    exporter.onProgress(
      (p) => (status.textContent = `编码 ${name} ${p.percent}%`),
    );
    const blob = await exporter.export({
      width: project.meta.width,
      height: project.meta.height,
      fps: 30,
      sequence: compiled.sequence,
      assets: { renderContext: compiled.sequence.renderContext },
      frameRenderer: renderer,
    });
    await fetch(`/out/${name}.mp4`, { method: "POST", body: blob });
    renderer.dispose();
    results.push({
      name,
      passed: true,
      times,
      duration: compiled.sequence.duration,
      width: project.meta.width,
      height: project.meta.height,
    });
  }
  status.textContent = JSON.stringify(results, null, 2);
} catch (e) {
  results.push({ passed: false, error: String(e), stack: (e as Error).stack });
  status.textContent = JSON.stringify(results, null, 2);
}
await fetch("/report", {
  method: "POST",
  body: JSON.stringify(results, null, 2),
});
