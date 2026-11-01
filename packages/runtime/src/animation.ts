import type { CompiledAnimation, VisualNode } from "@vnve/core";
import type { ActorRenderState, RenderState } from "./types";
export interface VisualRenderState {
  id: string;
  localTime?: number;
  width: number;
  height: number;
  space: "stage" | "screen";
  layer: "behindActors" | "aboveActors";
  x: number;
  y: number;
  scale: number;
  anchor?: {
    x: number;
    y: number;
    centerOffset: number;
    rotation: number;
    actorId: string;
  };
  nodes: VisualNode[];
}
export function sampleAnimationTrack(
  track: CompiledAnimation["tracks"][number],
  time: number,
): number {
  let low = 0,
    high = track.times.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (track.times[mid] <= time) low = mid + 1;
    else high = mid;
  }
  const a = Math.max(0, low - 1),
    b = Math.min(a + 1, track.times.length - 1);
  if (track.interpolation === "step" || b === a) return track.values[a];
  const f = Math.max(
    0,
    Math.min(
      1,
      (time - track.times[a]) /
        Math.max(1e-12, track.times[b] - track.times[a]),
    ),
  );
  return track.values[a] + (track.values[b] - track.values[a]) * f;
}
/** Stateless execution of the master timeline's compiled numeric projections. */
export function applyAnimations(
  state: RenderState,
  clips: readonly CompiledAnimation[],
  time: number,
): RenderState {
  const actors = state.actors.map((a) => ({ ...a })),
    camera = { ...state.camera },
    visuals: VisualRenderState[] = [];
  const follows = new Map<string, NonNullable<CompiledAnimation["follow"]>>();
  for (const clip of clips) {
    if (
      clip.overrides?.enabled === false ||
      time < clip.start ||
      (time >= clip.start + clip.resolvedDuration &&
        clip.endBehavior !== "hold")
    )
      continue;
    const inLifetime = time < clip.start + clip.resolvedDuration;
    const local = Math.min(clip.resolvedDuration, time - clip.start),
      nodes = clip.nodes.map((n) => ({
        ...n,
        attrs: {
          ...n.attrs,
          ...(n.attrs.mask ? { mask: { ...n.attrs.mask } } : {}),
        },
      })),
      byNode = new Map(nodes.map((n) => [n.id, n]));
    for (const track of clip.tracks) {
      const target = clip.targets.find((t) => t.id === track.targetId)!;
      const raw = sampleAnimationTrack(track, local);
      const identity = ["scale", "opacity", "brightness"].includes(
        track.property,
      )
        ? 1
        : 0;
      const value = identity + (raw - identity) * (clip.overrides?.weight ?? 1);
      if (target.kind === "mask") {
        (
          byNode.get(target.ref)!.attrs.mask as unknown as Record<
            string,
            number
          >
        )[track.property] = raw;
        continue;
      }
      if (target.kind === "visual") {
        byNode.get(target.ref)!.attrs[
          track.property as keyof VisualNode["attrs"]
        ] = raw as never;
        continue;
      }
      const subject =
        target.kind === "actor"
          ? actors.find((a) => a.id === target.ref)
          : camera;
      if (!subject) continue;
      const property = track.property as keyof typeof camera;
      const multiplicative = ["scale", "opacity", "brightness"].includes(
        property,
      );
      const numeric = subject as unknown as Record<string, number>;
      numeric[property] = multiplicative
        ? numeric[property] * value
        : numeric[property] + value;
      if (property === "scale")
        numeric[property] = Math.max(0.01, Math.min(100, numeric[property]));
      if (track.property === "opacity")
        numeric[property] = Math.max(0, Math.min(1, numeric[property]));
    }
    if (clip.follow) follows.set(clip.id, clip.follow);
    if (nodes.length && inLifetime)
      visuals.push({
        id: clip.id,
        localTime: local,
        width: clip.width,
        height: clip.height,
        space: clip.space,
        layer: clip.layer,
        x: clip.overrides?.x ?? 0,
        y: clip.overrides?.y ?? 0,
        scale: clip.overrides?.scale ?? 1,
        nodes,
      });
  }
  for (const visual of visuals) {
    const follow = follows.get(visual.id);
    const actor = follow && actors.find((a) => a.id === follow.actorId);
    if (actor)
      visual.anchor = {
        x: actor.x / 100,
        y: actor.y / 100,
        centerOffset: follow.point === "center" ? -0.4 * actor.scale : 0,
        rotation: actor.rotation ?? 0,
        actorId: actor.id,
      };
  }
  return { ...state, actors, camera, visuals };
}
