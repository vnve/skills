import type Konva from 'konva';
import type { SceneTransitionPlan } from '../scene-transition-channels';

export interface TransitionContext {
  /** The transition overlay layer (topmost) */
  layer: Konva.Layer;
  /** The main content layer (for filter-based effects like blur) */
  bgLayer: Konva.Layer;
  width: number;
  height: number;
  /** Snapshot of the previous frame; kept as a compatibility alias for outgoingSurface */
  snapshot?: CanvasImageSource;
  /** Stable outgoing static scene surface */
  outgoingSurface?: CanvasImageSource;
  /** Stable incoming static scene surface */
  incomingSurface?: CanvasImageSource;
  /** Initial compositor plan for this transition instance */
  compositorPlan?: SceneTransitionPlan;
}

export interface TransitionEffect {
  /** Whether the renderer should capture a frame snapshot before setup */
  readonly needsSnapshot: boolean;
  /** Initialize Konva nodes needed for this transition */
  setup(ctx: TransitionContext): void;
  /** Update the transition state for the given progress (0→1) */
  update(progress: number, compositorPlan?: SceneTransitionPlan): void;
  /** Clean up all temporary nodes and filters */
  teardown(): void;
}
