import { SoftTransition } from "../../packages/renderer/src/soft-transition";
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
  // Real WebGL alpha, endpoints and portrait/landscape surface checks.
  for (const [width, height] of [
    [64, 32],
    [32, 64],
  ]) {
    const from = document.createElement("canvas"),
      to = document.createElement("canvas");
    from.width = to.width = width;
    from.height = to.height = height;
    const ctx = from.getContext("2d")!;
    ctx.fillStyle = "red";
    ctx.fillRect(0, 0, width, height);
    const gl = new SoftTransition();
    if (gl.render(from, to, 0) !== from || gl.render(from, to, 1) !== to)
      throw Error("GL endpoints changed");
    const result = gl.render(from, to, 0.5),
      read = document.createElement("canvas");
    read.width = width;
    read.height = height;
    const c = read.getContext("2d")!;
    c.drawImage(result, 0, 0);
    const pixel = c.getImageData(width / 2, height / 2, 1, 1).data;
    if (
      pixel[0] < 250 ||
      pixel[1] > 2 ||
      pixel[2] > 2 ||
      Math.abs(pixel[3] - 128) > 2
    )
      throw Error("GL alpha mismatch: " + pixel);
    gl.dispose();
  }
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
    const interval = compiled.sequence.transitions[0];
    const times = interval
      ? [0.05, 0.53, 0.95].map(
          (t) =>
            interval.startTime + t * (interval.endTime - interval.startTime),
        )
      : [0.3, 1.2, 2.8];
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
