import type { MediaType } from '@vnve/core';
import { MediaPlaybackService, type MediaPlayer } from './media-playback';

export interface DynamicMediaResolverOptions {
  fetchFn?: typeof fetch;
  mediaService?: Pick<MediaPlaybackService, 'createPlayer' | 'destroyPlayer'>;
}

export interface ResolveFrameOptions {
  waitForSeek?: boolean;
  /** Fail instead of silently omitting a required visual from preview/export. */
  throwOnMissing?: boolean;
}

class DynamicMediaUnavailableError extends Error {
  readonly code = 'DYNAMIC_MEDIA_UNAVAILABLE';
  constructor() {
    super('Video or animated image could not be loaded. Restore or replace the media and retry.');
  }
}

function isDynamicMediaType(mediaType: MediaType | undefined): mediaType is 'animated' | 'video' {
  return mediaType === 'animated' || mediaType === 'video';
}

export class DynamicMediaResolver {
  private readonly fetchFn: typeof fetch;
  private readonly mediaService: Pick<MediaPlaybackService, 'createPlayer' | 'destroyPlayer'>;
  private readonly players = new Map<string, MediaPlayer>();
  private readonly failedUrls = new Set<string>();
  private readonly seekQueues = new Map<string, {
    inFlight: Promise<void> | null;
    pendingTime: number | null;
  }>();
  private disposed = false;

  constructor(options: DynamicMediaResolverOptions = {}) {
    this.fetchFn = options.fetchFn ?? ((input, init) => globalThis.fetch(input, init));
    this.mediaService = options.mediaService ?? new MediaPlaybackService();
  }

  async load(entries: ReadonlyMap<string, MediaType> | Iterable<[string, MediaType]>): Promise<void> {
    const dynamicEntries = [...entries].filter(([, mediaType]) => isDynamicMediaType(mediaType));
    await Promise.all(dynamicEntries.map(async ([url, mediaType]) => {
      try {
        if (this.disposed) return;
        if (this.players.has(url)) return;

        const response = await this.fetchFn(url);
        if (!response.ok) throw new Error(`Media request failed: ${response.status}`);

        const blob = await response.blob();
        const player = this.mediaService.createPlayer(url, mediaType, blob, {
          mimeType: blob.type || undefined,
          loop: true,
        });
        // Wait for the player to fully initialise before registering it.
        // This prevents resolveFrame() from blocking on a pending init
        // while the preview tick is waiting for a frame.
        await player.seek(0);
        if (this.disposed) {
          this.mediaService.destroyPlayer(url);
          return;
        }
        this.players.set(url, player);
        this.failedUrls.delete(url);
      } catch (err) {
        // Clean up the player if it was created but init/seek failed.
        this.mediaService.destroyPlayer(url);
        // Keep preview/export running even if one dynamic asset fails to load.
        if (!this.disposed) {
          this.failedUrls.add(url);
          console.warn('DynamicMediaResolver: failed to load dynamic asset', url, err);
        }
      }
    }));
  }

  private scheduleSeek(url: string, player: MediaPlayer, time: number): void {
    if (this.disposed || this.players.get(url) !== player) return;
    const queue = this.seekQueues.get(url) ?? { inFlight: null, pendingTime: null };
    queue.pendingTime = time;
    this.seekQueues.set(url, queue);

    if (queue.inFlight) return;

    queue.inFlight = (async () => {
      while (!this.disposed && queue.pendingTime !== null) {
        const nextTime = queue.pendingTime;
        queue.pendingTime = null;
        try {
          await player.seek(nextTime);
        } catch (err) {
          if (!this.disposed) {
            console.warn('DynamicMediaResolver: failed to resolve dynamic frame', url, err);
          }
          break;
        }
      }
    })().finally(() => {
      if (this.disposed) return;
      queue.inFlight = null;
      if (queue.pendingTime !== null) {
        this.scheduleSeek(url, player, queue.pendingTime);
        return;
      }
      this.seekQueues.delete(url);
    });
  }

  async resolveFrame(
    url: string,
    time: number,
    options: ResolveFrameOptions = {},
  ): Promise<CanvasImageSource | null> {
    if (this.disposed) return null;
    const player = this.players.get(url);
    if (!player) {
      if (options.throwOnMissing && this.failedUrls.has(url)) throw new DynamicMediaUnavailableError();
      return null;
    }
    if (options.waitForSeek === false) {
      this.scheduleSeek(url, player, time);
      return player.currentFrame;
    }
    await player.seek(time);
    return player.currentFrame;
  }

  async resolveFrames(
    urls: Iterable<string>,
    time: number,
    options: ResolveFrameOptions = {},
  ): Promise<Map<string, CanvasImageSource>> {
    const uniqueUrls = [...new Set([...urls])];
    const frames = new Map<string, CanvasImageSource>();

    await Promise.all(uniqueUrls.map(async (url) => {
      const frame = await this.resolveFrame(url, time, options);
      if (frame) {
        frames.set(url, frame);
      }
    }));

    return frames;
  }

  dispose(): void {
    this.disposed = true;
    for (const url of this.players.keys()) {
      this.mediaService.destroyPlayer(url);
    }
    this.players.clear();
    this.failedUrls.clear();
    this.seekQueues.clear();
  }
}

export function createDynamicMediaResolver(options?: DynamicMediaResolverOptions): DynamicMediaResolver {
  return new DynamicMediaResolver(options);
}
