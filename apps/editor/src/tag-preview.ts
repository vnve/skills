import {
  getAllAudio,
  getAllVariants,
  getThemeBoxImageAssets,
  type InlineTag,
  type Project,
} from "@vnve/core";
import { compilePlaybackInWorker } from "./core/timeline-compiler";

/** Disposable playback input: never written to the project or undo history. */
export function createTagPreviewProject(
  project: Project,
  sceneId: string,
  tag: InlineTag,
): Project {
  const source = project.acts
    .flatMap((a) => a.scenes)
    .find((s) => s.id === sceneId);
  if (!source) throw new Error("预览场景不存在");
  const scene = {
    ...source,
    sceneSettingsLinked: false,
    scenePropsLinked: false,
    dialoguePropsLinked: false,
    autoEntrance: false,
    speakerScale: false,
    transition: { type: "cut" as const, duration: 0 },
    lineGap: 0,
    timeline: undefined,
    script: {
      nodes: [
        {
          id: "tag-preview",
          type: "text" as const,
          text: "",
          content: [structuredClone(tag)],
        },
      ],
    },
  };
  if (tag.name === "wipe" || tag.name === "transition") {
    const all = project.acts.flatMap((a) => a.scenes);
    const next = all[all.findIndex((s) => s.id === sceneId) + 1];
    if (!next || next.id !== tag.params.nextScene)
      throw new Error("擦镜换场需要紧邻下一场");
    const wait = (id: string, seconds: number) => ({
      id,
      type: "text" as const,
      text: "",
      content: [
        { type: "tag" as const, name: "wait" as const, params: { seconds } },
      ],
    });
    scene.script.nodes.unshift(wait("wipe-preview-before", 0.2));
    const incoming = {
      ...next,
      animationClips: [],
      script: { nodes: [wait("wipe-preview-after", 1)] },
    };
    return {
      ...project,
      acts: [{ ...project.acts[0], scenes: [scene, incoming] }],
    };
  }
  return { ...project, acts: [{ ...project.acts[0], scenes: [scene] }] };
}

export async function compileTagPreview(
  project: Project,
  sceneId: string,
  tag: InlineTag,
  resolve: (url: string) => string,
  signal?: AbortSignal,
) {
  const isolated = createTagPreviewProject(project, sceneId, tag);
  const map = new Map<string, string>();
  for (const asset of [
    ...getAllVariants(project.assets),
    ...getThemeBoxImageAssets(project.assets.themes ?? []),
  ]) {
    map.set(asset.id, resolve(asset.url));
    map.set(asset.url, resolve(asset.url));
  }
  const audioFiles: Record<string, string> = {};
  for (const asset of getAllAudio(project.assets.audio))
    for (const key of [asset.id, asset.name, asset.url])
      audioFiles[key] = resolve(asset.url);
  const compiled = await compilePlaybackInWorker(
    {
      project: isolated,
      scope:
        tag.name === "wipe" || tag.name === "transition"
          ? { type: "project" }
          : { type: "scene", sceneId },
      resolvedUrlMap: map,
    },
    signal,
  );
  return { sequence: compiled.sequence, audioFiles };
}
