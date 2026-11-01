import { describe, it, expect } from 'vitest';
import { SET_TARGET_BACKGROUND, SET_TARGET_CG, type TimelineEvent } from '@vnve/core';
import { computeRenderState, computeDuration } from '../computeState';

describe('computeDuration', () => {
  it('returns 0 for empty events', () => {
    expect(computeDuration([])).toBe(0);
  });

  it('returns max of at + dur', () => {
    const events: TimelineEvent[] = [
      { type: 'show', at: 0, dur: 0.5, targetId: 'a', params: {} },
      { type: 'hide', at: 0.5, dur: 0.5, targetId: 'a', params: {} },
    ];
    expect(computeDuration(events)).toBe(1);
  });
});

describe('computeRenderState - empty', () => {
  it('returns empty state for no events', () => {
    const state = computeRenderState([], 0);
    expect(state.time).toBe(0);
    expect(state.duration).toBe(0);
    expect(state.actors).toHaveLength(0);
    expect(state.dialogue).toBeNull();
    expect(state.narration).toBeNull();
    expect(state.activeEventIndex).toBe(-1);
  });
});

describe('computeRenderState - show', () => {
  const events: TimelineEvent[] = [
    { type: 'show', at: 0, dur: 0.5, targetId: 'alice', params: { x: 100, y: 500 } },
  ];

  it('actor is fading in during show', () => {
    const state = computeRenderState(events, 0.25);
    expect(state.actors).toHaveLength(1);
    expect(state.actors[0].visible).toBe(true);
    expect(state.actors[0].opacity).toBeCloseTo(0.5, 1);
    expect(state.actors[0].x).toBe(100);
    expect(state.actors[0].y).toBe(500);
    expect(state.activeEventIndex).toBe(0);
  });

  it('actor is fully visible after show completes', () => {
    const state = computeRenderState(events, 0.5);
    expect(state.actors[0].visible).toBe(true);
    expect(state.actors[0].opacity).toBe(1);
  });

  it('actor visible at time well past show', () => {
    const state = computeRenderState(events, 10);
    expect(state.actors[0].visible).toBe(true);
    expect(state.actors[0].opacity).toBe(1);
  });
});

describe('computeRenderState - hide', () => {
  const events: TimelineEvent[] = [
    { type: 'show', at: 0, dur: 0.5, targetId: 'alice', params: { x: 100, y: 500 } },
    { type: 'hide', at: 0.5, dur: 0.5, targetId: 'alice', params: {} },
  ];

  it('actor is fading out during hide', () => {
    const state = computeRenderState(events, 0.75);
    expect(state.actors[0].opacity).toBeCloseTo(0.5, 1);
  });

  it('actor is invisible after hide completes', () => {
    const state = computeRenderState(events, 1.0);
    expect(state.actors[0].visible).toBe(false);
    expect(state.actors[0].opacity).toBe(0);
  });
});

describe('computeRenderState - move', () => {
  const events: TimelineEvent[] = [
    { type: 'show', at: 0, dur: 0.5, targetId: 'alice', params: { x: 0, y: 0 } },
    { type: 'move', at: 0.5, dur: 1.0, targetId: 'alice', params: { toX: 100, toY: 200 } },
  ];

  it('actor is at starting position before move', () => {
    const state = computeRenderState(events, 0.5);
    expect(state.actors[0].x).toBe(0);
    expect(state.actors[0].y).toBe(0);
  });

  it('actor is at midpoint during move', () => {
    const state = computeRenderState(events, 1.0);
    expect(state.actors[0].x).toBeCloseTo(50, 0);
    expect(state.actors[0].y).toBeCloseTo(100, 0);
  });

  it('actor is at target after move completes', () => {
    const state = computeRenderState(events, 1.5);
    expect(state.actors[0].x).toBe(100);
    expect(state.actors[0].y).toBe(200);
  });
});

describe('computeRenderState - consecutive moves', () => {
  const events: TimelineEvent[] = [
    { type: 'show', at: 0, dur: 0, targetId: 'a', params: { x: 0, y: 0 } },
    { type: 'move', at: 0, dur: 1, targetId: 'a', params: { toX: 100, toY: 0 } },
    { type: 'move', at: 1, dur: 1, targetId: 'a', params: { toX: 100, toY: 200 } },
  ];

  it('second move starts from end of first move', () => {
    const state = computeRenderState(events, 1.5);
    expect(state.actors[0].x).toBe(100);
    expect(state.actors[0].y).toBeCloseTo(100, 0);
  });
});

describe('computeRenderState - shake', () => {
  const events: TimelineEvent[] = [
    { type: 'show', at: 0, dur: 0, targetId: 'a', params: { x: 100, y: 100 } },
    { type: 'shake', at: 0, dur: 0.4, targetId: 'a', params: { amp: 10 } },
  ];

  it('actor has nonzero shake offset during shake', () => {
    const state = computeRenderState(events, 0.1);
    // At least one of the offsets should be nonzero
    const hasOffset =
      Math.abs(state.actors[0].shakeOffsetX) > 0 ||
      Math.abs(state.actors[0].shakeOffsetY) > 0;
    expect(hasOffset).toBe(true);
  });

  it('actor has zero shake offset after shake completes', () => {
    const state = computeRenderState(events, 0.4);
    expect(state.actors[0].shakeOffsetX).toBe(0);
    expect(state.actors[0].shakeOffsetY).toBe(0);
  });
});

describe('computeRenderState - set', () => {
  const events: TimelineEvent[] = [
    { type: 'show', at: 0, dur: 0, targetId: 'a', params: { x: 0, y: 0 } },
    { type: 'set', at: 0, dur: 0, params: { target: 'a', variant: 'happy' } },
  ];

  it('sprite is set immediately', () => {
    const state = computeRenderState(events, 0);
    expect(state.actors[0].sprite).toBe('happy');
  });

  it('supports scene layer targets (background/cg)', () => {
    const layerEvents: TimelineEvent[] = [
      { type: 'set', at: 0, dur: 0, params: { target: SET_TARGET_BACKGROUND, variant: 'bg-1' } },
      { type: 'set', at: 0, dur: 0, params: { target: SET_TARGET_CG, variant: 'cg-1' } },
    ];
    const state = computeRenderState(layerEvents, 0);
    expect(state.background?.asset).toBe('bg-1');
    expect(state.cg?.asset).toBe('cg-1');
  });

  it('applies actor sprite fade transition when with=fade', () => {
    const fadeEvents: TimelineEvent[] = [
      { type: 'show', at: 0, dur: 0, targetId: 'a', params: { x: 0, y: 0 } },
      { type: 'set', at: 0, dur: 0, params: { target: 'a', variant: 'neutral' } },
      { type: 'set', at: 1, dur: 0.5, params: { target: 'a', variant: 'happy', with: 'fade' } },
    ];
    const during = computeRenderState(fadeEvents, 1.25).actors[0];
    expect(during.sprite).toBe('happy');
    expect(during.previousSprite).toBe('neutral');
    expect(during.spriteTransition?.effect).toBe('fade');
    expect(during.spriteTransition?.progress).toBeCloseTo(0.5, 2);

    const after = computeRenderState(fadeEvents, 1.5).actors[0];
    expect(after.sprite).toBe('happy');
    expect(after.previousSprite).toBeUndefined();
    expect(after.spriteTransition).toBeUndefined();
  });
});

describe('computeRenderState - say', () => {
  const events: TimelineEvent[] = [
    { type: 'say', at: 0, dur: 2, targetId: 'alice', params: { text: 'Hello!' } },
  ];

  it('dialogue is active during say', () => {
    const state = computeRenderState(events, 1.0);
    expect(state.dialogue).not.toBeNull();
    expect(state.dialogue!.speaker).toBe('alice');
    expect(state.dialogue!.text).toBe('Hello!');
    expect(state.dialogue!.progress).toBeCloseTo(0.5, 1);
  });

  it('tracks elapsed and reveal durations for active line-mode dialogue', () => {
    const state = computeRenderState([
      { type: 'say', at: 0, dur: 4, targetId: 'alice', params: { text: 'Hello!', displayMode: 'line' } },
    ], 1.0);
    expect(state.dialogue?.elapsedSeconds).toBeCloseTo(1, 5);
    expect(state.dialogue?.revealDurationSeconds).toBeCloseTo(4, 5);
  });

  it('dialogue persists after say completes (VN convention)', () => {
    const state = computeRenderState(events, 2.0);
    expect(state.dialogue).not.toBeNull();
    expect(state.dialogue!.speaker).toBe('alice');
    expect(state.dialogue!.text).toBe('Hello!');
    expect(state.dialogue!.progress).toBe(1);
  });

  it('dialogue is null before say starts', () => {
    const state = computeRenderState([], 0);
    expect(state.dialogue).toBeNull();
  });

  it('supports inline pause windows without slowing the whole line', () => {
    const pausedEvents: TimelineEvent[] = [
      {
        type: 'say',
        at: 0,
        dur: 2, // base 1s + 1s pause at 50%
        targetId: 'alice',
        params: {
          text: '123456',
          inlinePauses: [{ ratio: 0.5, dur: 1 }],
        },
      },
    ];

    // Reaches 50% at t=0.5
    expect(computeRenderState(pausedEvents, 0.5).dialogue!.progress).toBeCloseTo(0.5, 5);
    // Stays at 50% during pause window [0.5, 1.5]
    expect(computeRenderState(pausedEvents, 1.0).dialogue!.progress).toBeCloseTo(0.5, 5);
    expect(computeRenderState(pausedEvents, 1.5).dialogue!.progress).toBeCloseTo(0.5, 5);
    // Then continues and finishes at t=2.0
    expect(computeRenderState(pausedEvents, 1.75).dialogue!.progress).toBeCloseTo(0.75, 5);
    expect(computeRenderState(pausedEvents, 2.0).dialogue!.progress).toBe(1);
  });

  it('starts delayed dialogue at the delayed timestamp, not earlier', () => {
    const delayedEvents: TimelineEvent[] = [
      { type: 'say', at: 1.5, dur: 2, targetId: 'alice', params: { text: 'Hello after the transition' } },
    ];

    expect(computeRenderState(delayedEvents, 1.25).dialogue).toBeNull();

    const stateAtStart = computeRenderState(delayedEvents, 1.5);
    expect(stateAtStart.dialogue).not.toBeNull();
    expect(stateAtStart.dialogue!.elapsedSeconds).toBe(0);
    expect(stateAtStart.dialogue!.progress).toBe(0);

    const stateMidway = computeRenderState(delayedEvents, 2.5);
    expect(stateMidway.dialogue!.elapsedSeconds).toBe(1);
    expect(stateMidway.dialogue!.progress).toBe(0.5);
  });
});

describe('computeRenderState - narrate', () => {
  const events: TimelineEvent[] = [
    { type: 'narrate', at: 0, dur: 2, params: { text: 'Once upon a time...' } },
  ];

  it('narration is active during narrate', () => {
    const state = computeRenderState(events, 1.0);
    expect(state.narration).not.toBeNull();
    expect(state.narration!.text).toBe('Once upon a time...');
    expect(state.narration!.progress).toBeCloseTo(0.5, 1);
  });

  it('narration persists after narrate completes (VN convention)', () => {
    const state = computeRenderState(events, 2.0);
    expect(state.narration).not.toBeNull();
    expect(state.narration!.text).toBe('Once upon a time...');
    expect(state.narration!.progress).toBe(1);
  });

  it('keeps the latest completed narration after multiple lines', () => {
    const multi: TimelineEvent[] = [
      { type: 'narrate', at: 0, dur: 0.6, params: { text: '第一句文案' } },
      { type: 'narrate', at: 0.75, dur: 1.0, params: { text: '第二句文案第二句文案第二句文案' } },
      { type: 'narrate', at: 1.9, dur: 0.6, params: { text: '第三句文案' } },
    ];
    const state = computeRenderState(multi, 3.0);
    expect(state.narration).not.toBeNull();
    expect(state.narration!.text).toBe('第三句文案');
    expect(state.narration!.progress).toBe(1);
  });

  it('starts delayed narration at the delayed timestamp, not earlier', () => {
    const delayedEvents: TimelineEvent[] = [
      { type: 'narrate', at: 2, dur: 3, params: { text: 'Narration begins later' } },
    ];

    expect(computeRenderState(delayedEvents, 1.9).narration).toBeNull();

    const stateAtStart = computeRenderState(delayedEvents, 2);
    expect(stateAtStart.narration).not.toBeNull();
    expect(stateAtStart.narration!.elapsedSeconds).toBe(0);
    expect(stateAtStart.narration!.progress).toBe(0);

    const stateMidway = computeRenderState(delayedEvents, 3.5);
    expect(stateMidway.narration!.elapsedSeconds).toBe(1.5);
    expect(stateMidway.narration!.progress).toBe(0.5);
  });

  it('keeps the previous completed narration at the exact boundary before the next line reveals', () => {
    const multi: TimelineEvent[] = [
      { type: 'narrate', at: 0, dur: 0.6, params: { text: '第一句文案' } },
      { type: 'narrate', at: 0.75, dur: 1.0, params: { text: '第二句文案第二句文案第二句文案' } },
    ];

    const state = computeRenderState(multi, 0.75);

    expect(state.narration).not.toBeNull();
    expect(state.narration!.text).toBe('第一句文案');
    expect(state.narration!.progress).toBe(1);
  });

  it('switches to narration immediately when a dialogue is followed by narration', () => {
    const mixed: TimelineEvent[] = [
      { type: 'show', at: 0, dur: 0, targetId: 'alice', params: { x: 50, y: 100 } },
      { type: 'say', at: 0, dur: 0.8, targetId: 'alice', params: { text: 'Dialogue A' } },
      { type: 'narrate', at: 1.0, dur: 1.2, params: { text: 'Narration B' } },
    ];

    const state = computeRenderState(mixed, 1.05);

    expect(state.dialogue).toBeNull();
    expect(state.narration).not.toBeNull();
    expect(state.narration!.text).toBe('Narration B');
    expect(state.narration!.progress).toBeGreaterThan(0);
    expect(state.actors.find((actor) => actor.id === 'alice')?.isSpeaker).toBe(false);
  });

  it('starts voiced narration immediately without adding any extra runtime delay', () => {
    const mixed: TimelineEvent[] = [
      { type: 'show', at: 0, dur: 0, targetId: 'alice', params: { x: 50, y: 100 } },
      { type: 'say', at: 0, dur: 0.8, targetId: 'alice', params: { text: 'Dialogue A' } },
      { type: 'narrate', at: 1.0, dur: 1.2, params: { text: 'Narration B', audioUrl: 'assets/audio/narration.wav' } },
    ];

    const state = computeRenderState(mixed, 1.05);

    expect(state.dialogue).toBeNull();
    expect(state.narration).not.toBeNull();
    expect(state.narration!.text).toBe('Narration B');
    expect(state.narration!.progress).toBeGreaterThan(0);
  });

  it('keeps the latest completed speech when say/narrate are mixed', () => {
    const mixed: TimelineEvent[] = [
      { type: 'narrate', at: 0, dur: 0.8, params: { text: 'Narration A' } },
      { type: 'say', at: 1.0, dur: 0.8, targetId: 'alice', params: { text: 'Dialogue B' } },
      { type: 'narrate', at: 2.0, dur: 0.8, params: { text: 'Narration C' } },
    ];
    const state = computeRenderState(mixed, 4.0);
    expect(state.dialogue).toBeNull();
    expect(state.narration).not.toBeNull();
    expect(state.narration!.text).toBe('Narration C');
  });
});

describe('computeRenderState - rotate and zoom', () => {
  const events: TimelineEvent[] = [
    { type: 'show', at: 0, dur: 0, targetId: 'alice', params: { x: 0, y: 0 } },
    { type: 'rotate', at: 0, dur: 1, targetId: 'alice', params: { angle: 90 } },
    { type: 'zoom', at: 1, dur: 1, targetId: 'alice', params: { scale: 1.5 } },
  ];

  it('interpolates actor rotation while the rotate event is active', () => {
    const state = computeRenderState(events, 0.5);
    expect(state.actors[0].rotation).toBeGreaterThan(0);
    expect(state.actors[0].rotation).toBeLessThan(90);
  });

  it('applies the final rotation and zoom values after completion', () => {
    const state = computeRenderState(events, 2);
    expect(state.actors[0].rotation).toBe(90);
    expect(state.actors[0].scale).toBe(1.5);
  });

  it('interpolates actor scale while the zoom event is active', () => {
    const state = computeRenderState(events, 1.5);
    expect(state.actors[0].scale).toBeGreaterThan(1);
    expect(state.actors[0].scale).toBeLessThan(1.5);
  });
});

describe('computeRenderState - wait', () => {
  const events: TimelineEvent[] = [
    { type: 'show', at: 0, dur: 0, targetId: 'a', params: { x: 50, y: 50 } },
    { type: 'wait', at: 0, dur: 2, params: { seconds: 2 } },
  ];

  it('wait has no visual effect', () => {
    const state = computeRenderState(events, 1.0);
    expect(state.actors).toHaveLength(1);
    expect(state.actors[0].x).toBe(50);
    expect(state.actors[0].y).toBe(50);
  });
});

describe('computeRenderState - multiple actors', () => {
  const events: TimelineEvent[] = [
    { type: 'show', at: 0, dur: 0.5, targetId: 'alice', params: { x: 100, y: 500 } },
    { type: 'show', at: 0.5, dur: 0.5, targetId: 'bob', params: { x: 300, y: 500 } },
  ];

  it('maintains independent actor states', () => {
    const state = computeRenderState(events, 1.0);
    expect(state.actors).toHaveLength(2);
    const alice = state.actors.find((a) => a.id === 'alice')!;
    const bob = state.actors.find((a) => a.id === 'bob')!;
    expect(alice.x).toBe(100);
    expect(bob.x).toBe(300);
  });
});

describe('computeRenderState - seek consistency', () => {
  const events: TimelineEvent[] = [
    { type: 'show', at: 0, dur: 0.5, targetId: 'a', params: { x: 0, y: 0 } },
    { type: 'move', at: 0.5, dur: 1, targetId: 'a', params: { toX: 100, toY: 200 } },
    { type: 'say', at: 1.5, dur: 2, targetId: 'a', params: { text: 'Hi' } },
    { type: 'hide', at: 3.5, dur: 0.5, targetId: 'a', params: {} },
  ];

  it('same time produces identical state', () => {
    const t = 1.2;
    const state1 = computeRenderState(events, t);
    const state2 = computeRenderState(events, t);
    expect(state1).toEqual(state2);
  });

  it('multiple different times then re-check still consistent', () => {
    computeRenderState(events, 0);
    computeRenderState(events, 2.0);
    computeRenderState(events, 3.5);
    const stateA = computeRenderState(events, 1.0);
    const stateB = computeRenderState(events, 1.0);
    expect(stateA).toEqual(stateB);
  });
});

describe('computeRenderState - time clamping', () => {
  const events: TimelineEvent[] = [
    { type: 'show', at: 0, dur: 1, targetId: 'a', params: { x: 0, y: 0 } },
  ];

  it('clamps negative time to 0', () => {
    const state = computeRenderState(events, -5);
    expect(state.time).toBe(0);
  });

  it('clamps time beyond duration to duration', () => {
    const state = computeRenderState(events, 100);
    expect(state.time).toBe(1);
  });
});

describe('computeRenderState - audio', () => {
  it('returns empty audio state for no events', () => {
    const state = computeRenderState([], 0);
    expect(state.audio).toEqual({ bgm: null, sfxTriggers: [] });
  });

  it('returns empty audio state for non-audio events', () => {
    const events: TimelineEvent[] = [
      { type: 'show', at: 0, dur: 1, targetId: 'a', params: { x: 0, y: 0 } },
    ];
    const state = computeRenderState(events, 0.5);
    expect(state.audio.bgm).toBeNull();
    expect(state.audio.sfxTriggers).toHaveLength(0);
  });
});

describe('computeRenderState - bgm', () => {
  it('sets bgm state when bgm event is reached', () => {
    const events: TimelineEvent[] = [
      { type: 'bgm', at: 0, dur: 0, params: { asset: 'theme.mp3', volume: 0.8, fade: 1 } },
      { type: 'wait', at: 0, dur: 5, params: { seconds: 5 } },
    ];
    const state = computeRenderState(events, 1);
    expect(state.audio.bgm).not.toBeNull();
    expect(state.audio.bgm!.asset).toBe('theme.mp3');
    expect(state.audio.bgm!.status).toBe('playing');
    expect(state.audio.bgm!.volume).toBe(0.8);
    expect(state.audio.bgm!.fade).toBe(1);
    expect(state.audio.bgm!.loop).toBe(true);
    expect(state.audio.bgm!.duck).toBe(0.45);
    expect(state.audio.bgm!.startedAt).toBe(0);
  });

  it('uses default volume and fade when not specified', () => {
    const events: TimelineEvent[] = [
      { type: 'bgm', at: 0, dur: 0, params: { asset: 'theme.mp3' } },
      { type: 'wait', at: 0, dur: 2, params: { seconds: 2 } },
    ];
    const state = computeRenderState(events, 1);
    expect(state.audio.bgm!.volume).toBe(0.4);
    expect(state.audio.bgm!.fade).toBe(0.3);
    expect(state.audio.bgm!.loop).toBe(true);
    expect(state.audio.bgm!.duck).toBe(0.45);
  });

  it('replaces bgm when a new bgm event is encountered', () => {
    const events: TimelineEvent[] = [
      { type: 'bgm', at: 0, dur: 0, params: { asset: 'theme1.mp3' } },
      { type: 'bgm', at: 2, dur: 0, params: { asset: 'theme2.mp3' } },
      { type: 'wait', at: 0, dur: 5, params: { seconds: 5 } },
    ];
    const state = computeRenderState(events, 3);
    expect(state.audio.bgm!.asset).toBe('theme2.mp3');
    expect(state.audio.bgm!.startedAt).toBe(2);
  });

  it('stops bgm when stop event is encountered', () => {
    const events: TimelineEvent[] = [
      { type: 'bgm', at: 0, dur: 0, params: { action: 'play', asset: 'theme.mp3' } },
      { type: 'bgm', at: 2, dur: 0, params: { action: 'stop' } },
      { type: 'wait', at: 0, dur: 5, params: { seconds: 5 } },
    ];
    const state = computeRenderState(events, 3);
    expect(state.audio.bgm).toBeNull();
  });

  it('ignores invalid empty-asset play and keeps previous bgm state', () => {
    const events: TimelineEvent[] = [
      { type: 'bgm', at: 0, dur: 0, params: { asset: 'theme.mp3' } },
      { type: 'bgm', at: 2, dur: 0, params: { asset: '' } },
      { type: 'wait', at: 0, dur: 5, params: { seconds: 5 } },
    ];
    const state = computeRenderState(events, 3);
    expect(state.audio.bgm?.asset).toBe('theme.mp3');
  });

  it('bgm is null before bgm event time', () => {
    const events: TimelineEvent[] = [
      { type: 'bgm', at: 2, dur: 0, params: { asset: 'theme.mp3' } },
      { type: 'wait', at: 0, dur: 5, params: { seconds: 5 } },
    ];
    const state = computeRenderState(events, 1);
    expect(state.audio.bgm).toBeNull();
  });

  it('supports pause and resume actions', () => {
    const events: TimelineEvent[] = [
      { type: 'bgm', at: 0, dur: 0, params: { action: 'play', asset: 'theme.mp3', fade: 0.5 } },
      { type: 'bgm', at: 2, dur: 0, params: { action: 'pause', fade: 0.2 } },
      { type: 'bgm', at: 3, dur: 0, params: { action: 'resume' } },
      { type: 'wait', at: 0, dur: 5, params: { seconds: 5 } },
    ];
    const pausedState = computeRenderState(events, 2.5);
    expect(pausedState.audio.bgm?.status).toBe('paused');
    const resumedState = computeRenderState(events, 3.5);
    expect(resumedState.audio.bgm?.status).toBe('playing');
  });

  it('applies ducking during active dialogue', () => {
    const events: TimelineEvent[] = [
      { type: 'bgm', at: 0, dur: 0, params: { action: 'play', asset: 'theme.mp3', duck: 0.5 } },
      { type: 'say', at: 0, dur: 2, targetId: 'a', params: { text: 'hello' } },
    ];
    const speakingState = computeRenderState(events, 1);
    expect(speakingState.audio.bgm?.ducking).toBe(true);
    const doneState = computeRenderState(events, 2.1);
    expect(doneState.audio.bgm?.ducking).toBe(false);
  });
});

describe('computeRenderState - sfx', () => {
  it('collects sfx trigger when sfx event is reached', () => {
    const events: TimelineEvent[] = [
      { type: 'sfx', at: 1, dur: 0, params: { asset: 'click.wav', volume: 0.5 } },
      { type: 'wait', at: 0, dur: 5, params: { seconds: 5 } },
    ];
    const state = computeRenderState(events, 2);
    expect(state.audio.sfxTriggers).toHaveLength(1);
    expect(state.audio.sfxTriggers[0].asset).toBe('click.wav');
    expect(state.audio.sfxTriggers[0].volume).toBe(0.5);
    expect(state.audio.sfxTriggers[0].triggeredAt).toBe(1);
  });

  it('uses default volume when not specified', () => {
    const events: TimelineEvent[] = [
      { type: 'sfx', at: 0, dur: 0, params: { asset: 'click.wav' } },
      { type: 'wait', at: 0, dur: 2, params: { seconds: 2 } },
    ];
    const state = computeRenderState(events, 1);
    expect(state.audio.sfxTriggers[0].volume).toBe(0.8);
  });

  it('collects multiple sfx triggers', () => {
    const events: TimelineEvent[] = [
      { type: 'sfx', at: 0, dur: 0, params: { asset: 'click.wav' } },
      { type: 'sfx', at: 1, dur: 0, params: { asset: 'boom.wav' } },
      { type: 'sfx', at: 2, dur: 0, params: { asset: 'ding.wav' } },
      { type: 'wait', at: 0, dur: 5, params: { seconds: 5 } },
    ];
    const state = computeRenderState(events, 3);
    expect(state.audio.sfxTriggers).toHaveLength(3);
    expect(state.audio.sfxTriggers[0].asset).toBe('click.wav');
    expect(state.audio.sfxTriggers[1].asset).toBe('boom.wav');
    expect(state.audio.sfxTriggers[2].asset).toBe('ding.wav');
  });

  it('does not include sfx triggers from future events', () => {
    const events: TimelineEvent[] = [
      { type: 'sfx', at: 0, dur: 0, params: { asset: 'click.wav' } },
      { type: 'sfx', at: 3, dur: 0, params: { asset: 'boom.wav' } },
      { type: 'wait', at: 0, dur: 5, params: { seconds: 5 } },
    ];
    const state = computeRenderState(events, 1);
    expect(state.audio.sfxTriggers).toHaveLength(1);
    expect(state.audio.sfxTriggers[0].asset).toBe('click.wav');
  });
});

describe('computeRenderState - mixed audio and visual', () => {
  it('audio state coexists with visual state', () => {
    const events: TimelineEvent[] = [
      { type: 'show', at: 0, dur: 0.5, targetId: 'alice', params: { x: 100, y: 500 } },
      { type: 'bgm', at: 0, dur: 0, params: { asset: 'theme.mp3' } },
      { type: 'sfx', at: 0.5, dur: 0, params: { asset: 'appear.wav' } },
      { type: 'say', at: 0.5, dur: 2, targetId: 'alice', params: { text: 'Hello!' } },
    ];
    const state = computeRenderState(events, 1);
    expect(state.actors).toHaveLength(1);
    expect(state.actors[0].visible).toBe(true);
    expect(state.dialogue).not.toBeNull();
    expect(state.audio.bgm).not.toBeNull();
    expect(state.audio.bgm!.asset).toBe('theme.mp3');
    expect(state.audio.sfxTriggers).toHaveLength(1);
  });
});
