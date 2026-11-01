import type { BgmState, SfxTrigger } from './types';
import type { CompiledAudioPlan } from './audio-plan';

export interface ActiveBgmState extends BgmState {
  offset: number;
}

export interface VoicePlaybackState {
  asset: string;
  volume: number;
  key: string;
  offset: number;
  startedAt: number;
  duration: number;
}

export interface ComputedAudioState {
  bgm: ActiveBgmState | null;
  bgmFadeOut?: number;
  sfxTriggers: SfxTrigger[];
  voices: VoicePlaybackState[];
  speechActive: boolean;
}

function isSpeechActive(plan: CompiledAudioPlan, time: number): boolean {
  return plan.speechWindows.some((window) => time >= window.start && time < window.end);
}

export function computeAudioState(
  plan: CompiledAudioPlan,
  time: number,
): ComputedAudioState {
  const clampedTime = Math.max(0, Math.min(time, plan.duration));
  const speechActive = isSpeechActive(plan, clampedTime);
  const segment = plan.bgmSegments.find(
    (candidate) => clampedTime >= candidate.start && clampedTime < candidate.end,
  );

  const bgm = segment
    ? {
        asset: segment.asset,
        status: 'playing' as const,
        volume: segment.volume,
        fade: segment.fade,
        loop: segment.loop,
        duck: segment.duck,
        ducking: speechActive && segment.duck < 1,
        startedAt: segment.startedAt,
        offset: segment.offset + (clampedTime - segment.start),
      }
    : null;

  const voices = plan.voiceSegments
    .filter((voice) => clampedTime >= voice.start && clampedTime < voice.end)
    .map((voice) => ({
      asset: voice.asset,
      volume: voice.volume,
      key: voice.key,
      offset: (voice.offset ?? 0) + clampedTime - voice.start,
      startedAt: voice.start,
      duration: (voice.offset ?? 0) + voice.end - voice.start,
    }));

  return {
    bgm,
    ...(!segment ? (() => {
      const outgoing = plan.bgmSegments.findLast((candidate) =>
        candidate.fadeOut !== undefined && clampedTime >= candidate.end);
      return outgoing ? { bgmFadeOut: outgoing.fadeOut } : {};
    })() : {}),
    sfxTriggers: plan.sfxTriggers.filter((trigger) => trigger.triggeredAt <= clampedTime),
    voices,
    speechActive,
  };
}
