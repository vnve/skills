import { drawParticles } from "./particle-drawing";
import { blendOperation, compositeGroup } from "./visual-compositing";
import Konva from "konva";
import type { VisualNode } from "@vnve/core";
import type { VisualRenderState } from "@vnve/runtime";
/** Adapter owns real Konva nodes; authored callbacks never reach this interface. */
export class VisualNodes {
  private roots = new Map<
    string,
    {
      root: Konva.Group;
      nodes: Map<string, Konva.Group | Konva.Shape>;
      signature: string;
    }
  >();
  constructor(
    private behind: Konva.Group,
    private above: Konva.Group,
  ) {}
  private frameWidth = 1;
  private frameHeight = 1;
  private parentOrders = new Map<Konva.Container, Konva.Node[]>();
  private moved: Array<{
    node: Konva.Node;
    parent: Konva.Container;
    attrs: Record<string, unknown>;
  }> = [];
  restore() {
    for (const entry of this.moved) {
      entry.node.moveTo(entry.parent);
      entry.node.setAttrs(entry.attrs);
    }
    for (const [parent, children] of this.parentOrders)
      children
        .filter((n) => n.getParent() === parent)
        .forEach((node, index) => node.zIndex(index));
    this.parentOrders.clear();
    this.moved = [];
  }
  compose(
    visuals: VisualRenderState[],
    resolve: (member: import("@vnve/core").SceneMember) => Konva.Node[],
    images?: Map<string, CanvasImageSource>,
  ) {
    for (const visual of visuals) {
      const entry = this.roots.get(visual.id)!;
      const attached = new Set<string>();
      const attach = (node: VisualNode, visited = new Set<string>()) => {
        if (attached.has(node.id)) return;
        attached.add(node.id);
        if (visited.has(node.id)) throw new Error("Scene composition cycle");
        visited.add(node.id);
        const group = entry.nodes.get(node.id) as Konva.Group;
        let subjectBasis: Konva.Transform | undefined;
        if (node.attrs.memberSpace === "local") {
          const subject = resolve(node.attrs.members![0]).at(-1);
          if (subject) {
            subjectBasis = subject
              .getAbsoluteTransform()
              .copy()
              .scale(
                this.frameWidth / visual.width,
                this.frameHeight / visual.height,
              );
            const transform = entry.root
              .getAbsoluteTransform()
              .copy()
              .invert()
              .multiply(subjectBasis)
              .multiply(group.getTransform());
            group.setAttrs({
              ...transform.decompose(),
              offsetX: 0,
              offsetY: 0,
            });
          }
        }
        if (node.attrs.memberPlacement === "original") {
          const member = node.attrs.members!.find((m) => m.kind === "actor")!;
          const originals = resolve(member),
            parent = originals[0]?.getParent();
          if (parent) {
            const index = Math.min(...originals.map((n) => n.zIndex()));
            const transform = parent
              .getAbsoluteTransform()
              .copy()
              .invert()
              .multiply(group.getAbsoluteTransform());
            if (!this.parentOrders.has(parent))
              this.parentOrders.set(parent, [...parent.getChildren()]);
            this.moved.push({
              node: group,
              parent: group.getParent()!,
              attrs: { ...group.getAttrs() },
            });
            group.moveTo(parent);
            group.setAttrs({
              ...transform.decompose(),
              offsetX: 0,
              offsetY: 0,
            });
            group.zIndex(index);
          }
        }
        for (const member of node.attrs.members ?? []) {
          const source =
            member.kind === "visual"
              ? entry.nodes.get(member.nodeId)
              : undefined;
          if (member.kind === "visual") {
            const child = visual.nodes.find((n) => n.id === member.nodeId)!;
            attach(child, new Set(visited));
          }
          for (const target of source ? [source] : resolve(member)) {
            const parent = target.getParent();
            if (!parent) continue;
            const transform = (
              subjectBasis ?? entry.root.getAbsoluteTransform()
            )
              .copy()
              .invert()
              .multiply(target.getAbsoluteTransform());
            if (!this.parentOrders.has(parent))
              this.parentOrders.set(parent, [...parent.getChildren()]);
            this.moved.push({
              node: target,
              parent,
              attrs: {
                x: target.x(),
                y: target.y(),
                scaleX: target.scaleX(),
                scaleY: target.scaleY(),
                rotation: target.rotation(),
                skewX: target.skewX(),
                skewY: target.skewY(),
                offsetX: target.offsetX(),
                offsetY: target.offsetY(),
              },
            });
            target.moveTo(group);
            target.setAttrs({
              ...transform.decompose(),
              offsetX: 0,
              offsetY: 0,
            });
          }
        }
      };
      for (const node of visual.nodes) if (node.attrs.members) attach(node);
      // Cache leaves before parents, including explicit visual-member dependencies.
      const done = new Set<string>();
      const finish = (node: VisualNode) => {
        if (done.has(node.id)) return;
        done.add(node.id);
        for (const child of visual.nodes.filter((n) => n.parentId === node.id))
          finish(child);
        for (const member of node.attrs.members ?? [])
          if (member.kind === "visual")
            finish(visual.nodes.find((n) => n.id === member.nodeId)!);
        if (node.type === "Group")
          compositeGroup(
            entry.nodes.get(node.id) as Konva.Group,
            node.attrs,
            images,
          );
      };
      visual.nodes.forEach(finish);
    }
  }
  update(
    visuals: VisualRenderState[],
    width: number,
    height: number,
    camera: Konva.Transform,
    images?: Map<string, CanvasImageSource>,
    fonts?: Map<string, string>,
    speakerBoost?: { actorId: string; scale: number },
  ) {
    this.frameWidth = width;
    this.frameHeight = height;
    const active = new Set(visuals.map((v) => v.id));
    for (const [id, entry] of this.roots)
      if (!active.has(id)) {
        entry.root.destroy();
        this.roots.delete(id);
      }
    for (const visual of visuals) {
      const signature = JSON.stringify(
        visual.nodes.map((n) => [n.id, n.type, n.parentId]),
      );
      let entry = this.roots.get(visual.id);
      if (entry?.signature !== signature) {
        entry?.root.destroy();
        entry = undefined;
      }
      if (!entry) {
        const root = new Konva.Group({ listening: false });
        entry = { root, nodes: new Map(), signature };
        this.roots.set(visual.id, entry);
        for (const node of visual.nodes) {
          const constructors: Record<
            VisualNode["type"],
            () => Konva.Group | Konva.Shape
          > = {
            Group: () => new Konva.Group(),
            Rect: () => new Konva.Rect(),
            Circle: () => new Konva.Circle(),
            Ellipse: () => new Konva.Ellipse({ radiusX: 0, radiusY: 0 }),
            Line: () => new Konva.Line(),
            Path: () => new Konva.Path(),
            Text: () => new Konva.Text(),
            Image: () => new Konva.Image({ image: undefined }),
            Particles: () => new Konva.Shape(),
          };
          entry.nodes.set(node.id, constructors[node.type]());
        }
        for (const node of visual.nodes)
          (node.parentId
            ? (entry.nodes.get(node.parentId) as Konva.Group)
            : root
          ).add(entry.nodes.get(node.id)!);
      }
      const parent = visual.layer === "behindActors" ? this.behind : this.above;
      if (entry.root.parent !== parent) entry.root.moveTo(parent);
      const transform =
        visual.space === "screen"
          ? camera.copy().invert()
          : new Konva.Transform();
      if (visual.anchor) {
        const anchor = visual.anchor,
          angle = (anchor.rotation * Math.PI) / 180;
        const offset =
          anchor.centerOffset *
          height *
          (speakerBoost?.actorId === anchor.actorId ? speakerBoost.scale : 1);
        const point = {
          x: anchor.x * width - Math.sin(angle) * offset,
          y: anchor.y * height + Math.cos(angle) * offset,
        };
        const projected =
          visual.space === "screen" ? camera.point(point) : point;
        transform.translate(projected.x, projected.y);
      }
      transform.scale(width / visual.width, height / visual.height);
      transform.translate(visual.x, visual.y);
      transform.scale(visual.scale, visual.scale);
      const attrs = transform.decompose();
      entry.root.setAttrs({ ...attrs, listening: false });
      for (const node of visual.nodes) {
        const target = entry.nodes.get(node.id)!;
        target.clearCache();
        if (target instanceof Konva.Group)
          target
            .getChildren((n) => n.hasName("visual-mask"))
            .forEach((n) => n.destroy());
        this.updateNode(target, node, images, fonts);
        if (node.type === "Particles")
          (target as Konva.Shape).sceneFunc((context) => {
            drawParticles(
              (context as unknown as { _context: CanvasRenderingContext2D })
                ._context,
              node.attrs.particles ?? [],
              visual.localTime ?? 0,
              images,
            );
          });
        if (node.attrs.cameraFactor !== undefined) {
          const factor = node.attrs.cameraFactor;
          const c = camera.decompose();
          const desired = new Konva.Transform()
            .translate(c.x * factor, c.y * factor)
            .scale(c.scaleX ** factor, c.scaleY ** factor);

          // Root already contains the stage/screen correction and reference-canvas scale.
          const reference = entry.root.getTransform();
          const base =
            visual.space === "screen"
              ? camera.copy().multiply(reference)
              : reference;
          const local = camera
            .copy()
            .multiply(reference)
            .invert()
            .multiply(desired)
            .multiply(base)
            .multiply(target.getTransform());
          target.setAttrs(local.decompose());
        }
      }
      const ordered = [...visual.nodes].sort(
        (a, b) => (a.attrs.order ?? 0) - (b.attrs.order ?? 0),
      );
      for (const node of ordered) entry.nodes.get(node.id)!.moveToTop();
    }
  }
  private updateNode(
    target: Konva.Node,
    node: VisualNode,
    images?: Map<string, CanvasImageSource>,
    fonts?: Map<string, string>,
    speakerBoost?: { actorId: string; scale: number },
  ) {
    const {
      assetId,
      fontId,
      clip,
      mask,
      bounds,
      cameraFactor,
      members,
      memberSpace,
      memberPlacement,
      order,
      blendMode,
      particles,
      blur,
      ...attrs
    } = node.attrs;
    // Reset optional properties too, so rebuilding the same IDs cannot retain stale appearance.
    target.setAttrs({
      x: 0,
      y: 0,
      scaleX: 1,
      scaleY: 1,
      rotation: 0,
      opacity: 1,
      offsetX: 0,
      offsetY: 0,
      fill: undefined,
      stroke: undefined,
      strokeWidth: 0,
      width: undefined,
      height: undefined,
      radius: 0,
      radiusX: 0,
      radiusY: 0,
      fontSize: 12,
      text: "",
      data: "",
      points: [],
      closed: false,
      ...attrs,
      globalCompositeOperation: blendOperation[blendMode ?? "normal"],
      listening: false,
      clipX: clip?.x ?? 0,
      clipY: clip?.y ?? 0,
      clipWidth: clip?.width,
      clipHeight: clip?.height,
    });
    if (node.type === "Image")
      (target as Konva.Image).image(images?.get(assetId!) ?? undefined);
    if (node.type === "Text")
      (target as Konva.Text).fontFamily(
        fontId ? (fonts?.get(fontId) ?? "sans-serif") : "sans-serif",
      );
  }
  hide() {
    this.behind.visible(false);
    this.above.visible(false);
  }
}
