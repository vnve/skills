import { describe, expect, it, vi } from 'vitest';
import { DynamicMediaResolver } from '../dynamic-media-resolver';
import type { MediaPlayer } from '../media-playback';

function createPlayerStub() {
  let currentFrame: CanvasImageSource | null = null;
  const seek = vi.fn(async (time: number) => {
    currentFrame = `frame:${time}` as unknown as CanvasImageSource;
  });

  const player: MediaPlayer = {
    id: '/hero.gif',
    mediaType: 'animated',
    state: 'idle',
    get currentFrame() {
      return currentFrame;
    },
    loop: true,
    play: vi.fn(),
    pause: vi.fn(),
    seek,
    destroy: vi.fn(),
    onFrame: null,
  };

  return { player, seek };
}

describe('DynamicMediaResolver', () => {
  it('rejects a required missing video while allowing unrelated assets and recovery', async () => {
    const { player } = createPlayerStub();
    const fetchFn = vi.fn().mockResolvedValue({ ok: false, status: 404 });
    const resolver = new DynamicMediaResolver({
      fetchFn,
      mediaService: { createPlayer: vi.fn(() => player), destroyPlayer: vi.fn() },
    });
    await resolver.load(new Map([['/missing.mp4', 'video']]));
    await expect(resolver.resolveFrame('/missing.mp4', 1, { throwOnMissing: true }))
      .rejects.toMatchObject({ code: 'DYNAMIC_MEDIA_UNAVAILABLE' });
    await expect(resolver.resolveFrame('/unrelated.png', 1, { throwOnMissing: true })).resolves.toBeNull();
    fetchFn.mockResolvedValue({ ok: true, blob: async () => new Blob(['video']) });
    await resolver.load(new Map([['/missing.mp4', 'video']]));
    await expect(resolver.resolveFrame('/missing.mp4', 1, { throwOnMissing: true })).resolves.toBe('frame:1');
    resolver.dispose();
  });
  it('invokes default global fetch with the browser context intact', async () => {
    const originalFetch = globalThis.fetch;
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { player } = createPlayerStub();
    const mediaService = {
      createPlayer: vi.fn(() => player),
      destroyPlayer: vi.fn(),
    };
    const fetchFn = vi.fn(function (this: typeof globalThis, _input: RequestInfo | URL) {
      if (this !== globalThis) {
        throw new TypeError('Illegal invocation');
      }
      return Promise.resolve({
        ok: true,
        blob: async () => new Blob(['gif-data'], { type: 'image/gif' }),
      });
    }) as typeof fetch;
    globalThis.fetch = fetchFn;

    try {
      const resolver = new DynamicMediaResolver({ mediaService });
      await resolver.load(new Map([
        ['/hero.gif', 'animated'],
      ]));

      expect(mediaService.createPlayer).toHaveBeenCalledTimes(1);
      expect(fetchFn).toHaveBeenCalledTimes(1);
      expect(fetchFn.mock.calls[0]?.[0]).toBe('/hero.gif');
      resolver.dispose();
    } finally {
      globalThis.fetch = originalFetch;
      warnSpy.mockRestore();
    }
  });

  it('loads dynamic media once and resolves frames by timeline time', async () => {
    const { player, seek } = createPlayerStub();
    const mediaService = {
      createPlayer: vi.fn(() => player),
      destroyPlayer: vi.fn(),
      destroyAll: vi.fn(),
    };
    const fetchFn = vi.fn(async () => ({
      ok: true,
      blob: async () => new Blob(['gif-data'], { type: 'image/gif' }),
    })) as typeof fetch;

    const resolver = new DynamicMediaResolver({ fetchFn, mediaService });

    await resolver.load(new Map([
      ['/hero.gif', 'animated'],
      ['/bg.png', 'static'],
    ]));

    const frames = await resolver.resolveFrames(['/hero.gif', '/bg.png'], 1.25);

    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(fetchFn).toHaveBeenCalledWith('/hero.gif');
    expect(mediaService.createPlayer).toHaveBeenCalledWith(
      '/hero.gif',
      'animated',
      expect.any(Blob),
      expect.objectContaining({ mimeType: 'image/gif', loop: true }),
    );
    expect(seek).toHaveBeenCalledWith(1.25);
    expect(frames.get('/hero.gif')).toBe('frame:1.25');
    expect(frames.has('/bg.png')).toBe(false);

    resolver.dispose();

    expect(mediaService.destroyPlayer).toHaveBeenCalledWith('/hero.gif');
  });

  it('can return the cached frame immediately while scheduling a preview seek in the background', async () => {
    let currentFrame: CanvasImageSource | null = 'frame:0' as unknown as CanvasImageSource;
    let releaseSeek!: () => void;
    const seek = vi.fn(async (time: number) => {
      await new Promise<void>((resolve) => {
        releaseSeek = () => {
          currentFrame = `frame:${time}` as unknown as CanvasImageSource;
          resolve();
        };
      });
    });

    const player: MediaPlayer = {
      id: '/hero.gif',
      mediaType: 'animated',
      state: 'idle',
      get currentFrame() {
        return currentFrame;
      },
      loop: true,
      play: vi.fn(),
      pause: vi.fn(),
      seek,
      destroy: vi.fn(),
      onFrame: null,
    };

    const mediaService = {
      createPlayer: vi.fn(() => player),
      destroyPlayer: vi.fn(),
    };

    const resolver = new DynamicMediaResolver({ mediaService });
    (resolver as any).players.set('/hero.gif', player);

    const result = await Promise.race([
      resolver.resolveFrames(['/hero.gif'], 1.25, { waitForSeek: false }),
      new Promise<'timed-out'>((resolve) => setTimeout(() => resolve('timed-out'), 20)),
    ]);

    expect(result).not.toBe('timed-out');
    expect(result).toBeInstanceOf(Map);
    expect((result as Map<string, CanvasImageSource>).get('/hero.gif')).toBe('frame:0');
    expect(seek).toHaveBeenCalledTimes(1);
    expect(seek).toHaveBeenLastCalledWith(1.25);

    releaseSeek();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(player.currentFrame).toBe('frame:1.25');

    resolver.dispose();
  });

  it('coalesces overlapping preview seeks to latest-wins while one seek is in flight', async () => {
    let currentFrame: CanvasImageSource | null = 'frame:0' as unknown as CanvasImageSource;
    const releases: Array<() => void> = [];
    const seek = vi.fn(async (time: number) => {
      await new Promise<void>((resolve) => {
        releases.push(() => {
          currentFrame = `frame:${time}` as unknown as CanvasImageSource;
          resolve();
        });
      });
    });

    const player: MediaPlayer = {
      id: '/hero.gif',
      mediaType: 'animated',
      state: 'idle',
      get currentFrame() {
        return currentFrame;
      },
      loop: true,
      play: vi.fn(),
      pause: vi.fn(),
      seek,
      destroy: vi.fn(),
      onFrame: null,
    };

    const resolver = new DynamicMediaResolver({
      mediaService: {
        createPlayer: vi.fn(() => player),
        destroyPlayer: vi.fn(),
      },
    });
    (resolver as any).players.set('/hero.gif', player);

    await resolver.resolveFrames(['/hero.gif'], 0.5, { waitForSeek: false });
    await resolver.resolveFrames(['/hero.gif'], 1.0, { waitForSeek: false });
    await resolver.resolveFrames(['/hero.gif'], 1.5, { waitForSeek: false });

    expect(seek).toHaveBeenCalledTimes(1);
    expect(seek).toHaveBeenLastCalledWith(0.5);

    releases.shift()?.();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(seek).toHaveBeenCalledTimes(2);
    expect(seek).toHaveBeenLastCalledWith(1.5);

    releases.shift()?.();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(seek).toHaveBeenCalledTimes(2);
    expect(player.currentFrame).toBe('frame:1.5');

    resolver.dispose();
  });

  it('does not reschedule queued preview seeks after dispose', async () => {
    let currentFrame: CanvasImageSource | null = 'frame:0' as unknown as CanvasImageSource;
    const releases: Array<() => void> = [];
    const seek = vi.fn(async (time: number) => {
      await new Promise<void>((resolve) => {
        releases.push(() => {
          currentFrame = `frame:${time}` as unknown as CanvasImageSource;
          resolve();
        });
      });
    });

    const player: MediaPlayer = {
      id: '/hero.gif',
      mediaType: 'animated',
      state: 'idle',
      get currentFrame() {
        return currentFrame;
      },
      loop: true,
      play: vi.fn(),
      pause: vi.fn(),
      seek,
      destroy: vi.fn(),
      onFrame: null,
    };

    const destroyPlayer = vi.fn();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const resolver = new DynamicMediaResolver({
      mediaService: {
        createPlayer: vi.fn(() => player),
        destroyPlayer,
      },
    });
    (resolver as any).players.set('/hero.gif', player);

    await resolver.resolveFrames(['/hero.gif'], 0.5, { waitForSeek: false });
    await resolver.resolveFrames(['/hero.gif'], 1.5, { waitForSeek: false });

    resolver.dispose();
    releases.shift()?.();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(seek).toHaveBeenCalledTimes(1);
    expect(destroyPlayer).toHaveBeenCalledWith('/hero.gif');
    await expect(resolver.resolveFrame('/hero.gif', 2.0)).resolves.toBeNull();
    expect(warnSpy).not.toHaveBeenCalledWith(
      'DynamicMediaResolver: failed to resolve dynamic frame',
      expect.anything(),
      expect.anything(),
    );

    warnSpy.mockRestore();
  });

  it('resolveFrame returns null while a player is still initialising', async () => {
    let resolveSeek!: () => void;
    const seekPromise = new Promise<void>((r) => { resolveSeek = r; });
    const seek = vi.fn(async () => { await seekPromise; });
    const player: MediaPlayer = {
      id: '/slow.gif',
      mediaType: 'animated',
      state: 'idle',
      currentFrame: null,
      loop: true,
      play: vi.fn(),
      pause: vi.fn(),
      seek,
      destroy: vi.fn(),
      onFrame: null,
    };
    const mediaService = {
      createPlayer: vi.fn(() => player),
      destroyPlayer: vi.fn(),
    };
    const fetchFn = vi.fn(async () => ({
      ok: true,
      blob: async () => new Blob(['gif-data'], { type: 'image/gif' }),
    })) as typeof fetch;

    const resolver = new DynamicMediaResolver({ fetchFn, mediaService });

    // Start loading but don't await — simulates concurrent updateFrame calls
    const loadPromise = resolver.load(new Map([['/slow.gif', 'animated']]));

    // While load is blocked on seek(0), resolveFrame should return null
    // because the player isn't registered in the map yet.
    const frame = await resolver.resolveFrame('/slow.gif', 2.0);
    expect(frame).toBeNull();

    // Unblock init so load can complete
    resolveSeek();
    await loadPromise;

    // Now the player is registered — resolveFrame should find it
    const frame2 = await resolver.resolveFrame('/slow.gif', 3.0);
    expect(frame2).toBeNull(); // still null because stub sets no frame on second seek

    resolver.dispose();
  });

  it('cleans up player when seek fails during load', async () => {
    const player: MediaPlayer = {
      id: '/bad.gif',
      mediaType: 'animated',
      state: 'idle',
      currentFrame: null,
      loop: true,
      play: vi.fn(),
      pause: vi.fn(),
      seek: vi.fn(async () => { throw new Error('decode-failed'); }),
      destroy: vi.fn(),
      onFrame: null,
    };
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const mediaService = {
      createPlayer: vi.fn(() => player),
      destroyPlayer: vi.fn(),
    };
    const fetchFn = vi.fn(async () => ({
      ok: true,
      blob: async () => new Blob(['bad-data'], { type: 'image/gif' }),
    })) as typeof fetch;

    const resolver = new DynamicMediaResolver({ fetchFn, mediaService });
    await resolver.load(new Map([['/bad.gif', 'animated']]));

    // Player should NOT be in the resolver's map
    const frame = await resolver.resolveFrame('/bad.gif', 0);
    expect(frame).toBeNull();
    await expect(resolver.resolveFrame('/bad.gif', 0, { throwOnMissing: true }))
      .rejects.toMatchObject({ code: 'DYNAMIC_MEDIA_UNAVAILABLE' });

    // destroyPlayer should have been called to clean up
    expect(mediaService.destroyPlayer).toHaveBeenCalledWith('/bad.gif');

    warnSpy.mockRestore();
    resolver.dispose();
  });

  it('warns when a dynamic asset fails to initialize', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const mediaService = {
      createPlayer: vi.fn(),
      destroyPlayer: vi.fn(),
    };
    const fetchFn = vi.fn(async () => {
      throw new Error('network-failed');
    }) as typeof fetch;

    const resolver = new DynamicMediaResolver({ fetchFn, mediaService });
    await resolver.load(new Map([
      ['/broken.mp4', 'video'],
    ]));

    expect(warnSpy).toHaveBeenCalledWith(
      'DynamicMediaResolver: failed to load dynamic asset',
      '/broken.mp4',
      expect.any(Error),
    );

    warnSpy.mockRestore();
  });
});
