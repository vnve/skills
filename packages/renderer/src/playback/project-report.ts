import {
  collectProjectReferences,
  getTtsText,
  getTextNodeContent,
  type Project,
} from "@vnve/core";
import {
  compilePlaybackScope,
  type PreviewScope,
  type CompiledPlaybackScope,
} from "./compile-playback-scope";
export interface ProjectIssue {
  code: string;
  level: "error" | "warning" | "review";
  message: string;
  sceneId?: string;
  nodeId?: string;
  animationId?: string;
  assetId?: string;
  path?: string;
}
export interface ProjectResource {
  kind: "image" | "voice" | "bgm" | "sfx" | "font";
  id: string;
  path: string;
}
export function createProjectReport(
  project: Project,
  options: { scope?: PreviewScope; resolvedUrlMap?: Map<string, string> } = {},
) {
  const compiled = compilePlaybackScope({
    project,
    scope: options.scope ?? { type: "project" },
    resolvedUrlMap: options.resolvedUrlMap ?? new Map(),
    strict: false,
  });
  const refs = collectProjectReferences(project, compiled.scenes);
  const issues: ProjectIssue[] = compiled.diagnostics.map((d) => ({
    code: d.code,
    level: d.level,
    message: d.message,
    sceneId: d.location?.sceneId,
    nodeId: d.location?.nodeId,
    animationId: d.location?.animationId,
  }));
  const resources: ProjectResource[] =
    compiled.sequence.renderContext.imageUrls.map((path) => ({
      kind: "image",
      id:
        [...refs.variants].find(
          (id) =>
            compiled.sequence.renderContext.variantUrlsById.get(id) === path,
        ) ?? path,
      path,
    }));
  for (const [id, kind] of refs.audio) {
    const a =
      kind === "voice"
        ? undefined
        : project.assets.audio[kind].find(
            (a) => a.id === id || a.name === id || a.url === id,
          );
    resources.push({ kind, id, path: a?.url ?? id });
  }
  for (const font of project.assets.fonts)
    if (refs.fonts.has(font.id))
      resources.push({ kind: "font", id: font.id, path: font.url });
  if (!compiled.scenes.length || !compiled.cues.some((c) => c.text.trim()))
    issues.push({
      level: "warning",
      code: "EMPTY_PROJECT",
      message: "No readable dialogue in this scope",
    });
  const ids = new Set<string>();
  for (const scene of compiled.scenes) {
    for (const node of scene.script.nodes) {
      if (!node.id || ids.has(node.id))
        issues.push({
          level: "error",
          code: "NODE_ID_INVALID",
          message: "Dialogue needs a unique stable ID",
          sceneId: scene.id,
          nodeId: node.id,
        });
      if (node.id) ids.add(node.id);
      if (!getTtsText(node).trim()) continue;
      if (!node.audioUrl)
        issues.push({
          level: "warning",
          code: "VOICE_MISSING",
          message: "No voice media; silent reading is allowed",
          sceneId: scene.id,
          nodeId: node.id,
        });
      else {
        const snapshot = node.audioImportSnapshot ?? node.ttsSnapshot;
        if (
          !snapshot ||
          snapshot.text !== getTtsText(node) ||
          snapshot.actorId !== node.actorId
        )
          issues.push({
            level: "warning",
            code: "VOICE_STALE",
            message: "Voice input snapshot is missing or changed",
            sceneId: scene.id,
            nodeId: node.id,
          });
        if (!node.audioDuration || !Number.isFinite(node.audioDuration))
          issues.push({
            level: "error",
            code: "VOICE_DURATION_INVALID",
            message: "Voice duration must come from media",
            sceneId: scene.id,
            nodeId: node.id,
          });
      }
    }
  }
  for (const resource of resources)
    if (resource.path.startsWith("/placeholders/"))
      issues.push({
        level: "warning",
        code: "PLACEHOLDER_MEDIA",
        message: "Placeholder image is not final artwork",
        assetId: resource.id,
        path: resource.path,
      });
  const unique = issues.filter(
    (issue, index, all) =>
      all.findIndex((i) => JSON.stringify(i) === JSON.stringify(issue)) ===
      index,
  );
  return {
    version: 1 as const,
    projectId: project.meta.id,
    scope: options.scope ?? { type: "project" },
    duration: compiled.sequence.duration,
    scenes: compiled.sequence.sceneClips.map((c) => ({
      sceneId: c.sceneId,
      start: c.startTime,
      contentStart: c.contentStartTime,
      end: c.endTime,
    })),
    lines: compiled.cues,
    animations: [
      ...(compiled.sequence.renderContext.sceneAnimations ?? new Map()),
    ].map(([sceneId, clips]) => ({ sceneId, clips })),
    transitions: compiled.sequence.transitions,
    resources,
    issues: unique,
    pending: [
      {
        code: "BROWSER_LAYOUT_REQUIRED",
        message: "Actual-font layout, artwork and mix need browser review",
      },
    ],
    compiled,
  };
}
export function serializeProjectReport(
  report: ReturnType<typeof createProjectReport>,
  includeEvents = false,
) {
  const { compiled, ...data } = report;
  return {
    ...data,
    ok: !data.issues.some((i) => i.level === "error"),
    ...(includeEvents
      ? { events: compiled.events, audioPlan: compiled.audioPlan }
      : {}),
  };
}
