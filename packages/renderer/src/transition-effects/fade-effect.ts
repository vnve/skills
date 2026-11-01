import Konva from 'konva';
import type { TransitionEffect, TransitionContext } from './types';

export class FadeEffect implements TransitionEffect {
  readonly needsSnapshot = false;
  private rect: Konva.Rect | null = null;

  constructor(private readonly color: string) {}

  setup(ctx: TransitionContext): void {
    this.rect = new Konva.Rect({
      x: 0,
      y: 0,
      width: ctx.width,
      height: ctx.height,
      fill: this.color,
      opacity: 0,
      listening: false,
    });
    ctx.layer.add(this.rect);
  }

  update(_progress: number, compositorPlan?: Parameters<TransitionEffect['update']>[1]): void {
    if (!this.rect) return;
    this.rect.opacity(compositorPlan?.shot.throughColorOpacity ?? 0);
    this.rect.visible(true);
  }

  teardown(): void {
    this.rect?.destroy();
    this.rect = null;
  }
}
