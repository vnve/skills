import type {
  SequenceTransitionChannelSpec,
  SequenceTransitionEnvelope,
} from './sequence-types';

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function smoothstep01(value: number): number {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
}

export function sampleSequenceTransitionEnvelope(
  envelope: SequenceTransitionEnvelope,
  progress: number,
): number {
  const clampedProgress = clamp01(progress);

  if (envelope.easing === 'step') {
    return clampedProgress < envelope.at ? envelope.from : envelope.to;
  }

  if (envelope.end <= envelope.start) {
    return clampedProgress >= envelope.end ? envelope.to : envelope.from;
  }

  const normalized = (clampedProgress - envelope.start) / (envelope.end - envelope.start);
  const eased = envelope.easing === 'smoothstep'
    ? smoothstep01(normalized)
    : clamp01(normalized);

  return envelope.from + (envelope.to - envelope.from) * eased;
}

export function sampleSequenceTransitionChannel(
  spec: SequenceTransitionChannelSpec,
  progress: number,
): {
  outgoingOpacity: number;
  incomingOpacity: number;
  throughColorOpacity: number;
} {
  const outgoingOpacity = clamp01(sampleSequenceTransitionEnvelope(spec.outgoing, progress));
  const incomingOpacity = clamp01(sampleSequenceTransitionEnvelope(spec.incoming, progress));
  const throughColorOpacity = spec.mode === 'through-color'
    ? clamp01(1 - outgoingOpacity - incomingOpacity)
    : 0;

  return {
    outgoingOpacity,
    incomingOpacity,
    throughColorOpacity,
  };
}
