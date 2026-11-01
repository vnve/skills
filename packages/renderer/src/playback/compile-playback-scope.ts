import { collectProjectReferences } from "@vnve/core";
import type { Project, Scene, TimelineEvent } from "@vnve/core";
import { compileAudioPlan, type CompiledAudioPlan } from "@vnve/runtime";
import {
  type CompiledSequence,
  buildRenderContext,
  type RenderContext,
} from "../sequence";
import type { SceneTimeline } from "@vnve/compiler";
export type PreviewScope =
  | { type: "project" }
  | { type: "scene"; sceneId: string }
  | { type: "act"; actId: string };
import { TimelineService } from "@vnve/compiler";

import { buildCompiledSequence } from "./sequence-compiler";

export interface CompiledPlaybackScope {
  events: TimelineEvent[];
  audioPlan: CompiledAudioPlan;
  eventSourceMap: number[];
  scenes: Scene[];
  fallbackSceneId: string | null;
  sequence: CompiledSequence;
  cues: import("@vnve/compiler").DialogueCue[];
  diagnostics: import("@vnve/core").Diagnostic[];
  inputFingerprint: string;
}

function getScenesForScope(project: Project, scope: PreviewScope): Scene[] {
  const allScenes = project.acts.flatMap((act) => act.scenes);
  if (scope.type === "scene") {
    return allScenes.filter((scene) => scene.id === scope.sceneId);
  }
  if (scope.type === "act") {
    return project.acts.find((act) => act.id === scope.actId)?.scenes ?? [];
  }
  return allScenes;
}

export function compilePlaybackScope(params: {
  project: Project;
  scope: PreviewScope;
  resolvedUrlMap: Map<string, string>;
  strict?: boolean;
}): CompiledPlaybackScope {
  const { project, scope, resolvedUrlMap } = params;
  const scenes = getScenesForScope(project, scope),
    fallbackSceneId = scenes[0]?.id ?? null;
  const compiled = new TimelineService().compileScenes(
    scenes,
    project.meta,
    project.assets,
    project.acts.flatMap((act) => act.scenes.map((scene) => scene.id)),
  );
  if (scope.type !== "project" && !scenes.length)
    compiled.diagnostics.push({
      level: "error",
      code: "SCOPE_NOT_FOUND",
      message: "Requested playback scope does not exist",
    });
  const references = collectProjectReferences(project, scenes);
  compiled.diagnostics.push(
    ...references.issues.map((issue) => ({
      level: "error" as const,
      code: issue.code,
      message: issue.message,
      location: {
        nodeId: issue.nodeId,
        sceneId: issue.sceneId,
        field: issue.assetId,
      },
    })),
  );
  if (
    params.strict !== false &&
    compiled.diagnostics.some((d) => d.level === "error")
  )
    throw Object.assign(
      new Error(
        compiled.diagnostics
          .filter((d) => d.level === "error")
          .map((d) => d.message)
          .join("; "),
      ),
      { diagnostics: compiled.diagnostics },
    );
  const renderContext = buildRenderContext(
    project,
    scenes,
    resolvedUrlMap,
    compiled.sceneAnimations,
  );
  const audioPlan = compiled.audioPlan;
  const sequence = buildCompiledSequence({
    sceneTimelines: compiled.sceneTimelines,
    transitions: compiled.transitions,
    renderContext,
    fallbackSceneId,
    audioPlan,
  });

  return {
    inputFingerprint: compiled.inputFingerprint,
    events: compiled.timeline.events,
    audioPlan,
    eventSourceMap: compiled.eventSourceMap,
    scenes,
    fallbackSceneId,
    sequence,
    cues: compiled.cues,
    diagnostics: compiled.diagnostics,
  };
}
