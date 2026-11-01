import { describe, it, expect } from 'vitest';
import type { TimelineEvent } from '@vnve/core';
import { computeRenderState } from '../computeState';

describe('computeRenderState - show with entrance effects', () => {
  describe('fade (default)', () => {
    const events: TimelineEvent[] = [
      { type: 'show', at: 0, dur: 0.5, targetId: 'a', params: { x: 50, y: 50 } },
    ];

    it('fades opacity from 0 to 1', () => {
      const mid = computeRenderState(events, 0.25);
      expect(mid.actors[0].opacity).toBeCloseTo(0.5, 1);
      expect(mid.actors[0].x).toBe(50);
      expect(mid.actors[0].y).toBe(50);
    });

    it('reaches full opacity when completed', () => {
      const end = computeRenderState(events, 0.5);
      expect(end.actors[0].opacity).toBe(1);
    });
  });

  describe('fade (explicit with param)', () => {
    const events: TimelineEvent[] = [
      { type: 'show', at: 0, dur: 0.5, targetId: 'a', params: { x: 50, y: 50, with: 'fade' } },
    ];

    it('fades opacity', () => {
      const mid = computeRenderState(events, 0.25);
      expect(mid.actors[0].opacity).toBeCloseTo(0.5, 1);
      expect(mid.actors[0].x).toBe(50);
    });
  });

  describe('slide-left', () => {
    const events: TimelineEvent[] = [
      { type: 'show', at: 0, dur: 1.0, targetId: 'a', params: { x: 50, y: 50, with: 'slide-left' } },
    ];

    it('slides from left of target (x - 20) to target', () => {
      const start = computeRenderState(events, 0.001);
      // At the very beginning, x should be close to 30 (50 - 20)
      expect(start.actors[0].x).toBeLessThan(50);
      expect(start.actors[0].opacity).toBe(1);
    });

    it('reaches target position when completed', () => {
      const end = computeRenderState(events, 1.0);
      expect(end.actors[0].x).toBe(50);
      expect(end.actors[0].y).toBe(50);
      expect(end.actors[0].opacity).toBe(1);
    });
  });

  describe('slide-right', () => {
    const events: TimelineEvent[] = [
      { type: 'show', at: 0, dur: 1.0, targetId: 'a', params: { x: 50, y: 50, with: 'slide-right' } },
    ];

    it('slides from right of target (x + 20) to target', () => {
      const start = computeRenderState(events, 0.001);
      expect(start.actors[0].x).toBeGreaterThan(50);
      expect(start.actors[0].opacity).toBe(1);
    });

    it('reaches target position when completed', () => {
      const end = computeRenderState(events, 1.0);
      expect(end.actors[0].x).toBe(50);
      expect(end.actors[0].y).toBe(50);
    });
  });

  describe('slide-up', () => {
    const events: TimelineEvent[] = [
      { type: 'show', at: 0, dur: 1.0, targetId: 'a', params: { x: 50, y: 50, with: 'slide-up' } },
    ];

    it('slides from below target (y + 15) to target', () => {
      const start = computeRenderState(events, 0.001);
      expect(start.actors[0].y).toBeGreaterThan(50);
      expect(start.actors[0].opacity).toBe(1);
    });

    it('reaches target position when completed', () => {
      const end = computeRenderState(events, 1.0);
      expect(end.actors[0].x).toBe(50);
      expect(end.actors[0].y).toBe(50);
    });
  });

  describe('slide-down', () => {
    const events: TimelineEvent[] = [
      { type: 'show', at: 0, dur: 1.0, targetId: 'a', params: { x: 50, y: 50, with: 'slide-down' } },
    ];

    it('slides from above target (y - 15) to target', () => {
      const start = computeRenderState(events, 0.001);
      expect(start.actors[0].y).toBeLessThan(50);
      expect(start.actors[0].opacity).toBe(1);
    });

    it('reaches target position when completed', () => {
      const end = computeRenderState(events, 1.0);
      expect(end.actors[0].x).toBe(50);
      expect(end.actors[0].y).toBe(50);
    });
  });
});

describe('computeRenderState - hide with exit effects', () => {
  describe('fade (default)', () => {
    const events: TimelineEvent[] = [
      { type: 'show', at: 0, dur: 0, targetId: 'a', params: { x: 50, y: 50 } },
      { type: 'hide', at: 0, dur: 0.5, targetId: 'a', params: {} },
    ];

    it('fades opacity from 1 to 0', () => {
      const mid = computeRenderState(events, 0.25);
      expect(mid.actors[0].opacity).toBeCloseTo(0.5, 1);
    });

    it('is invisible when completed', () => {
      const end = computeRenderState(events, 0.5);
      expect(end.actors[0].visible).toBe(false);
      expect(end.actors[0].opacity).toBe(0);
    });
  });

  describe('slide-left exit', () => {
    const events: TimelineEvent[] = [
      { type: 'show', at: 0, dur: 0, targetId: 'a', params: { x: 50, y: 50 } },
      { type: 'hide', at: 0, dur: 1.0, targetId: 'a', params: { with: 'slide-left' } },
    ];

    it('slides actor to the left during hide', () => {
      const mid = computeRenderState(events, 0.5);
      expect(mid.actors[0].x).toBeLessThan(50);
      expect(mid.actors[0].opacity).toBe(1);
    });

    it('is invisible when completed', () => {
      const end = computeRenderState(events, 1.0);
      expect(end.actors[0].visible).toBe(false);
      expect(end.actors[0].opacity).toBe(0);
    });
  });

  describe('slide-right exit', () => {
    const events: TimelineEvent[] = [
      { type: 'show', at: 0, dur: 0, targetId: 'a', params: { x: 50, y: 50 } },
      { type: 'hide', at: 0, dur: 1.0, targetId: 'a', params: { with: 'slide-right' } },
    ];

    it('slides actor to the right during hide', () => {
      const mid = computeRenderState(events, 0.5);
      expect(mid.actors[0].x).toBeGreaterThan(50);
      expect(mid.actors[0].opacity).toBe(1);
    });
  });

  describe('slide-up exit', () => {
    const events: TimelineEvent[] = [
      { type: 'show', at: 0, dur: 0, targetId: 'a', params: { x: 50, y: 50 } },
      { type: 'hide', at: 0, dur: 1.0, targetId: 'a', params: { with: 'slide-up' } },
    ];

    it('slides actor upward during hide', () => {
      const mid = computeRenderState(events, 0.5);
      expect(mid.actors[0].y).toBeLessThan(50);
      expect(mid.actors[0].opacity).toBe(1);
    });
  });

  describe('slide-down exit', () => {
    const events: TimelineEvent[] = [
      { type: 'show', at: 0, dur: 0, targetId: 'a', params: { x: 50, y: 50 } },
      { type: 'hide', at: 0, dur: 1.0, targetId: 'a', params: { with: 'slide-down' } },
    ];

    it('slides actor downward during hide', () => {
      const mid = computeRenderState(events, 0.5);
      expect(mid.actors[0].y).toBeGreaterThan(50);
      expect(mid.actors[0].opacity).toBe(1);
    });
  });
});
