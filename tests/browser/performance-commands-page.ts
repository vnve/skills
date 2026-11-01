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
  for (const { name, project } of fixtures) {
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
      width: 1920,
      height: 1080,
      mode: "offscreen",
    });
    const times =
      name === "wipe"
        ? compiled.sequence.transitions.flatMap((t) => [
            t.startTime + 0.05,
            (t.startTime + t.endTime) / 2,
            t.endTime - 0.05,
          ])
        : [0.3, 1, 2.4];
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
      width: 1920,
      height: 1080,
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
