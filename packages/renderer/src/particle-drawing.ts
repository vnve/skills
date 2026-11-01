import type { BakedParticle } from "@vnve/core";

/** Baked values only: drawing a frame has no simulation state. */
export function drawParticles(
  ctx: CanvasRenderingContext2D,
  particles: BakedParticle[],
  time: number,
  images?: Map<string, CanvasImageSource>,
) {
  for (const p of particles) {
    const age = time - p.birth;
    if (age < 0 || age >= p.lifetime) continue;
    const value = (key: string, fallback: number) => {
      const values = p.values[key];
      if (!values) return fallback;
      const a = Math.min(values.length - 1, Math.floor(age * p.sampleRate));
      const b = Math.min(a + 1, values.length - 1);
      const t =
        (age - a / p.sampleRate) /
        Math.max(
          1e-10,
          Math.min(p.lifetime, b / p.sampleRate) - a / p.sampleRate,
        );
      return values[a] + (values[b] - values[a]) * Math.max(0, Math.min(1, t));
    };
    ctx.save();
    ctx.translate(value("x", 0), value("y", 0));
    ctx.rotate((value("rotation", 0) * Math.PI) / 180);
    ctx.scale(value("scaleX", 1), value("scaleY", 1));
    ctx.globalAlpha *= Math.max(0, Math.min(1, value("opacity", 1)));
    if (p.assetId) {
      const image = images?.get(p.assetId);
      if (!image) throw new Error(`Missing particle texture '${p.assetId}'`);
      ctx.drawImage(image, -p.width! / 2, -p.height! / 2, p.width!, p.height!);
    } else {
      ctx.fillStyle = p.fill ?? "#ffffff";
      ctx.beginPath();
      ctx.arc(0, 0, p.radius!, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}
