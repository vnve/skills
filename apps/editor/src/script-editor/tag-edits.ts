import {
  getExtendedSlotPositions,
  type ExtendedSlotName,
} from "../core/stage-utils";
import { cameraActionDefaults, type InlineTag } from "@vnve/core";
/** The parser prefers numeric coordinates; keep semantic and numeric targets exclusive. */
export function updateTagParameter(
  tag: InlineTag,
  key: string,
  value: unknown,
  width = 1920,
  height = 1080,
): InlineTag {
  let params = { ...tag.params } as Record<string, unknown>;
  if (tag.name === "camera" && key === "action" && typeof value === "string") {
    const keep: Record<string, unknown> = {};
    for (const field of [
      "await",
      "actor",
      "other",
      "fromTarget",
      "toTarget",
      "foreground",
    ])
      if (params[field] !== undefined) keep[field] = params[field];
    if (!["focus", "duo"].includes(value)) {
      delete keep.actor;
      delete keep.other;
    }
    if (value !== "duo") delete keep.other;
    if (value !== "rackfocus") {
      delete keep.fromTarget;
      delete keep.toTarget;
    }
    if (value !== "parallax") delete keep.foreground;
    params = { ...cameraActionDefaults(value), ...keep };
  }
  if (tag.name === "move") {
    if (key === "to") {
      delete params.toX;
      delete params.toY;
    }
    if (key === "toX" || key === "toY") {
      const slot =
        typeof params.to === "string"
          ? getExtendedSlotPositions(width, height)[
              params.to as ExtendedSlotName
            ]
          : undefined;
      if (slot && key === "toX" && params.toY === undefined)
        params.toY = slot.y;
      if (slot && key === "toY" && params.toX === undefined)
        params.toX = slot.x;
      delete params.to;
    }
  }
  if (tag.name === "camera" && key === "target") {
    if (value === "point") {
      delete params.actor;
      params.x ??= 50;
      params.y ??= 50;
    }
    if (value === "actor") {
      delete params.x;
      delete params.y;
    }
  }
  if (value === undefined) delete params[key];
  else params[key] = value;
  return { ...tag, params } as InlineTag;
}
