import {isDissolveTransition} from "@vnve/core";
import type { SceneTransitionType } from '@vnve/core';
import type {
  SequenceTransition,
  SequenceTransitionChannelSpec,
  SequenceTransitionEnvelope,
} from './sequence-types';

function buildTransitionEnvelope(
  start: number,
  end: number,
  from: number,
  to: number,
  easing: Extract<SequenceTransitionEnvelope['easing'], 'linear' | 'smoothstep'>,
): SequenceTransitionEnvelope {
  return { start, end, from, to, easing };
}

function buildStepTransitionEnvelope(
  at: number,
  from: number,
  to: number,
): SequenceTransitionEnvelope {
  return { at, from, to, easing: 'step' };
}

function buildTransitionChannel(
  mode: SequenceTransitionChannelSpec['mode'],
  outgoing: SequenceTransitionEnvelope,
  incoming: SequenceTransitionEnvelope,
): SequenceTransitionChannelSpec {
  return { mode, outgoing, incoming };
}

export function buildDefaultTransitionChannels(
  effect: SceneTransitionType,
): SequenceTransition['channels'] {
  const opacityCrossfade = buildTransitionChannel(
    'opacity',
    buildTransitionEnvelope(0, 1, 1, 0, 'linear'),
    buildTransitionEnvelope(0, 1, 0, 1, 'linear'),
  );

  const midpointSwitch = buildTransitionChannel(
    'opacity',
    buildStepTransitionEnvelope(0.5, 1, 0),
    buildStepTransitionEnvelope(0.5, 0, 1),
  );

  if (effect === 'fade-black' || effect === 'fade-white') {
    return {
      shot: buildTransitionChannel(
        'through-color',
        buildTransitionEnvelope(0, 0.5, 1, 0, 'linear'),
        buildTransitionEnvelope(0.5, 1, 0, 1, 'linear'),
      ),
      dialogue: buildTransitionChannel(
        'opacity',
        buildTransitionEnvelope(0, 0.3, 1, 0, 'smoothstep'),
        buildTransitionEnvelope(0.78, 1, 0, 1, 'smoothstep'),
      ),
    };
  }

  if (isDissolveTransition(effect)) {
    return {
      shot: opacityCrossfade,
      dialogue: buildTransitionChannel(
        'opacity',
        buildTransitionEnvelope(0.02, 0.45, 1, 0, 'smoothstep'),
        buildTransitionEnvelope(0.2, 0.92, 0, 1, 'smoothstep'),
      ),
    };
  }

  if (effect === 'cut' || effect === 'wipe-left' || effect === 'wipe-right') {
    return {
      shot: midpointSwitch,
      dialogue: midpointSwitch,
    };
  }

  return {
    shot: buildTransitionChannel(
      'opacity',
      buildStepTransitionEnvelope(1, 1, 1),
      buildStepTransitionEnvelope(1, 0, 0),
    ),
    dialogue: buildTransitionChannel(
      'opacity',
      buildStepTransitionEnvelope(1, 1, 1),
      buildStepTransitionEnvelope(1, 0, 0),
    ),
  };
}
