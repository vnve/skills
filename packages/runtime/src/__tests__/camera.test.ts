import { describe, it, expect } from 'vitest';
import type { TimelineEvent, CameraFocusEvent, CameraResetEvent } from '@vnve/core';
import { computeRenderState } from '../computeState';

describe('computeRenderState - camera-focus', () => {
  it('camera state defaults to center with scale 1', () => {
    const state = computeRenderState([], 0);
    expect(state.camera).toEqual({ x: 50, y: 50, scale: 1 });
  });

  it('camera-focus with coordinates interpolates to target', () => {
    const events: TimelineEvent[] = [
      {
        type: 'camera-focus',
        at: 0,
        dur: 1,
        params: { x: 30, y: 40, zoom: 2.0 },
      } as CameraFocusEvent,
    ];

    // Mid-animation
    const stateMid = computeRenderState(events, 0.5);
    expect(stateMid.camera.scale).toBeGreaterThan(1);
    expect(stateMid.camera.scale).toBeLessThan(2);
    expect(stateMid.camera.x).toBeLessThan(50);
    expect(stateMid.camera.x).toBeGreaterThan(30);

    // Completed
    const stateEnd = computeRenderState(events, 1.0);
    expect(stateEnd.camera.x).toBe(30);
    expect(stateEnd.camera.y).toBe(40);
    expect(stateEnd.camera.scale).toBe(2.0);
  });

  it('camera-focus persists after completion', () => {
    const events: TimelineEvent[] = [
      {
        type: 'camera-focus',
        at: 0,
        dur: 0.5,
        params: { x: 80, y: 20, zoom: 1.8 },
      } as CameraFocusEvent,
    ];
    const state = computeRenderState(events, 5.0);
    expect(state.camera.x).toBe(80);
    expect(state.camera.y).toBe(20);
    expect(state.camera.scale).toBe(1.8);
  });

  it('camera-focus targeting an actor uses actor position', () => {
    const events: TimelineEvent[] = [
      { type: 'show', at: 0, dur: 0.1, targetId: 'alice', params: { x: 25, y: 75 } },
      {
        type: 'camera-focus',
        at: 0.1,
        dur: 0.5,
        targetId: 'alice',
        params: { zoom: 1.5 },
      } as CameraFocusEvent,
    ];
    const state = computeRenderState(events, 1.0);
    expect(state.camera.x).toBe(25);
    // Focuses on actor's head area: actor.y * 0.2
    expect(state.camera.y).toBe(75 * 0.2);
    expect(state.camera.scale).toBe(1.5);
  });
});

describe('computeRenderState - camera-reset', () => {
  it('camera-reset returns camera to default state', () => {
    const events: TimelineEvent[] = [
      {
        type: 'camera-focus',
        at: 0,
        dur: 0.5,
        params: { x: 30, y: 40, zoom: 2.0 },
      } as CameraFocusEvent,
      {
        type: 'camera-reset',
        at: 0.5,
        dur: 0.5,
        params: {},
      } as CameraResetEvent,
    ];

    // After focus completes but before reset finishes
    const stateFocused = computeRenderState(events, 0.5);
    expect(stateFocused.camera.x).toBe(30);
    expect(stateFocused.camera.y).toBe(40);
    expect(stateFocused.camera.scale).toBe(2.0);

    // After reset completes
    const stateReset = computeRenderState(events, 1.0);
    expect(stateReset.camera.x).toBe(50);
    expect(stateReset.camera.y).toBe(50);
    expect(stateReset.camera.scale).toBe(1);
  });

  it('camera-reset interpolates smoothly', () => {
    const events: TimelineEvent[] = [
      {
        type: 'camera-focus',
        at: 0,
        dur: 0.1,
        params: { x: 0, y: 0, zoom: 3.0 },
      } as CameraFocusEvent,
      {
        type: 'camera-reset',
        at: 0.1,
        dur: 1.0,
        params: {},
      } as CameraResetEvent,
    ];

    const stateMid = computeRenderState(events, 0.6);
    // Should be somewhere between focused (0, 0, 3) and default (50, 50, 1)
    expect(stateMid.camera.x).toBeGreaterThan(0);
    expect(stateMid.camera.x).toBeLessThan(50);
    expect(stateMid.camera.scale).toBeGreaterThan(1);
    expect(stateMid.camera.scale).toBeLessThan(3);
  });
});

describe('computeRenderState - camera + other effects', () => {
  it('camera and screen shake can coexist', () => {
    const events: TimelineEvent[] = [
      {
        type: 'camera-focus',
        at: 0,
        dur: 0.5,
        params: { x: 30, y: 40, zoom: 2.0 },
      } as CameraFocusEvent,
      { type: 'vibrate', at: 0, dur: 0.5, params: { amp: 10 } },
    ];
    const state = computeRenderState(events, 0.25);
    // Both camera and screenShake should be present
    expect(state.camera.scale).toBeGreaterThan(1);
    expect(state.screenShake).not.toBeNull();
  });

  it('camera and actor zoom are independent', () => {
    const events: TimelineEvent[] = [
      { type: 'show', at: 0, dur: 0.1, targetId: 'alice', params: { x: 50, y: 50 } },
      { type: 'zoom', at: 0.1, dur: 0.1, targetId: 'alice', params: { scale: 1.2 } },
      {
        type: 'camera-focus',
        at: 0.2,
        dur: 0.1,
        params: { x: 50, y: 50, zoom: 2.0 },
      } as CameraFocusEvent,
    ];
    const state = computeRenderState(events, 1.0);
    // Actor has its own scale
    expect(state.actors[0].scale).toBe(1.2);
    // Camera has its own scale, independent
    expect(state.camera.scale).toBe(2.0);
  });
});
