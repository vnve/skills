import { describe, expect, it } from 'vitest';
import type { SceneTransitionType } from '@vnve/core';
import {
  buildSceneTransitionPlan,
} from '../scene-transition-compositor';
import type {
  SceneShotSurface,
  SceneTransitionSampledChannels,
} from '../scene-transition-channels';

function createSurface(id: string): SceneShotSurface {
  return {
    sceneId: id,
    backgroundColor: id === 'outgoing' ? '#111111' : '#222222',
    backgroundAssetId: `${id}-bg`,
    cgAssetId: `${id}-cg`,
  };
}

function buildPlan(
  effect: SceneTransitionType,
  progress: number,
  sampled?: SceneTransitionSampledChannels,
) {
  return buildSceneTransitionPlan({
    effect,
    progress,
    outgoing: createSurface('outgoing'),
    incoming: createSurface('incoming'),
    ...(sampled ? { sampled } : {}),
  });
}

describe('scene transition compositor', () => {
  it('fades through black as a stop-through-color transition', () => {
    const early = buildPlan('fade-black', 0.2);
    const middle = buildPlan('fade-black', 0.5);
    const late = buildPlan('fade-black', 0.85);

    expect(early.shot.outgoing.opacity).toBeGreaterThan(0.3);
    expect(early.shot.incoming.opacity).toBeCloseTo(0);
    expect(early.shot.throughColor).toBe('#000000');
    expect(early.shot.throughColorOpacity).toBeGreaterThan(0);

    expect(middle.shot.outgoing.opacity).toBeLessThan(0.1);
    expect(middle.shot.incoming.opacity).toBeLessThan(0.25);
    expect(middle.shot.throughColorOpacity).toBeGreaterThan(0.95);

    expect(late.shot.outgoing.opacity).toBeCloseTo(0);
    expect(late.shot.incoming.opacity).toBeGreaterThan(0.45);
  });

  it('fades in dialogue during the final stage of fade transition', () => {
    const early = buildPlan('fade-black', 0.1);
    const middle = buildPlan('fade-black', 0.5);
    const beforeDialogue = buildPlan('fade-black', 0.68);
    const late = buildPlan('fade-black', 0.9);

    expect(early.dialogue.outgoing.opacity).toBeGreaterThan(0);
    expect(early.dialogue.outgoing.opacity).toBeLessThan(1);
    expect(early.dialogue.incoming.opacity).toBe(0);
    expect(middle.dialogue.outgoing.opacity).toBe(0);
    expect(middle.dialogue.incoming.opacity).toBe(0);
    expect(beforeDialogue.dialogue.outgoing.opacity).toBe(0);
    expect(beforeDialogue.dialogue.incoming.opacity).toBe(0);
    expect(late.dialogue.outgoing.opacity).toBe(0);
    expect(late.dialogue.incoming.opacity).toBeGreaterThan(0.45);
    expect(late.dialogue.incoming.opacity).toBeLessThan(0.75);
  });

  it('uses a direct old-snapshot to new-scene dissolve curve', () => {
    const early = buildPlan('dissolve', 0.15);
    const middle = buildPlan('dissolve', 0.5);
    const late = buildPlan('dissolve', 0.9);

    expect(early.shot.mode).toBe('dual-opacity');
    expect(early.shot.outgoing.opacity).toBeCloseTo(0.85, 6);
    expect(early.shot.incoming.opacity).toBeCloseTo(0.15, 6);

    expect(middle.shot.outgoing.opacity).toBeCloseTo(0.5, 6);
    expect(middle.shot.incoming.opacity).toBeCloseTo(0.5, 6);

    expect(late.shot.outgoing.opacity).toBeCloseTo(0.1, 6);
    expect(late.shot.incoming.opacity).toBeCloseTo(0.9, 6);
  });

  it('uses the compiled dissolve dialogue contract for fallback plans', () => {
    const early = buildPlan('dissolve', 0.15);
    const middle = buildPlan('dissolve', 0.7);
    const late = buildPlan('dissolve', 0.9);

    expect(early.dialogue.incoming.opacity).toBe(0);
    expect(middle.dialogue.incoming.opacity).toBeGreaterThan(0.7);
    expect(middle.dialogue.incoming.opacity).toBeLessThan(0.8);
    expect(late.dialogue.incoming.opacity).toBeGreaterThan(0.95);
  });

  it('uses the compiled dissolve shot contract for fallback plans', () => {
    const early = buildPlan('dissolve', 0.1);
    const entering = buildPlan('dissolve', 0.3);
    const late = buildPlan('dissolve', 0.85);

    expect(early.shot.incoming.opacity).toBeCloseTo(0.1, 6);
    expect(entering.shot.incoming.opacity).toBeCloseTo(0.3, 6);
    expect(late.shot.outgoing.opacity).toBeCloseTo(0.15, 6);
  });

  it('starts dissolve dialogue from the compiled incoming envelope', () => {
    const early = buildPlan('dissolve', 0.4);
    const entering = buildPlan('dissolve', 0.7);

    expect(early.dialogue.incoming.opacity).toBeGreaterThan(0.15);
    expect(early.dialogue.incoming.opacity).toBeLessThan(0.25);
    expect(entering.dialogue.incoming.opacity).toBeGreaterThan(0);
  });

  it('starts fade-black dialogue earlier than the final-frame gate', () => {
    const beforeReveal = buildPlan('fade-black', 0.68);
    const entering = buildPlan('fade-black', 0.8);

    expect(beforeReveal.dialogue.incoming.opacity).toBe(0);
    expect(entering.dialogue.incoming.opacity).toBeGreaterThan(0);
    expect(entering.dialogue.incoming.opacity).toBeLessThan(0.05);
  });

  it('provides a real transition curve for cut with step at midpoint', () => {
    const early = buildPlan('cut', 0.25);
    const mid = buildPlan('cut', 0.5);
    const late = buildPlan('cut', 0.75);

    // Before midpoint: outgoing visible
    expect(early.shot.outgoing.opacity).toBe(1);
    expect(early.shot.incoming.opacity).toBe(0);
    expect(early.dialogue.outgoing.opacity).toBe(1);
    expect(early.dialogue.incoming.opacity).toBe(0);

    // At midpoint: switch to incoming
    expect(mid.shot.outgoing.opacity).toBe(0);
    expect(mid.shot.incoming.opacity).toBe(1);
    expect(mid.dialogue.outgoing.opacity).toBe(0);
    expect(mid.dialogue.incoming.opacity).toBe(1);

    // After midpoint: incoming visible
    expect(late.shot.outgoing.opacity).toBe(0);
    expect(late.shot.incoming.opacity).toBe(1);
  });

  it('fades out outgoing dialogue during early fade-black', () => {
    const start = buildPlan('fade-black', 0);
    const early = buildPlan('fade-black', 0.15);
    const afterFade = buildPlan('fade-black', 0.35);

    // At start, outgoing dialogue fully visible
    expect(start.dialogue.outgoing.opacity).toBe(1);
    // During early phase, fading out
    expect(early.dialogue.outgoing.opacity).toBeGreaterThan(0);
    expect(early.dialogue.outgoing.opacity).toBeLessThan(1);
    // After 0.3, fully hidden
    expect(afterFade.dialogue.outgoing.opacity).toBe(0);
  });

  it('prefers sampled compiled channel values over rebuilding effect curves', () => {
    const plan = buildPlan('fade-black', 0.35, {
      shot: {
        outgoingOpacity: 0.11,
        incomingOpacity: 0.22,
        throughColorOpacity: 0.67,
      },
      dialogue: {
        outgoingOpacity: 0.55,
        incomingOpacity: 0.66,
        throughColorOpacity: 0,
      },
    } as any);

    expect(plan.shot.mode).toBe('through-color');
    expect(plan.shot.outgoing.opacity).toBeCloseTo(0.11, 6);
    expect(plan.shot.incoming.opacity).toBeCloseTo(0.22, 6);
    expect(plan.shot.throughColorOpacity).toBeCloseTo(0.67, 6);
    expect(plan.dialogue.outgoing.opacity).toBeCloseTo(0.55, 6);
    expect(plan.dialogue.incoming.opacity).toBeCloseTo(0.66, 6);
  });
});
