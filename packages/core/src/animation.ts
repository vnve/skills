import { z } from "zod/v3";

export const ANIMATION_SDK_VERSION = 2;
export const ANIMATION_BUDGET = {
  nodes: 512,
  tracks: 4096,
  samples: 500000,
  bytes: 12000000,
  path: 100000,
  points: 20000,
  source: 100000,
  executionMs: 5000,
  particles: 4096,
  activeParticles: 2048,
  compositePixels: 16777216,
} as const;
const id = z.string().trim().min(1).max(200);
const scalar = z.number().finite().min(-100000).max(100000);
const boundsSchema = z
  .object({
    x: scalar,
    y: scalar,
    width: scalar.positive().max(8192),
    height: scalar.positive().max(8192),
  })
  .strict();
export const maskProperties = [
  "x",
  "y",
  "scaleX",
  "scaleY",
  "rotation",
  "opacity",
  "width",
  "height",
  "radiusX",
  "radiusY",
] as const;
export const visualMaskSchema = z
  .object({
    type: z.enum(["rect", "ellipse", "path", "image"]),
    x: scalar.optional(),
    y: scalar.optional(),
    scaleX: scalar.optional(),
    scaleY: scalar.optional(),
    rotation: scalar.optional(),
    opacity: z.number().min(0).max(1).optional(),
    width: scalar.nonnegative().optional(),
    height: scalar.nonnegative().optional(),
    radiusX: scalar.nonnegative().optional(),
    radiusY: scalar.nonnegative().optional(),
    data: z.string().max(100000).optional(),
    assetId: id.optional(),
    invert: z.boolean().optional(),
  })
  .strict()
  .superRefine((m, ctx) => {
    const required =
      m.type === "rect" || m.type === "image"
        ? ["width", "height"]
        : m.type === "ellipse"
          ? ["radiusX", "radiusY"]
          : ["data"];
    if (m.type === "image") required.push("assetId");
    for (const key of required)
      if (m[key as keyof typeof m] === undefined)
        ctx.addIssue({ code: "custom", message: `Missing mask ${key}` });
  });
export type VisualMask = z.infer<typeof visualMaskSchema>;
const sceneMemberSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("actor"), actorId: id }).strict(),
  z.object({ kind: z.literal("visual"), nodeId: id }).strict(),
  z.object({ kind: z.enum(["background", "cg", "dialogue"]) }).strict(),
]);
export type SceneMember = z.infer<typeof sceneMemberSchema>;
export const particleProperties = [
  "x",
  "y",
  "scaleX",
  "scaleY",
  "rotation",
  "opacity",
] as const;
const particleSchema = z
  .object({
    id,
    birth: z.number().finite().min(0).max(300),
    lifetime: z.number().finite().positive().max(300),
    radius: scalar.nonnegative().optional(),
    assetId: id.optional(),
    width: scalar.positive().optional(),
    height: scalar.positive().optional(),
    fill: z.string().min(1).max(100).optional(),
    sampleRate: z.number().int().min(1).max(120),
    values: z.record(z.array(scalar).min(2).max(36001)),
  })
  .strict()
  .superRefine((p, ctx) => {
    if (
      p.assetId
        ? p.width === undefined || p.height === undefined
        : p.radius === undefined
    )
      ctx.addIssue({
        code: "custom",
        message: "Particle needs radius or image dimensions",
      });
    for (const [key, values] of Object.entries(p.values)) {
      if (
        !(particleProperties as readonly string[]).includes(key) ||
        values.length !== Math.ceil(p.lifetime * p.sampleRate) + 1
      )
        ctx.addIssue({ code: "custom", message: "Invalid particle samples" });
    }
  });
export type BakedParticle = z.infer<typeof particleSchema>;
export const visualProperties = [
  "x",
  "y",
  "scaleX",
  "scaleY",
  "rotation",
  "opacity",
  "width",
  "height",
  "radius",
  "radiusX",
  "radiusY",
  "strokeWidth",
  "offsetX",
  "offsetY",
  "fontSize",
  "blur",
] as const;
export type VisualProperty = (typeof visualProperties)[number];
const attributes = z
  .object({
    x: scalar.optional(),
    y: scalar.optional(),
    scaleX: scalar.optional(),
    scaleY: scalar.optional(),
    rotation: scalar.optional(),
    opacity: z.number().finite().min(0).max(1).optional(),
    width: scalar.nonnegative().optional(),
    height: scalar.nonnegative().optional(),
    radius: scalar.nonnegative().optional(),
    radiusX: scalar.nonnegative().optional(),
    radiusY: scalar.nonnegative().optional(),
    strokeWidth: scalar.nonnegative().optional(),
    offsetX: scalar.optional(),
    offsetY: scalar.optional(),
    fontSize: scalar.positive().optional(),
    blur: z.number().finite().min(0).max(30).optional(),
    fill: z.string().min(1).max(100).optional(),
    stroke: z.string().min(1).max(100).optional(),
    points: z
      .array(scalar)
      .min(4)
      .max(ANIMATION_BUDGET.points)
      .refine((v) => v.length % 2 === 0, "Points need x/y pairs")
      .optional(),
    closed: z.boolean().optional(),
    data: z.string().max(ANIMATION_BUDGET.path).optional(),
    text: z.string().max(5000).optional(),
    fontId: id.optional(),
    assetId: id.optional(),
    particles: z
      .array(particleSchema)
      .max(ANIMATION_BUDGET.particles)
      .optional(),
    order: z.number().int().min(-100000).max(100000).optional(),
    cameraFactor: z.number().min(0).max(1).optional(),
    bounds: boundsSchema.optional(),
    mask: visualMaskSchema.optional(),
    memberSpace: z.enum(["stage", "local"]).optional(),
    memberPlacement: z.enum(["overlay", "original"]).optional(),
    members: z.array(sceneMemberSchema).min(1).max(512).optional(),
    blendMode: z
      .enum(["normal", "add", "screen", "multiply", "source-atop"])
      .optional(),
    clip: z
      .object({
        x: scalar,
        y: scalar,
        width: scalar.nonnegative(),
        height: scalar.nonnegative(),
      })
      .strict()
      .optional(),
  })
  .strict();
export const visualNodeSchema = z
  .object({
    id,
    type: z.enum([
      "Group",
      "Rect",
      "Circle",
      "Ellipse",
      "Line",
      "Path",
      "Text",
      "Image",
      "Particles",
    ]),
    parentId: id.optional(),
    attrs: attributes,
  })
  .strict();
export type VisualNode = z.infer<typeof visualNodeSchema>;
export function usesVisualPrimitives(nodes: readonly VisualNode[]): boolean {
  return nodes.some((node) =>
    [
      "mask",
      "bounds",
      "cameraFactor",
      "members",
      "memberSpace",
      "memberPlacement",
      "order",
      "blendMode",
      "particles",
    ].some((key) => key in node.attrs),
  );
}
export const animationOverridesSchema = z
  .object({
    enabled: z.boolean().optional(),
    weight: z.number().finite().min(0).max(2).optional(),
    x: scalar.optional(),
    y: scalar.optional(),
    scale: z.number().finite().positive().max(100).optional(),
  })
  .strict();

const position = z.union([
  z
    .object({ scene: z.enum(["start", "storyEnd"]), offset: scalar.default(0) })
    .strict(),
  z.number().finite().min(0).max(36000),
  z.string().min(1).max(300),
  z
    .object({
      nodeId: id,
      edge: z.enum(["start", "end"]),
      offset: scalar.default(0),
    })
    .strict(),
]);
const values = z
  .record(scalar)
  .refine((v) => Object.keys(v).length > 0, "Numeric properties required");
const tweenVars = z.record(z.union([scalar, z.string().max(200), z.boolean()]));
const targetSchema = z
  .object({
    id,
    kind: z.enum(["actor", "camera", "visual", "mask"]),
    ref: id,
    initial: values,
  })
  .strict();
const operation = z.discriminatedUnion("method", [
  z
    .object({
      method: z.literal("label"),
      name: id,
      position: position.optional(),
    })
    .strict(),
  z
    .object({
      method: z.enum(["to", "from", "fromTo", "set"]),
      targets: z.array(id).min(1).max(512),
      vars: tweenVars,
      from: values.optional(),
      position: position.optional(),
    })
    .strict(),
]);
export const animationClipSchema = z
  .object({
    version: z.literal(2),
    sdkVersion: z.literal(2),
    capabilities: z.array(z.literal("visual-primitives-v1")).max(1).optional(),
    engineVersion: z.literal("3.15.0"),
    id,
    name: id,
    sceneId: id,
    width: z.number().int().positive().max(8192),
    height: z.number().int().positive().max(8192),
    start: z.number().finite().min(0).max(3600).default(0),
    duration: z.number().finite().positive().max(300).optional(),
    extendScene: z.boolean().default(false),
    endBehavior: z.enum(["restore", "hold"]).default("restore"),
    sampleRate: z.number().int().min(1).max(120).default(60),
    anchor: z
      .object({
        nodeId: id,
        edge: z.enum(["start", "end"]),
        offset: scalar.optional(),
      })
      .strict()
      .optional(),
    follow: z
      .object({ actorId: id, point: z.enum(["origin", "center"]) })
      .strict()
      .optional(),
    space: z.enum(["stage", "screen"]).default("stage"),
    layer: z.enum(["behindActors", "aboveActors"]).default("aboveActors"),
    seed: z.number().int().default(0),
    parameters: z
      .record(z.union([scalar, z.string().max(200), z.boolean()]))
      .default({}),
    parameterDefinitions: z
      .record(
        z.discriminatedUnion("type", [
          z
            .object({ type: z.literal("number"), min: scalar, max: scalar })
            .strict(),
          z.object({ type: z.literal("color") }).strict(),
          z.object({ type: z.literal("boolean") }).strict(),
          z
            .object({
              type: z.literal("enum"),
              values: z.array(z.string().max(200)).min(1).max(100),
            })
            .strict(),
        ]),
      )
      .default({}),
    nodes: z.array(visualNodeSchema).max(ANIMATION_BUDGET.nodes),
    targets: z.array(targetSchema).max(512),
    timelines: z
      .array(
        z
          .object({
            id,
            defaults: tweenVars.default({}),
            operations: z.array(operation).max(4096),
          })
          .strict(),
      )
      .max(128),
    samples: z
      .array(
        z
          .object({
            targetId: id,
            start: z.number().finite().nonnegative(),
            position: position.optional(),
            duration: z.number().finite().positive().max(300),
            sampleRate: z.number().int().min(1).max(120),
            values: z.record(z.array(scalar).min(2).max(36001)),
            interpolation: z.enum(["linear", "step"]).default("linear"),
          })
          .strict(),
      )
      .max(4096)
      .default([]),
    bindings: z
      .array(
        z
          .object({
            query: z.enum(["width", "height", "cueDuration", "parameter"]),
            nodeId: id.optional(),
            value: z.union([scalar, z.string().max(200), z.boolean()]),
            key: id.optional(),
          })
          .strict(),
      )
      .default([]),
    source: z.string().max(ANIMATION_BUDGET.source),
    sourceDigest: z.string().regex(/^[a-f0-9]{64}$/),
    overrides: animationOverridesSchema.optional(),
  })
  .strict()
  .superRefine((clip, ctx) => {
    const fail = (message: string) =>
      ctx.addIssue({ code: z.ZodIssueCode.custom, message });
    for (const [key, def] of Object.entries(clip.parameterDefinitions)) {
      const v = clip.parameters[key];
      if (
        def.type === "number" &&
        (typeof v !== "number" ||
          def.min > def.max ||
          v < def.min ||
          v > def.max)
      )
        fail(`Invalid parameter ${key}`);
      if (def.type === "boolean" && typeof v !== "boolean")
        fail(`Invalid parameter ${key}`);
      if (
        def.type === "color" &&
        (typeof v !== "string" || !/^#[0-9a-f]{6}$/i.test(v))
      )
        fail(`Invalid parameter ${key}`);
      if (
        def.type === "enum" &&
        (typeof v !== "string" || !def.values.includes(v))
      )
        fail(`Invalid parameter ${key}`);
    }
    const ids = new Set<string>();
    const nodes = new Map(clip.nodes.map((n) => [n.id, n]));
    if (nodes.size !== clip.nodes.length) fail("Duplicate node ID");
    for (const node of clip.nodes) {
      if (
        node.parentId &&
        (node.parentId === node.id ||
          nodes.get(node.parentId)?.type !== "Group")
      )
        fail("Invalid visual parent");
      const path = new Set<string>();
      let current: VisualNode | undefined = node;
      while (current?.parentId) {
        if (path.has(current.id)) {
          fail("Visual parent cycles");
          break;
        }
        path.add(current.id);
        current = nodes.get(current.parentId);
      }
      const common = [
        "x",
        "y",
        "scaleX",
        "scaleY",
        "rotation",
        "opacity",
        "offsetX",
        "offsetY",
        "fill",
        "stroke",
        "strokeWidth",
        "order",
        "blendMode",
      ];
      const byType: Record<string, string[]> = {
        Group: [
          "clip",
          "bounds",
          "mask",
          "cameraFactor",
          "members",
          "memberSpace",
          "memberPlacement",
          "blur",
        ],
        Rect: ["width", "height"],
        Circle: ["radius"],
        Ellipse: ["radiusX", "radiusY"],
        Line: ["points", "closed"],
        Path: ["data"],
        Text: ["text", "fontSize", "fontId", "width", "height"],
        Image: ["assetId", "width", "height"],
        Particles: ["particles"],
      };
      for (const key of Object.keys(node.attrs))
        if (![...common, ...byType[node.type]].includes(key))
          fail(`Unsupported ${node.type} property ${key}`);
      if (
        (node.attrs.blur !== undefined ||
          node.attrs.mask ||
          node.attrs.members ||
          (node.type === "Group" &&
            node.attrs.blendMode &&
            node.attrs.blendMode !== "normal")) &&
        !node.attrs.bounds
      )
        fail("Composited Group requires bounds");
      if (
        node.attrs.memberSpace === "local" &&
        (node.attrs.members?.length !== 1 ||
          node.attrs.members[0].kind !== "actor")
      )
        fail("Local member space requires one actor");
      if (
        node.attrs.memberPlacement === "original" &&
        (node.parentId ||
          node.attrs.memberSpace === "local" ||
          node.attrs.cameraFactor !== undefined ||
          node.attrs.members?.filter((m) => m.kind !== "visual").length !== 1 ||
          !node.attrs.members.some((m) => m.kind === "actor"))
      )
        fail(
          "Original placement requires a root stage Group with one actor and optional visual members",
        );
      if (node.attrs.clip && node.attrs.mask) fail("Choose clip or mask");
      if (node.parentId && node.attrs.cameraFactor !== undefined)
        fail("cameraFactor requires a root Group");
      const required: Record<string, string[]> = {
        Rect: ["width", "height"],
        Circle: ["radius"],
        Ellipse: ["radiusX", "radiusY"],
        Line: ["points"],
        Path: ["data"],
        Text: ["text"],
        Image: ["assetId", "width", "height"],
        Particles: ["particles"],
      };
      for (const field of required[node.type] ?? [])
        if (!(field in node.attrs)) fail(`Missing ${node.type} ${field}`);
    }
    const compositePixels = clip.nodes.reduce(
      (sum, n) =>
        sum +
        (n.attrs.bounds
          ? Math.ceil(n.attrs.bounds.width) * Math.ceil(n.attrs.bounds.height)
          : 0),
      0,
    );
    if (compositePixels > ANIMATION_BUDGET.compositePixels)
      fail(
        `Composite pixel count ${compositePixels} exceeds ${ANIMATION_BUDGET.compositePixels}`,
      );
    const members = new Set<string>();
    for (const node of clip.nodes)
      for (const member of node.attrs.members ?? []) {
        const key = JSON.stringify(member);
        if (members.has(key)) fail("Duplicate scene member");
        members.add(key);
        if (
          member.kind === "visual" &&
          (!nodes.has(member.nodeId) ||
            member.nodeId === node.id ||
            nodes.get(member.nodeId)?.parentId)
        )
          fail("Scene visual member must be a different root node");
        if (member.kind === "visual") {
          if (nodes.get(member.nodeId)?.attrs.memberPlacement === "original")
            fail("Original placement cannot be nested as a visual member");
          const visited = new Set<string>([node.id]);
          const visit = (ref: string) => {
            if (visited.has(ref)) {
              fail("Scene member cycle");
              return;
            }
            visited.add(ref);
            for (const child of clip.nodes.filter((n) => n.parentId === ref))
              visit(child.id);
            for (const m of nodes.get(ref)?.attrs.members ?? [])
              if (m.kind === "visual") visit(m.nodeId);
            visited.delete(ref);
          };
          visit(member.nodeId);
        }
      }
    const usesPrimitives = usesVisualPrimitives(clip.nodes);
    if (usesPrimitives && !clip.capabilities?.includes("visual-primitives-v1"))
      fail("Missing visual-primitives-v1 capability");
    const targetRefs = new Set<string>();
    for (const target of clip.targets) {
      const refKey = `${target.kind}:${target.ref}`;
      if (targetRefs.has(refKey)) fail("Duplicate target reference");
      targetRefs.add(refKey);
      if (ids.has(target.id)) fail("Duplicate target ID");
      ids.add(target.id);
      if (
        (target.kind === "visual" || target.kind === "mask") &&
        !nodes.has(target.ref)
      )
        fail("Unknown visual target");
      if (target.kind === "mask" && !nodes.get(target.ref)?.attrs.mask)
        fail("Missing target mask");
      const allowed =
        target.kind === "mask"
          ? maskProperties
          : target.kind === "visual"
            ? visualProperties
            : target.kind === "camera"
              ? ["x", "y", "scale"]
              : [
                  "x",
                  "y",
                  "scale",
                  "rotation",
                  "opacity",
                  "brightness",
                  "blur",
                ];
      for (const key of Object.keys(target.initial))
        if (!allowed.includes(key as never))
          fail(`Unsupported target property ${key}`);
    }
    const tweenControls = [
      "duration",
      "delay",
      "ease",
      "repeat",
      "repeatDelay",
      "yoyo",
      "stagger",
      "immediateRender",
    ];
    const timelineIds = new Set<string>();
    for (const tl of clip.timelines) {
      if (timelineIds.has(tl.id)) fail("Duplicate timeline ID");
      timelineIds.add(tl.id);
      for (const key of Object.keys(tl.defaults))
        if (!tweenControls.includes(key))
          fail(`Unsupported GSAP default ${key}`);
      for (const op of tl.operations) {
        if (op.method === "label") {
          if (op.name.startsWith("line:") || op.name.startsWith("scene:"))
            fail("Reserved timeline label");
          continue;
        }
        for (const [key, value] of Object.entries(op.vars))
          if (
            typeof value === "string" &&
            key !== "ease" &&
            !/^[+-]=[-+]?\d+(?:\.\d+)?$/.test(value)
          )
            fail(`Unsupported GSAP string value for ${key}`);
        for (const tid of op.targets) {
          const t = clip.targets.find((t) => t.id === tid);
          if (!t) {
            fail("Unknown animation target");
            continue;
          }
          for (const key of [
            ...Object.keys(op.vars),
            ...Object.keys(op.from ?? {}),
          ])
            if (!tweenControls.includes(key) && !(key in t.initial))
              fail(`Initialize GSAP target property ${key}`);
        }
        for (const key of ["duration", "delay", "repeatDelay", "stagger"])
          if (
            key in op.vars &&
            (typeof op.vars[key] !== "number" || Number(op.vars[key]) < 0)
          )
            fail(`Invalid ${key}`);
        if (
          "repeat" in op.vars &&
          (typeof op.vars.repeat !== "number" ||
            Number(op.vars.repeat) < 0 ||
            !Number.isInteger(op.vars.repeat) ||
            Number(op.vars.repeat) > 1000)
        )
          fail("Use finite integer repeats");
      }
    }
    const particles = clip.nodes.flatMap((n) => n.attrs.particles ?? []);
    if (particles.length > ANIMATION_BUDGET.particles)
      fail(
        `Particle count ${particles.length} exceeds ${ANIMATION_BUDGET.particles}`,
      );
    for (const n of clip.nodes)
      if (
        new Set(n.attrs.particles?.map((p) => p.id)).size !==
        (n.attrs.particles?.length ?? 0)
      )
        fail("Duplicate particle ID");
    const edges = particles
      .flatMap((p) => [
        { time: p.birth, delta: 1 },
        { time: p.birth + p.lifetime, delta: -1 },
      ])
      .sort((a, b) => a.time - b.time || a.delta - b.delta);
    let active = 0;
    for (const e of edges) {
      active += e.delta;
      if (active > ANIMATION_BUDGET.activeParticles) {
        fail(`Active particles exceed ${ANIMATION_BUDGET.activeParticles}`);
        break;
      }
    }
    let count = particles.reduce(
      (n, p) => n + Object.values(p.values).reduce((n, v) => n + v.length, 0),
      0,
    );
    for (const sample of clip.samples) {
      const target = clip.targets.find((t) => t.id === sample.targetId);
      if (!target) fail("Unknown sample target");
      for (const [key, list] of Object.entries(sample.values)) {
        if (!target || !(key in target.initial))
          fail("Unknown sample property");
        if (list.length !== Math.ceil(sample.duration * sample.sampleRate) + 1)
          fail("Invalid sample count");
        count += list.length;
      }
    }
    if (count > ANIMATION_BUDGET.samples)
      fail("Animation sample budget exceeded");
  });
export type AnimationClip = z.infer<typeof animationClipSchema>;
export type AnimationTarget = AnimationClip["targets"][number];
export type AnimationPosition = NonNullable<
  AnimationClip["timelines"][number]["operations"][number]["position"]
>;
export interface CompiledAnimation extends AnimationClip {
  resolvedDuration: number;
  tracks: Array<{
    targetId: string;
    property: string;
    times: number[];
    values: number[];
    interpolation: "linear" | "step";
  }>;
}
