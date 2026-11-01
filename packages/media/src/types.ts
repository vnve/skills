import type { CompiledSequence, FrameRenderer, RenderContext } from '@vnve/renderer';

export type { FrameRenderer } from '@vnve/renderer';

export type ExportState = 'idle' | 'running' | 'done' | 'cancelled' | 'error';

export interface ExportProgress {
  state: ExportState;
  currentFrame: number;
  totalFrames: number;
  percent: number;
}

export interface ExportAssets {
  /** Shared render context consumed by both preview and export pipelines. */
  renderContext: RenderContext;
  /** assetName → audio URL */
  audioFiles?: Record<string, string>;
}

export interface ExportOptions {
  width: number;
  height: number;
  fps: number;
  bitrate?: number;
  sequence: CompiledSequence;
  assets?: ExportAssets;
  frameRenderer: FrameRenderer;
  /** Seekable byte writes for a file destination; omitting this returns a buffered Blob. */
  outputStream?: WritableStream<{ type: 'write'; data: Uint8Array<ArrayBuffer>; position: number }>;
}
