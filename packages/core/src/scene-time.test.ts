import { describe, expect, it } from 'vitest';
import { computeTransitionOverlay, findSceneAtTime } from './scene-time';

describe('scene-time', () => {
  it('findSceneAtTime returns matching scene and keeps previous scene active in gaps', () => {
    const ranges = [
      { sceneId: 'scene-1', startTime: 0, endTime: 2 },
      { sceneId: 'scene-2', startTime: 3, endTime: 5 },
    ];

    expect(findSceneAtTime(ranges, 1)).toBe('scene-1');
    expect(findSceneAtTime(ranges, 2.5)).toBe('scene-1');
    expect(findSceneAtTime(ranges, 4)).toBe('scene-2');
  });

  it('findSceneAtTime handles empty ranges and out-of-bound timestamps', () => {
    const ranges = [
      { sceneId: 'scene-1', startTime: 1, endTime: 2 },
      { sceneId: 'scene-2', startTime: 2, endTime: 3 },
    ];

    expect(findSceneAtTime([], 1)).toBeNull();
    expect(findSceneAtTime(ranges, 0)).toBe('scene-1');
    expect(findSceneAtTime(ranges, 4)).toBe('scene-2');
  });

  it('findSceneAtTime stays on the visual clock when contentStartTime exists', () => {
    const ranges = [
      { sceneId: 'scene-1', startTime: 0, contentStartTime: 0, endTime: 2 },
      { sceneId: 'scene-2', startTime: 2.4, contentStartTime: 2.8, endTime: 5 },
    ];

    expect(findSceneAtTime(ranges, 2.1)).toBe('scene-1');
    expect(findSceneAtTime(ranges, 2.5)).toBe('scene-2');
  });

  it('computeTransitionOverlay resolves progress only inside the transition window', () => {
    const ranges = [
      { sceneId: 'scene-1', startTime: 0, endTime: 2 },
      { sceneId: 'scene-2', startTime: 3, endTime: 5, transitionIn: { type: 'fade-black', duration: 0.8 } },
      { sceneId: 'scene-3', startTime: 6, endTime: 8, transitionIn: { type: 'fade-white', duration: 0 } },
    ];

    expect(computeTransitionOverlay(ranges, 2)).toBeNull();
    expect(computeTransitionOverlay(ranges, 2.6)).toEqual({ effect: 'fade-black', progress: 0 });
    expect(computeTransitionOverlay(ranges, 3)).toEqual(
      expect.objectContaining({ effect: 'fade-black' }),
    );
    expect(computeTransitionOverlay(ranges, 3)?.progress).toBeCloseTo(0.5, 5);
    expect(computeTransitionOverlay(ranges, 3.5)).toBeNull();
    expect(computeTransitionOverlay(ranges, 6)).toBeNull();
  });

  it('starts dissolve at scene start instead of the symmetric lead-in window', () => {
    const ranges = [
      { sceneId: 'scene-1', startTime: 0, endTime: 2 },
      { sceneId: 'scene-2', startTime: 3, endTime: 5, transitionIn: { type: 'dissolve', duration: 0.8 } },
    ];

    expect(computeTransitionOverlay(ranges, 2.6)).toBeNull();
    expect(computeTransitionOverlay(ranges, 3)).toEqual({ effect: 'dissolve', progress: 0 });
    expect(computeTransitionOverlay(ranges, 3.4)).toEqual(
      expect.objectContaining({ effect: 'dissolve' }),
    );
    expect(computeTransitionOverlay(ranges, 3.4)?.progress).toBeCloseTo(0.5, 5);
    expect(computeTransitionOverlay(ranges, 3.8)).toBeNull();
  });
});
