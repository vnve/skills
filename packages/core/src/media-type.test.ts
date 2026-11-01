import { describe, it, expect } from 'vitest';
import type { AssetVariant, MediaType } from './types/project';

describe('AssetVariant media fields', () => {
  it('accepts mediaType, loop, thumbnailUrl, duration fields', () => {
    const variant: AssetVariant = {
      id: 'v1',
      name: 'test',
      url: '/test.mp4',
      width: 1920,
      height: 1080,
      mediaType: 'video',
      loop: true,
      thumbnailUrl: 'assets/thumbnails/v1.jpg',
      duration: 30.5,
    };
    expect(variant.mediaType).toBe('video');
    expect(variant.loop).toBe(true);
    expect(variant.thumbnailUrl).toBe('assets/thumbnails/v1.jpg');
    expect(variant.duration).toBe(30.5);
  });

  it('allows undefined mediaType (backward compat = static)', () => {
    const variant: AssetVariant = {
      id: 'v2',
      name: 'static',
      url: '/test.png',
    };
    expect(variant.mediaType).toBeUndefined();
  });

  it('accepts all MediaType values', () => {
    const types: MediaType[] = ['static', 'animated', 'video'];
    expect(types).toHaveLength(3);
  });
});
