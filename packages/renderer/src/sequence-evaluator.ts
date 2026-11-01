import { computeRenderState } from '@vnve/runtime';
import { buildSceneTransitionPlan } from './scene-transition-compositor';
import { sampleSequenceTransitionChannel } from './sequence-envelope';
import { prepareFrameInput, type PreparedFrame, type RenderContext } from './frame-pipeline';
import type { CompiledSceneClip, CompiledSequence, SequenceTransition } from './sequence-types';

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function buildSceneShotSurface(
  sceneId: string,
  renderContext: RenderContext,
) {
  return {
    sceneId,
    backgroundColor: renderContext.sceneBackgroundColors.get(sceneId),
    backgroundAssetId: renderContext.sceneBackgrounds.get(sceneId),
    backgroundVisible: renderContext.sceneBackgroundVisibility.get(sceneId) ?? true,
    cgAssetId: renderContext.sceneCgs.get(sceneId),
    cgVisible: renderContext.sceneCgVisibility.get(sceneId) ?? true,
  };
}

function findClipById(
  sequence: CompiledSequence,
  clipId: string,
): CompiledSceneClip | null {
  return sequence.sceneClips.find((clip) => clip.clipId === clipId) ?? null;
}

function computeTransitionProgress(
  transition: SequenceTransition,
  time: number,
): number {
  const rawDuration = transition.endTime - transition.startTime;
  if (rawDuration <= 0) {
    return time >= transition.endTime ? 1 : 0;
  }
  return clamp01((time - transition.startTime) / rawDuration);
}

export function findSequenceTransitionAtTime(
  sequence: CompiledSequence,
  time: number,
): SequenceTransition | null {
  let winner: SequenceTransition | null = null;

  for (const transition of sequence.transitions) {
    if (time < transition.effectiveStartTime || time >= transition.effectiveEndTime) {
      continue;
    }
    if (!winner || transition.selectionOrder < winner.selectionOrder) {
      winner = transition;
    }
  }

  return winner;
}

export function findSequenceSceneAtTime(
  sequence: CompiledSequence,
  time: number,
): CompiledSceneClip | null {
  const activeTransition = findSequenceTransitionAtTime(sequence, time);
  if (activeTransition) {
    return findClipById(sequence, activeTransition.toClipId);
  }

  for (let index = 0; index < sequence.sceneClips.length; index += 1) {
    const clip = sequence.sceneClips[index];
    if (!clip) continue;
    if (time >= clip.startTime && time < clip.endTime) {
      return clip;
    }
    const nextClip = sequence.sceneClips[index + 1];
    if (nextClip && time >= clip.endTime && time < nextClip.startTime) {
      return clip;
    }
  }

  if (sequence.sceneClips.length > 0) {
    const firstClip = sequence.sceneClips[0]!;
    if (time < firstClip.startTime) {
      return firstClip;
    }
    return sequence.sceneClips[sequence.sceneClips.length - 1] ?? null;
  }

  return null;
}

export function sampleSequenceTransition(
  sequence: CompiledSequence,
  time: number,
): {
  transition: SequenceTransition;
  outgoingClip: CompiledSceneClip;
  incomingClip: CompiledSceneClip;
  progress: number;
  compositorPlan: ReturnType<typeof buildSceneTransitionPlan>;
} | null {
  const transition = findSequenceTransitionAtTime(sequence, time);
  if (!transition) {
    return null;
  }

  const incomingClip = findClipById(sequence, transition.toClipId);
  const outgoingClip = findClipById(sequence, transition.fromClipId);
  if (!incomingClip || !outgoingClip) {
    return null;
  }

  const progress = computeTransitionProgress(transition, time);
  const compositorPlan = buildSceneTransitionPlan({
    effect: transition.effect,
    progress,
    outgoing: buildSceneShotSurface(outgoingClip.sceneId, sequence.renderContext),
    incoming: buildSceneShotSurface(incomingClip.sceneId, sequence.renderContext),
    sampled: {
      shot: sampleSequenceTransitionChannel(transition.channels.shot, progress),
      dialogue: sampleSequenceTransitionChannel(transition.channels.dialogue, progress),
    },
  });

  return {
    transition,
    outgoingClip,
    incomingClip,
    progress,
    compositorPlan,
  };
}

export function sampleSequence(params: {
  sequence: CompiledSequence;
  time: number;
  imageResolver?: (url: string) => CanvasImageSource | null;
  renderScale?: number;
}): PreparedFrame {
  const { sequence, time, imageResolver, renderScale } = params;
  const activeTransition = sampleSequenceTransition(sequence, time);

  if (activeTransition) {
    const outgoing = prepareFrameInput({
      renderState: computeRenderState(activeTransition.outgoingClip.events, time, undefined, sequence.renderContext.sceneActorDefaults.get(activeTransition.outgoingClip.sceneId)),
      time,
      sceneTime: time - activeTransition.outgoingClip.contentStartTime,
      sceneTimeRanges: [],
      fallbackSceneId: activeTransition.outgoingClip.sceneId,
      renderContext: sequence.renderContext,
      imageResolver,
      renderScale,
    });
    const incoming = prepareFrameInput({
      renderState: computeRenderState(activeTransition.incomingClip.events, time, undefined, sequence.renderContext.sceneActorDefaults.get(activeTransition.incomingClip.sceneId)),
      time,
      sceneTime: time - activeTransition.incomingClip.contentStartTime,
      sceneTimeRanges: [],
      fallbackSceneId: activeTransition.incomingClip.sceneId,
      renderContext: sequence.renderContext,
      imageResolver,
      renderScale,
    });

    return {
      transition: {
        outgoing,
        incoming,
        compositorPlan: activeTransition.compositorPlan,
        progress: activeTransition.progress,
      },
      currentSceneId: activeTransition.incomingClip.sceneId,
    };
  }

  const clip = findSequenceSceneAtTime(sequence, time);
  const currentSceneId = clip?.sceneId ?? sequence.fallbackSceneId;
  const single = prepareFrameInput({
    renderState: computeRenderState(clip?.events ?? [], time, undefined, currentSceneId ? sequence.renderContext.sceneActorDefaults.get(currentSceneId) : undefined),
    time,
    sceneTime: time - (clip?.contentStartTime ?? 0),
    sceneTimeRanges: [],
    fallbackSceneId: currentSceneId,
    renderContext: sequence.renderContext,
    imageResolver,
    renderScale,
  });

  return {
    single,
    currentSceneId,
  };
}
