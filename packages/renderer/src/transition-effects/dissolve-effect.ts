import Konva from 'konva';
import type { TransitionEffect, TransitionContext } from './types';

export class DissolveEffect implements TransitionEffect {
  readonly needsSnapshot = true;
  private outgoingImage: Konva.Image | null = null;

  setup(ctx: TransitionContext): void {
    const outgoingSurface = ctx.outgoingSurface ?? ctx.snapshot;
    if (outgoingSurface) {
      this.outgoingImage = new Konva.Image({
        x: 0,
        y: 0,
        width: ctx.width,
        height: ctx.height,
        image: outgoingSurface,
        opacity: 1,
        listening: false,
      });
      ctx.layer.add(this.outgoingImage);
    }
  }

  update(_progress: number, compositorPlan?: Parameters<TransitionEffect['update']>[1]): void {
    if (this.outgoingImage) {
      this.outgoingImage.opacity(compositorPlan?.shot.outgoing.opacity ?? 1);
      this.outgoingImage.visible(true);
    }
  }

  teardown(): void {
    this.outgoingImage?.destroy();
    this.outgoingImage = null;
  }
}
