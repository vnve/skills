import { it, expect } from "vitest";
import { COMMON_VISUAL_COMMANDS } from "@vnve/core";
import { buildCommandGroups } from "./SlashCommandPalette";
it("offers exactly sixteen visual entries plus audio and wait, filtering hidden recent tags", () => {
  const groups = buildCommandGroups((k) => k, ["rackfocus", "rotate", "show"]);
  const names = groups.flatMap((g) => g.commands.map((c) => c.name));
  expect(names).toHaveLength(19);
  expect(new Set(names)).toEqual(
    new Set([...COMMON_VISUAL_COMMANDS, "bgm", "sfx", "wait"]),
  );
});
