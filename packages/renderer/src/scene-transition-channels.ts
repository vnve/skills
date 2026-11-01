import type { SceneTransitionType } from '@vnve/core';

export interface SceneShotSurface {
  sceneId: string;
  backgroundColor?: string;
  backgroundAssetId?: string;
  backgroundVisible?: boolean;
  cgAssetId?: string;
  cgVisible?: boolean;
}

export interface SceneShotChannel {
  outgoing: SceneTransitionParticipation;
  incoming: SceneTransitionParticipation;
}

export interface SceneDialogueChannel {
  outgoing: SceneTransitionParticipation;
  incoming: SceneTransitionParticipation;
}

export interface SceneTransitionSampledChannelValue {
  outgoingOpacity: number;
  incomingOpacity: number;
  throughColorOpacity: number;
}

export interface SceneTransitionSampledChannels {
  shot: SceneTransitionSampledChannelValue;
  dialogue: SceneTransitionSampledChannelValue;
}

export interface SceneTransitionSpec {
  effect: SceneTransitionType;
  progress: number;
  outgoing: SceneShotSurface;
  incoming: SceneShotSurface;
  sampled?: Partial<SceneTransitionSampledChannels>;
}

export interface SceneShotReveal {
  type: 'wipe' | 'radial-open';
  progress: number;
  feather: number;
  direction?: 'left' | 'right';
}

export interface SceneShotPlanSide {
  surface: SceneShotSurface;
  opacity: number;
}

export interface SceneTransitionParticipation {
  phase: 'hidden' | 'transitioning' | 'visible';
  opacity: number;
}

export interface SceneShotPlan {
  mode: 'through-color' | 'dual-opacity' | 'incoming-reveal' | 'filtered-outgoing';
  outgoing: SceneShotPlanSide;
  incoming: SceneShotPlanSide;
  throughColor: string | null;
  throughColorOpacity: number;
  incomingReveal?: SceneShotReveal;
  outgoingBlur?: number;
  outgoingPixelate?: number;
}

export interface SceneTransitionPlan {
  effect: SceneTransitionType;
  progress: number;
  shot: SceneShotPlan;
  dialogue: SceneDialogueChannel;
}
