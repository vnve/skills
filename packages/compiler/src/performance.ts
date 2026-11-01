import {
  animationClipSchema,
  type AnimationClip,
  type VisualNode,
  type Scene,
  type PerformanceEvent,
  type Project,
  type SceneMember,
} from "@vnve/core";
/** Trusted built-in directions emit the same data as the free authoring SDK. */
export function buildPerformance(
  event: PerformanceEvent,
  scene: Pick<Scene, "id" | "actors">,
  width = 1920,
  height = 1080,
  assets?: Project["assets"],
): AnimationClip {
  const { name, values: p } = event.params,
    dur = event.dur;
  if (name === "wipe") throw new Error("wipe is a scene-end transition");
  const nodes: VisualNode[] = [],
    targets: AnimationClip["targets"] = [],
    operations: AnimationClip["timelines"][number]["operations"] = [];
  const bounds = { x: 0, y: 0, width, height },
    accent = String(p.accent ?? "#a44a42");
  const node = (
    type: VisualNode["type"],
    id: string,
    attrs: VisualNode["attrs"],
    parentId?: string,
  ) => {
    const n = { type, id, attrs, parentId };
    nodes.push(n);
    return n;
  };
  const group = (
    id: string,
    attrs: VisualNode["attrs"] = {},
    parentId?: string,
  ) => node("Group", id, attrs, parentId);
  const rect = (
    id: string,
    x: number,
    y: number,
    w: number,
    h: number,
    fill: string,
    parentId?: string,
    opacity = 1,
  ) => node("Rect", id, { x, y, width: w, height: h, fill, opacity }, parentId);
  const text = (
    id: string,
    value: unknown,
    x: number,
    y: number,
    size: number,
    parentId?: string,
    fill = "#eee9df",
  ) =>
    node(
      "Text",
      id,
      {
        x,
        y,
        fontSize: size,
        text: String(value ?? ""),
        fill,
        width: width * 0.88,
      },
      parentId,
    );
  const image = (
    id: string,
    assetId: string,
    x: number,
    y: number,
    w: number,
    h: number,
    parentId?: string,
  ) => node("Image", id, { assetId, x, y, width: w, height: h }, parentId);
  const tween = (
    n: VisualNode,
    from: Record<string, number>,
    to: Record<string, number>,
    at: number,
    length: number,
    kind: "visual" | "mask" = "visual",
    ease = "power2.out",
  ) => {
    const id = `${kind}:${n.id}`;
    let target = targets.find((t) => t.id === id);
    if (!target) {
      target = { id, ref: n.id, kind, initial: {} };
      targets.push(target);
    }
    for (const [k, v] of Object.entries(from))
      if (!(k in target.initial)) {
        target.initial[k] = v;
        if (kind === "visual") (n.attrs as Record<string, unknown>)[k] = v;
        else (n.attrs.mask as unknown as Record<string, unknown>)[k] = v;
      }
    operations.push({
      method: "fromTo",
      targets: [id],
      from,
      vars: { ...to, duration: dur * length, ease },
      position: dur * at,
    });
  };
  const person = (
    id: string,
    actorId: string,
    parentId?: string,
    attrs: VisualNode["attrs"] = {},
  ) => {
    if (!scene.actors.some((a) => a.id === actorId))
      throw new Error(`Unknown ${name} actor '${actorId}'`);
    return group(
      id,
      { bounds, members: [{ kind: "actor", actorId }], ...attrs },
      parentId,
    );
  };
  const sceneMembers: Array<{ key: string; member: SceneMember }> = [
    { key: "$background", member: { kind: "background" } },
    ...[...scene.actors]
      .sort((a, b) => a.zIndex - b.zIndex)
      .map((a) => ({
        key: a.id,
        member: { kind: "actor" as const, actorId: a.id },
      })),
    { key: "$cg", member: { kind: "cg" } },
  ];
  if (name === "parallax" || name === "rackfocus") {
    const dx =
        (Number(p.moveX ?? (name === "rackfocus" ? 0 : 3)) / 100) * width,
      dy = (Number(p.moveY ?? 0) / 100) * height,
      zoom = Number(p.zoom ?? (name === "rackfocus" ? 1 : 1.04));
    const animate = (layer: VisualNode, depth: number, cover = false) => {
      const extra = cover
        ? 2 * Math.max(Math.abs(dx) / width, Math.abs(dy) / height) * depth
        : 0;
      const scale = 1 + (zoom - 1) * depth + extra;
      const x = dx * depth - (width * (scale - 1)) / 2,
        y = dy * depth - (height * (scale - 1)) / 2;
      tween(
        layer,
        { x: 0, y: 0, scaleX: 1, scaleY: 1 },
        { x, y, scaleX: scale, scaleY: scale },
        0,
        0.55,
        "visual",
        "sine.inOut",
      );
      tween(
        layer,
        { x, y, scaleX: scale, scaleY: scale },
        { x: 0, y: 0, scaleX: 1, scaleY: 1 },
        0.65,
        0.35,
        "visual",
        "sine.inOut",
      );
    };
    for (const { key, member } of sceneMembers) {
      const layer = group(`depth-${key}`, { bounds, members: [member] });
      animate(
        layer,
        Number(
          member.kind === "actor"
            ? (p.actorDepth ?? 0.6)
            : (p.backgroundDepth ?? 0.2),
        ),
        member.kind !== "actor",
      );
      if (name === "rackfocus") {
        const from = String(p.fromTarget ?? "$background"),
          to = String(p.toTarget),
          blur = Number(p.blur ?? 12);
        const start = key === from ? 0 : blur,
          end = key === to ? 0 : blur;
        layer.attrs.blur = start;
        tween(
          layer,
          { blur: start },
          { blur: end },
          0.22,
          0.42,
          "visual",
          "sine.inOut",
        );
        tween(
          layer,
          { blur: end },
          { blur: 0 },
          0.8,
          0.2,
          "visual",
          "sine.inOut",
        );
      }
    }
    if (p.foreground) {
      const front = group("foreground", { bounds });
      const media = assets
        ? Object.values(assets.visual)
            .flat()
            .flatMap((g) => g.variants)
            .find((v) => v.id === p.foreground)
        : undefined;
      const ratio =
        media?.width && media?.height
          ? media.width / media.height
          : width / height;
      const w = Math.max(width, height * ratio),
        h = w / ratio;
      image(
        "foreground-image",
        String(p.foreground),
        (width - w) / 2,
        (height - h) / 2,
        w,
        h,
        front.id,
      );
      animate(front, Number(p.foregroundDepth ?? 1), true);
      tween(front, { opacity: 0 }, { opacity: 1 }, 0, 0.12);
      tween(front, { opacity: 1 }, { opacity: 0 }, 0.88, 0.12);
    }
  } else if (name === "comic") {
    rect("dim", 0, 0, width, height, "#0b0d12", undefined, 0.55);
    const sign = p.direction === "right" ? -1 : 1;
    const panel = group("panel", {
      bounds,
      mask: {
        type: "path",
        data: `M 0 ${height * 0.32} L ${width} ${height * 0.14} L ${width} ${height * 0.66} L 0 ${height * 0.84} Z`,
      },
    });
    rect("paper", 0, 0, width, height, "#ddd7c5", panel.id);
    const a = scene.actors.find((a) => a.id === p.actor)!;
    const k = 2.2;
    person("portrait", String(p.actor), panel.id, {
      scaleX: k,
      scaleY: k,
      x: width * 0.5 - (a.x / 100) * width * k,
      y: height * 0.43 - ((a.y / 100) * height - height * 0.67 * a.scale) * k,
    });
    tween(panel, { x: sign * width }, { x: 0 }, 0, 0.12);
    if (p.text) {
      rect(
        "text-band",
        width * 0.56,
        height * 0.72,
        width * 0.4,
        height * 0.17,
        accent,
      );
      const t = text(
        "emphasis",
        p.text,
        width * 0.59,
        height * 0.75,
        Math.min(
          height * 0.075,
          (width * 0.34) / Math.max(1, Array.from(String(p.text)).length),
        ),
      );
      tween(
        t,
        { opacity: 0, x: width * 0.65 },
        { opacity: 1, x: width * 0.59 },
        0.18,
        0.12,
      );
    }
  } else if (name === "introduce") {
    rect("paper", 0, 0, width, height, "#e5dfce");
    node("Path", "stripe", {
      data: `M ${width * 0.68} 0 L ${width} 0 L ${width} ${height} L ${width * 0.47} ${height} Z`,
      fill: accent,
    });
    const a = scene.actors.find((a) => a.id === p.actor)!;
    const hero = person("portrait", String(p.actor), undefined, {
      x: width * 0.68 - (a.x / 100) * width,
    });
    tween(
      hero,
      { x: hero.attrs.x! + (p.direction === "right" ? -width : width) },
      { x: hero.attrs.x! },
      0,
      0.15,
    );
    const title = group("title", {
      bounds: { x: 0, y: 0, width: width * 0.6, height },
      mask: { type: "rect", width: 0, height },
    });
    text(
      "name",
      p.title,
      width * 0.06,
      height * 0.34,
      Math.min(
        height * 0.15,
        (width * 0.47) / Math.max(1, Array.from(String(p.title)).length),
      ),
      title.id,
      "#202c30",
    );
    rect(
      "rule",
      width * 0.06,
      height * 0.55,
      width * 0.35,
      height * 0.008,
      accent,
      title.id,
    );
    if (p.subtitle)
      text(
        "subtitle",
        p.subtitle,
        width * 0.06,
        height * 0.62,
        Math.min(
          height * 0.04,
          (width * 0.48) / Math.max(1, Array.from(String(p.subtitle)).length),
        ),
        title.id,
        "#364144",
      );
    tween(title, { width: 0 }, { width: width * 0.6 }, 0.16, 0.25, "mask");
  } else if (name === "duel") {
    const split = Number(p.split ?? 0.5),
      pressure = Number(p.pressure ?? 0),
      edge = width * split,
      slope = width * 0.08;
    const left = group("left", {
      bounds,
      mask: {
        type: "path",
        data: `M ${-width} 0 L ${edge + slope} 0 L ${edge - slope} ${height} L ${-width} ${height} Z`,
      },
    });
    rect("left-bg", 0, 0, width, height, "#263440", left.id, 0.9);
    const a = scene.actors.find((a) => a.id === p.actor)!;
    person("left-person", String(p.actor), left.id, {
      x: width * 0.25 - (a.x / 100) * width,
    });
    const right = group("right", {
      bounds,
      mask: {
        type: "path",
        data: `M ${edge + slope} 0 L ${width * 2} 0 L ${width * 2} ${height} L ${edge - slope} ${height} Z`,
      },
    });
    rect("right-bg", 0, 0, width, height, accent, right.id, 0.75);
    const b = scene.actors.find((a) => a.id === p.other)!;
    person("right-person", String(p.other), right.id, {
      x: width * 0.75 - (b.x / 100) * width,
    });
    const divider = node("Line", "divider", {
      points: [edge + slope, 0, edge - slope, height],
      stroke: "#e4dcc9",
      strokeWidth: width * 0.004,
    });
    for (const n of [left, right])
      tween(
        n,
        { x: 0 },
        { x: pressure * width },
        0.35,
        0.4,
        "mask",
        "sine.inOut",
      );
    tween(
      divider,
      { x: 0 },
      { x: pressure * width },
      0.35,
      0.4,
      "visual",
      "sine.inOut",
    );
    if (p.text)
      text("first", p.text, width * 0.05, height * 0.83, height * 0.045);
    if (p.reply) {
      const reply = text(
        "reply",
        p.reply,
        width * 0.55,
        height * 0.76,
        height * 0.04,
      );
      tween(reply, { opacity: 0 }, { opacity: 1 }, 0.35, 0.15);
    }
  } else if (name === "memory") {
    const images = p.images as string[],
      count = images.length,
      columns = Math.min(3, count),
      rows = Math.ceil(count / columns);
    rect("backdrop", 0, 0, width, height, "#11151b", undefined, 0.88);
    images.forEach((asset, i) => {
      const w = (width * 0.82) / columns,
        h = (height * 0.64) / rows,
        x = width * 0.08 + (i % columns) * ((width * 0.86) / columns),
        y = height * 0.12 + (Math.floor(i / columns) * height * 0.7) / rows;
      const card = group(`card-${i}`, {
        clip: { x: 0, y: 0, width: w, height: h },
        x,
        y,
        rotation: (i % 2 ? 1 : -1) * 4,
      });
      const media = assets
        ? Object.values(assets.visual)
            .flat()
            .flatMap((g) => g.variants)
            .find((v) => v.id === asset)
        : undefined;
      const aspect =
        media?.width && media?.height ? media.width / media.height : 16 / 9;
      const iw = Math.max(w, h * aspect),
        ih = iw / aspect;
      image(`image-${i}`, asset, (w - iw) / 2, (h - ih) / 2, iw, ih, card.id);
      tween(
        card,
        {
          x: x + (i % 2 ? -1 : 1) * width * 0.3,
          y: y + height * 0.1,
          opacity: 0,
          rotation: (i % 2 ? 1 : -1) * 8,
          scaleX: 1,
          scaleY: 1,
        },
        { x, y, opacity: 1, rotation: (i % 2 ? 1 : -1) * 4 },
        (i * 0.3) / count,
        0.18,
      );
      tween(
        card,
        {
          x,
          y,
          opacity: 1,
          rotation: (i % 2 ? 1 : -1) * 4,
          scaleX: 1,
          scaleY: 1,
        },
        {
          x: width * 0.5 - w / 2,
          y: height * 0.25,
          opacity: 0,
          rotation: 0,
          scaleX: 1.2,
          scaleY: 1.2,
        },
        0.65,
        0.18,
      );
    });
    const final = image("complete", images[count - 1], 0, 0, width, height);
    tween(final, { opacity: 0 }, { opacity: 1 }, 0.65, 0.22);
    if (p.caption) {
      const caption = text(
        "caption",
        p.caption,
        width * 0.06,
        height * 0.84,
        height * 0.05,
      );
      tween(caption, { opacity: 0 }, { opacity: 1 }, 0.83, 0.12);
    }
  } else if (name === "awake") {
    const people = scene.actors.map((a) => a.id);
    if (p.actor && !people.includes(String(p.actor)))
      throw new Error(`Unknown awake actor '${p.actor}'`);
    for (const id of people)
      if (!scene.actors.some((a) => a.id === id))
        throw new Error(`Unknown awake actor '${id}'`);
    const view = group("view", {
      bounds,
      mask: {
        type: "ellipse",
        x: width * 0.5,
        y: height * 0.5,
        radiusX: width * 0.62,
        radiusY: 0,
      },
    });
    const content = group(
      "content",
      {
        bounds,
        blur: Number(p.blur ?? 18),
        members: sceneMembers.map((m) => m.member),
      },
      view.id,
    );
    if (p.blinks !== 1) {
      tween(
        view,
        { radiusY: 0 },
        { radiusY: height * 0.07 },
        0.05,
        0.12,
        "mask",
        "sine.inOut",
      );
      tween(
        view,
        { radiusY: height * 0.07 },
        { radiusY: 0 },
        0.19,
        0.05,
        "mask",
      );
    }
    tween(
      view,
      { radiusY: 0 },
      { radiusY: height * 0.22 },
      0.28,
      0.2,
      "mask",
      "sine.inOut",
    );
    tween(
      view,
      { radiusY: height * 0.22, radiusX: width * 0.62 },
      { radiusY: height, radiusX: width * 0.85 },
      0.51,
      0.21,
      "mask",
    );
    tween(
      content,
      { blur: Number(p.blur ?? 18) },
      { blur: 0 },
      0.31,
      0.44,
      "visual",
      "sine.inOut",
    );
  }
  return animationClipSchema.parse({
    version: 2,
    sdkVersion: 2,
    capabilities: ["visual-primitives-v1"],
    engineVersion: "3.15.0",
    id: `builtin:${name}`,
    name,
    sceneId: scene.id,
    width,
    height,
    space: "screen",
    layer: "aboveActors",
    duration: dur,
    nodes,
    targets,
    timelines: [{ id: "builtin", defaults: {}, operations }],
    samples: [],
    bindings: [],
    source: "",
    sourceDigest:
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  });
}
