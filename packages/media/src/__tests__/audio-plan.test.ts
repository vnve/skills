import { describe, expect, it } from 'vitest';
import type { TimelineEvent } from '@vnve/core';
import {
  compileAudioPlan,
  computeAudioState,
} from '../audio-plan';

describe('audio-plan', () => {
  it('re-exports the shared runtime audio plan compiler', () => {
    const events: TimelineEvent[] = [
      { type: 'bgm', at: 0, dur: 0, params: { asset: 'bgm-main' } },
      { type: 'sfx', at: 1, dur: 0, params: { asset: 'hit' } },
    ];

    const plan = compileAudioPlan(events, 2);
    expect(plan.bgmSegments).toHaveLength(1);
    expect(plan.sfxTriggers).toEqual([
      { asset: 'hit', volume: 0.8, triggeredAt: 1 },
    ]);
  });

  it('re-exports the shared runtime audio state calculator', () => {
    const events: TimelineEvent[] = [
      {
        type: 'say',
        at: 1,
        dur: 2,
        targetId: 'actor-1',
        params: { text: 'hello', audioUrl: 'assets/audio/tts-1.wav', voiceVolume: 0.7 },
      },
    ];

    const state = computeAudioState(compileAudioPlan(events, 3), 1.5);
    expect(state.voices).toEqual([
      {
        asset: 'assets/audio/tts-1.wav',
        volume: 0.7,
        key: 'voice:0',
        offset: 0.5,
        startedAt: 1,
        duration: 2,
      },
    ]);
  });
});
