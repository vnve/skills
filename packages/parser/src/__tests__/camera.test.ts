import { describe, it, expect } from 'vitest';
import type { ScriptDoc, CameraFocusEvent, CameraResetEvent } from '@vnve/core';
import { parse } from '../index';

describe('parse - camera command', () => {
  describe('camera focus with actor', () => {
    it('generates a camera-focus event targeting an actor', () => {
      const doc: ScriptDoc = {
        nodes: [
          { type: 'text', text: '', content: [{ type: 'tag', name: 'camera', params: { action: 'focus', actor: 'alice', zoom: 2.0 } }] },
        ],
      };
      const result = parse(doc);
      expect(result.diagnostics).toHaveLength(0);
      expect(result.events).toHaveLength(1);
      const evt = result.events[0] as CameraFocusEvent;
      expect(evt.type).toBe('camera-focus');
      expect(evt.targetId).toBe('alice');
      expect(evt.params.zoom).toBe(2.0);
      expect(evt.dur).toBeCloseTo(0.6); // default duration
    });

    it('uses default zoom=1.5 when zoom is not specified', () => {
      const doc: ScriptDoc = {
        nodes: [
          { type: 'text', text: '', content: [{ type: 'tag', name: 'camera', params: { action: 'focus', actor: 'bob' } }] },
        ],
      };
      const result = parse(doc);
      expect(result.diagnostics).toHaveLength(0);
      const evt = result.events[0] as CameraFocusEvent;
      expect(evt.params.zoom).toBe(1.5);
    });

    it('clamps zoom to [1.0, 3.0]', () => {
      const doc: ScriptDoc = {
        nodes: [
          { type: 'text', text: '', content: [{ type: 'tag', name: 'camera', params: { action: 'focus', actor: 'alice', zoom: 5.0 } }] },
        ],
      };
      const result = parse(doc);
      const evt = result.events[0] as CameraFocusEvent;
      expect(evt.params.zoom).toBe(3.0);
    });

    it('clamps zoom to minimum 1.0', () => {
      const doc: ScriptDoc = {
        nodes: [
          { type: 'text', text: '', content: [{ type: 'tag', name: 'camera', params: { action: 'focus', actor: 'alice', zoom: 0.5 } }] },
        ],
      };
      const result = parse(doc);
      const evt = result.events[0] as CameraFocusEvent;
      expect(evt.params.zoom).toBe(1.0);
    });
  });

  describe('camera focus with coordinates', () => {
    it('generates a camera-focus event with x/y coordinates', () => {
      const doc: ScriptDoc = {
        nodes: [
          { type: 'text', text: '', content: [{ type: 'tag', name: 'camera', params: { action: 'focus', x: 30, y: 50, zoom: 1.8 } }] },
        ],
      };
      const result = parse(doc);
      expect(result.diagnostics).toHaveLength(0);
      expect(result.events).toHaveLength(1);
      const evt = result.events[0] as CameraFocusEvent;
      expect(evt.type).toBe('camera-focus');
      expect(evt.targetId).toBeUndefined();
      expect(evt.params.x).toBe(30);
      expect(evt.params.y).toBe(50);
      expect(evt.params.zoom).toBe(1.8);
    });
  });

  describe('camera focus with custom dur', () => {
    it('respects user-specified dur', () => {
      const doc: ScriptDoc = {
        nodes: [
          { type: 'text', text: '', content: [{ type: 'tag', name: 'camera', params: { action: 'focus', actor: 'alice', dur: 1.2 } }] },
        ],
      };
      const result = parse(doc);
      const evt = result.events[0] as CameraFocusEvent;
      expect(evt.dur).toBeCloseTo(1.2);
    });
  });

  describe('camera focus with ease', () => {
    it('passes ease parameter through', () => {
      const doc: ScriptDoc = {
        nodes: [
          { type: 'text', text: '', content: [{ type: 'tag', name: 'camera', params: { action: 'focus', actor: 'alice', ease: 'linear' } }] },
        ],
      };
      const result = parse(doc);
      const evt = result.events[0] as CameraFocusEvent;
      expect(evt.params.ease).toBe('linear');
    });
  });

  describe('camera reset', () => {
    it('generates a camera-reset event', () => {
      const doc: ScriptDoc = {
        nodes: [
          { type: 'text', text: '', content: [{ type: 'tag', name: 'camera', params: { action: 'reset' } }] },
        ],
      };
      const result = parse(doc);
      expect(result.diagnostics).toHaveLength(0);
      expect(result.events).toHaveLength(1);
      const evt = result.events[0] as CameraResetEvent;
      expect(evt.type).toBe('camera-reset');
      expect(evt.dur).toBeCloseTo(0.6);
    });

    it('respects user-specified dur for reset', () => {
      const doc: ScriptDoc = {
        nodes: [
          { type: 'text', text: '', content: [{ type: 'tag', name: 'camera', params: { action: 'reset', dur: 0.3 } }] },
        ],
      };
      const result = parse(doc);
      const evt = result.events[0] as CameraResetEvent;
      expect(evt.dur).toBeCloseTo(0.3);
    });
  });

  describe('validation errors', () => {
    it('reports error when action is missing', () => {
      const doc: ScriptDoc = {
        nodes: [
          { type: 'text', text: '', content: [{ type: 'tag', name: 'camera', params: {} }] },
        ],
      };
      const result = parse(doc);
      expect(result.diagnostics.length).toBeGreaterThan(0);
      expect(result.diagnostics.some(d => d.code === 'MISSING_PARAM')).toBe(true);
    });

    it('reports error when action is invalid', () => {
      const doc: ScriptDoc = {
        nodes: [
          { type: 'text', text: '', content: [{ type: 'tag', name: 'camera', params: { action: 'spin' } }] },
        ],
      };
      const result = parse(doc);
      expect(result.diagnostics.length).toBeGreaterThan(0);
      expect(result.diagnostics.some(d => d.code === 'CAMERA_INVALID_ACTION')).toBe(true);
    });

    it('reports error when focus has neither actor nor coordinates', () => {
      const doc: ScriptDoc = {
        nodes: [
          { type: 'text', text: '', content: [{ type: 'tag', name: 'camera', params: { action: 'focus' } }] },
        ],
      };
      const result = parse(doc);
      expect(result.diagnostics.length).toBeGreaterThan(0);
      expect(result.diagnostics.some(d => d.code === 'CAMERA_NO_TARGET')).toBe(true);
    });
  });

  describe('time advancement', () => {
    it('camera focus advances time by dur', () => {
      const doc: ScriptDoc = {
        nodes: [
          { type: 'text', text: '', content: [{ type: 'tag', name: 'camera', params: { action: 'focus', actor: 'a', dur: 0.8 } }] },
          { type: 'text', text: '', content: [{ type: 'tag', name: 'camera', params: { action: 'reset', dur: 0.5 } }] },
        ],
      };
      const result = parse(doc);
      expect(result.events[0].at).toBe(0);
      expect(result.events[1].at).toBeCloseTo(0.8);
    });
  });
});
