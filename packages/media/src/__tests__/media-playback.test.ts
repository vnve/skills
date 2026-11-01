import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MediaPlaybackService, type MediaPlayer } from '../media-playback';

// Mock createImageBitmap if not defined in the test environment (e.g. happy-dom)
if (typeof globalThis.createImageBitmap === 'undefined') {
  globalThis.createImageBitmap = vi.fn().mockResolvedValue({
    close: vi.fn(),
    width: 1,
    height: 1,
  });
}

const imageDecoderMocks = vi.hoisted(() => {
  const decode = vi.fn(async ({ frameIndex }: { frameIndex: number }) => ({
    image: {
      duration: [100_000, 150_000, 250_000][frameIndex] ?? 100_000,
      close: vi.fn(),
    },
  }));

  class MockImageDecoder {
    tracks = {
      selectedTrack: {
        frameCount: 3,
      },
    };

    completed = Promise.resolve();

    decode = decode;

    close = vi.fn();
  }

  return { MockImageDecoder, decode };
});

vi.stubGlobal('ImageDecoder', imageDecoderMocks.MockImageDecoder as unknown as typeof ImageDecoder);

// Mock mediabunny at the top of the file (before all describes)
const mediabunnyMocks = vi.hoisted(() => {
  const mockCanvas = typeof document !== 'undefined'
    ? document.createElement('canvas')
    : {};
  const mockWrapped = { canvas: mockCanvas, timestamp: 0, duration: 0.033 };
  const mockSink = {
    getCanvas: vi.fn().mockResolvedValue(mockWrapped),
  };
  const mockTrack = {
    computeDuration: vi.fn().mockResolvedValue(5.0),
  };
  const mockInput = {
    getPrimaryVideoTrack: vi.fn().mockResolvedValue(mockTrack),
    dispose: vi.fn(),
  };
  const InputMock = vi.fn().mockReturnValue(mockInput);
  const BufferSourceMock = vi.fn();
  const BlobSourceMock = vi.fn();

  return {
    InputMock,
    BufferSourceMock,
    BlobSourceMock,
    mockSink,
    mockInput,
  };
});

vi.mock('mediabunny', () => {
  return {
    ALL_FORMATS: ['mock-format'],
    BufferSource: mediabunnyMocks.BufferSourceMock,
    BlobSource: mediabunnyMocks.BlobSourceMock,
    Input: mediabunnyMocks.InputMock,
    CanvasSink: vi.fn().mockReturnValue(mediabunnyMocks.mockSink),
  };
});

describe('MediaPlaybackService', () => {
  let service: MediaPlaybackService;

  beforeEach(() => {
    service = new MediaPlaybackService();
  });

  afterEach(() => {
    service.destroyAll();
  });

  it('can be instantiated', () => {
    expect(service).toBeDefined();
  });

  it('destroyAll cleans up all players', () => {
    // Should not throw even with no players
    expect(() => service.destroyAll()).not.toThrow();
  });

  it('pauseAll and resumeAll do not throw', () => {
    expect(() => service.pauseAll()).not.toThrow();
    expect(() => service.resumeAll()).not.toThrow();
  });

  it('replaces an existing player when createPlayer is called with the same id', () => {
    const first = service.createPlayer('shared', 'video', new Blob(['a']));
    const destroySpy = vi.spyOn(first, 'destroy');

    const second = service.createPlayer('shared', 'animated', new Blob(['b']), { mimeType: 'image/webp' });

    expect(destroySpy).toHaveBeenCalledTimes(1);
    expect(second).not.toBe(first);
    expect(service.getPlayer('shared')).toBe(second);
  });

  it('pauseAll and resumeAll only affect active players', () => {
    const playingPlayer: MediaPlayer = {
      id: 'playing',
      mediaType: 'video',
      state: 'playing',
      currentFrame: null,
      loop: true,
      play: vi.fn(),
      pause: vi.fn(),
      seek: vi.fn(),
      destroy: vi.fn(),
      onFrame: null,
    };
    const pausedPlayer: MediaPlayer = {
      ...playingPlayer,
      id: 'paused',
      state: 'paused',
      play: vi.fn(),
      pause: vi.fn(),
    };
    const idlePlayer: MediaPlayer = {
      ...playingPlayer,
      id: 'idle',
      state: 'idle',
      play: vi.fn(),
      pause: vi.fn(),
    };

    (service as any).players.set('playing', playingPlayer);
    (service as any).players.set('paused', pausedPlayer);
    (service as any).players.set('idle', idlePlayer);

    service.pauseAll();
    service.resumeAll();

    expect(playingPlayer.pause).toHaveBeenCalledTimes(1);
    expect(pausedPlayer.pause).not.toHaveBeenCalled();
    expect(pausedPlayer.play).toHaveBeenCalledTimes(1);
    expect(idlePlayer.play).not.toHaveBeenCalled();
  });
});

describe('VideoPlayer', () => {
  beforeEach(() => {
    mediabunnyMocks.InputMock.mockClear();
    mediabunnyMocks.BufferSourceMock.mockClear();
    mediabunnyMocks.BlobSourceMock.mockClear();
  });

  it('starts in idle state', async () => {
    const { VideoPlayer } = await import('../media-playback');
    const player = new VideoPlayer('test', new Blob(['data']));
    expect(player.state).toBe('idle');
    player.destroy();
  });

  it('has video mediaType', async () => {
    const { VideoPlayer } = await import('../media-playback');
    const player = new VideoPlayer('test', new Blob(['data']));
    expect(player.mediaType).toBe('video');
    player.destroy();
  });

  it('transitions to playing state on play()', async () => {
    const { VideoPlayer } = await import('../media-playback');
    const player = new VideoPlayer('test', new Blob(['data']));
    player.play();
    expect(player.state).toBe('playing');
    player.destroy();
  });

  it('transitions to paused state on pause()', async () => {
    const { VideoPlayer } = await import('../media-playback');
    const player = new VideoPlayer('test', new Blob(['data']));
    player.play();
    player.pause();
    expect(player.state).toBe('paused');
    player.destroy();
  });

  it('calls onFrame when a frame is decoded after init', async () => {
    const { VideoPlayer } = await import('../media-playback');
    const player = new VideoPlayer('test', new Blob(['data']));
    const frameSpy = vi.fn();
    player.onFrame = frameSpy;
    // Wait for async init to complete
    await new Promise((r) => setTimeout(r, 100));
    expect(frameSpy).toHaveBeenCalled();
    player.destroy();
  });

  it('seek wraps time by duration for looping videos', async () => {
    const { VideoPlayer } = await import('../media-playback');
    const player = new VideoPlayer('test', new Blob(['data']));
    await new Promise((r) => setTimeout(r, 100));
    mediabunnyMocks.mockSink.getCanvas.mockClear();

    await player.seek(7.5); // 7.5 % 5.0 = 2.5

    expect(mediabunnyMocks.mockSink.getCanvas).toHaveBeenCalledWith(2.5);
    player.destroy();
  });

  it('seek clamps time to duration when loop is false', async () => {
    const { VideoPlayer } = await import('../media-playback');
    const player = new VideoPlayer('test', new Blob(['data']), false);
    await new Promise((r) => setTimeout(r, 100));
    mediabunnyMocks.mockSink.getCanvas.mockClear();

    await player.seek(7.5);

    expect(mediabunnyMocks.mockSink.getCanvas).toHaveBeenCalledWith(5.0);
    player.destroy();
  });

  it('constructs mediabunny Input with BlobSource', async () => {
    const { VideoPlayer } = await import('../media-playback');
    const blob = new Blob(['video-data'], { type: 'video/mp4' });
    const player = new VideoPlayer('test', blob);

    await new Promise((r) => setTimeout(r, 0));

    expect(mediabunnyMocks.BlobSourceMock).toHaveBeenCalledWith(blob);
    expect(mediabunnyMocks.InputMock).toHaveBeenCalledWith(
      expect.objectContaining({
        source: expect.anything(),
        formats: expect.any(Array),
      }),
    );

    player.destroy();
  });

  it('warns and leaves duration at zero when no video track is found', async () => {
    mediabunnyMocks.mockInput.getPrimaryVideoTrack.mockResolvedValueOnce(null);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { VideoPlayer } = await import('../media-playback');

    const player = new VideoPlayer('test', new Blob(['data']));
    await new Promise((r) => setTimeout(r, 0));

    expect(player.duration).toBe(0);
    expect(warnSpy).toHaveBeenCalledWith('VideoPlayer: no video track found');
    player.destroy();
  });

  it('warns when frame decoding fails and keeps the player reusable', async () => {
    mediabunnyMocks.mockSink.getCanvas.mockRejectedValueOnce(new Error('decode failed'));
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { VideoPlayer } = await import('../media-playback');

    const player = new VideoPlayer('test', new Blob(['data']));
    await new Promise((r) => setTimeout(r, 0));

    expect(warnSpy).toHaveBeenCalledWith('VideoPlayer: frame decode error', expect.any(Error));

    mediabunnyMocks.mockSink.getCanvas.mockResolvedValueOnce({
      canvas: document.createElement('canvas'),
    });
    await player.seek(0.5);
    expect(mediabunnyMocks.mockSink.getCanvas).toHaveBeenLastCalledWith(0.5);
    player.destroy();
  });

  it('stops playback at the end when looping is disabled', async () => {
    const { VideoPlayer } = await import('../media-playback');
    const player = new VideoPlayer('test', new Blob(['data']), false);
    await new Promise((r) => setTimeout(r, 0));
    vi.spyOn(performance, 'now').mockReturnValue(6_000);
    (player as any)._state = 'playing';
    (player as any)._duration = 5;
    (player as any).startTime = 0;

    (player as any).tick();

    expect(player.state).toBe('paused');
    player.destroy();
  });

  it('rewinds instead of pausing when looping videos reach the end', async () => {
    vi.spyOn(performance, 'now').mockReturnValue(6_000);
    const { VideoPlayer } = await import('../media-playback');
    const player = new VideoPlayer('test', new Blob(['data']), true);
    await new Promise((r) => setTimeout(r, 0));
    const decodeSpy = vi.spyOn(player as any, 'decodeFrameAtTime');
    (player as any)._state = 'playing';
    (player as any)._duration = 5;
    (player as any).startTime = 0;

    (player as any).tick();

    expect(player.state).toBe('playing');
    expect(decodeSpy).toHaveBeenCalledWith(1);
    player.destroy();
  });

  it('updates playback offsets when seeking while already playing', async () => {
    vi.spyOn(performance, 'now').mockReturnValue(7_000);
    const { VideoPlayer } = await import('../media-playback');
    const player = new VideoPlayer('test', new Blob(['data']), true);
    await new Promise((r) => setTimeout(r, 0));

    (player as any)._state = 'playing';
    (player as any)._duration = 5;
    (player as any).startTime = 0;
    await player.seek(7.5);

    expect((player as any).pausedAt).toBe(2_500);
    expect((player as any).startTime).toBe(4_500);
    player.destroy();
  });

  it('schedules and cancels animation frames during video play/pause', async () => {
    const rafSpy = vi.fn<(cb: FrameRequestCallback) => number>().mockReturnValue(7);
    const cancelSpy = vi.fn();
    vi.stubGlobal('requestAnimationFrame', rafSpy);
    vi.stubGlobal('cancelAnimationFrame', cancelSpy);
    const { VideoPlayer } = await import('../media-playback');
    const player = new VideoPlayer('test', new Blob(['data']), true);

    await new Promise((r) => setTimeout(r, 0));
    player.play();
    await new Promise((r) => setTimeout(r, 0));
    player.pause();

    expect(rafSpy).toHaveBeenCalled();
    expect(cancelSpy).toHaveBeenCalledWith(7);
    player.destroy();
  });
});

describe('AnimatedImagePlayer', () => {
  beforeEach(() => {
    imageDecoderMocks.decode.mockClear();
  });

  it('has animated mediaType', async () => {
    const { AnimatedImagePlayer } = await import('../media-playback');
    const player = new AnimatedImagePlayer('test', new Blob(['data']), 'image/gif');
    expect(player.mediaType).toBe('animated');
    player.destroy();
  });

  it('starts in idle state', async () => {
    const { AnimatedImagePlayer } = await import('../media-playback');
    const player = new AnimatedImagePlayer('test', new Blob(['data']), 'image/gif');
    expect(player.state).toBe('idle');
    player.destroy();
  });

  it('transitions to playing on play()', async () => {
    const { AnimatedImagePlayer } = await import('../media-playback');
    const player = new AnimatedImagePlayer('test', new Blob(['data']), 'image/gif');
    player.play();
    expect(player.state).toBe('playing');
    player.destroy();
  });

  it('transitions to paused on pause()', async () => {
    const { AnimatedImagePlayer } = await import('../media-playback');
    const player = new AnimatedImagePlayer('test', new Blob(['data']), 'image/gif');
    player.play();
    player.pause();
    expect(player.state).toBe('paused');
    player.destroy();
  });

  it('wraps seek time by total duration for looping animated media', async () => {
    const { AnimatedImagePlayer } = await import('../media-playback');
    const player = new AnimatedImagePlayer('test', new Blob(['data']), 'image/gif');

    await new Promise((resolve) => setTimeout(resolve, 0));
    imageDecoderMocks.decode.mockClear();

    await player.seek(0.8);

    expect(imageDecoderMocks.decode).toHaveBeenCalledWith({ frameIndex: 2 });

    imageDecoderMocks.decode.mockClear();
    await player.seek(1.55);

    expect(imageDecoderMocks.decode).toHaveBeenCalledWith({ frameIndex: 0 });
    player.destroy();
  });

  it('can seek to the first frame without waiting for the full timing scan', async () => {
    let releaseFrameOne: (() => void) | null = null;
    imageDecoderMocks.decode.mockImplementation(({ frameIndex }: { frameIndex: number }) => {
      if (frameIndex === 0) {
        return Promise.resolve({
          image: {
            duration: 100_000,
            close: vi.fn(),
          },
        });
      }
      return new Promise((resolve) => {
        releaseFrameOne = () => resolve({
          image: {
            duration: 150_000,
            close: vi.fn(),
          },
        });
      });
    });

    const { AnimatedImagePlayer } = await import('../media-playback');
    const player = new AnimatedImagePlayer('test', new Blob(['data']), 'image/gif');

    const result = await Promise.race([
      player.seek(0).then(() => 'resolved'),
      new Promise((resolve) => setTimeout(() => resolve('timed-out'), 20)),
    ]);

    expect(result).toBe('resolved');

    releaseFrameOne?.();
    player.destroy();
  });

  it('can seek while timing metadata is still scanning on a separate decoder', async () => {
    vi.resetModules();

    let playbackDecoder: SerialBlockingImageDecoder | null = null;
    let timingDecoder: SerialBlockingImageDecoder | null = null;
    let releaseTimingScan: (() => void) | null = null;

    class SerialBlockingImageDecoder {
      private tail = Promise.resolve();
      tracks = {
        selectedTrack: {
          frameCount: 3,
        },
      };

      completed = Promise.resolve();

      async decode({ frameIndex }: { frameIndex: number }) {
        const run = async () => {
          if (this === timingDecoder && frameIndex === 1) {
            await new Promise<void>((resolve) => {
              releaseTimingScan = resolve;
            });
          }

          return {
            image: {
              duration: [100_000, 150_000, 250_000][frameIndex] ?? 100_000,
              close: vi.fn(),
            },
          };
        };

        const resultPromise = this.tail.then(run);
        this.tail = resultPromise.then(() => undefined, () => undefined);
        return resultPromise;
      }

      close = vi.fn();
    }

    const ImageDecoderMock = vi.fn(() => {
      const decoder = new SerialBlockingImageDecoder();
      if (!playbackDecoder) {
        playbackDecoder = decoder;
      } else {
        timingDecoder = decoder;
      }
      return decoder;
    });

    vi.stubGlobal('ImageDecoder', ImageDecoderMock as unknown as typeof ImageDecoder);

    const { AnimatedImagePlayer } = await import('../media-playback');
    const player = new AnimatedImagePlayer('test', new Blob(['data']), 'image/gif');
    await new Promise((resolve) => setTimeout(resolve, 0));

    const result = await Promise.race([
      player.seek(0.25).then(() => 'resolved'),
      new Promise((resolve) => setTimeout(() => resolve('timed-out'), 20)),
    ]);

    expect(result).toBe('resolved');
    expect(ImageDecoderMock).toHaveBeenCalledTimes(2);
    expect(playbackDecoder).not.toBeNull();
    expect(timingDecoder).not.toBeNull();

    releaseTimingScan?.();
    player.destroy();
    vi.stubGlobal('ImageDecoder', imageDecoderMocks.MockImageDecoder as unknown as typeof ImageDecoder);
  });

  it('warns when ImageDecoder is unavailable', async () => {
    vi.stubGlobal('ImageDecoder', undefined);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { AnimatedImagePlayer } = await import('../media-playback');

    const player = new AnimatedImagePlayer('test', new Blob(['data']), 'image/gif');
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(warnSpy).toHaveBeenCalledWith('ImageDecoder not supported in this browser');
    await expect(player.seek(1)).resolves.toBeUndefined();
    player.destroy();
    vi.stubGlobal('ImageDecoder', imageDecoderMocks.MockImageDecoder as unknown as typeof ImageDecoder);
  });

  it('logs init failures from ImageDecoder setup', async () => {
    class FailingImageDecoder {
      tracks = { selectedTrack: { frameCount: 3 } };
      completed = Promise.reject(new Error('decoder failed'));
      decode = vi.fn();
      close = vi.fn();
    }

    vi.stubGlobal('ImageDecoder', FailingImageDecoder as unknown as typeof ImageDecoder);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { AnimatedImagePlayer } = await import('../media-playback');

    const player = new AnimatedImagePlayer('test', new Blob(['data']), 'image/gif');
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(errorSpy).toHaveBeenCalledWith(
      'Failed to init AnimatedImagePlayer:',
      expect.any(Error),
    );
    player.destroy();
    vi.stubGlobal('ImageDecoder', imageDecoderMocks.MockImageDecoder as unknown as typeof ImageDecoder);
  });

  it('pauses at the end of a non-looping animation', async () => {
    const { AnimatedImagePlayer } = await import('../media-playback');
    const player = new AnimatedImagePlayer('test', new Blob(['data']), 'image/gif', false);

    await new Promise((resolve) => setTimeout(resolve, 0));
    vi.spyOn(performance, 'now').mockReturnValue(500);
    (player as any)._state = 'playing';
    (player as any).frameIndex = 2;
    (player as any).frameDurations = [100, 150, 250];
    (player as any).lastFrameTime = 0;

    (player as any).tick();

    expect(player.state).toBe('paused');
    player.destroy();
  });

  it('skips re-decoding when seeking to the current animated frame', async () => {
    const { AnimatedImagePlayer } = await import('../media-playback');
    const player = new AnimatedImagePlayer('test', new Blob(['data']), 'image/gif');

    await new Promise((resolve) => setTimeout(resolve, 0));
    imageDecoderMocks.decode.mockClear();

    await player.seek(0);
    expect(imageDecoderMocks.decode).not.toHaveBeenCalled();
    player.destroy();
  });

  it('cancels an active animation frame when paused after playback starts', async () => {
    const rafSpy = vi.fn<(cb: FrameRequestCallback) => number>().mockReturnValue(42);
    const cancelSpy = vi.fn();
    vi.stubGlobal('requestAnimationFrame', rafSpy);
    vi.stubGlobal('cancelAnimationFrame', cancelSpy);
    const { AnimatedImagePlayer } = await import('../media-playback');

    const player = new AnimatedImagePlayer('test', new Blob(['data']), 'image/gif');
    await new Promise((resolve) => setTimeout(resolve, 0));
    player.play();
    await new Promise((resolve) => setTimeout(resolve, 0));

    player.pause();

    expect(cancelSpy).toHaveBeenCalledWith(42);
    player.destroy();
  });

  it('rewinds to the first frame when a looping animation reaches the end', async () => {
    const rafSpy = vi.fn<(cb: FrameRequestCallback) => number>().mockReturnValue(1);
    vi.stubGlobal('requestAnimationFrame', rafSpy);
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    vi.spyOn(performance, 'now').mockReturnValue(500);
    const { AnimatedImagePlayer } = await import('../media-playback');
    const player = new AnimatedImagePlayer('test', new Blob(['data']), 'image/gif', true);

    await new Promise((resolve) => setTimeout(resolve, 0));
    const decodeSpy = vi.spyOn(player as any, 'decodeFrame');
    (player as any)._state = 'playing';
    (player as any).frameIndex = 2;
    (player as any).frameDurations = [100, 150, 250];
    (player as any).lastFrameTime = 0;

    (player as any).tick();

    expect(decodeSpy).toHaveBeenCalledWith(0);
    expect(rafSpy).toHaveBeenCalled();
    player.destroy();
  });

  it('falls back to default frame timing when timing metadata decode fails', async () => {
    vi.resetModules();

    let decoderCount = 0;
    class TimingFallbackDecoder {
      tracks = { selectedTrack: { frameCount: 3 } };
      completed = Promise.resolve();

      async decode({ frameIndex }: { frameIndex: number }) {
        if (decoderCount > 1 && frameIndex === 1) {
          throw new Error('timing decode failed');
        }
        return {
          image: {
            duration: 100_000,
            close: vi.fn(),
          },
        };
      }

      close = vi.fn();
    }

    const ImageDecoderMock = vi.fn(() => {
      decoderCount += 1;
      return new TimingFallbackDecoder();
    });
    vi.stubGlobal('ImageDecoder', ImageDecoderMock as unknown as typeof ImageDecoder);

    const { AnimatedImagePlayer } = await import('../media-playback');
    const player = new AnimatedImagePlayer('test', new Blob(['data']), 'image/gif', false);
    await new Promise((resolve) => setTimeout(resolve, 0));

    await (player as any).buildFrameTimingMetadata();

    expect((player as any).frameDurations[1]).toBe(100);
    player.destroy();
    vi.stubGlobal('ImageDecoder', imageDecoderMocks.MockImageDecoder as unknown as typeof ImageDecoder);
  });

});
