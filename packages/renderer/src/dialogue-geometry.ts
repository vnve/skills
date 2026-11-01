import {
  computeDialogueBoxPlacement,
  type DialogueThemeConfig,
} from "./themes";
const percent = (value: number, fallback: number) =>
  Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : fallback;
/** Shared by actual drawing and actual-font layout checks. Rectangles are box-relative. */
export function dialogueGeometry(
  theme: DialogueThemeConfig,
  width: number,
  height: number,
) {
  const box = computeDialogueBoxPlacement(theme, width, height),
    boxW = box.width;
  return {
    box,
    body: {
      x: (percent(theme.bodyX, 3) / 100) * boxW,
      y: (percent(theme.bodyY, 24) / 100) * theme.boxHeight,
      width: Math.max(1, (percent(theme.bodyWidth, 94) / 100) * boxW),
      height: Math.max(
        1,
        (percent(theme.bodyHeight, 70) / 100) * theme.boxHeight,
      ),
    },
    name: {
      x:
        (percent(theme.nameplateX, 2.5) / 100) * boxW + theme.nameplatePaddingX,
      y:
        (percent(theme.nameplateY, 3) / 100) * theme.boxHeight +
        theme.nameplatePaddingY,
      width: Math.max(
        1,
        (percent(theme.nameplateWidth, 18) / 100) * boxW -
          theme.nameplatePaddingX * 2,
      ),
      height: Math.max(
        1,
        (percent(theme.nameplateHeight, 11) / 100) * theme.boxHeight -
          theme.nameplatePaddingY * 2,
      ),
    },
  };
}
