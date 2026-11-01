import { describe, expect, it } from 'vitest';
import {
  DEFAULT_VARIANT_KEY,
  findVariantForReplacement,
  inferVariantKey,
  isDefaultVariantToken,
  variantMatchesIdentity,
} from './variant-identity';

describe('variant identity', () => {
  it('maps localized default display names to the stable default key', () => {
    expect(inferVariantKey('默认')).toBe(DEFAULT_VARIANT_KEY);
    expect(inferVariantKey('預設')).toBe(DEFAULT_VARIANT_KEY);
    expect(inferVariantKey('デフォルト')).toBe(DEFAULT_VARIANT_KEY);
    expect(inferVariantKey('기본')).toBe(DEFAULT_VARIANT_KEY);
    expect(inferVariantKey('Default')).toBe(DEFAULT_VARIANT_KEY);
    expect(inferVariantKey('Generated')).toBe(DEFAULT_VARIANT_KEY);
    expect(isDefaultVariantToken('平静')).toBe(true);
  });

  it('keeps mixed proper-name variants distinct from the default key', () => {
    expect(inferVariantKey('Sherlock 微笑')).toBe('sherlock微笑');
    expect(inferVariantKey('开心')).toBe('happy');
    expect(inferVariantKey('happy', 'happy')).toBe('happy');
    expect(inferVariantKey('雨天')).toBe('rainy');
  });

  it('replaces by id or key instead of colliding on translated display names', () => {
    const group = {
      defaultVariantId: 'v-default',
      variants: [
        { id: 'v-default', key: 'default', name: '默认', url: 'a.png' },
        { id: 'v-happy', key: 'happy', name: '开心', url: 'b.png' },
      ],
    };

    expect(findVariantForReplacement(group, { variantId: 'v-happy' })?.id).toBe('v-happy');
    expect(findVariantForReplacement(group, { variantKey: 'default' })?.id).toBe('v-default');
    expect(findVariantForReplacement(group, { variantName: 'default' })?.id).toBe('v-default');
    expect(findVariantForReplacement(group, { variantName: '默认' })?.id).toBe('v-default');
    expect(findVariantForReplacement(group, { variantName: '开心' })?.id).toBe('v-happy');
    expect(findVariantForReplacement(group, { variantName: 'Generated' })?.id).toBe('v-default');
  });

  it('matches old projects that only have localized names and no key', () => {
    const variant = { id: 'legacy', name: '默认', url: 'legacy.png' };
    expect(variantMatchesIdentity(variant, { variantKey: 'default' })).toBe(true);
    expect(variantMatchesIdentity(variant, { variantName: 'default' })).toBe(true);
    expect(variantMatchesIdentity(variant, { variantName: '預設' })).toBe(true);
  });
});
