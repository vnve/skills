import type { SceneTransitionType } from "@vnve/core";
import { buildDefaultTransitionChannels } from "../sequence";
import type {
  CompiledSequence,
  CompiledSceneClip,
  SequenceTransition,
  RenderContext,
} from "../sequence";
import type { CompiledAudioPlan } from "@vnve/runtime";
import type { SceneTimeline } from "@vnve/compiler";

function buildSceneClip(sceneTimeline: SceneTimeline): CompiledSceneClip {
  const clipId = `scene:${sceneTimeline.sceneId}`;

  return {
    clipId,
    sceneId: sceneTimeline.sceneId,
    startTime: sceneTimeline.renderStartTime ?? sceneTimeline.startTime,
    contentStartTime: sceneTimeline.contentStartTime,
    endTime: sceneTimeline.renderEndTime ?? sceneTimeline.endTime,
    eventTimeBasis: "sequence-global",
    events: sceneTimeline.events,
    channels: {
      shot: { channel: "shot", clipId },
      dialogue: { channel: "dialogue", clipId },
    },
  };
}

export function buildCompiledSequence(params: {
  sceneTimelines: SceneTimeline[];
  transitions: import("@vnve/compiler").CompiledTransition[];
  renderContext: RenderContext;
  audioPlan: CompiledAudioPlan;
  fallbackSceneId: string | null;
}): CompiledSequence {
  const { sceneTimelines, renderContext, audioPlan, fallbackSceneId } = params;
  const sceneClips = sceneTimelines.map(buildSceneClip);
  const transitions: SequenceTransition[] = params.transitions.map(
    (t, selectionOrder) => ({
      ...t,
      selectionOrder,
      fromClipId: `scene:${t.fromSceneId}`,
      toClipId: `scene:${t.toSceneId}`,
      channels: buildDefaultTransitionChannels(t.effect),
    }),
  );
  const duration = audioPlan.duration;

  return {
    duration,
    renderContext,
    audioPlan,
    sceneClips,
    transitions,
    fallbackSceneId,
  };
}
