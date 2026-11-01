import {
  DEFAULT_BGM_DUCK,
  DEFAULT_BGM_FADE,
  DEFAULT_BGM_LOOP,
  DEFAULT_BGM_VOLUME,
  DEFAULT_SFX_VOLUME,
  DEFAULT_TTS_VOLUME,
  type TimelineEvent,
} from '@vnve/core';
import { computeDuration } from './computeState';
import type { SfxTrigger } from './types';

export interface BgmSegment {
  asset: string;
  start: number;
  end: number;
  /** Fade tail after an explicit pause/stop; absent for replacement and sequence end. */
  fadeOut?: number;
  offset: number;
  volume: number;
  fade: number;
  loop: boolean;
  duck: number;
  startedAt: number;
}

export interface VoiceSegment {
  asset: string;
  start: number;
  end: number;
  volume: number;
  key: string;
  /** Source recording offset; paused speech resumes without replaying its beginning. */
  offset?: number;
}

export function voiceIntervals(
  event: Extract<TimelineEvent, { type: 'say' | 'narrate' }>,
): Array<{ start: number; end: number; offset?: number }> {
  const pauses = event.params.inlinePauses ?? [];
  const length =
    event.params.voiceDuration ??
    Math.max(0, event.dur - pauses.reduce((sum, p) => sum + p.dur, 0));
  const segments: Array<{ start: number; end: number; offset?: number }> = [];
  let cursor = 0,
    delay = 0;
  const append = (end: number) => {
    if (end > cursor)
      segments.push({
        start: event.at + cursor + delay,
        end: event.at + end + delay,
        ...(cursor > 0 ? { offset: cursor } : {}),
      });
    cursor = end;
  };
  for (const pause of pauses) {
    const at = Math.max(cursor, pause.at ?? pause.ratio * length);
    if (at >= length) break;
    append(at);
    delay += pause.dur;
  }
  append(length);
  return segments;
}

export interface SpeechWindow {
  start: number;
  end: number;
}

export interface CompiledAudioPlan {
  duration: number;
  bgmSegments: BgmSegment[];
  sfxTriggers: SfxTrigger[];
  voiceSegments: VoiceSegment[];
  speechWindows: SpeechWindow[];
}

function mergeSpeechWindows(windows: SpeechWindow[]): SpeechWindow[] {
  if (windows.length === 0) return [];
  const sorted = [...windows].sort((a, b) => a.start - b.start);
  const merged: SpeechWindow[] = [{ ...sorted[0] }];
  for (let i = 1; i < sorted.length; i++) {
    const current = sorted[i];
    const last = merged[merged.length - 1];
    if (current.start <= last.end) {
      last.end = Math.max(last.end, current.end);
      continue;
    }
    merged.push({ ...current });
  }
  return merged;
}

export function compileAudioPlan(
  events: TimelineEvent[],
  duration = computeDuration(events),
): CompiledAudioPlan {
  const safeDuration = Math.max(0, duration);
  const bgmSegments: BgmSegment[] = [];
  const sfxTriggers: SfxTrigger[] = [];
  const voiceSegments: VoiceSegment[] = [];
  const rawSpeechWindows: SpeechWindow[] = [];

  let currentBgm: Omit<BgmSegment, 'end'> | null = null;
  let pausedBgm:
    | {
        asset: string;
        offset: number;
        volume: number;
        fade: number;
        loop: boolean;
        duck: number;
      }
    | null = null;

  const pushCurrentBgm = (end: number, fadeOut?: number) => {
    if (!currentBgm || end <= currentBgm.start) return;
    bgmSegments.push({
      ...currentBgm,
      end: Math.min(safeDuration, end),
      ...(fadeOut !== undefined ? { fadeOut: Math.max(0, fadeOut) } : {}),
    });
  };

  events.forEach((event, index) => {
    if ((event.type === 'say' || event.type === 'narrate')) {
      const start = Math.max(0, event.at);
      const end = Math.min(safeDuration, Math.max(start, event.at + event.dur));
      if (end > start) {
        rawSpeechWindows.push({ start, end });
      }
      if (event.params.audioUrl && end > start) {
        for (const [part,interval] of voiceIntervals(event).entries()) {
          if(interval.start>=end) continue;
          voiceSegments.push({
            ...interval,asset:event.params.audioUrl,end:Math.min(end,interval.end),
            volume:event.params.voiceVolume ?? DEFAULT_TTS_VOLUME,
            key:part===0?`voice:${index}`:`voice:${index}:${part}`,
          });
        }
      }
      return;
    }

    if (event.type === 'sfx') {
      sfxTriggers.push({
        asset: event.params.asset,
        volume: event.params.volume ?? DEFAULT_SFX_VOLUME,
        triggeredAt: event.at,
      });
      return;
    }

    if (event.type !== 'bgm') {
      return;
    }

    const action = event.params.action ?? 'play';
    if (action === 'stop') {
      pushCurrentBgm(event.at, event.params.fade ?? DEFAULT_BGM_FADE);
      currentBgm = null;
      pausedBgm = null;
      return;
    }

    if (action === 'pause') {
      if (!currentBgm) return;
      const elapsed = Math.max(0, event.at - currentBgm.start);
      pushCurrentBgm(event.at, event.params.fade ?? DEFAULT_BGM_FADE);
      pausedBgm = {
        asset: currentBgm.asset,
        offset: currentBgm.offset + elapsed,
        volume: currentBgm.volume,
        fade: event.params.fade ?? currentBgm.fade,
        loop: currentBgm.loop,
        duck: currentBgm.duck,
      };
      currentBgm = null;
      return;
    }

    if (action === 'resume') {
      if (!pausedBgm) return;
      currentBgm = {
        asset: pausedBgm.asset,
        start: Math.max(0, event.at),
        offset: pausedBgm.offset,
        volume: event.params.volume ?? pausedBgm.volume,
        fade: event.params.fade ?? pausedBgm.fade,
        loop: event.params.loop ?? pausedBgm.loop,
        duck: event.params.duck ?? pausedBgm.duck,
        startedAt: Math.max(0, event.at),
      };
      pausedBgm = null;
      return;
    }

    const asset = event.params.asset;
    pushCurrentBgm(event.at);
    pausedBgm = null;
    if (typeof asset !== 'string' || asset.length === 0) {
      currentBgm = null;
      return;
    }
    currentBgm = {
      asset,
      start: Math.max(0, event.at),
      offset: 0,
      volume: event.params.volume ?? DEFAULT_BGM_VOLUME,
      fade: event.params.fade ?? DEFAULT_BGM_FADE,
      loop: event.params.loop ?? DEFAULT_BGM_LOOP,
      duck: event.params.duck ?? DEFAULT_BGM_DUCK,
      startedAt: Math.max(0, event.at),
    };
  });

  pushCurrentBgm(safeDuration);

  return {
    duration: safeDuration,
    bgmSegments,
    sfxTriggers,
    voiceSegments,
    speechWindows: mergeSpeechWindows(rawSpeechWindows),
  };
}
