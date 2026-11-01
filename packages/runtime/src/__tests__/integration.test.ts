import { describe, it, expect } from 'vitest';
import type { ScriptDoc } from '@vnve/core';
import { parse } from '@vnve/parser';
import { computeRenderState } from '../computeState';

describe('integration: parser -> runtime state', () => {
  it('produces correct keyframe states for a show -> say -> move -> hide script', () => {
    const doc: ScriptDoc = {
      nodes: [
        { type: 'text', text: '', content: [{ type: 'tag', name: 'show', params: { actor: 'alice', x: 100, y: 500 } }] },
        { type: 'text', text: '', content: [{ type: 'tag', name: 'say', params: { actor: 'alice', text: 'Hello!' } }] },
        { type: 'text', text: '', content: [{ type: 'tag', name: 'move', params: { actor: 'alice', toX: 400, toY: 500 } }] },
        { type: 'text', text: '', content: [{ type: 'tag', name: 'hide', params: { actor: 'alice' } }] },
      ],
    };

    const { events } = parse(doc);
    expect(events.length).toBe(4);

    // After show completes (t = 0.5s, show default dur = 0.5)
    const stateAfterShow = computeRenderState(events, 0.5);
    expect(stateAfterShow.actors).toHaveLength(1);
    expect(stateAfterShow.actors[0].visible).toBe(true);
    expect(stateAfterShow.actors[0].opacity).toBe(1);
    expect(stateAfterShow.actors[0].x).toBe(100);
    expect(stateAfterShow.actors[0].y).toBe(500);

    // During say event (midpoint)
    const sayEvent = events[1];
    const midSay = sayEvent.at + sayEvent.dur / 2;
    const stateDuringSay = computeRenderState(events, midSay);
    expect(stateDuringSay.dialogue).not.toBeNull();
    expect(stateDuringSay.dialogue!.speaker).toBe('alice');
    expect(stateDuringSay.dialogue!.text).toBe('Hello!');
    expect(stateDuringSay.dialogue!.progress).toBeCloseTo(0.5, 1);

    // After say completes, dialogue persists (VN convention)
    const stateAfterSay = computeRenderState(events, sayEvent.at + sayEvent.dur);
    expect(stateAfterSay.dialogue).not.toBeNull();
    expect(stateAfterSay.dialogue!.speaker).toBe('alice');
    expect(stateAfterSay.dialogue!.text).toBe('Hello!');
    expect(stateAfterSay.dialogue!.progress).toBe(1);

    // During move (midpoint)
    const moveEvent = events[2];
    const midMove = moveEvent.at + moveEvent.dur / 2;
    const stateDuringMove = computeRenderState(events, midMove);
    expect(stateDuringMove.actors[0].x).toBeCloseTo(250, 0);
    expect(stateDuringMove.actors[0].y).toBe(500);

    // After everything completes
    const totalDur = events.reduce((m, e) => Math.max(m, e.at + e.dur), 0);
    const stateEnd = computeRenderState(events, totalDur);
    expect(stateEnd.actors[0].visible).toBe(false);
    expect(stateEnd.actors[0].opacity).toBe(0);
    // Dialogue persists from the completed say event (VN convention)
    expect(stateEnd.dialogue).not.toBeNull();
    expect(stateEnd.dialogue!.progress).toBe(1);
  });

  it('seek consistency: same events + same time = same state', () => {
    const doc: ScriptDoc = {
      nodes: [
        { type: 'text', text: '', content: [{ type: 'tag', name: 'show', params: { actor: 'a', x: 0, y: 0 } }] },
        { type: 'text', text: '', content: [{ type: 'tag', name: 'move', params: { actor: 'a', toX: 100, toY: 200 } }] },
        { type: 'text', text: '', content: [{ type: 'tag', name: 'say', params: { actor: 'a', text: 'Testing consistency' } }] },
      ],
    };
    const { events } = parse(doc);

    // Try multiple random-ish times
    const times = [0, 0.25, 0.5, 0.7, 1.0, 1.5];
    for (const t of times) {
      const s1 = computeRenderState(events, t);
      const s2 = computeRenderState(events, t);
      expect(s1).toEqual(s2);
    }
  });

  it('handles TextNode say/narrate events', () => {
    const doc: ScriptDoc = {
      nodes: [
        { type: 'text', text: 'A narrator speaks.', actorId: undefined },
        { type: 'text', text: 'Hello!', actorId: 'bob' },
      ],
    };
    const { events } = parse(doc);
    expect(events).toHaveLength(2);

    // During first event (narrate)
    const state1 = computeRenderState(events, events[0].dur / 2);
    expect(state1.narration).not.toBeNull();
    expect(state1.narration!.text).toBe('A narrator speaks.');

    // During second event (say)
    const state2 = computeRenderState(events, events[1].at + events[1].dur / 2);
    expect(state2.dialogue).not.toBeNull();
    expect(state2.dialogue!.speaker).toBe('bob');
    expect(state2.dialogue!.text).toBe('Hello!');
  });

  it('handles set and shake events', () => {
    const doc: ScriptDoc = {
      nodes: [
        { type: 'text', text: '', content: [{ type: 'tag', name: 'show', params: { actor: 'a', x: 100, y: 100 } }] },
        { type: 'text', text: '', content: [{ type: 'tag', name: 'set', params: { target: 'a', variant: 'happy' } }] },
        { type: 'text', text: '', content: [{ type: 'tag', name: 'shake', params: { actor: 'a', amp: 10 } }] },
      ],
    };
    const { events } = parse(doc);

    // After show and set complete (set is instant, dur=0)
    const stateAfterSet = computeRenderState(events, 0.5);
    expect(stateAfterSet.actors[0].sprite).toBe('happy');

    // During shake
    const shakeEvent = events[2];
    const midShake = shakeEvent.at + shakeEvent.dur / 2;
    const stateDuringShake = computeRenderState(events, midShake);
    const hasShakeOffset =
      Math.abs(stateDuringShake.actors[0].shakeOffsetX) > 0 ||
      Math.abs(stateDuringShake.actors[0].shakeOffsetY) > 0;
    expect(hasShakeOffset).toBe(true);

    // After shake completes
    const stateAfterShake = computeRenderState(events, shakeEvent.at + shakeEvent.dur);
    expect(stateAfterShake.actors[0].shakeOffsetX).toBe(0);
    expect(stateAfterShake.actors[0].shakeOffsetY).toBe(0);
  });
});
