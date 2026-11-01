import { describe, it, expect } from 'vitest';
import {
  detectMediaTypeFromExtension,
  isVideoExtension,
  isAnimatedExtension,
  extOf,
  VIDEO_EXTS,
  ANIMATED_EXTS,
  ALL_VISUAL_EXTS,
} from './media-utils';

describe('detectMediaTypeFromExtension', () => {
  it('returns "video" for .mp4', () => {
    expect(detectMediaTypeFromExtension('.mp4')).toBe('video');
  });
  it('returns "video" for .webm', () => {
    expect(detectMediaTypeFromExtension('.webm')).toBe('video');
  });
  it('returns "video" for .mkv', () => {
    expect(detectMediaTypeFromExtension('.mkv')).toBe('video');
  });
  it('returns "animated" for .gif', () => {
    expect(detectMediaTypeFromExtension('.gif')).toBe('animated');
  });
  it('returns "static" for .webp', () => {
    expect(detectMediaTypeFromExtension('.webp')).toBe('static');
  });
  it('returns "static" for .png', () => {
    expect(detectMediaTypeFromExtension('.png')).toBe('static');
  });
  it('returns "static" for .jpg', () => {
    expect(detectMediaTypeFromExtension('.jpg')).toBe('static');
  });
  it('returns "static" for .avif', () => {
    expect(detectMediaTypeFromExtension('.avif')).toBe('static');
  });
  it('returns "static" for unknown extension', () => {
    expect(detectMediaTypeFromExtension('.xyz')).toBe('static');
  });
  it('is case-insensitive', () => {
    expect(detectMediaTypeFromExtension('.MP4')).toBe('video');
    expect(detectMediaTypeFromExtension('.GIF')).toBe('animated');
  });
});

describe('isVideoExtension', () => {
  it('returns true for video extensions', () => {
    expect(isVideoExtension('.mp4')).toBe(true);
    expect(isVideoExtension('.webm')).toBe(true);
    expect(isVideoExtension('.mkv')).toBe(true);
  });
  it('returns false for non-video', () => {
    expect(isVideoExtension('.png')).toBe(false);
    expect(isVideoExtension('.gif')).toBe(false);
  });
});

describe('isAnimatedExtension', () => {
  it('returns true for animated extensions', () => {
    expect(isAnimatedExtension('.gif')).toBe(true);
  });
  it('returns false for non-animated', () => {
    expect(isAnimatedExtension('.png')).toBe(false);
    expect(isAnimatedExtension('.mp4')).toBe(false);
    expect(isAnimatedExtension('.webp')).toBe(false);
  });
});

describe('extOf', () => {
  it('extracts extension from filename', () => {
    expect(extOf('test.png')).toBe('.png');
    expect(extOf('video.mp4')).toBe('.mp4');
  });
  it('handles no extension', () => {
    expect(extOf('noext')).toBe('');
  });
  it('lowercases extension', () => {
    expect(extOf('Test.PNG')).toBe('.png');
  });
});

describe('extension sets', () => {
  it('VIDEO_EXTS contains 3 formats', () => {
    expect(VIDEO_EXTS.size).toBe(3);
  });
  it('ANIMATED_EXTS contains 1 format', () => {
    expect(ANIMATED_EXTS.size).toBe(1);
  });
  it('ALL_VISUAL_EXTS is superset', () => {
    for (const ext of VIDEO_EXTS) expect(ALL_VISUAL_EXTS.has(ext)).toBe(true);
    for (const ext of ANIMATED_EXTS) expect(ALL_VISUAL_EXTS.has(ext)).toBe(true);
  });
});
