import { describe, it, expect } from "vitest";
import { checkSequenceLayout } from "../layout-check";
import { createEmptyRenderContext } from "../frame-pipeline";
import type { CompiledSequence } from "../sequence-types";
import type { TimelineEvent } from "@vnve/core";
function fixture(
  text: string,
  name = "Lin",
  overrides: Record<string, unknown> = {},
) {
  const context = createEmptyRenderContext();
  context.speakerNames.set("actor", name);
  const event: TimelineEvent = {
    type: "say",
    at: 2,
    dur: 1,
    targetId: "actor",
    params: {
      text,
      theme: "classic",
      themeOverrides: { nameplateVisible: true, ...overrides },
    },
  };
  return {
    renderContext: context,
    sceneClips: [{ sceneId: "scene", events: [event] }],
  } as CompiledSequence;
}
const ctx = {
  font: "",
  measureText: (text: string) => ({ width: [...text].length * 20 }),
} as CanvasRenderingContext2D;
describe("actual font layout diagnostics", () => {
  it("accepts a short line and reports long Chinese, English and explicit line overflow at the scene/time", () => {
    expect(
      checkSequenceLayout(fixture("你好"), 1920, 1080, ctx, {
        check: () => true,
      }),
    ).toEqual([]);
    for (const text of [
      "很长的中文对白".repeat(100),
      "long English dialogue ".repeat(100),
      "a\nb\nc\nd\ne\nf\ng\nh\ni",
    ])
      expect(checkSequenceLayout(fixture(text), 1920, 1080, ctx)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: "TEXT_OVERFLOW",
            sceneId: "scene",
            at: 2,
          }),
        ]),
      );
  });
  it("checks visible speaker text even when its background plate is hidden", () => {
    const issues = checkSequenceLayout(
      fixture("Short", "Name".repeat(100)),
      1920,
      1080,
      ctx,
      { check: () => false },
    );
    expect(issues.map((i) => i.code)).toEqual(
      expect.arrayContaining(["NAMEPLATE_OVERFLOW", "FONT_UNAVAILABLE"]),
    );
    expect(
      checkSequenceLayout(
        fixture("Short", "Name".repeat(100), { nameplateVisible: false }),
        1920,
        1080,
        ctx,
      ).some((i) => i.code === "NAMEPLATE_OVERFLOW"),
    ).toBe(true);
  });
});
