import type {
  SceneTransitionParticipation,
  SceneTransitionPlan,
  SceneTransitionSampledChannelValue,
  SceneTransitionSpec,
} from './scene-transition-channels';
import { buildDefaultTransitionChannels } from './default-transition-channels';
import { sampleSequenceTransitionChannel } from './sequence-envelope';

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function buildParticipation(opacity: number): SceneTransitionParticipation {
  const safeOpacity = clamp01(opacity);
  if (safeOpacity <= 0.001) {
    return { phase: 'hidden', opacity: 0 };
  }
  if (safeOpacity >= 0.999) {
    return { phase: 'visible', opacity: 1 };
  }
  return {
    phase: 'transitioning',
    opacity: safeOpacity,
  };
}

function applySampledChannel(
  fallback: {
    outgoing: SceneTransitionParticipation;
    incoming: SceneTransitionParticipation;
  },
  sampled?: SceneTransitionSampledChannelValue,
) {
  if (!sampled) {
    return fallback;
  }

  return {
    outgoing: buildParticipation(sampled.outgoingOpacity),
    incoming: buildParticipation(sampled.incomingOpacity),
  };
}

export function buildSceneTransitionPlan(spec: SceneTransitionSpec): SceneTransitionPlan {
  const progress = clamp01(spec.progress);
  const defaultChannels = buildDefaultTransitionChannels(spec.effect);
  const fallbackShot = sampleSequenceTransitionChannel(defaultChannels.shot, progress);
  const fallbackDialogue = sampleSequenceTransitionChannel(defaultChannels.dialogue, progress);

  const throughColor = spec.effect === 'fade-black'
    ? '#000000'
    : spec.effect === 'fade-white'
      ? '#ffffff'
      : null;

  const plan: SceneTransitionPlan = {
    effect: spec.effect,
    progress,
    shot: {
      mode: defaultChannels.shot.mode === 'through-color' ? 'through-color' : 'dual-opacity',
      outgoing: { surface: spec.outgoing, opacity: fallbackShot.outgoingOpacity },
      incoming: { surface: spec.incoming, opacity: fallbackShot.incomingOpacity },
      throughColor,
      throughColorOpacity: throughColor ? fallbackShot.throughColorOpacity : 0,
    },
    dialogue: {
      outgoing: buildParticipation(fallbackDialogue.outgoingOpacity),
      incoming: buildParticipation(fallbackDialogue.incomingOpacity),
    },
  };

  if (!spec.sampled) {
    return plan;
  }

  const sampledShot = spec.sampled.shot;
  return {
    ...plan,
    shot: sampledShot
      ? {
          ...plan.shot,
          outgoing: { surface: spec.outgoing, opacity: clamp01(sampledShot.outgoingOpacity) },
          incoming: { surface: spec.incoming, opacity: clamp01(sampledShot.incomingOpacity) },
          throughColorOpacity: plan.shot.throughColor
            ? clamp01(sampledShot.throughColorOpacity)
            : plan.shot.throughColorOpacity,
        }
      : plan.shot,
    dialogue: applySampledChannel(plan.dialogue, spec.sampled.dialogue),
  };
}
