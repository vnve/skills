import type { DialogueCue } from "@vnve/compiler";
/** Transport navigation follows spoken/readable lines, not parallel effect lifetimes. */
export function stepDialogueCue(
  cues: DialogueCue[],
  time: number,
  direction: -1 | 1,
) {
  const lines = cues
    .filter((c) => c.text.trim())
    .sort((a, b) => a.start - b.start);
  if (!lines.length) return undefined;
  const epsilon = 1e-4;
  if (direction === 1)
    return lines.find((c) => c.start > time + epsilon) ?? lines.at(-1);
  const current = lines.findLastIndex((c) => c.start <= time + epsilon);
  if (current < 0) return lines[0];
  return lines[
    Math.max(0, time < lines[current].end - epsilon ? current - 1 : current)
  ];
}
