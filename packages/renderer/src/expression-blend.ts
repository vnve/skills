/** Add weighted premultiplied samples, then apply actor opacity once when drawn. */
export function blendExpression(
  mix: Array<{ image: CanvasImageSource; weight: number }>,
  height: number,
  canvas: HTMLCanvasElement,
): HTMLCanvasElement {
  const size = (image: CanvasImageSource) => {
    const source = image as {
      naturalWidth?: number;
      naturalHeight?: number;
      width?: number;
      height?: number;
    };
    return {
      w: source.naturalWidth ?? source.width ?? 1,
      h: source.naturalHeight ?? source.height ?? 1,
    };
  };
  canvas.height = Math.max(1, Math.ceil(height));
  canvas.width = Math.max(
    1,
    Math.ceil(
      Math.max(
        ...mix.map((m) => {
          const s = size(m.image);
          return (height * s.w) / s.h;
        }),
      ),
    ),
  );
  const ctx = canvas.getContext("2d")!;
  ctx.globalCompositeOperation = "lighter";
  for (const m of mix) {
    const s = size(m.image),
      width = (height * s.w) / s.h;
    ctx.globalAlpha = m.weight;
    ctx.drawImage(
      m.image,
      (canvas.width - width) / 2,
      canvas.height - height,
      width,
      height,
    );
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
  return canvas;
}
