import type { StyledSegment, TextDisplayMode } from '@vnve/core';

/** Dark ink on a light surface needs crisp edges, rather than a dark halo. */
export function textNeedsShadow(color: string): boolean {
  const hex = color.trim().match(/^#([\da-f]{3}|[\da-f]{6}|[\da-f]{8})$/i);
  const rgb = color.trim().match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i);
  const expanded = hex ? (hex[1]!.length === 3 ? hex[1]!.split('').map((digit) => digit + digit).join('') : hex[1]!) : null;
  const channels = expanded ? [0, 2, 4].map((at) => parseInt(expanded.slice(at, at + 2), 16)) : rgb ? rgb.slice(1, 4).map(Number) : null;
  if (!channels) return true;
  return channels[0]! * 0.2126 + channels[1]! * 0.7152 + channels[2]! * 0.0722 > 128;
}

/**
 * Truncate styled segments to show only the first `charCount` characters.
 * Used for typewriter / progress-based text reveal.
 */
export function truncateSegments(
  segments: StyledSegment[],
  charCount: number,
): StyledSegment[] {
  const result: StyledSegment[] = [];
  let remaining = charCount;

  for (const seg of segments) {
    if (remaining <= 0) break;
    if (seg.text.length <= remaining) {
      result.push(seg);
      remaining -= seg.text.length;
    } else {
      result.push({ ...seg, text: seg.text.slice(0, remaining) });
      remaining = 0;
    }
  }

  return result;
}

/**
 * Slice styled segments by absolute character range [start, end).
 * Preserves segment styling while trimming text content to the requested window.
 */
export function sliceSegmentsByCharRange(
  segments: StyledSegment[],
  start: number,
  end: number,
): StyledSegment[] {
  if (end <= start) {
    return [];
  }

  const result: StyledSegment[] = [];
  let offset = 0;

  for (const segment of segments) {
    const segmentStart = offset;
    const segmentEnd = offset + segment.text.length;
    offset = segmentEnd;

    if (segmentEnd <= start) {
      continue;
    }
    if (segmentStart >= end) {
      break;
    }

    const sliceStart = Math.max(0, start - segmentStart);
    const sliceEnd = Math.min(segment.text.length, end - segmentStart);
    if (sliceEnd <= sliceStart) {
      continue;
    }

    result.push({
      ...segment,
      text: segment.text.slice(sliceStart, sliceEnd),
    });
  }

  return result;
}

export interface TextLineInfo {
  charStart: number;
  charEnd: number;
}

export interface StyledTextLayout {
  lines: TextLineInfo[];
  totalChars: number;
}

export interface StyledTextRenderPlanLine {
  segments: StyledSegment[];
  lastLineOpacity?: number;
  lastCharOpacity?: number;
  lastCharEnd?: number;
}

export interface StyledTextRenderPlan {
  layout: StyledTextLayout;
  lines: StyledTextRenderPlanLine[];
}

interface StyledToken {
  text: string;
  bold?: boolean;
  italic?: boolean;
  color?: string;
  charStart: number;
  charEnd: number;
  isNewline?: boolean;
}

const CJK_CHAR_PATTERN = /[\u2E80-\u9FFF\uF900-\uFAFF\uFE30-\uFE4F\u3000-\u303F\u3040-\u309F\u30A0-\u30FF\uFF00-\uFFEF]/;
const ASCII_WORD_CHAR_PATTERN = /[A-Za-z0-9]/;

function isCjkChar(char: string): boolean {
  return CJK_CHAR_PATTERN.test(char);
}

function isAsciiWordChar(char: string): boolean {
  return ASCII_WORD_CHAR_PATTERN.test(char);
}

function isWordConnector(char: string): boolean {
  return char === '\'' || char === '’' || char === '-' || char === '_' || char === '.';
}

function tokenizeStyledSegments(segments: StyledSegment[]): StyledToken[] {
  const tokens: StyledToken[] = [];
  let charOffset = 0;

  for (const seg of segments) {
    const chunks = seg.text.split(/(\n)/);
    for (const chunk of chunks) {
      if (!chunk) continue;
      if (chunk === '\n') {
        tokens.push({
          text: '\n',
          bold: seg.bold,
          italic: seg.italic,
          color: seg.color,
          charStart: charOffset,
          charEnd: charOffset + 1,
          isNewline: true,
        });
        charOffset += 1;
        continue;
      }

      const parts: string[] = [];
      let index = 0;
      while (index < chunk.length) {
        const char = chunk[index]!;

        if (/^[^\S\n]$/.test(char)) {
          parts.push(char);
          index += 1;
          continue;
        }

        if (isCjkChar(char)) {
          parts.push(char);
          index += 1;
          continue;
        }

        if (isAsciiWordChar(char)) {
          const start = index;
          index += 1;

          while (index < chunk.length) {
            const next = chunk[index]!;
            if (isAsciiWordChar(next)) {
              index += 1;
              continue;
            }

            if (
              isWordConnector(next)
              && index + 1 < chunk.length
              && isAsciiWordChar(chunk[index - 1]!)
              && isAsciiWordChar(chunk[index + 1]!)
            ) {
              index += 1;
              continue;
            }

            break;
          }

          parts.push(chunk.slice(start, index));
          continue;
        }

        parts.push(char);
        index += 1;
      }

      // Keep common Chinese punctuation with its neighbour at soft wraps.
      const breakUnits: string[] = [];
      for (const part of parts) {
        const previous = breakUnits.at(-1);
        if (previous && !/\s$/.test(previous) && (/^[，。！？、：；）》】」』”’]+$/.test(part) || /[（《【「『“‘]$/.test(previous))) {
          breakUnits[breakUnits.length - 1] = previous + part;
        } else breakUnits.push(part);
      }
      for (const part of breakUnits) {
        tokens.push({
          text: part,
          bold: seg.bold,
          italic: seg.italic,
          color: seg.color,
          charStart: charOffset,
          charEnd: charOffset + part.length,
        });
        charOffset += part.length;
      }
    }
  }

  return tokens;
}

/**
 * Compute word-wrapped line layout for styled segments.
 * Returns an array of { charStart, charEnd } per line, where char indices
 * refer to the concatenated plain text of all segments.
 */
export function computeTextLayout(
  ctx: CanvasRenderingContext2D,
  segments: StyledSegment[],
  opts: { width: number; fontSize: number; fontFamily: string; padding?: number },
): TextLineInfo[] {
  const { width, fontSize, fontFamily, padding = 0 } = opts;
  const effectiveWidth = width - padding * 2;
  const tokens = tokenizeStyledSegments(segments);

  function buildFont(token: StyledToken): string {
    const style = token.italic ? 'italic' : 'normal';
    const weight = token.bold ? '700' : '400';
    return `${style} ${weight} ${fontSize}px ${fontFamily}`;
  }

  interface MeasuredToken extends StyledToken {
    width: number;
  }

  const measured: MeasuredToken[] = tokens.map((token) => {
    if (token.isNewline) return { ...token, width: 0 };
    ctx.font = buildFont(token);
    return {
      ...token,
      width: ctx.measureText(token.text).width,
    };
  });

  const lines: TextLineInfo[] = [];
  let currentLineStart: number | null = null;
  let currentLineEnd = 0;
  let currentLineWidth = 0;
  let endedWithNewline = false;
  let lastCharPos = 0;

  for (const token of measured) {
    lastCharPos = token.charEnd;
    if (token.isNewline) {
      if (currentLineStart === null) {
        lines.push({ charStart: token.charStart, charEnd: token.charStart });
      } else {
        lines.push({ charStart: currentLineStart, charEnd: currentLineEnd });
      }
      currentLineStart = null;
      currentLineEnd = token.charEnd;
      currentLineWidth = 0;
      endedWithNewline = true;
      continue;
    }

    endedWithNewline = false;
    const isSpace = /^[^\S\n]$/.test(token.text);
    if (isSpace) {
      if (currentLineWidth + token.width <= effectiveWidth || currentLineStart === null) {
        if (currentLineStart === null) currentLineStart = token.charStart;
        currentLineEnd = token.charEnd;
        currentLineWidth += token.width;
      }
      continue;
    }

    if (currentLineWidth + token.width > effectiveWidth && currentLineStart !== null) {
      lines.push({ charStart: currentLineStart, charEnd: currentLineEnd });
      currentLineStart = token.charStart;
      currentLineEnd = token.charEnd;
      currentLineWidth = token.width;
    } else {
      if (currentLineStart === null) currentLineStart = token.charStart;
      currentLineEnd = token.charEnd;
      currentLineWidth += token.width;
    }
  }

  if (currentLineStart !== null) {
    lines.push({ charStart: currentLineStart, charEnd: currentLineEnd });
  } else if (endedWithNewline) {
    lines.push({ charStart: lastCharPos, charEnd: lastCharPos });
  }

  if (lines.length === 0) {
    lines.push({ charStart: 0, charEnd: 0 });
  }

  return lines;
}

export interface RenderStyledTextOptions {
  x: number;
  y: number;
  width: number;
  fontSize: number;
  fontFamily: string;
  defaultColor: string;
  lineHeight: number;
  align?: 'left' | 'center';
  padding?: number;
  /** When set, the last rendered line is drawn at this opacity (0–1) for fade-in. */
  lastLineOpacity?: number;
  /** When set, the last rendered character (by charEnd index) is drawn at this opacity (0–1). */
  lastCharOpacity?: number;
  /** 1-based charEnd index for last rendered character. Must be set with lastCharOpacity. */
  lastCharEnd?: number;
}

export interface BuildStyledTextRenderPlanOptions {
  width: number;
  fontSize: number;
  fontFamily: string;
  padding?: number;
  displayMode?: TextDisplayMode;
  progress?: number;
  elapsedSeconds?: number;
  revealDurationSeconds?: number;
  lineRevealGapSeconds?: number;
}

const LINE_REVEAL_DURATION_SECONDS = 0.5;

function computeTypewriterRevealWindow(
  totalChars: number,
  progress: number,
): { visibleLength: number; charRevealOpacity: number } {
  const clamped = Math.max(0, Math.min(1, progress));
  if (totalChars <= 0) {
    return { visibleLength: 0, charRevealOpacity: 1 };
  }

  const charSlot = clamped * totalChars;
  const visibleLength = Math.min(totalChars, Math.ceil(charSlot));
  if (visibleLength <= 0) {
    return { visibleLength: 0, charRevealOpacity: 1 };
  }

  const rawFade = Math.max(0, Math.min(1, charSlot - (visibleLength - 1)));
  return {
    visibleLength,
    charRevealOpacity: 1 - (1 - rawFade) * (1 - rawFade),
  };
}

function computeLineRevealWindow(
  lineInfos: Array<{ charEnd: number }>,
  progress: number,
  fallbackCharLength: number,
): { visibleLength: number; lineRevealOpacity: number } {
  const clamped = Math.max(0, Math.min(1, progress));
  if (lineInfos.length === 0) {
    return {
      visibleLength: Math.ceil(fallbackCharLength * clamped),
      lineRevealOpacity: 1,
    };
  }

  const totalLines = lineInfos.length;
  const lineSlot = clamped * totalLines;
  const revealedLines = lineSlot >= totalLines
    ? totalLines
    : Math.floor(lineSlot) + 1;
  const rawFade = lineSlot >= totalLines ? 1 : lineSlot - Math.floor(lineSlot);
  return {
    visibleLength: lineInfos[Math.max(0, revealedLines - 1)]?.charEnd ?? fallbackCharLength,
    lineRevealOpacity: 1 - (1 - rawFade) * (1 - rawFade),
  };
}

function computeTimedLineRevealState(
  lineInfos: TextLineInfo[],
  _totalChars: number,
  elapsedSeconds: number,
  _revealDurationSeconds: number,
  lineGapSeconds: number = 0.15,
): { visibleLineCount: number; lastLineOpacity?: number } {
  if (lineInfos.length === 0) {
    return { visibleLineCount: 0 };
  }

  const sequentialGapSeconds = Math.max(0, lineGapSeconds);
  const lineWindowSeconds = LINE_REVEAL_DURATION_SECONDS + sequentialGapSeconds;
  let visibleLineCount = 0;
  let lastLineOpacity: number | undefined;

  for (let i = 0; i < lineInfos.length; i++) {
    const lineStartSeconds = i * lineWindowSeconds;
    const fadeElapsed = elapsedSeconds - lineStartSeconds;
    if (fadeElapsed < 0) {
      break;
    }

    visibleLineCount += 1;
    if (fadeElapsed < LINE_REVEAL_DURATION_SECONDS) {
      const fadeProgress = Math.max(0, Math.min(1, fadeElapsed / LINE_REVEAL_DURATION_SECONDS));
      lastLineOpacity = 1 - (1 - fadeProgress) * (1 - fadeProgress);
      break;
    }
  }

  return { visibleLineCount, lastLineOpacity };
}

function buildFullLinePlan(
  segments: StyledSegment[],
  layout: StyledTextLayout,
): StyledTextRenderPlanLine[] {
  return layout.lines.map((line) => ({
    segments: sliceSegmentsByCharRange(segments, line.charStart, line.charEnd),
  }));
}

export function buildStyledTextLayout(
  ctx: CanvasRenderingContext2D,
  segments: StyledSegment[],
  opts: { width: number; fontSize: number; fontFamily: string; padding?: number },
): StyledTextLayout {
  return {
    lines: computeTextLayout(ctx, segments, opts),
    totalChars: segments.reduce((sum, seg) => sum + seg.text.length, 0),
  };
}

export function buildStyledTextRenderPlan(
  ctx: CanvasRenderingContext2D,
  segments: StyledSegment[],
  opts: BuildStyledTextRenderPlanOptions,
): StyledTextRenderPlan {
  const layout = buildStyledTextLayout(ctx, segments, opts);
  const displayMode = opts.displayMode ?? 'typewriter';
  const progress = Math.max(0, Math.min(1, opts.progress ?? 1));

  if (displayMode === 'instant' || progress >= 1) {
    return { layout, lines: buildFullLinePlan(segments, layout) };
  }

  if (displayMode === 'line') {
    if (
      typeof opts.elapsedSeconds === 'number'
      && opts.elapsedSeconds >= 0
      && typeof opts.revealDurationSeconds === 'number'
      && opts.revealDurationSeconds >= 0
    ) {
      const timedReveal = computeTimedLineRevealState(
        layout.lines,
        layout.totalChars,
        opts.elapsedSeconds,
        opts.revealDurationSeconds,
        opts.lineRevealGapSeconds,
      );

      return {
        layout,
        lines: layout.lines
          .slice(0, timedReveal.visibleLineCount)
          .map((line, index) => {
            const renderLine: StyledTextRenderPlanLine = {
              segments: sliceSegmentsByCharRange(segments, line.charStart, line.charEnd),
            };
            if (
              timedReveal.lastLineOpacity !== undefined
              && index === timedReveal.visibleLineCount - 1
            ) {
              renderLine.lastLineOpacity = timedReveal.lastLineOpacity;
            }
            return renderLine;
          }),
      };
    }

    const lineReveal = computeLineRevealWindow(layout.lines, progress, layout.totalChars);
    const currentLineIndex = layout.lines.findIndex((line) => line.charEnd >= lineReveal.visibleLength);
    const finalIndex = currentLineIndex >= 0 ? currentLineIndex : layout.lines.length - 1;

    return {
      layout,
      lines: layout.lines
        .slice(0, finalIndex + 1)
        .map((line, index) => {
          const renderLine: StyledTextRenderPlanLine = {
            segments: sliceSegmentsByCharRange(segments, line.charStart, line.charEnd),
          };
          if (index === finalIndex) {
            renderLine.lastLineOpacity = lineReveal.lineRevealOpacity;
          }
          return renderLine;
        }),
    };
  }

  const typewriterReveal = computeTypewriterRevealWindow(layout.totalChars, progress);
  const lines: StyledTextRenderPlanLine[] = [];

  for (const line of layout.lines) {
    if (typewriterReveal.visibleLength <= line.charStart) {
      break;
    }

    const sliceEnd = Math.min(typewriterReveal.visibleLength, line.charEnd);
    if (sliceEnd <= line.charStart) {
      continue;
    }

    const renderLine: StyledTextRenderPlanLine = {
      segments: sliceSegmentsByCharRange(segments, line.charStart, sliceEnd),
    };
    if (sliceEnd === typewriterReveal.visibleLength) {
      renderLine.lastCharOpacity = typewriterReveal.charRevealOpacity;
      renderLine.lastCharEnd = sliceEnd - line.charStart;
    }
    lines.push(renderLine);

    if (sliceEnd === typewriterReveal.visibleLength) {
      break;
    }
  }

  return { layout, lines };
}

/**
 * Word-wrap and draw styled text segments onto a Canvas 2D context.
 *
 * For each word: sets ctx.font based on bold/italic, ctx.fillStyle based on
 * color, and renders with word wrap. Returns the total measured height.
 */
export function renderStyledText(
  ctx: CanvasRenderingContext2D,
  segments: StyledSegment[],
  opts: RenderStyledTextOptions,
): number {
  const {
    x: startX,
    y: startY,
    width,
    fontSize,
    fontFamily,
    defaultColor,
    lineHeight,
    align = 'left',
    padding = 0,
  } = opts;

  const effectiveWidth = width - padding * 2;
  const offsetX = startX + padding;

  const tokens = tokenizeStyledSegments(segments);

  // Build font string for a token
  function buildFont(token: StyledToken): string {
    const style = token.italic ? 'italic' : 'normal';
    const weight = token.bold ? '700' : '400';
    return `${style} ${weight} ${fontSize}px ${fontFamily}`;
  }

  // Measure token widths
  interface MeasuredToken extends StyledToken {
    width: number;
  }

  const measured: MeasuredToken[] = tokens.map(token => {
    if (token.isNewline) return { ...token, width: 0 };
    ctx.font = buildFont(token);
    return { ...token, width: ctx.measureText(token.text).width };
  });

  // Word-wrap into lines
  interface LineToken extends MeasuredToken {}
  type Line = LineToken[];

  const lines: Line[] = [];
  let currentLine: Line = [];
  let currentLineWidth = 0;

  for (const token of measured) {
    if (token.isNewline) {
      lines.push(currentLine);
      currentLine = [];
      currentLineWidth = 0;
      continue;
    }

    const isSpace = /^[^\S\n]$/.test(token.text);

    if (isSpace) {
      // Add space to current line if it fits
      if (currentLineWidth + token.width <= effectiveWidth || currentLine.length === 0) {
        currentLine.push(token);
        currentLineWidth += token.width;
      }
      // Otherwise discard trailing space before wrap
      continue;
    }

    // It's a word
    if (currentLineWidth + token.width > effectiveWidth && currentLine.length > 0) {
      // Wrap: start new line
      lines.push(currentLine);
      currentLine = [token];
      currentLineWidth = token.width;
    } else {
      currentLine.push(token);
      currentLineWidth += token.width;
    }
  }
  if (currentLine.length > 0) {
    lines.push(currentLine);
  }
  if (lines.length === 0) {
    lines.push([]);
  }

  // Draw lines
  let cursorY = startY + fontSize; // baseline of first line
  const applyLastLineOpacity = opts.lastLineOpacity !== undefined && opts.lastLineOpacity < 1;
  ctx.save();
  ctx.shadowColor = textNeedsShadow(defaultColor) ? 'rgba(10, 12, 18, 0.35)' : 'transparent';
  ctx.shadowBlur = textNeedsShadow(defaultColor) ? 1 : 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 1;
  const applyLastCharOpacity = opts.lastCharOpacity !== undefined
    && opts.lastCharOpacity < 1
    && typeof opts.lastCharEnd === 'number'
    && opts.lastCharEnd > 0;
  const fadeCharEnd = opts.lastCharEnd ?? 0;

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx];
    const isLastLine = lineIdx === lines.length - 1;

    if (isLastLine && applyLastLineOpacity) {
      ctx.save();
      ctx.globalAlpha = opts.lastLineOpacity!;
    }

    // Calculate line width for alignment
    const lineW = line.reduce((sum, t) => sum + t.width, 0);
    let cursorX = offsetX;

    if (align === 'center') {
      cursorX = offsetX + (effectiveWidth - lineW) / 2;
    }

    for (const token of line) {
      ctx.font = buildFont(token);
      ctx.fillStyle = token.color || defaultColor;
      if (
        applyLastCharOpacity
        && token.charEnd === fadeCharEnd
        && token.text.length > 0
      ) {
        const prefix = token.text.slice(0, -1);
        const fadedChar = token.text.slice(-1);

        if (prefix.length > 0) {
          ctx.fillText(prefix, cursorX, cursorY);
          cursorX += ctx.measureText(prefix).width;
        }

        const baseAlpha = ctx.globalAlpha;
        ctx.globalAlpha = baseAlpha * (opts.lastCharOpacity ?? 1);
        ctx.fillText(fadedChar, cursorX, cursorY);
        ctx.globalAlpha = baseAlpha;
        cursorX += ctx.measureText(fadedChar).width;
      } else {
        ctx.fillText(token.text, cursorX, cursorY);
        cursorX += token.width;
      }
    }

    if (isLastLine && applyLastLineOpacity) {
      ctx.restore();
    }

    cursorY += lineHeight;
  }

  ctx.restore();
  return cursorY - startY;
}

export function renderStyledTextPlan(
  ctx: CanvasRenderingContext2D,
  plan: StyledTextRenderPlan,
  opts: Omit<RenderStyledTextOptions, 'lastLineOpacity' | 'lastCharOpacity' | 'lastCharEnd'>,
): number {
  const { x, y, lineHeight } = opts;

  if (plan.lines.length === 0) {
    return renderStyledText(ctx, [], opts);
  }

  for (let index = 0; index < plan.lines.length; index += 1) {
    const line = plan.lines[index]!;
    renderStyledText(ctx, line.segments, {
      ...opts,
      x,
      y: y + index * lineHeight,
      lastLineOpacity: line.lastLineOpacity,
      lastCharOpacity: line.lastCharOpacity,
      lastCharEnd: line.lastCharEnd,
    });
  }

  return opts.fontSize + (plan.lines.length * lineHeight);
}
