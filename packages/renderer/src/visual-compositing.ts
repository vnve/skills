import Konva from "konva";
import type { VisualNode } from "@vnve/core";

export const blendOperation = {
  normal: "source-over",
  "source-atop": "source-atop",
  add: "lighter",
  screen: "screen",
  multiply: "multiply",
} as const;

const maskCanvases = new WeakMap<Konva.Group, HTMLCanvasElement>();

/** Isolate before masking/blending so siblings never become mask destinations. */
export function compositeGroup(
  group: Konva.Group,
  attrs: VisualNode["attrs"],
  images?: Map<string, CanvasImageSource>,
) {
  group
    .getChildren((n) => n.hasName("visual-mask"))
    .forEach((n) => n.destroy());
  const bounds = attrs.bounds;
  if (!bounds) return;
  const mask = attrs.mask;
  if (mask) {
    let canvas = maskCanvases.get(group);
    if (!canvas) {
      canvas = document.createElement("canvas");
      maskCanvases.set(group, canvas);
    }
    canvas.width = Math.ceil(bounds.width);
    canvas.height = Math.ceil(bounds.height);
    const ctx = canvas.getContext("2d")!;
    if (mask.invert) {
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.globalCompositeOperation = "destination-out";
    }
    ctx.translate(-bounds.x, -bounds.y);
    ctx.translate(mask.x ?? 0, mask.y ?? 0);
    ctx.rotate(((mask.rotation ?? 0) * Math.PI) / 180);
    ctx.scale(mask.scaleX ?? 1, mask.scaleY ?? 1);
    ctx.globalAlpha = Math.max(0, Math.min(1, mask.opacity ?? 1));
    ctx.fillStyle = "#fff";
    if (mask.type === "rect") ctx.fillRect(0, 0, mask.width!, mask.height!);
    else if (mask.type === "ellipse") {
      ctx.beginPath();
      ctx.ellipse(
        0,
        0,
        Math.max(0, mask.radiusX!),
        Math.max(0, mask.radiusY!),
        0,
        0,
        Math.PI * 2,
      );
      ctx.fill();
    } else if (mask.type === "path") ctx.fill(new Path2D(mask.data));
    else {
      const image = images?.get(mask.assetId!);
      if (!image) throw new Error(`Missing mask image '${mask.assetId}'`);
      ctx.drawImage(image, 0, 0, mask.width!, mask.height!);
    }
    group.add(
      new Konva.Image({
        image: canvas,
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height,
        globalCompositeOperation: "destination-in",
        name: "visual-mask",
        listening: false,
      }),
    );
  }
  group.cache({ ...bounds, pixelRatio: 1, imageSmoothingEnabled: true });
  group.blurRadius(Math.max(0, attrs.blur ?? 0));
  group.filters((attrs.blur ?? 0) > 0 ? [Konva.Filters.Blur] : []);
}
