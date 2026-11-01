import { describe, expect, it, vi } from 'vitest';
import {
  clampBoxImageOpacity,
  layoutDialogueBoxImage,
  normalizeBoxImageSlice,
  drawDialogueBoxImage,
} from '../dialogue-box-image';

function fakeImage(width: number, height: number): CanvasImageSource {
  return { width, height, naturalWidth: width, naturalHeight: height } as unknown as CanvasImageSource;
}

describe('dialogue box image layout', () => {
  it('treats empty slice as stretch', () => {
    expect(normalizeBoxImageSlice({ top: 0, right: 0, bottom: 0, left: 0 })).toBeNull();
    const patches = layoutDialogueBoxImage(fakeImage(400, 120), {
      x: 0,
      y: 0,
      width: 800,
      height: 200,
    });
    expect(patches).toEqual([
      { sx: 0, sy: 0, sw: 400, sh: 120, dx: 0, dy: 0, dw: 800, dh: 200 },
    ]);
  });

  it('contains the image inside the box and letterboxes leftover space', () => {
    const patches = layoutDialogueBoxImage(
      fakeImage(400, 100),
      { x: 0, y: 0, width: 800, height: 400 },
      { fit: 'contain' },
    );
    expect(patches).toHaveLength(1);
    expect(patches[0]?.dw).toBeCloseTo(800);
    expect(patches[0]?.dh).toBeCloseTo(200);
    expect(patches[0]?.dy).toBeCloseTo(100);
  });

  it('covers the box by cropping overflow', () => {
    const patches = layoutDialogueBoxImage(
      fakeImage(400, 100),
      { x: 10, y: 20, width: 200, height: 200 },
      { fit: 'cover' },
    );
    expect(patches).toHaveLength(1);
    expect(patches[0]?.dw).toBe(200);
    expect(patches[0]?.dh).toBe(200);
    expect(patches[0]?.dx).toBe(10);
    expect(patches[0]?.dy).toBe(20);
    expect(patches[0]?.sw).toBeCloseTo(100);
    expect(patches[0]?.sh).toBeCloseTo(100);
  });

  it('splits a 9-slice frame into nine patches that keep corners unstretched', () => {
    const patches = layoutDialogueBoxImage(
      fakeImage(100, 80),
      { x: 0, y: 0, width: 300, height: 160 },
      { slice: { top: 10, right: 20, bottom: 10, left: 20 } },
    );
    expect(patches).toHaveLength(9);
    const topLeft = patches[0];
    const bottomRight = patches[8];
    expect(topLeft).toMatchObject({ sx: 0, sy: 0, sw: 20, sh: 10, dx: 0, dy: 0, dw: 20, dh: 10 });
    expect(bottomRight).toMatchObject({
      sx: 80,
      sy: 70,
      sw: 20,
      sh: 10,
      dx: 280,
      dy: 150,
      dw: 20,
      dh: 10,
    });
  });

  it('draws every layout patch through the canvas drawImage API', () => {
    const drawImage = vi.fn();
    drawDialogueBoxImage(
      { drawImage },
      fakeImage(40, 20),
      { x: 0, y: 0, width: 80, height: 40 },
      { fit: 'stretch' },
    );
    expect(drawImage).toHaveBeenCalledTimes(1);
    expect(drawImage).toHaveBeenCalledWith(
      expect.anything(),
      0, 0, 40, 20,
      0, 0, 80, 40,
    );
  });

  it('clamps opacity into 0–1', () => {
    expect(clampBoxImageOpacity(undefined)).toBe(1);
    expect(clampBoxImageOpacity(-2)).toBe(0);
    expect(clampBoxImageOpacity(1.4)).toBe(1);
    expect(clampBoxImageOpacity(0.3)).toBe(0.3);
  });
});
