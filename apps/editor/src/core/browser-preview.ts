import {
  getAllVariants,
  getThemeBoxImageAssets,
  type Project,
} from "@vnve/core";
import { compilePlaybackInWorker } from "./timeline-compiler";
import { sampleSequence, KonvaFrameRenderer } from "@vnve/renderer";
import { createDynamicMediaResolver } from "@vnve/media";
import { workspaceRequest, localMediaUrl } from "./local-workspace";
import type { Loaded } from "../session";
const resolve = (url: string) =>
  url.startsWith("assets/") ? localMediaUrl(url) : url;
export async function captureBrowserFrames(job: {
  projectId: string;
  times: number[];
  sceneId?: string;
}) {
  const loaded = await workspaceRequest<Loaded>({
    op: "load",
    projectId: job.projectId,
  });
  const project: Project = { ...loaded.project, assets: loaded.assets },
    urls = new Map<string, string>();
  for (const asset of [
    ...getAllVariants(project.assets),
    ...getThemeBoxImageAssets(project.assets.themes),
  ]) {
    urls.set(asset.id, resolve(asset.url));
    urls.set(asset.url, resolve(asset.url));
  }
  const compiled = await compilePlaybackInWorker({
    project,
    scope: job.sceneId
      ? { type: "scene", sceneId: job.sceneId }
      : { type: "project" },
    resolvedUrlMap: urls,
  });
  const renderer = new KonvaFrameRenderer({
    width: project.meta.width,
    height: project.meta.height,
  });
  const images = new Map<string, ImageBitmap>(),
    faces: FontFace[] = [];
  const dynamic = createDynamicMediaResolver();
  try {
    for (const font of project.assets.fonts) {
      const face = new FontFace(
        font.name,
        `url(${JSON.stringify(resolve(font.url))})`,
      );
      await face.load();
      document.fonts.add(face);
      faces.push(face);
    }
    await document.fonts.ready;
    const context = compiled.sequence.renderContext;
    const dynamicEntries = new Map(
      [...context.variantMediaTypesByUrl].filter(
        ([, type]) => type === "video" || type === "animated",
      ),
    );
    await dynamic.load(dynamicEntries);
    for (const url of context.imageUrls) {
      if (dynamicEntries.has(url)) continue;
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Unable to load preview image ${url}`);
      images.set(url, await createImageBitmap(await response.blob()));
    }
    const frames = [];
    for (const time of job.times) {
      if (time > compiled.sequence.duration)
        throw new Error(
          `Preview time ${time} exceeds duration ${compiled.sequence.duration}`,
        );
      const dynamicFrames = await dynamic.resolveFrames(
        dynamicEntries.keys(),
        time,
        { throwOnMissing: true },
      );
      const frame = sampleSequence({
        sequence: compiled.sequence,
        time,
        imageResolver: (url) =>
          images.get(url) ?? dynamicFrames.get(url) ?? null,
      });
      const canvas = frame.transition
        ? renderer.renderTransitionFrame(
            {
              state: frame.transition.outgoing.nextRenderState,
              images: frame.transition.outgoing.imageMap,
              options: frame.transition.outgoing.frameOptions,
            },
            {
              state: frame.transition.incoming.nextRenderState,
              images: frame.transition.incoming.imageMap,
              options: frame.transition.incoming.frameOptions,
            },
            {
              effect: frame.transition.compositorPlan.effect,
              progress: frame.transition.progress,
              compositorPlan: frame.transition.compositorPlan,
            },
          )
        : renderer.renderFrame(
            frame.single!.nextRenderState,
            frame.single!.imageMap,
            frame.single!.frameOptions,
          );
      frames.push({ time, png: canvas.toDataURL("image/png") });
    }
    return {
      ok: true,
      verifiedBrowser: true,
      audioVerified: false,
      width: project.meta.width,
      height: project.meta.height,
      duration: compiled.sequence.duration,
      frames,
      diagnostics: compiled.diagnostics,
      revision: {
        projectRevision: loaded.projectRevision,
        assetsRevision: loaded.assetsRevision,
      },
    };
  } finally {
    renderer.dispose();
    dynamic.dispose();
    for (const image of images.values()) image.close();
    for (const face of faces) document.fonts.delete(face);
  }
}
export function startBrowserPreviewBridge() {
  let stopped = false,
    busy = false;
  const poll = async () => {
    if (stopped || busy) return;
    busy = true;
    try {
      const response = await fetch("/__vnve/preview/next");
      if (!response.ok) return;
      const job = await response.json();
      if (!job.id) return;
      let result;
      try {
        result = await captureBrowserFrames(job);
      } catch (error) {
        result = {
          ok: false,
          verifiedBrowser: false,
          code: "PREVIEW_FAILED",
          message: String(error),
        };
      }
      await fetch("/__vnve/preview/result", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: job.id, result }),
      });
    } catch {
    } finally {
      busy = false;
    }
  };
  const timer = setInterval(() => void poll(), 750);
  return () => {
    stopped = true;
    clearInterval(timer);
  };
}
