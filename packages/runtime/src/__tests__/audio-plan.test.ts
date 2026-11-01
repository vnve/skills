import { describe, expect, it } from 'vitest';
import type { TimelineEvent } from '@vnve/core';
import { compileAudioPlan } from '../audio-plan';
import { computeAudioState } from '../audio-state';

describe('compileAudioPlan', () => {
  it('compiles shared bgm, sfx, voice and speech windows from timeline events', () => {
    const events: TimelineEvent[] = [
      {
        type: 'bgm',
        at: 0,
        dur: 0,
        params: { action: 'play', asset: 'theme.mp3', volume: 0.8, fade: 0.2, duck: 0.5 },
      },
      {
        type: 'say',
        at: 1,
        dur: 2,
        targetId: 'actor-1',
        params: { text: 'hello', audioUrl: 'assets/audio/tts-1.wav', voiceVolume: 0.7 },
      },
      {
        type: 'narrate',
        at: 2.5,
        dur: 1,
        params: { text: 'world' },
      },
      {
        type: 'sfx',
        at: 1.2,
        dur: 0,
        params: { asset: 'hit.wav', volume: 0.4 },
      },
      {
        type: 'bgm',
        at: 3,
        dur: 0,
        params: { action: 'pause', fade: 0.1 },
      },
      {
        type: 'bgm',
        at: 4,
        dur: 0,
        params: { action: 'resume', volume: 0.6 },
      },
      {
        type: 'wait',
        at: 4,
        dur: 2,
        params: { seconds: 2 },
      },
    ];

    const plan = compileAudioPlan(events, 6);

    expect(plan.bgmSegments).toEqual([
      {
        asset: 'theme.mp3',
        start: 0,
        end: 3,
        fadeOut: 0.1,
        offset: 0,
        volume: 0.8,
        fade: 0.2,
        loop: true,
        duck: 0.5,
        startedAt: 0,
      },
      {
        asset: 'theme.mp3',
        start: 4,
        end: 6,
        offset: 3,
        volume: 0.6,
        fade: 0.1,
        loop: true,
        duck: 0.5,
        startedAt: 4,
      },
    ]);
    expect(plan.sfxTriggers).toEqual([
      { asset: 'hit.wav', volume: 0.4, triggeredAt: 1.2 },
    ]);
    expect(plan.voiceSegments).toEqual([
      {
        asset: 'assets/audio/tts-1.wav',
        start: 1,
        end: 3,
        volume: 0.7,
        key: 'voice:1',
      },
    ]);
    expect(plan.speechWindows).toEqual([
      { start: 1, end: 3.5 },
    ]);
  });

  it('preserves delayed speech timestamps in voice and speech timing', () => {
    const plan = compileAudioPlan([
      {
        type: 'say',
        at: 3,
        dur: 2,
        targetId: 'actor-1',
        params: { text: 'delayed line', audioUrl: 'assets/audio/tts-2.wav' },
      },
      {
        type: 'narrate',
        at: 6,
        dur: 1,
        params: { text: 'late narration' },
      },
    ], 8);

    expect(plan.voiceSegments).toEqual([
      {
        asset: 'assets/audio/tts-2.wav',
        start: 3,
        end: 5,
        volume: 1,
        key: 'voice:0',
      },
    ]);
    expect(plan.speechWindows).toEqual([
      { start: 3, end: 5 },
      { start: 6, end: 7 },
    ]);
    expect(computeAudioState(plan, 3.5)).toEqual({
      bgm: null,
      sfxTriggers: [],
      voices: [{
        asset: 'assets/audio/tts-2.wav',
        volume: 1,
        key: 'voice:0',
        offset: 0.5,
        startedAt: 3,
        duration: 2,
      }],
      speechActive: true,
    });
  });

  it('computes active audio state with offset-aware bgm and voice playback', () => {
    const plan = compileAudioPlan([
      {
        type: 'bgm',
        at: 0,
        dur: 0,
        params: { action: 'play', asset: 'theme.mp3', volume: 0.8, fade: 0.2, duck: 0.5 },
      },
      {
        type: 'say',
        at: 1,
        dur: 2,
        targetId: 'actor-1',
        params: { text: 'hello', audioUrl: 'assets/audio/tts-1.wav', voiceVolume: 0.7 },
      },
      {
        type: 'sfx',
        at: 1.2,
        dur: 0,
        params: { asset: 'hit.wav', volume: 0.4 },
      },
      {
        type: 'bgm',
        at: 3,
        dur: 0,
        params: { action: 'pause', fade: 0.1 },
      },
      {
        type: 'bgm',
        at: 4,
        dur: 0,
        params: { action: 'resume', volume: 0.6 },
      },
    ], 6);

    expect(computeAudioState(plan, 1.5)).toEqual({
      bgm: {
        asset: 'theme.mp3',
        status: 'playing',
        volume: 0.8,
        fade: 0.2,
        loop: true,
        duck: 0.5,
        ducking: true,
        startedAt: 0,
        offset: 1.5,
      },
      sfxTriggers: [{ asset: 'hit.wav', volume: 0.4, triggeredAt: 1.2 }],
      voices: [{
        asset: 'assets/audio/tts-1.wav',
        volume: 0.7,
        key: 'voice:1',
        offset: 0.5,
        startedAt: 1,
        duration: 2,
      }],
      speechActive: true,
    });

    expect(computeAudioState(plan, 4.5)).toEqual({
      bgm: {
        asset: 'theme.mp3',
        status: 'playing',
        volume: 0.6,
        fade: 0.1,
        loop: true,
        duck: 0.5,
        ducking: false,
        startedAt: 4,
        offset: 3.5,
      },
      sfxTriggers: [{ asset: 'hit.wav', volume: 0.4, triggeredAt: 1.2 }],
      voices: [],
      speechActive: false,
    });
  });

  it('handles bgm stop, missing assets and disjoint speech windows', () => {
    const plan = compileAudioPlan([
      {
        type: 'bgm',
        at: 0,
        dur: 0,
        params: { action: 'play', asset: 'theme.mp3' },
      },
      {
        type: 'bgm',
        at: 1,
        dur: 0,
        params: { action: 'stop' },
      },
      {
        type: 'bgm',
        at: 2,
        dur: 0,
        params: { action: 'play' },
      },
      {
        type: 'say',
        at: 3,
        dur: 1,
        targetId: 'actor-1',
        params: { text: 'hello' },
      },
      {
        type: 'narrate',
        at: 5,
        dur: 1,
        params: { text: 'world' },
      },
    ], 7);

    expect(plan.bgmSegments).toEqual([
      {
        asset: 'theme.mp3',
        start: 0,
        end: 1,
        fadeOut: 0.3,
        offset: 0,
        volume: 0.4,
        fade: 0.3,
        loop: true,
        duck: 0.45,
        startedAt: 0,
      },
    ]);
    expect(plan.voiceSegments).toEqual([]);
    expect(plan.speechWindows).toEqual([
      { start: 3, end: 4 },
      { start: 5, end: 6 },
    ]);
  });

  it('ignores pause and resume actions when no bgm timeline exists', () => {
    const plan = compileAudioPlan([
      {
        type: 'bgm',
        at: 1,
        dur: 0,
        params: { action: 'pause' },
      },
      {
        type: 'bgm',
        at: 2,
        dur: 0,
        params: { action: 'resume' },
      },
      {
        type: 'sfx',
        at: 3,
        dur: 0,
        params: { asset: 'click.wav' },
      },
    ], 4);

    expect(plan.bgmSegments).toEqual([]);
    expect(plan.sfxTriggers).toEqual([
      { asset: 'click.wav', volume: 0.8, triggeredAt: 3 },
    ]);
  });

  it('shares explicit pause and zero stop fades with playback', () => {
    const plan = compileAudioPlan([
      { type: 'bgm', at: 0, dur: 0, params: { action: 'play', asset: 'tone.wav' } },
      { type: 'bgm', at: 1, dur: 0, params: { action: 'pause', fade: 0.4 } },
      { type: 'bgm', at: 2, dur: 0, params: { action: 'resume' } },
      { type: 'bgm', at: 3, dur: 0, params: { action: 'stop', fade: 0 } },
    ], 4);
    expect(computeAudioState(plan, 1).bgmFadeOut).toBe(0.4);
    expect(computeAudioState(plan, 3).bgmFadeOut).toBe(0);
  });

  it('clamps computed audio state to the plan duration', () => {
    const plan = compileAudioPlan([
      {
        type: 'bgm',
        at: 0,
        dur: 0,
        params: { action: 'play', asset: 'theme.mp3' },
      },
      {
        type: 'say',
        at: 0.5,
        dur: 1,
        targetId: 'actor-1',
        params: { text: 'hello', audioUrl: 'assets/audio/tts-1.wav' },
      },
    ], 2);

    expect(computeAudioState(plan, -1)).toEqual({
      bgm: {
        asset: 'theme.mp3',
        status: 'playing',
        volume: 0.4,
        fade: 0.3,
        loop: true,
        duck: 0.45,
        ducking: false,
        startedAt: 0,
        offset: 0,
      },
      sfxTriggers: [],
      voices: [],
      speechActive: false,
    });

    expect(computeAudioState(plan, 3)).toEqual({
      bgm: null,
      sfxTriggers: [],
      voices: [],
      speechActive: false,
    });
  });
});
