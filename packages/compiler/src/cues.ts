import type { Scene, TimelineEvent, Diagnostic } from "@vnve/core";
import { voiceIntervals } from "@vnve/runtime";
export interface DialogueCue {
  sceneId: string;
  nodeId: string;
  index: number;
  text: string;
  start: number;
  end: number;
  revealDuration: number;
  voice?: { asset: string; start: number; end: number };
}
export function collectCues(
  scene: Pick<Scene, "id" | "script">,
  events: TimelineEvent[],
  sources: number[],
): DialogueCue[] {
  return scene.script.nodes.flatMap((node, index) => {
    const primary = events.find(
      (event, i) =>
        sources[i] === index &&
        (event.type === "say" || event.type === "narrate"),
    );
    const related = events.filter((_, i) => sources[i] === index);
    if (!related.length) return [];
    const start = primary?.at ?? Math.min(...related.map((e) => e.at)),
      end = primary
        ? primary.at + primary.dur
        : Math.max(...related.map((e) => e.at + e.dur));
    const params =
      primary && (primary.type === "say" || primary.type === "narrate")
        ? primary.params
        : undefined;
    const intervals =
      primary && (primary.type === "say" || primary.type === "narrate")
        ? voiceIntervals(primary)
        : [];
    return [
      {
        sceneId: scene.id,
        nodeId: node.id ?? `index:${index}`,
        index,
        text: params?.text ?? "",
        start,
        end,
        revealDuration: params?.textAnimDur ?? primary?.dur ?? 0,
        ...(params?.audioUrl
          ? {
              voice: {
                asset: params.audioUrl,
                start: intervals[0]?.start ?? start,
                end: Math.min(end, intervals.at(-1)?.end ?? start),
              },
            }
          : {}),
      },
    ];
  });
}
