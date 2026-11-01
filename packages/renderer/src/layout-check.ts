import type { CompiledSequence } from "./sequence-types";
import { resolveDialogueThemeForCanvas } from "./themes";
import { dialogueGeometry } from "./dialogue-geometry";
import { computeTextLayout, sliceSegmentsByCharRange } from "./styled-text";
export interface LayoutIssue {
  code:
    | "TEXT_OVERFLOW"
    | "NAMEPLATE_OVERFLOW"
    | "FONT_UNAVAILABLE"
    | "DIALOGUE_OUT_OF_FRAME";
  level: "warning" | "error";
  message: string;
  sceneId: string;
  at: number;
  nodeId?: string;
}
/** Call only after the project's FontFace loads have completed in this browser. */
export function checkSequenceLayout(
  sequence: CompiledSequence,
  width: number,
  height: number,
  ctx: CanvasRenderingContext2D,
  fonts?: Pick<FontFaceSet, "check">,
): LayoutIssue[] {
  const issues: LayoutIssue[] = [];
  for (const clip of sequence.sceneClips)
    for (const event of clip.events) {
      if (event.type !== "say" && event.type !== "narrate") continue;
      const theme = resolveDialogueThemeForCanvas(
            event.params.theme,
            event.params.themeOverrides,
            sequence.renderContext.customThemes,
          width,
          height,
        ),
        geometry = dialogueGeometry(theme, width, height);
      const issue = (
        code: LayoutIssue["code"],
        message: string,
        level: LayoutIssue["level"] = "error",
      ) =>
        issues.push({
          code,
          message,
          level,
          sceneId: clip.sceneId,
          at: event.at,
        });
      if (
        fonts &&
        !fonts.check(
          `${theme.fontSize}px ${theme.fontFamily}`,
          event.params.text,
        )
      )
        issue("FONT_UNAVAILABLE", "Dialogue font is not loaded", "warning");
      const segments = event.params.segments?.length
        ? event.params.segments
        : [{ text: event.params.text }];
      const lines = computeTextLayout(ctx, segments, {
        width: geometry.body.width,
        fontSize: theme.fontSize,
        fontFamily: theme.fontFamily,
      });
      const requiredHeight =
        theme.fontSize +
        Math.max(0, lines.length - 1) *
          theme.fontSize *
          Math.max(1, theme.lineHeight);
      const maxWidth = Math.max(
        0,
        ...lines.map((line) =>
          sliceSegmentsByCharRange(
            segments,
            line.charStart,
            line.charEnd,
          ).reduce((sum, part) => {
            ctx.font = `${part.italic ? "italic" : "normal"} ${part.bold ? "700" : "400"} ${theme.fontSize}px ${theme.fontFamily}`;
            return sum + ctx.measureText(part.text).width;
          }, 0),
        ),
      );
      if (
        requiredHeight > geometry.body.height + 0.5 ||
        maxWidth > geometry.body.width + 0.5
      )
        issue(
          "TEXT_OVERFLOW",
          `Dialogue requires ${Math.ceil(maxWidth)}×${Math.ceil(requiredHeight)} px in ${Math.floor(geometry.body.width)}×${Math.floor(geometry.body.height)} px`,
        );
      if (event.type === "say") {
        const speaker =
          sequence.renderContext.speakerNames.get(event.targetId ?? "") ??
          event.targetId ??
          "";
        ctx.font = `bold ${theme.nameFontSize}px ${theme.nameFontFamily}`;
        const measured = ctx.measureText(speaker).width;
        if (
          measured > geometry.name.width + 0.5 ||
          theme.nameFontSize > geometry.name.height + 0.5
        )
          issue(
            "NAMEPLATE_OVERFLOW",
            `Speaker name '${speaker}' does not fit the name area`,
          );
        if (
          fonts &&
          !fonts.check(
            `bold ${theme.nameFontSize}px ${theme.nameFontFamily}`,
            speaker,
          )
        )
          issue("FONT_UNAVAILABLE", "Name font is not loaded", "warning");
      }
      const { box } = geometry;
      if (
        box.x < -0.5 ||
        box.y < -0.5 ||
        box.x + box.width > width + 0.5 ||
        box.y + box.height > height + 0.5
      )
        issue(
          "DIALOGUE_OUT_OF_FRAME",
          "Dialogue box extends outside the canvas",
        );
    }
  return issues;
}
