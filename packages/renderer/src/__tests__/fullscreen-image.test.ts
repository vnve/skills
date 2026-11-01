import { describe, expect, it } from 'vitest';
import { getFullScreenImageCrop } from '../fullscreen-image';

describe('full-screen proportional cover', () => {
  it.each([
    { naturalWidth: 1920, naturalHeight: 1080, width: 100, height: 100 },
    { videoWidth: 1920, videoHeight: 1080, width: 100, height: 100 },
    { displayWidth: 1920, displayHeight: 1080 },
    { width: 1920, height: 1080 },
  ])('uses intrinsic source dimensions for images and decoded media: %j', (image) => {
    expect(getFullScreenImageCrop(image as CanvasImageSource, 1080, 1920)).toEqual({
      x: 656.25, y: 0, width: 607.5, height: 1080,
    });
  });

  it('crops portrait media vertically on a landscape stage', () => {
    expect(getFullScreenImageCrop({ width: 1080, height: 1920 } as CanvasImageSource, 1920, 1080)).toEqual({
      x: 0, y: 656.25, width: 1080, height: 607.5,
    });
  });

  it('clears an old crop when the next source has no valid dimensions', () => {
    expect(getFullScreenImageCrop(null, 1080, 1920)).toEqual({ x: 0, y: 0, width: 0, height: 0 });
    expect(getFullScreenImageCrop({ width: Infinity, height: 100 } as CanvasImageSource, 1080, 1920)).toEqual({ x: 0, y: 0, width: 0, height: 0 });
  });
});
