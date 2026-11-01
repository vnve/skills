import type { InlineTag, RichContent } from "@vnve/core";

export function getInlineTagByIndex(
  content: RichContent[],
  tagIndex: number,
): InlineTag | null {
  if (tagIndex < 0) return null;
  let current = 0;

  for (const segment of content) {
    if (segment.type !== "tag") continue;
    if (current === tagIndex) return segment;
    current += 1;
  }

  return null;
}
