import type { SceneTransitionType, TimelineEvent } from '@vnve/core';
import type { CompiledAudioPlan } from '@vnve/runtime';
import type { RenderContext } from './frame-pipeline';

export type SequenceClipChannel = 'shot' | 'dialogue';
export type SequenceTransitionMode = 'opacity' | 'through-color';
export type SequenceTransitionEasing = 'linear' | 'smoothstep' | 'step';
export type SequenceEventTimeBasis = 'sequence-global';

export interface ChannelClipRef {
  channel: SequenceClipChannel;
  clipId: string;
}

export interface SequenceTransitionRampEnvelope {
  start: number;
  end: number;
  from: number;
  to: number;
  easing: Exclude<SequenceTransitionEasing, 'step'>;
}

export interface SequenceTransitionStepEnvelope {
  at: number;
  from: number;
  to: number;
  easing: 'step';
}

export type SequenceTransitionEnvelope =
  | SequenceTransitionRampEnvelope
  | SequenceTransitionStepEnvelope;

export interface SequenceTransitionChannelSpec {
  mode: SequenceTransitionMode;
  outgoing: SequenceTransitionEnvelope;
  incoming: SequenceTransitionEnvelope;
}

export interface CompiledSceneClip {
  clipId: string;
  sceneId: string;
  startTime: number;
  contentStartTime: number;
  endTime: number;
  eventTimeBasis: SequenceEventTimeBasis;
  events: TimelineEvent[];
  channels: {
    shot: ChannelClipRef;
    dialogue: ChannelClipRef;
  };
}

export interface SequenceTransition {
  id: string;
  /** Lower value wins when multiple transitions are active at the same time. */
  selectionOrder: number;
  /** Raw transition progress still uses startTime/endTime; this is when the transition becomes selectable after overlap ordering is applied. */
  effectiveStartTime: number;
  /** Selectable window is [effectiveStartTime, effectiveEndTime); fully shadowed transitions collapse to zero length. */
  effectiveEndTime: number;
  fromClipId: string;
  toClipId: string;
  fromSceneId: string;
  toSceneId: string;
  startTime: number;
  endTime: number;
  effect: SceneTransitionType;
  channels: {
    shot: SequenceTransitionChannelSpec;
    dialogue: SequenceTransitionChannelSpec;
    audio?: SequenceTransitionChannelSpec;
  };
}

export interface CompiledSequence {
  duration: number;
  renderContext: RenderContext;
  audioPlan: CompiledAudioPlan;
  sceneClips: CompiledSceneClip[];
  transitions: SequenceTransition[];
  fallbackSceneId: string | null;
}
