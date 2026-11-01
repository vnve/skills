/**
 * Placeholder asset URLs — maps to static AVIF files in public/placeholders/.
 *
 * Character placeholders: 4 male + 4 female silhouettes (640×960)
 * Background placeholders: 4 blurred scene images (1920×1080)
 *
 * Names are overlaid dynamically by the UI layer (CSS), not baked into images.
 */

/** Eight visually distinct colors used for placeholder imagery. */
export const PLACEHOLDER_COLORS: readonly string[] = [
  '#5B8DEF', // blue
  '#E85D75', // rose
  '#4ECDC4', // teal
  '#F5A623', // amber
  '#9B59B6', // purple
  '#2ECC71', // green
  '#E74C3C', // red
  '#3498DB', // sky
] as const;

/** Number of placeholder images per gender. */
const IMAGES_PER_GENDER = 4;

/** Number of background placeholder images. */
const BACKGROUND_COUNT = 4;

/**
 * Get the placeholder character image URL.
 *
 * @param _name   Character name (unused — name overlay is handled by the UI layer)
 * @param colorIndex  Index for image selection (wraps around IMAGES_PER_GENDER)
 * @param gender  Character gender, defaults to 'male'
 * @returns Static URL path to the AVIF placeholder image
 */
export function generatePlaceholderCharacter(
  _name: string,
  colorIndex: number,
  gender: 'male' | 'female' = 'male',
): string {
  const index = (colorIndex % IMAGES_PER_GENDER) + 1;
  return `/placeholders/character-${gender}-${index}.avif`;
}

/**
 * Get the placeholder background image URL.
 *
 * @param _name   Background name (unused — name overlay is handled by the UI layer)
 * @param colorIndex  Index for image selection (wraps around BACKGROUND_COUNT)
 * @returns Static URL path to the AVIF placeholder image
 */
export function generatePlaceholderBackground(
  _name: string,
  colorIndex: number,
): string {
  const index = (colorIndex % BACKGROUND_COUNT) + 1;
  return `/placeholders/background-${index}.avif`;
}

/**
 * Detect whether a URL is a placeholder asset.
 * Matches both new static placeholders and legacy Canvas data URIs.
 */
export function isPlaceholderUrl(url: string): boolean {
  return url.startsWith('/placeholders/') || url.startsWith('data:image/png;base64,');
}
