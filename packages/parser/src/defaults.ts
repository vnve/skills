/** Default reading pace multiplier (1.0 = normal visual-novel pacing). */
export const DEFAULT_READING_PACE = 1;

/** Baseline CJK reading speed tuned for visual-novel dialogue cadence. */
export const CJK_CHARS_PER_SECOND = 10;

/** Baseline English reading speed (word tokens per second). */
export const LATIN_WORDS_PER_SECOND = 3.8;

/** Baseline numeric reading speed (number tokens per second). */
export const NUMERIC_TOKENS_PER_SECOND = 2.8;

/** Fallback speed for symbols from other writing systems (characters per second). */
export const OTHER_CHARS_PER_SECOND = 11;

/** Pause after sentence-ending punctuation marks. */
export const STRONG_PUNCT_PAUSE = 0.22;

/** Pause after short-break punctuation marks. */
export const WEAK_PUNCT_PAUSE = 0.1;

/** Pause added per explicit line break. */
export const LINE_BREAK_PAUSE = 0.28;

/** Minimum duration for say/narrate even for very short text */
export const MIN_TEXT_DURATION = 0.8;

/** Default pause between consecutive dialogue lines */
export const DEFAULT_LINE_GAP = 0.15;

/** Default durations in seconds for each command type */
export const DEFAULT_DURATIONS: Record<string, number> = {
  show: 0.5,
  hide: 0.5,
  move: 0.6,
  shake: 0.4,
  hop: 0.4,
  set: 0,
  wait: 1.0,
  flash: 0.3,
  vibrate: 0.4,
  rotate: 0.3,
  zoom: 0.3,
  camera: 0.6,
  rain: 1.0,
  snow: 1.0,
};

const CJK_CHAR_RE = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;
const LATIN_CHAR_RE = /[A-Za-z]/;
const DIGIT_CHAR_RE = /\d/;
const LATIN_WORD_RE = /[A-Za-z]+(?:'[A-Za-z]+)*/g;
const NUMERIC_TOKEN_RE = /\d+(?:[.,:/-]\d+)*/g;
const STRONG_PUNCT_RE = /[。！？!?；;：:…]/;
const WEAK_PUNCT_RE = /[，、,]/;

interface TimingBreakdown {
  revealSeconds: number;
  pauseSeconds: number;
}

function normalizeReadingPace(readingPace?: number): number {
  if (typeof readingPace !== 'number' || !Number.isFinite(readingPace) || readingPace <= 0) {
    return DEFAULT_READING_PACE;
  }
  return readingPace;
}

function countMatches(text: string, re: RegExp): number {
  const matches = text.match(re);
  return matches ? matches.length : 0;
}

function analyzeTextTiming(text: string): TimingBreakdown {
  let cjkChars = 0;
  let latinChars = 0;
  let digitChars = 0;
  let otherVisibleChars = 0;
  let strongPunct = 0;
  let weakPunct = 0;
  let lineBreaks = 0;

  for (const ch of text) {
    if (ch === '\n') {
      lineBreaks += 1;
      continue;
    }
    if (/\s/.test(ch)) continue;

    if (STRONG_PUNCT_RE.test(ch)) {
      strongPunct += 1;
      continue;
    }
    if (WEAK_PUNCT_RE.test(ch)) {
      weakPunct += 1;
      continue;
    }
    if (CJK_CHAR_RE.test(ch)) {
      cjkChars += 1;
      continue;
    }
    if (LATIN_CHAR_RE.test(ch)) {
      latinChars += 1;
      continue;
    }
    if (DIGIT_CHAR_RE.test(ch)) {
      digitChars += 1;
      continue;
    }
    otherVisibleChars += 1;
  }

  const latinWordCount = countMatches(text, LATIN_WORD_RE);
  const numericTokenCount = countMatches(text, NUMERIC_TOKEN_RE);
  const latinUnits = latinWordCount > 0 ? latinWordCount : latinChars / 4.7;
  const numericUnits = numericTokenCount > 0 ? numericTokenCount : digitChars / 3;

  const revealSeconds =
    cjkChars / CJK_CHARS_PER_SECOND
    + latinUnits / LATIN_WORDS_PER_SECOND
    + numericUnits / NUMERIC_TOKENS_PER_SECOND
    + otherVisibleChars / OTHER_CHARS_PER_SECOND;
  const pauseSeconds =
    strongPunct * STRONG_PUNCT_PAUSE
    + weakPunct * WEAK_PUNCT_PAUSE
    + lineBreaks * LINE_BREAK_PAUSE;

  return { revealSeconds, pauseSeconds };
}

/**
 * Estimate reveal duration (typing time) without min clamp.
 */
export function estimateTextRevealDuration(text: string, readingPace?: number): number {
  if (!text || text.length === 0) return 0;
  const pace = normalizeReadingPace(readingPace);
  const { revealSeconds } = analyzeTextTiming(text);
  return revealSeconds / pace;
}

/**
 * Estimate total display duration for visual-novel text.
 */
export function estimateTextDuration(text: string, readingPace?: number): number {
  if (!text || text.length === 0) return MIN_TEXT_DURATION;
  const pace = normalizeReadingPace(readingPace);
  const { revealSeconds, pauseSeconds } = analyzeTextTiming(text);
  return Math.max(MIN_TEXT_DURATION, (revealSeconds + pauseSeconds) / pace);
}
