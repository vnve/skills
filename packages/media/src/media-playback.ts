import type { MediaType } from '@vnve/core';

export type PlayerState = 'idle' | 'playing' | 'paused';

export interface MediaPlayer {
  readonly id: string;
  readonly mediaType: MediaType;
  readonly state: PlayerState;
  readonly currentFrame: CanvasImageSource | null;
  readonly loop: boolean;

  play(): void;
  pause(): void;
  seek(time: number): Promise<void>;
  destroy(): void;

  /** Called each time a new frame is decoded. */
  onFrame: ((frame: CanvasImageSource) => void) | null;
}

/**
 * Animated image player using WebCodecs ImageDecoder.
 * Handles GIF and animated WebP frame-by-frame.
 */
export class AnimatedImagePlayer implements MediaPlayer {
  readonly id: string;
  readonly mediaType: MediaType = 'animated';
  private _state: PlayerState = 'idle';
  private _currentFrame: ImageBitmap | null = null;
  private _loop: boolean;
  private decoder: ImageDecoder | null = null;
  private timingDecoder: ImageDecoder | null = null;
  private frameIndex = 0;
  private animationId: number | null = null;
  private lastFrameTime = 0;
  /** Per-frame durations in ms. Missing entries fall back to 100ms. */
  private frameDurations: number[] = [];
  /** Cumulative time offsets per frame (in ms). frameTimes[i] = start time of frame i. */
  private frameTimes: number[] = [];
  /** Total duration of one loop in ms. */
  private totalDuration = 0;
  private initPromise: Promise<void>;
  private timingScanPromise: Promise<void> | null = null;
  private sourceBuffer: ArrayBuffer | null = null;
  private mimeType: string | null = null;

  onFrame: ((frame: CanvasImageSource) => void) | null = null;

  constructor(id: string, data: Blob, mimeType: string, loop = true) {
    this.id = id;
    this._loop = loop;
    this.initPromise = this.init(data, mimeType);
  }

  get state() { return this._state; }
  get currentFrame() { return this._currentFrame; }
  get loop() { return this._loop; }

  private createDecoder(buffer: ArrayBuffer, mimeType: string): ImageDecoder {
    return new ImageDecoder({
      type: mimeType,
      data: buffer,
    });
  }

  private async init(data: Blob, mimeType: string) {
    if (typeof ImageDecoder === 'undefined') {
      console.warn('ImageDecoder not supported in this browser');
      return;
    }
    try {
      // ImageDecoder requires ArrayBuffer — convert from Blob
      const buffer = await data.arrayBuffer();
      this.sourceBuffer = buffer;
      this.mimeType = mimeType;
      this.decoder = this.createDecoder(buffer.slice(0), mimeType);
      await this.decoder.completed;
      // Decode first frame as thumbnail
      await this.decodeFrame(0);
      void this.ensureTimingMetadata();
    } catch (err) {
      console.error('Failed to init AnimatedImagePlayer:', err);
    }
  }

  private async getTimingDecoder(): Promise<ImageDecoder | null> {
    if (this.timingDecoder) return this.timingDecoder;
    if (!this.sourceBuffer || !this.mimeType) return null;

    const decoder = this.createDecoder(this.sourceBuffer.slice(0), this.mimeType);
    await decoder.completed;
    this.timingDecoder = decoder;
    return decoder;
  }

  private async buildFrameTimingMetadata(): Promise<void> {
    const decoder = await this.getTimingDecoder();
    if (!decoder) return;
    const track = decoder.tracks.selectedTrack;
    if (!track || track.frameCount === 0) return;
    if (this.frameTimes.length === track.frameCount && this.totalDuration > 0) return;

    const frameTimes: number[] = [];
    let cumulative = 0;
    for (let i = 0; i < track.frameCount; i++) {
      frameTimes.push(cumulative);
      let durationMs = this.frameDurations[i];
      if (durationMs === undefined) {
        try {
          const result = await decoder.decode({ frameIndex: i });
          durationMs = Math.max((result.image.duration ?? 100_000) / 1000, 10);
          result.image.close();
        } catch {
          durationMs = 100;
        }
        this.frameDurations[i] = durationMs;
      }
      cumulative += durationMs;
    }

    this.frameTimes = frameTimes;
    this.totalDuration = cumulative;
  }

  private ensureTimingMetadata(): Promise<void> {
    if (!this.timingScanPromise) {
      this.timingScanPromise = this.buildFrameTimingMetadata().catch((err) => {
        console.warn('AnimatedImagePlayer: failed to build frame timing metadata', err);
      });
    }
    return this.timingScanPromise;
  }

  private async decodeFrame(index: number): Promise<void> {
    if (!this.decoder) return;
    const track = this.decoder.tracks.selectedTrack;
    if (!track || index >= track.frameCount) return;

    try {
      const result = await this.decoder.decode({ frameIndex: index });
      if (this.frameDurations[index] === undefined) {
        this.frameDurations[index] = Math.max((result.image.duration ?? 100_000) / 1000, 10);
      }
      this._currentFrame?.close();
      this._currentFrame = await createImageBitmap(result.image);
      result.image.close();
      this.onFrame?.(this._currentFrame);
    } catch {
      // Frame decode error -- skip
    }
  }

  private tick = () => {
    if (this._state !== 'playing' || !this.decoder) return;
    const track = this.decoder.tracks.selectedTrack;
    if (!track || track.frameCount === 0) return;

    const now = performance.now();
    const frameDurMs = this.frameDurations[this.frameIndex] ?? 100;
    if (now - this.lastFrameTime >= frameDurMs) {
      this.lastFrameTime = now;
      this.frameIndex++;
      if (this.frameIndex >= track.frameCount) {
        if (this._loop) {
          this.frameIndex = 0;
        } else {
          this._state = 'paused';
          return;
        }
      }
      this.decodeFrame(this.frameIndex);
    }
    this.animationId = requestAnimationFrame(this.tick);
  };

  play() {
    if (this._state === 'playing') return;
    this._state = 'playing';
    void this.initPromise.then(() => {
      if (this._state !== 'playing') return;
      this.lastFrameTime = performance.now();
      this.animationId = requestAnimationFrame(this.tick);
    });
  }

  pause() {
    this._state = 'paused';
    if (this.animationId !== null) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
  }

  async seek(time: number) {
    await this.initPromise;
    if (!this.decoder) return;
    const track = this.decoder.tracks.selectedTrack;
    if (!track || track.frameCount === 0) return;

    void this.ensureTimingMetadata();

    let targetFrame = 0;
    if (this.frameTimes.length === track.frameCount && this.totalDuration > 0) {
      let timeMs = time * 1000;
      timeMs = this._loop
        ? ((timeMs % this.totalDuration) + this.totalDuration) % this.totalDuration
        : Math.min(timeMs, this.totalDuration);

      let lo = 0;
      let hi = this.frameTimes.length - 1;
      while (lo < hi) {
        const mid = (lo + hi + 1) >>> 1;
        if (this.frameTimes[mid]! <= timeMs) {
          lo = mid;
        } else {
          hi = mid - 1;
        }
      }
      targetFrame = lo;
    } else if (time > 0) {
      targetFrame = Math.min(
        Math.max(0, Math.floor(time * 10)),
        track.frameCount - 1,
      );
    }

    // Skip decode if already on the correct frame
    if (targetFrame === this.frameIndex && this._currentFrame) return;
    this.frameIndex = targetFrame;
    await this.decodeFrame(targetFrame);
  }

  destroy() {
    this.pause();
    this._currentFrame?.close();
    this._currentFrame = null;
    this.decoder?.close();
    this.decoder = null;
    this.timingDecoder?.close();
    this.timingDecoder = null;
    this.sourceBuffer = null;
    this.mimeType = null;
    this.onFrame = null;
  }
}

/**
 * Video player using mediabunny for container demux + decode.
 * Handles MP4, WebM, MKV.
 */
export class VideoPlayer implements MediaPlayer {
  readonly id: string;
  readonly mediaType: MediaType = 'video';
  private _state: PlayerState = 'idle';
  private _currentFrame: CanvasImageSource | null = null;
  private _loop: boolean;
  private animationId: number | null = null;
  private startTime = 0;
  private pausedAt = 0;
  private _duration = 0;
  private _isDecoding = false;
  private initPromise: Promise<void>;

  private mbInput: { dispose(): void } | null = null;
  private canvasSink: { getCanvas(t: number): Promise<{ canvas: CanvasImageSource } | null> } | null = null;

  onFrame: ((frame: CanvasImageSource) => void) | null = null;

  constructor(id: string, data: Blob, loop = true) {
    this.id = id;
    this._loop = loop;
    this.initPromise = this.init(data);
  }

  get state() { return this._state; }
  get currentFrame() { return this._currentFrame; }
  get loop() { return this._loop; }
  get duration() { return this._duration; }

  private async init(data: Blob) {
    try {
      const mb = await import('mediabunny');
      const input = new mb.Input({
        source: new mb.BlobSource(data),
        formats: mb.ALL_FORMATS,
      });
      this.mbInput = input;
      const videoTrack = await input.getPrimaryVideoTrack();
      if (!videoTrack) {
        console.warn('VideoPlayer: no video track found');
        return;
      }
      this._duration = await videoTrack.computeDuration();
      this.canvasSink = new mb.CanvasSink(videoTrack, { poolSize: 2 });
      // Decode first frame as thumbnail
      await this.decodeFrameAtTime(0);
    } catch (err) {
      console.error('Failed to init VideoPlayer:', err);
    }
  }

  private async decodeFrameAtTime(time: number): Promise<void> {
    if (!this.canvasSink || this._isDecoding) return;
    this._isDecoding = true;
    try {
      const wrapped = await this.canvasSink.getCanvas(time);
      if (!wrapped) return;
      this._currentFrame = wrapped.canvas;
      this.onFrame?.(this._currentFrame);
    } catch (err) {
      console.warn('VideoPlayer: frame decode error', err);
    } finally {
      this._isDecoding = false;
    }
  }

  play() {
    if (this._state === 'playing') return;
    this._state = 'playing';
    void this.initPromise.then(() => {
      if (this._state !== 'playing') return;
      this.startTime = performance.now() - this.pausedAt;
      this.animationId = requestAnimationFrame(this.tick);
    });
  }

  pause() {
    this._state = 'paused';
    this.pausedAt = performance.now() - this.startTime;
    if (this.animationId !== null) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
  }

  private tick = () => {
    if (this._state !== 'playing') return;
    const elapsed = (performance.now() - this.startTime) / 1000;

    if (this._duration > 0 && elapsed >= this._duration) {
      if (this._loop) {
        this.startTime = performance.now();
      } else {
        this._state = 'paused';
        return;
      }
    }

    void this.decodeFrameAtTime(elapsed % (this._duration || 1));
    this.animationId = requestAnimationFrame(this.tick);
  };

  async seek(time: number) {
    await this.initPromise;
    let effectiveTime = time;
    if (this._duration > 0 && time > this._duration) {
      effectiveTime = this._loop
        ? time % this._duration
        : this._duration;
    }
    // pausedAt is stored in milliseconds (matching performance.now() units) so that
    // play() can restore startTime with: startTime = now - pausedAt
    this.pausedAt = effectiveTime * 1000;
    if (this._state === 'playing') {
      this.startTime = performance.now() - this.pausedAt;
    }
    await this.decodeFrameAtTime(effectiveTime);
  }

  destroy() {
    this.pause();
    this._currentFrame = null;
    this.canvasSink = null;
    this.mbInput?.dispose();
    this.mbInput = null;
    this.onFrame = null;
  }
}

/**
 * Centralized service managing all active media players.
 */
export class MediaPlaybackService {
  private players = new Map<string, MediaPlayer>();

  createPlayer(
    id: string,
    mediaType: MediaType,
    data: Blob,
    options?: { mimeType?: string; loop?: boolean },
  ): MediaPlayer {
    // Destroy existing player for this id
    this.destroyPlayer(id);

    let player: MediaPlayer;
    if (mediaType === 'animated') {
      const mime = options?.mimeType ?? 'image/gif';
      player = new AnimatedImagePlayer(id, data, mime, options?.loop ?? true);
    } else {
      player = new VideoPlayer(id, data, options?.loop ?? true);
    }

    this.players.set(id, player);
    return player;
  }

  getPlayer(id: string): MediaPlayer | undefined {
    return this.players.get(id);
  }

  destroyPlayer(id: string): void {
    const player = this.players.get(id);
    if (player) {
      player.destroy();
      this.players.delete(id);
    }
  }

  destroyAll(): void {
    for (const player of this.players.values()) {
      player.destroy();
    }
    this.players.clear();
  }

  pauseAll(): void {
    for (const player of this.players.values()) {
      if (player.state === 'playing') {
        player.pause();
      }
    }
  }

  resumeAll(): void {
    for (const player of this.players.values()) {
      if (player.state === 'paused') {
        player.play();
      }
    }
  }
}

export const mediaPlaybackService = new MediaPlaybackService();
