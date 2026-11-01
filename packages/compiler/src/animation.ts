import { gsap } from "gsap";
import {
  animationClipSchema,
  ANIMATION_BUDGET,
  type AnimationClip,
  type CompiledAnimation,
  type Diagnostic,
} from "@vnve/core";
import { createTimeline, disposeTimeline } from "@vnve/parser";
import type { DialogueCue } from "./cues";

export function compileAnimation(
  input: AnimationClip,
  cues: DialogueCue[],
  storyDuration: number,
  dimensions?: { width: number; height: number },
  placement?: { start: number; intrinsic?: boolean },
) {
  const clip = animationClipSchema.parse(input);
  const root = createTimeline();
  try {
    const cueTime = (ref: {
      nodeId: string;
      edge: "start" | "end";
      offset?: number;
    }) => {
      const cue = cues.find((c) => c.nodeId === ref.nodeId);
      if (!cue) throw new Error(`Animation cue '${ref.nodeId}' does not exist`);
      return cue[ref.edge] + (ref.offset ?? 0);
    };
    const positionTime = (
      p:
        | { nodeId: string; edge: "start" | "end"; offset?: number }
        | { scene: "start" | "storyEnd"; offset?: number },
    ) =>
      "nodeId" in p
        ? cueTime(p)
        : (p.scene === "storyEnd" ? storyDuration : 0) + (p.offset ?? 0);
    const start =
      placement?.start ?? (clip.anchor ? cueTime(clip.anchor) : clip.start);
    if (start < 0 || !Number.isFinite(start))
      throw new Error("Invalid animation start");
    if (clip.overrides?.enabled === false)
      return {
        compiled: {
          ...clip,
          start,
          resolvedDuration: clip.duration ?? 0,
          tracks: [],
        } satisfies CompiledAnimation,
        tree: root,
      };
    for (const b of clip.bindings) {
      const value =
        b.query === "parameter"
          ? clip.parameters[b.key ?? ""]
          : b.query === "cueDuration"
            ? (() => {
                const c = cues.find((c) => c.nodeId === b.nodeId);
                return c ? c.end - c.start : NaN;
              })()
            : dimensions?.[b.query];
      const matches =
        typeof value === "number" && typeof b.value === "number"
          ? Number.isFinite(value) && Math.abs(value - b.value) <= 1e-7
          : value !== undefined && value === b.value;
      if (!matches)
        throw new Error(
          `ANIMATION_REBUILD_REQUIRED: ${b.query}${b.nodeId ? ":" + b.nodeId : b.key ? ":" + b.key : ""}`,
        );
    }
    clip.samples = clip.samples.map((sample) => ({
      ...sample,
      start:
        sample.position === undefined
          ? sample.start
          : typeof sample.position === "number"
            ? sample.position
            : typeof sample.position === "object"
              ? positionTime(sample.position) - start
              : (() => {
                  throw new Error(
                    "Algorithm position must use numeric time or a symbolic cue",
                  );
                })(),
    }));
    for (const sample of clip.samples)
      if (sample.start < 0) throw new Error("Algorithm starts before fragment");
    const states = new Map(clip.targets.map((t) => [t.id, { ...t.initial }]));
    const writes: Array<{
      timeline: string;
      target: string;
      property: string;
      start: number;
      end: number;
    }> = [];
    const cuts = new Set<number>([0]);
    const scheduled: Array<{
      tween: gsap.core.Tween;
      start: number;
      boundaryOrder?: number;
    }> = [];
    for (const recipe of clip.timelines) {
      const tl = createTimeline();
      tl.vars.defaults = {
        ease: "none",
        lazy: false,
        immediateRender: false,
        ...recipe.defaults,
      };
      for (const c of cues) {
        tl.addLabel(`line:${c.nodeId}:start`, c.start - start);
        tl.addLabel(`line:${c.nodeId}:end`, c.end - start);
      }
      const resolve = (p: unknown): gsap.Position | undefined => {
        if (p === undefined) return undefined;
        if (typeof p === "object")
          return (
            positionTime(
              p as { nodeId: string; edge: "start" | "end"; offset?: number },
            ) - start
          );
        if (typeof p === "string" && !/^[<>]|^[+-]=/.test(p)) {
          const label = p.split(/[+-]=/)[0];
          if (label && !(label in tl.labels))
            throw new Error(`Unknown timeline label '${label}'`);
        }
        return p as gsap.Position;
      };
      for (const op of recipe.operations) {
        const pos = resolve(op.position);
        if (op.method === "label") {
          tl.addLabel(op.name, pos);
          continue;
        }
        const targets = op.targets.map((id) => states.get(id)!);
        const ease = op.vars.ease ?? recipe.defaults.ease;
        if (
          ease !== undefined &&
          (typeof ease !== "string" || !gsap.parseEase(ease))
        )
          throw new Error(`Unsupported GSAP easing ${ease}`);
        const vars = {
          ...recipe.defaults,
          ...op.vars,
          lazy: false,
          immediateRender: false,
        };
        if (op.method === "to") tl.to(targets, vars, pos);
        else if (op.method === "from") tl.from(targets, vars, pos);
        else if (op.method === "fromTo")
          tl.fromTo(targets, op.from!, vars, pos);
        else tl.set(targets, vars, pos);
        const tween = tl.recent() as gsap.core.Tween;
        if (tween.startTime() < 0)
          throw new Error("Animation cannot start before its fragment");
        for (const target of op.targets)
          for (const key of Object.keys(states.get(target)!))
            if (key in op.vars || key in (op.from ?? {})) {
              const w = {
                timeline: recipe.id,
                target,
                property: key,
                start: tween.startTime(),
                end: tween.endTime(),
              };
              if (w.start < 0)
                throw new Error("Animation cannot start before its fragment");
              if (
                writes.some(
                  (p) =>
                    p.timeline !== w.timeline &&
                    p.target === w.target &&
                    p.property === w.property &&
                    Math.max(p.start, w.start) < Math.min(p.end, w.end),
                )
              )
                throw new Error(
                  "Overlapping animation properties across timelines",
                );
              writes.push(w);
            }
        if (tween.endTime() > 300 || !Number.isFinite(tween.endTime()))
          throw new Error("Animation exceeds finite fragment duration");
        const addCut = (time: number) => {
          cuts.add(time);
          if (cuts.size > ANIMATION_BUDGET.samples)
            throw new Error("Animation sample budget exceeded");
        };
        if (["set", "from", "fromTo"].includes(op.method))
          for (let i = 0; i < op.targets.length; i++)
            addCut(
              tween.startTime() +
                i * Number(op.vars.stagger ?? recipe.defaults.stagger ?? 0),
            );
        const repeat = tween.repeat(),
          cycle = tween.duration() + tween.repeatDelay();
        if (repeat > 0 && cycle <= 0)
          throw new Error("Repeated animation needs a positive cycle duration");
        if (!tween.yoyo())
          for (let i = 1; i <= repeat; i++)
            addCut(tween.startTime() + i * cycle);
      }
      // Resolve recipe labels first, then place every operation on the same
      // chronological track as algorithm segments so later tweens inherit state.
      for (const tween of tl.getChildren(false, true, false)) {
        scheduled.push({
          tween: tween as gsap.core.Tween,
          start: tween.startTime(),
        });
        tl.remove(tween);
      }
      disposeTimeline(tl);
    }
    for (const sample of clip.samples) {
      const state = states.get(sample.targetId)!;
      const keys = Object.keys(sample.values);
      const count = sample.values[keys[0]].length;
      const segment = createTimeline();
      segment.set(
        state,
        Object.fromEntries(keys.map((key) => [key, sample.values[key][0]])),
        0,
      );
      // Publish exact boundary states to GSAP, so subsequent native tweens
      // inherit the algorithm's final value. Interior samples stay numeric data.
      segment.set(
        state,
        Object.fromEntries(
          keys.map((key) => [key, sample.values[key][count - 1]]),
        ),
        sample.duration,
      );
      for (const tween of segment.getChildren(false, true, false)) {
        scheduled.push({
          tween: tween as gsap.core.Tween,
          start: sample.start + tween.startTime(),
          boundaryOrder: tween.startTime() === sample.duration ? -1 : 0,
        });
        segment.remove(tween);
      }
      disposeTimeline(segment);
    }
    for (const { tween, start: position } of scheduled.sort(
      (a, b) =>
        a.start - b.start || (a.boundaryOrder ?? 0) - (b.boundaryOrder ?? 0),
    ))
      root.add(tween, position);
    const algorithmEnd = Math.max(
      0,
      ...clip.nodes
        .flatMap((n) => n.attrs.particles ?? [])
        .map((p) => p.birth + p.lifetime),
      ...clip.samples.map((s) => s.start + s.duration),
    );
    const duration =
      clip.duration ??
      Math.max(
        root.duration(),
        algorithmEnd,
        placement?.intrinsic ? 0 : storyDuration - start,
      );
    if (
      !Number.isFinite(duration) ||
      duration <= 0 ||
      duration > 300 ||
      root.duration() > duration + 1e-7 ||
      algorithmEnd > duration + 1e-7
    )
      throw new Error("Animation exceeds finite fragment duration");
    if (
      !placement &&
      !clip.extendScene &&
      start + duration > storyDuration + 1e-7
    )
      throw new Error(
        "Animation interval outside scene; explicitly enable extendScene",
      );
    if (root.duration() < duration)
      root.to({ value: 0 }, { value: 1, duration }, 0);
    const times = Array.from(
      { length: Math.ceil(duration * clip.sampleRate) + 1 },
      (_, i) => Math.min(duration, i / clip.sampleRate),
    );
    for (const sample of clip.samples) {
      cuts.add(sample.start);
      times.push(sample.start + sample.duration);
      if (sample.interpolation === "step")
        for (
          let i = 0;
          i < Math.ceil(sample.duration * sample.sampleRate) + 1;
          i++
        )
          cuts.add(
            sample.start + Math.min(sample.duration, i / sample.sampleRate),
          );
    }
    for (const cut of cuts) if (cut > 0 && cut <= duration) times.push(cut);
    const knots = [...new Set(times)]
      .sort((a, b) => a - b)
      .flatMap((time) =>
        cuts.has(time) && time > 0
          ? [
              { time, evaluate: Math.max(0, time - 1e-6) },
              { time, evaluate: time },
            ]
          : [{ time, evaluate: time }],
      );
    const ordered = knots.map((k) => k.time);
    const particleSamples = clip.nodes
      .flatMap((n) => n.attrs.particles ?? [])
      .reduce(
        (sum, p) =>
          sum + Object.values(p.values).reduce((n, v) => n + v.length, 0),
        0,
      );
    if (
      particleSamples +
        ordered.length *
          clip.targets.reduce((n, t) => n + Object.keys(t.initial).length, 0) >
      ANIMATION_BUDGET.samples
    )
      throw new Error("Animation sample budget exceeded");
    root.totalTime(duration, true);
    root.totalTime(0, true);
    const read = (t: number) => {
      root.totalTime(t, true);
      return clip.targets.map((target) =>
        Object.fromEntries(
          Object.keys(target.initial).map((p) => [
            p,
            states.get(target.id)![p],
          ]),
        ),
      );
    };
    const checked = knots.map((k) => read(k.evaluate));
    for (let i = ordered.length - 1; i >= 0; i--)
      if (
        JSON.stringify(read(knots[i].evaluate)) !== JSON.stringify(checked[i])
      )
        throw new Error("Animation must be independent of sampling order");
    const tracks: CompiledAnimation["tracks"] = [];
    clip.targets.forEach((target, index) => {
      for (const property of Object.keys(target.initial)) {
        const samples = clip.samples.filter(
          (s) => s.targetId === target.id && property in s.values,
        );
        for (let i = 0; i < samples.length; i++)
          for (let j = i + 1; j < samples.length; j++)
            if (
              Math.max(samples[i].start, samples[j].start) <
              Math.min(
                samples[i].start + samples[i].duration,
                samples[j].start + samples[j].duration,
              )
            )
              throw new Error("Overlapping sample properties");
        for (const sample of samples)
          if (
            writes.some(
              (w) =>
                w.target === target.id &&
                w.property === property &&
                Math.max(w.start, sample.start) <
                  Math.min(w.end, sample.start + sample.duration),
            )
          )
            throw new Error("Overlapping GSAP/sample properties");
        if (
          !samples.length &&
          !writes.some((w) => w.target === target.id && w.property === property)
        )
          continue;
        const values = checked.map((entry, i) => {
          const t = knots[i].evaluate;
          let value = entry[index][property];
          const active = samples.find(
            (s) => t >= s.start && t < s.start + s.duration,
          );
          if (active) {
            const local = t - active.start;
            const a = Math.min(
              active.values[property].length - 1,
              Math.floor(local * active.sampleRate),
            );
            const b = Math.min(a + 1, active.values[property].length - 1);
            const f =
              active.interpolation === "step"
                ? 0
                : (local - a / active.sampleRate) /
                  Math.max(
                    1e-10,
                    Math.min(active.duration, b / active.sampleRate) -
                      a / active.sampleRate,
                  );
            value =
              active.values[property][a] +
              (active.values[property][b] - active.values[property][a]) * f;
          }
          if (
            target.kind === "mask" &&
            ["width", "height", "radiusX", "radiusY"].includes(property) &&
            value < 0
          )
            throw new Error("Invalid animated mask geometry");
          if (!Number.isFinite(value))
            throw new Error("Animation produced non-finite numeric values");
          return value;
        });
        tracks.push({
          targetId: target.id,
          property,
          times: ordered,
          values,
          interpolation: "linear",
        });
      }
    });
    if (tracks.length > ANIMATION_BUDGET.tracks)
      throw new Error("Animation track budget exceeded");
    if (!clip.nodes.length && !tracks.length)
      throw new Error("Animation must create nodes or tracks");
    return {
      compiled: {
        ...clip,
        start,
        resolvedDuration: duration,
        tracks,
      } satisfies CompiledAnimation,
      tree: root,
    };
  } catch (error) {
    disposeTimeline(root);
    throw error;
  }
}
export function animationDiagnostic(
  error: unknown,
  sceneId: string,
): Diagnostic {
  return {
    level: "error",
    code: String((error as Error).message).includes(
      "ANIMATION_REBUILD_REQUIRED",
    )
      ? "ANIMATION_REBUILD_REQUIRED"
      : "ANIMATION_INVALID",
    message: (error as Error).message,
    location: { sceneId },
  };
}
