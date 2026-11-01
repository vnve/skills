import { createHash } from "node:crypto";
import {
  animationClipSchema,
  visualProperties,
  usesVisualPrimitives,
  maskProperties,
  ANIMATION_BUDGET,
  type AnimationClip,
  type VisualNode,
  type AnimationPosition,
} from "@vnve/core";

export interface AuthoringContext {
  width: number;
  height: number;
  cues: Array<{ nodeId: string; start: number; end: number; sceneId?: string }>;
}
/** Records GSAP-native authoring operations as validated data; no source reaches the browser. */
export function buildAnimation(
  definition: Record<string, any>,
  source: string,
  context: AuthoringContext,
): AnimationClip {
  if (definition.sdkVersion !== 2)
    throw new Error("Use animation SDK version 2");
  const nodes: VisualNode[] = [],
    targets: AnimationClip["targets"] = [],
    timelines: AnimationClip["timelines"] = [],
    samples: AnimationClip["samples"] = [],
    bindings: AnimationClip["bindings"] = [];
  const stateIds = new Map<object, string>();
  const refs = new Map<string, Record<string, number>>();
  const register = (
    kind: "actor" | "camera" | "visual" | "mask",
    ref: string,
    initial: Record<string, number>,
  ) => {
    const key = `${kind}:${ref}`;
    if (refs.has(key)) return refs.get(key)!;
    const state = { ...initial };
    refs.set(key, state);
    stateIds.set(state, key);
    targets.push({ id: key, kind, ref, initial: { ...initial } });
    return state;
  };
  const scene = Object.fromEntries(
    ["Group", "Rect", "Circle", "Ellipse", "Line", "Path", "Text", "Image"].map(
      (type) => [
        type.toLowerCase(),
        (input: Record<string, any>) => {
          if (nodes.length >= ANIMATION_BUDGET.nodes)
            throw new Error("Animation node budget exceeded");
          const { id, parentId, ...attrs } = input;
          const node = { id, type, parentId, attrs } as VisualNode;
          nodes.push(node);
          return node;
        },
      ],
    ),
  ) as Record<string, (input: Record<string, any>) => VisualNode>;
  const target = (node: VisualNode, initial?: Record<string, number>) => {
    if (!nodes.includes(node))
      throw new Error("Target must belong to this animation");
    const values =
      initial ??
      (Object.fromEntries(
        Object.entries(node.attrs).filter(
          ([key, value]) =>
            visualProperties.includes(key as never) &&
            typeof value === "number",
        ),
      ) as Record<string, number>);
    Object.assign(node.attrs, values);
    return register("visual", node.id, values);
  };
  const timeline = (
    options: { defaults?: Record<string, number | string | boolean> } = {},
  ) => {
    if (Object.keys(options).some((k) => k !== "defaults"))
      throw new Error(
        "Only timeline defaults are supported; use finite tween repeat/yoyo",
      );
    const recipe: AnimationClip["timelines"][number] = {
      id: `timeline-${timelines.length}`,
      defaults: options.defaults ?? {},
      operations: [],
    };
    timelines.push(recipe);
    const append = (
      method: "to" | "from" | "fromTo" | "set",
      states: object | object[],
      vars: Record<string, any>,
      position?: AnimationPosition,
      from?: Record<string, number>,
    ) => {
      const ids = (Array.isArray(states) ? states : [states]).map((s) => {
        const id = stateIds.get(s);
        if (!id) throw new Error("Use registered animation targets");
        return id;
      });
      recipe.operations.push({
        method,
        targets: ids,
        vars,
        ...(position !== undefined ? { position } : {}),
        ...(from ? { from } : {}),
      });
      if (recipe.operations.length > 4096)
        throw new Error("Animation operation budget exceeded");
      return api;
    };
    const api = {
      to: (
        states: object | object[],
        vars: Record<string, any>,
        position?: AnimationPosition,
      ) => append("to", states, vars, position),
      from: (
        states: object | object[],
        vars: Record<string, any>,
        position?: AnimationPosition,
      ) => append("from", states, vars, position),
      fromTo: (
        states: object | object[],
        from: Record<string, number>,
        vars: Record<string, any>,
        position?: AnimationPosition,
      ) => append("fromTo", states, vars, position, from),
      set: (
        states: object | object[],
        vars: Record<string, any>,
        position?: AnimationPosition,
      ) => append("set", states, vars, position),
      addLabel: (name: string, position?: AnimationPosition) => {
        recipe.operations.push({ method: "label", name, position });
        return api;
      },
    };
    return api;
  };
  const random = (index: number) => {
    let value = (definition.seed ?? 0) ^ Math.imul(index | 0, 0x9e3779b9);
    value = Math.imul(value ^ (value >>> 16), 0x21f0aaad);
    value = Math.imul(value ^ (value >>> 15), 0x735a2d97);
    return ((value ^ (value >>> 15)) >>> 0) / 4294967296;
  };
  scene.particles = (input: Record<string, any>) => {
    if (nodes.length >= ANIMATION_BUDGET.nodes)
      throw new Error("Animation node budget exceeded");
    if (
      !Array.isArray(input.particles) ||
      input.particles.length > ANIMATION_BUDGET.particles
    )
      throw new Error("Particle count exceeds budget");
    let sampleCount = 0;
    const particles = input.particles.map((p: Record<string, any>) => {
      const { sample: evaluate, ...meta } = p;
      const rate = p.sampleRate ?? 30;
      if (
        !Number.isFinite(p.lifetime) ||
        p.lifetime <= 0 ||
        p.lifetime > 300 ||
        !Number.isInteger(rate) ||
        rate < 1 ||
        rate > 120
      )
        throw new Error("Invalid particle duration or rate");
      if (typeof evaluate !== "function")
        throw new Error("Particle needs sample function");
      let hash = 2166136261;
      for (const char of String(p.id))
        hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
      const count = Math.ceil(p.lifetime * rate) + 1;
      const read = (i: number) =>
        evaluate({
          localTime: Math.min(i / rate, p.lifetime),
          time: (p.birth ?? 0) + Math.min(i / rate, p.lifetime),
          random: (index: number) =>
            random(hash ^ Math.imul(index, 0x9e3779b9)),
        });
      const checked = Array.from({ length: count }, (_, i) => read(i));
      const keys = Object.keys(checked[0]);
      sampleCount += count * keys.length;
      if (sampleCount > ANIMATION_BUDGET.samples)
        throw new Error("Particle samples exceed budget");
      for (let i = count - 1; i >= 0; i--)
        if (
          JSON.stringify(read(i)) !== JSON.stringify(checked[i]) ||
          Object.keys(checked[i]).join() !== keys.join()
        )
          throw new Error(
            "Particle samples must be stable and independent of sampling order",
          );
      return {
        ...meta,
        id: p.id,
        lifetime: p.lifetime,
        birth: p.birth ?? 0,
        sampleRate: rate,
        values: Object.fromEntries(
          keys.map((k) => [k, checked.map((v) => v[k])]),
        ),
      };
    });
    const { id, parentId, ...attrs } = input;
    const node = {
      id,
      parentId,
      type: "Particles" as const,
      attrs: { ...attrs, particles },
    };
    nodes.push(node);
    return node;
  };
  const query = {
    width: () => {
      bindings.push({ query: "width", value: context.width });
      return context.width;
    },
    height: () => {
      bindings.push({ query: "height", value: context.height });
      return context.height;
    },
    cueDuration: (nodeId: string) => {
      const c = context.cues.find(
        (c) =>
          c.nodeId === nodeId &&
          (!c.sceneId || c.sceneId === definition.sceneId),
      );
      if (!c) throw new Error("Unknown dialogue cue");
      const value = c.end - c.start;
      bindings.push({ query: "cueDuration", nodeId, value });
      return value;
    },
  };
  const sample = (
    state: object,
    definition: {
      start?: number;
      duration: number;
      sampleRate?: number;
      interpolation?: "linear" | "step";
      sample: (context: {
        time: number;
        localTime: number;
        duration: number;
        random: (index: number) => number;
      }) => Record<string, number>;
    },
    position?: AnimationPosition,
  ) => {
    const targetId = stateIds.get(state);
    if (!targetId) throw new Error("Unknown sample target");
    const rate = definition.sampleRate ?? 60,
      count = Math.ceil(definition.duration * rate) + 1;
    if (
      !Number.isFinite(definition.duration) ||
      definition.duration <= 0 ||
      definition.duration > 300 ||
      !Number.isInteger(rate) ||
      rate < 1 ||
      rate > 120 ||
      count > ANIMATION_BUDGET.samples
    )
      throw new Error("Invalid algorithm duration or sample rate");
    const evaluate = (i: number) =>
      definition.sample({
        time: (definition.start ?? 0) + Math.min(i / rate, definition.duration),
        localTime: Math.min(i / rate, definition.duration),
        duration: definition.duration,
        random,
      });
    const checked = Array.from({ length: count }, (_, i) => evaluate(i));
    for (let i = count - 1; i >= 0; i--)
      if (JSON.stringify(evaluate(i)) !== JSON.stringify(checked[i]))
        throw new Error("Sample must be independent of sampling order");
    const keys = Object.keys(checked[0]);
    if (checked.some((v) => Object.keys(v).join() !== keys.join()))
      throw new Error("Sample must write stable properties");
    samples.push({
      targetId,
      start: definition.start ?? 0,
      ...(position !== undefined ? { position } : {}),
      duration: definition.duration,
      sampleRate: rate,
      interpolation: definition.interpolation ?? "linear",
      values: Object.fromEntries(
        keys.map((k) => [k, checked.map((v) => v[k])]),
      ),
    });
  };
  if (typeof definition.build !== "function")
    throw new Error("Animation needs a build function");
  definition.build({
    scene,
    target,
    mask: (node: VisualNode) => {
      if (!nodes.includes(node) || !node.attrs.mask)
        throw new Error("Mask target must belong to this animation");
      const m = node.attrs.mask;
      const values: Record<string, number> = {
        x: 0,
        y: 0,
        scaleX: 1,
        scaleY: 1,
        rotation: 0,
        opacity: 1,
      };
      for (const key of maskProperties)
        if (typeof m[key] === "number") values[key] = m[key]!;
      return register("mask", node.id, values);
    },
    timeline,
    actor: (id: string) =>
      register("actor", id, {
        x: 0,
        y: 0,
        scale: 1,
        rotation: 0,
        opacity: 1,
        brightness: 1,
        blur: 0,
      }),
    camera: () => register("camera", "camera", { x: 0, y: 0, scale: 1 }),
    at: {
      scene: (scene: "start" | "storyEnd", offset = 0) => ({ scene, offset }),
      line: (nodeId: string, edge: "start" | "end" = "start", offset = 0) => ({
        nodeId,
        edge,
        offset,
      }),
    },
    sample,
    query,
    math: {
      random,
      lerp: (a: number, b: number, t: number) => a + (b - a) * t,
      spring: (time: number, frequency = 3, damping = 6) =>
        1 -
        Math.exp(-damping * time) * Math.cos(2 * Math.PI * frequency * time),
      noise: (time: number) => {
        const i = Math.floor(time),
          t = time - i,
          s = t * t * (3 - 2 * t);
        return random(i) * (1 - s) + random(i + 1) * s;
      },
      path: (points: { x: number; y: number }[], progress: number) => {
        if (points.length < 2) throw new Error("Path needs two points");
        const t = Math.max(0, Math.min(1, progress)) * (points.length - 1),
          i = Math.min(points.length - 2, Math.floor(t));
        return {
          x: points[i].x + (points[i + 1].x - points[i].x) * (t - i),
          y: points[i].y + (points[i + 1].y - points[i].y) * (t - i),
        };
      },
    },
    parameters: new Proxy(Object.freeze({ ...definition.parameters }), {
      get(object, key) {
        const value = object[key];
        if (
          typeof key === "string" &&
          Object.hasOwn(object, key) &&
          !bindings.some((b) => b.query === "parameter" && b.key === key)
        )
          bindings.push({ query: "parameter", key, value });
        return value;
      },
    }),
  });
  const { build: _, ...meta } = definition;
  return animationClipSchema.parse({
    ...meta,
    capabilities: usesVisualPrimitives(nodes)
      ? ["visual-primitives-v1"]
      : undefined,
    version: 2,
    engineVersion: "3.15.0",
    width: definition.width ?? context.width,
    height: definition.height ?? context.height,
    nodes,
    targets,
    timelines,
    samples,
    bindings,
    source,
    sourceDigest: createHash("sha256").update(source).digest("hex"),
  });
}
