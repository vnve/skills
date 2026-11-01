import { isInlineTagBlocking } from "@vnve/parser";

import { expect, it } from "vitest";
import { updateTagParameter } from "./tag-edits";
it("switches a move back to semantic targeting without old coordinates overriding it", () => {
  expect(
    updateTagParameter(
      {
        type: "tag",
        name: "move",
        params: { actor: "hero", toX: 12, toY: 100, dur: 1 },
      },
      "to",
      "right",
    ),
  ).toEqual({
    type: "tag",
    name: "move",
    params: { actor: "hero", to: "right", dur: 1 },
  });
});
it("keeps a move's other coordinate and duration when setting an explicit target", () => {
  expect(
    updateTagParameter(
      {
        type: "tag",
        name: "move",
        params: { actor: "hero", to: "left", toY: 100, dur: 1 },
      },
      "toX",
      82,
    ).params,
  ).toEqual({ actor: "hero", toX: 82, toY: 100, dur: 1 });
});
it("materializes the other axis when editing only one coordinate of a semantic move", () => {
  expect(
    updateTagParameter(
      {
        type: "tag",
        name: "move",
        params: { actor: "hero", to: "right", dur: 1 },
      },
      "toX",
      55,
    ).params,
  ).toEqual({ actor: "hero", toX: 55, toY: 100, dur: 1 });
  expect(
    updateTagParameter(
      {
        type: "tag",
        name: "move",
        params: { actor: "hero", to: "right", dur: 1 },
      },
      "toY",
      50,
      1080,
      1920,
    ).params,
  ).toEqual({ actor: "hero", toX: 70, toY: 50, dur: 1 });
});
it("shows the parser's default blocking behavior before await is explicitly set", () => {
  expect(
    isInlineTagBlocking({
      type: "tag",
      name: "show",
      params: { actor: "hero" },
    }),
  ).toBe(true);
  expect(
    isInlineTagBlocking({
      type: "tag",
      name: "bgm",
      params: { asset: "music" },
    }),
  ).toBe(false);
  expect(
    isInlineTagBlocking({
      type: "tag",
      name: "set",
      params: { target: "hero", variant: "a", with: "fade" },
    }),
  ).toBe(true);
  expect(
    isInlineTagBlocking({
      type: "tag",
      name: "set",
      params: { target: "hero", variant: "a" },
    }),
  ).toBe(false);
  expect(
    isInlineTagBlocking({
      type: "tag",
      name: "show",
      params: { actor: "hero", await: false },
    }),
  ).toBe(false);
});
it("changes camera mode in one edit and removes unrelated fields while restoring valid defaults", () => {
  const next = updateTagParameter(
    {
      type: "tag",
      name: "camera",
      params: {
        action: "focus",
        actor: "hero",
        target: "actor",
        zoom: 2,
        dur: 1,
      },
    },
    "action",
    "rackfocus",
  );
  expect(next.params).toMatchObject({
    action: "rackfocus",
    fromTarget: "$background",
    zoom: 1,
    dur: 4,
  });
  expect("actor" in next.params).toBe(false);
  const point = updateTagParameter(
    {
      type: "tag",
      name: "camera",
      params: { action: "focus", actor: "hero", target: "actor" },
    },
    "target",
    "point",
  );
  expect(point.params).toMatchObject({ x: 50, y: 50, target: "point" });
  expect("actor" in point.params).toBe(false);
});
