import type { AssetGroup, AssetVariant } from '../types/project';

export const DEFAULT_VARIANT_KEY = 'default';

const DEFAULT_VARIANT_ALIASES = [
  'default',
  'neutral',
  'everyday',
  '日常',
  'normal',
  'calm',
  'plain',
  'generated',
  '默认',
  '普通',
  '平静',
  '預設',
  '预设',
  'デフォルト',
  '기본',
] as const;

const SEMANTIC_VARIANT_ALIASES: Readonly<Record<string, string>> = {
  happy: 'happy', 开心: 'happy', 高兴: 'happy', 微笑: 'happy', 嬉しい: 'happy', 幸せ: 'happy', 행복: 'happy', 기쁨: 'happy',
  sad: 'sad', 悲伤: 'sad', 悲傷: 'sad', 难过: 'sad', 難過: 'sad', 悲しい: 'sad', 슬픔: 'sad',
  angry: 'angry', 生气: 'angry', 生氣: 'angry', 愤怒: 'angry', 憤怒: 'angry', 怒り: 'angry', 분노: 'angry',
  surprised: 'surprised', 惊讶: 'surprised', 驚訝: 'surprised', 吃惊: 'surprised', 吃驚: 'surprised', 驚き: 'surprised', 놀람: 'surprised',
  thinking: 'thinking', 思考: 'thinking', 沉思: 'thinking', 考え中: 'thinking', 생각중: 'thinking',
  shy: 'shy', 害羞: 'shy', 羞涩: 'shy', 羞澀: 'shy', 恥ずかしい: 'shy', 수줍음: 'shy',
  embarrassed: 'embarrassed', 尴尬: 'embarrassed', 尷尬: 'embarrassed', 困窘: 'embarrassed', 당황: 'embarrassed',
  confused: 'confused', 困惑: 'confused', 疑惑: 'confused', 混乱: 'confused', 혼란: 'confused',
  serious: 'serious', 严肃: 'serious', 嚴肅: 'serious', 认真: 'serious', 認真: 'serious', 真剣: 'serious', 진지: 'serious',
  morning: 'morning', 早晨: 'morning', 清晨: 'morning', 朝: 'morning', 아침: 'morning',
  afternoon: 'afternoon', 下午: 'afternoon', 午后: 'afternoon', 午後: 'afternoon', 오후: 'afternoon',
  sunset: 'sunset', 黄昏: 'sunset', 黃昏: 'sunset', 日落: 'sunset', 夕暮れ: 'sunset', 노을: 'sunset',
  night: 'night', 夜晚: 'night', 夜间: 'night', 夜間: 'night', 夜: 'night', 밤: 'night',
  rainy: 'rainy', 雨天: 'rainy', 下雨: 'rainy', 雨: 'rainy', 비: 'rainy',
  snowy: 'snowy', 雪天: 'snowy', 下雪: 'snowy', 雪: 'snowy', 눈: 'snowy',
  foggy: 'foggy', 雾天: 'foggy', 霧天: 'foggy', 雾: 'foggy', 霧: 'foggy', 안개: 'foggy',
  stormy: 'stormy', 暴风雨: 'stormy', 暴風雨: 'stormy', 风暴: 'stormy', 嵐: 'stormy', 폭풍: 'stormy',
};

export function normalizeVariantToken(value: string): string {
  return value
    .normalize('NFKC')
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, '');
}

export function isDefaultVariantToken(value: string | undefined): boolean {
  if (!value) return false;
  return (DEFAULT_VARIANT_ALIASES as readonly string[]).includes(normalizeVariantToken(value));
}

function canonicalVariantKey(value: string): string {
  const normalized = normalizeVariantToken(value);
  if (isDefaultVariantToken(normalized)) return DEFAULT_VARIANT_KEY;
  return SEMANTIC_VARIANT_ALIASES[normalized] ?? normalized ?? DEFAULT_VARIANT_KEY;
}

export function inferVariantKey(name: string, explicitKey?: string): string {
  const trimmedKey = explicitKey?.trim();
  if (trimmedKey) {
    return canonicalVariantKey(trimmedKey);
  }
  return canonicalVariantKey(name);
}

export function resolveVariantKey(variant: Pick<AssetVariant, 'key' | 'name'>): string {
  return inferVariantKey(variant.name, variant.key);
}

export function variantMatchesIdentity(
  variant: Pick<AssetVariant, 'id' | 'key' | 'name'>,
  identity: { variantId?: string; variantKey?: string; variantName?: string },
): boolean {
  if (identity.variantId && variant.id === identity.variantId) return true;

  const variantKey = resolveVariantKey(variant);
  if (identity.variantKey) {
    const requestedKey = inferVariantKey(identity.variantKey, identity.variantKey);
    if (variantKey === requestedKey) return true;
  }

  if (identity.variantName) {
    const requestedKey = inferVariantKey(identity.variantName);
    if (variantKey === requestedKey) return true;
    if (normalizeVariantToken(variant.name) === normalizeVariantToken(identity.variantName)) return true;
  }

  return false;
}

export function findVariantForReplacement(
  group: Pick<AssetGroup, 'variants' | 'defaultVariantId'>,
  identity: { variantId?: string; variantKey?: string; variantName?: string },
): AssetVariant | undefined {
  const exact = group.variants.find((variant) => variantMatchesIdentity(variant, identity));
  if (exact) return exact;

  const requestedIsDefault = isDefaultVariantToken(identity.variantKey)
    || isDefaultVariantToken(identity.variantName);
  if (!requestedIsDefault) return undefined;

  return group.variants.find((variant) => variant.id === group.defaultVariantId)
    ?? group.variants.find((variant) => resolveVariantKey(variant) === DEFAULT_VARIANT_KEY);
}
