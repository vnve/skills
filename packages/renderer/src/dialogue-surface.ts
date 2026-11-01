import type { DialogueThemeConfig } from './themes';

/** Shared by the live preview, transition surfaces, export and theme studio. */
export function drawDialogueSurface(
  ctx: CanvasRenderingContext2D,
  theme: DialogueThemeConfig,
  width: number,
  height: number,
): void {
  ctx.save();
  const radius = Math.min(theme.cornerRadius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(radius, 0);
  ctx.arcTo(width, 0, width, height, radius);
  ctx.arcTo(width, height, 0, height, radius);
  ctx.arcTo(0, height, 0, 0, radius);
  ctx.arcTo(0, 0, width, 0, radius);
  ctx.closePath();
  ctx.clip();
  if (theme.boxGradient) {
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, theme.boxGradient.top);
    gradient.addColorStop(0.42, theme.boxGradient.middle);
    gradient.addColorStop(1, theme.boxGradient.bottom);
    ctx.fillStyle = gradient;
  } else {
    ctx.fillStyle = theme.boxFill;
  }
  ctx.fillRect(0, 0, width, height);

  // Decorations remain outside the text area and scale with the surface.
  const unit = Math.min(width / 1600, height / 230);
  const inset = 12 * unit;
  ctx.strokeStyle = theme.boxAccent ?? theme.nameColor;
  ctx.fillStyle = theme.boxAccent ?? theme.nameColor;
  ctx.lineWidth = Math.max(0.7, unit);
  ctx.globalAlpha *= 0.7;
  const line = (x1: number, y1: number, x2: number, y2: number) => {
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  };
  switch (theme.boxDecoration) {
    case 'side':
      ctx.fillRect(24 * unit, 24 * unit, 2 * unit, height - 48 * unit);
      break;
    case 'corners': {
      const length = 27 * unit;
      for (const x of [inset, width - inset]) {
        for (const y of [inset, height - inset]) {
          const dx = x < width / 2 ? length : -length;
          const dy = y < height / 2 ? length : -length;
          ctx.beginPath(); ctx.moveTo(x + dx, y); ctx.lineTo(x, y); ctx.lineTo(x, y + dy); ctx.stroke();
        }
      }
      ctx.globalAlpha *= 0.3;
      line(inset + length, inset, width - inset - length, inset);
      break;
    }
    case 'double-rule':
      for (const y of [inset, height - inset]) {
        line(35 * unit, y, width - 35 * unit, y);
        line(55 * unit, y + (y < height / 2 ? 4 : -4) * unit, width - 55 * unit, y + (y < height / 2 ? 4 : -4) * unit);
      }
      break;
    case 'rule':
      line(28 * unit, inset, width - 28 * unit, inset);
      ctx.globalAlpha *= 0.35;
      line(28 * unit, height - inset, width - 28 * unit, height - inset);
      break;
  }
  ctx.restore();
}
