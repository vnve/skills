import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createDefaultProject, type Scene, type TimelineEvent } from '@vnve/core';
import { compileAudioPlan } from '@vnve/runtime';
import {
  buildRenderContext,
  createEmptyRenderContext,
  type CompiledSceneClip,
  type CompiledSequence,
  type FrameRenderer,
  type SequenceTransition,
  type SequenceTransitionChannelSpec,
} from '@vnve/renderer';
import { createExporter, type ExportOptions } from '../index';

class MockOffscreenCanvas {
  readonly width: number;
  readonly height: number;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
  }

  getContext(_type: string) {
    return createMockContext();
  }
}

function createMockContext(): unknown {
  const noop = () => {};
  return new Proxy({}, {
    get(_target, prop) {
      if (prop === 'canvas') return { width: 1920, height: 1080 };
      return noop;
    },
    set() { return true; },
  });
}

class MockVideoEncoder {
  static async isConfigSupported(config: VideoEncoderConfig) {
    return { supported: true, config };
  }
}

const mediaBunnyMockState = vi.hoisted(() => ({
  failOnAdd: false,
}));

const dynamicResolverMocks = vi.hoisted(() => {
  const loadMock = vi.fn();
  const resolveFramesMock = vi.fn().mockResolvedValue(new Map());
  const disposeMock = vi.fn();
  const createDynamicMediaResolverMock = vi.fn(() => ({
    load: loadMock,
    resolveFrames: resolveFramesMock,
    dispose: disposeMock,
  }));

  return {
    loadMock,
    resolveFramesMock,
    disposeMock,
    createDynamicMediaResolverMock,
  };
});

vi.mock('../dynamic-media-resolver', () => ({
  createDynamicMediaResolver: dynamicResolverMocks.createDynamicMediaResolverMock,
}));

vi.mock('mediabunny', () => {
  class MockBufferTarget {
    buffer: ArrayBuffer | null = null;
  }

  class MockStreamTarget {
    constructor(readonly writable: WritableStream) {}
  }

  class MockCanvasSource {
    constructor(_canvas: unknown, _config: unknown) {}

    async add() {
      if (mediaBunnyMockState.failOnAdd) {
        throw new Error('Encode failure');
      }
    }

    close() {}
  }

  class MockAudioBufferSource {
    constructor(_config: unknown) {}

    async add() {}

    close() {}
  }

  class MockOutput {
    readonly target: MockBufferTarget;

    constructor(opts: { target: MockBufferTarget }) {
      this.target = opts.target;
    }

    addVideoTrack() {}

    addAudioTrack() {}

    async start() {
      if (this.target instanceof MockStreamTarget) {
        const writer = this.target.writable.getWriter();
        await writer.write({ type: 'write', position: 0, data: new Uint8Array([1, 2]) });
        writer.releaseLock();
      }
    }

    async finalize() {
      this.target.buffer = new ArrayBuffer(16);
    }

    async cancel() {}
  }

  class MockMp4OutputFormat {
    constructor(_opts?: unknown) {}
  }

  return {
    AudioBufferSource: MockAudioBufferSource,
    BufferTarget: MockBufferTarget,
    StreamTarget: MockStreamTarget,
    CanvasSource: MockCanvasSource,
    Output: MockOutput,
    Mp4OutputFormat: MockMp4OutputFormat,
  };
});

it('writes encoded bytes to the selected stream without returning a buffered MP4', async () => {
  const write = vi.fn();
  const stream = new WritableStream({ write });
  const blob = await createExporter().export(makeOptions({ outputStream: stream }));
  expect(write.mock.calls[0]?.[0]).toEqual({ type: 'write', position: 0, data: new Uint8Array([1, 2]) });
  expect(blob.size).toBe(0);
});

beforeEach(() => {
  (globalThis as Record<string, unknown>).OffscreenCanvas = MockOffscreenCanvas;
  (globalThis as Record<string, unknown>).VideoEncoder = MockVideoEncoder;
  mediaBunnyMockState.failOnAdd = false;
});

function createMockCanvas(): HTMLCanvasElement {
  return { width: 320, height: 240 } as unknown as HTMLCanvasElement;
}

function createMockFrameRenderer(options?: { withTransition?: boolean }): FrameRenderer & {
  renderFrame: ReturnType<typeof vi.fn>;
  renderTransitionFrame?: ReturnType<typeof vi.fn>;
  dispose: ReturnType<typeof vi.fn>;
} {
  return {
    renderFrame: vi.fn().mockReturnValue(createMockCanvas()),
    renderTransitionFrame: options?.withTransition
      ? vi.fn().mockReturnValue(createMockCanvas())
      : undefined,
    dispose: vi.fn(),
  };
}

function createOpacityChannel(): SequenceTransitionChannelSpec {
  return {
    mode: 'opacity',
    outgoing: { start: 0, end: 1, from: 1, to: 0, easing: 'linear' },
    incoming: { start: 0, end: 1, from: 0, to: 1, easing: 'linear' },
  };
}

function createThroughColorChannel(): SequenceTransitionChannelSpec {
  return {
    mode: 'through-color',
    outgoing: { start: 0, end: 0.5, from: 1, to: 0, easing: 'linear' },
    incoming: { start: 0.5, end: 1, from: 0, to: 1, easing: 'linear' },
  };
}

function createClip(params: {
  sceneId: string;
  startTime: number;
  contentStartTime?: number;
  endTime: number;
  events?: TimelineEvent[];
}): CompiledSceneClip {
  const { sceneId, startTime, contentStartTime = startTime, endTime, events = [] } = params;
  const clipId = `scene:${sceneId}`;

  return {
    clipId,
    sceneId,
    startTime,
    contentStartTime,
    endTime,
    eventTimeBasis: 'sequence-global',
    events,
    channels: {
      shot: { channel: 'shot', clipId },
      dialogue: { channel: 'dialogue', clipId },
    },
  };
}

function createTransition(params: {
  id: string;
  selectionOrder: number;
  effectiveStartTime: number;
  effectiveEndTime: number;
  fromSceneId: string;
  toSceneId: string;
  startTime: number;
  endTime: number;
  effect: SequenceTransition['effect'];
}): SequenceTransition {
  const {
    id,
    selectionOrder,
    effectiveStartTime,
    effectiveEndTime,
    fromSceneId,
    toSceneId,
    startTime,
    endTime,
    effect,
  } = params;

  return {
    id,
    selectionOrder,
    effectiveStartTime,
    effectiveEndTime,
    fromClipId: `scene:${fromSceneId}`,
    toClipId: `scene:${toSceneId}`,
    fromSceneId,
    toSceneId,
    startTime,
    endTime,
    effect,
    channels: {
      shot: effect === 'fade-black' || effect === 'fade-white'
        ? createThroughColorChannel()
        : createOpacityChannel(),
      dialogue: createOpacityChannel(),
    },
  };
}

function createSequence(params?: {
  clips?: CompiledSceneClip[];
  transitions?: SequenceTransition[];
  duration?: number;
  renderContext?: CompiledSequence['renderContext'];
  audioPlan?: CompiledSequence['audioPlan'];
}): CompiledSequence {
  const clips = params?.clips ?? [];
  const transitions = params?.transitions ?? [];
  const duration = params?.duration ?? Math.max(
    0,
    ...clips.map((clip) => clip.endTime),
    ...transitions.map((transition) => transition.endTime),
  );
  const allEvents = clips.flatMap((clip) => clip.events);

  return {
    duration,
    renderContext: params?.renderContext ?? createEmptyRenderContext(),
    audioPlan: params?.audioPlan ?? compileAudioPlan(allEvents, duration),
    sceneClips: clips,
    transitions,
    fallbackSceneId: clips[0]?.sceneId ?? null,
  };
}

const sampleEvents: TimelineEvent[] = [
  { type: 'show', at: 0, dur: 0.5, targetId: 'a', params: { x: 100, y: 200 } },
  { type: 'say', at: 0.5, dur: 2, targetId: 'a', params: { text: 'Hello world' } },
  { type: 'hide', at: 2.5, dur: 0.5, targetId: 'a', params: {} },
];

function createBaseSequence(): CompiledSequence {
  return createSequence({
    clips: [createClip({
      sceneId: 'scene-1',
      startTime: 0,
      endTime: 3,
      events: sampleEvents,
    })],
    duration: 3,
  });
}

const defaultOptions: ExportOptions = {
  width: 1920,
  height: 1080,
  fps: 30,
  sequence: createBaseSequence(),
  frameRenderer: createMockFrameRenderer(),
};

function makeOptions(overrides?: Partial<ExportOptions>): ExportOptions {
  return {
    ...defaultOptions,
    ...overrides,
    frameRenderer: overrides?.frameRenderer ?? createMockFrameRenderer(),
    sequence: overrides?.sequence ?? createBaseSequence(),
  };
}

function createRenderContextFixture() {
  const project = createDefaultProject({ width: 1920, height: 1080 });
  project.assets.visual.character = [
    {
      id: 'char-a',
      name: 'Alice',
      defaultVariantId: 'char-a-v1',
      variants: [{ id: 'char-a-v1', name: 'Neutral', url: '/alice.png', mediaType: 'animated' }],
    },
  ];

  const scene: Scene = {
    id: 'scene-1',
    name: 'Scene 1',
    actors: [{
      id: 'a',
      characterId: 'char-a',
      x: 50,
      y: 100,
      scale: 1,
      visible: true,
      zIndex: 1,
      variantId: 'char-a-v1',
    }],
    script: { nodes: [] },
  };

  return buildRenderContext(project, [scene], new Map());
}

describe('createExporter', () => {
  it('starts in idle state', () => {
    const exporter = createExporter();
    expect(exporter.state).toBe('idle');
  });

  it('transitions idle -> running -> done on successful export', async () => {
    const exporter = createExporter();
    const states: string[] = [];
    exporter.onProgress((progress) => states.push(progress.state));

    await exporter.export(makeOptions());

    expect(exporter.state).toBe('done');
    expect(states[0]).toBe('running');
    expect(states[states.length - 1]).toBe('done');
  });

  it('uses sequence.duration for frame count and progress', async () => {
    const exporter = createExporter();
    let reportedTotal = 0;
    exporter.onProgress((progress) => {
      reportedTotal = progress.totalFrames;
    });

    const sequence = createSequence({
      clips: [createClip({
        sceneId: 'scene-1',
        startTime: 0,
        endTime: 1,
        events: [{ type: 'narrate', at: 0, dur: 1, params: { text: 'Short' } }],
      })],
      duration: 4,
    });

    await exporter.export(makeOptions({ width: 640, height: 480, fps: 10, sequence }));

    expect(reportedTotal).toBe(40);
  });

  it('throws when width, height, or fps are invalid', async () => {
    const exporter = createExporter();

    await expect(exporter.export(makeOptions({ width: 0 }))).rejects.toThrow(
      'width, height and fps must be positive',
    );
    await expect(exporter.export(makeOptions({ height: -1 }))).rejects.toThrow(
      'width, height and fps must be positive',
    );
    await expect(exporter.export(makeOptions({ fps: 0 }))).rejects.toThrow(
      'width, height and fps must be positive',
    );
  });

  it('throws on zero-duration sequences', async () => {
    const exporter = createExporter();

    await expect(exporter.export(makeOptions({
      sequence: createSequence({ duration: 0 }),
    }))).rejects.toThrow('No events to export');
  });

  it('returns empty blob and cancelled state when cancel() is called during export', async () => {
    const exporter = createExporter();
    exporter.onProgress((progress) => {
      if (progress.currentFrame === 1 && progress.state === 'running') {
        exporter.cancel();
      }
    });

    const blob = await exporter.export(makeOptions());

    expect(exporter.state).toBe('cancelled');
    expect(blob.size).toBe(0);
  });

  it('transitions to error on encoding failure', async () => {
    const exporter = createExporter();
    mediaBunnyMockState.failOnAdd = true;

    await expect(exporter.export(makeOptions())).rejects.toThrow('Encode failure');
    expect(exporter.state).toBe('error');
  });

  it('returns an mp4 blob on success', async () => {
    const exporter = createExporter();
    const blob = await exporter.export(makeOptions({ width: 320, height: 240, fps: 10 }));

    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe('video/mp4');
    expect(blob.size).toBeGreaterThan(0);
  });

  it('renders one single-scene frame per sampled export frame', async () => {
    const renderer = createMockFrameRenderer();
    const exporter = createExporter();

    await exporter.export(makeOptions({
      width: 320,
      height: 240,
      fps: 10,
      frameRenderer: renderer,
    }));

    expect(renderer.renderFrame).toHaveBeenCalledTimes(30);
    expect(renderer.dispose).toHaveBeenCalledTimes(1);
  });

  it('renders transition samples through renderTransitionFrame when available', async () => {
    const renderer = createMockFrameRenderer({ withTransition: true });
    const exporter = createExporter();
    const sequence = createSequence({
      clips: [
        createClip({
          sceneId: 'scene-1',
          startTime: 0,
          endTime: 1.5,
          events: [{ type: 'narrate', at: 0, dur: 1.5, params: { text: 'One' } }],
        }),
        createClip({
          sceneId: 'scene-2',
          startTime: 1,
          endTime: 2,
          events: [{ type: 'narrate', at: 1, dur: 1, params: { text: 'Two' } }],
        }),
      ],
      transitions: [
        createTransition({
          id: 'transition:scene-1->scene-2',
          selectionOrder: 0,
          effectiveStartTime: 1,
          effectiveEndTime: 1.5,
          fromSceneId: 'scene-1',
          toSceneId: 'scene-2',
          startTime: 1,
          endTime: 1.5,
          effect: 'fade-black',
        }),
      ],
      duration: 2,
    });

    await exporter.export(makeOptions({
      width: 320,
      height: 240,
      fps: 8,
      frameRenderer: renderer,
      sequence,
    }));

    expect(renderer.renderTransitionFrame).toHaveBeenCalled();
  });

  it('falls back to renderFrame with the incoming scene when transition rendering is unavailable', async () => {
    const renderer = createMockFrameRenderer();
    const exporter = createExporter();
    const sequence = createSequence({
      clips: [
        createClip({
          sceneId: 'scene-1',
          startTime: 0,
          endTime: 1.5,
          events: [{ type: 'narrate', at: 0, dur: 1.5, params: { text: 'One' } }],
        }),
        createClip({
          sceneId: 'scene-2',
          startTime: 1,
          endTime: 2,
          events: [{ type: 'narrate', at: 1, dur: 1, params: { text: 'Two' } }],
        }),
      ],
      transitions: [
        createTransition({
          id: 'transition:scene-1->scene-2',
          selectionOrder: 0,
          effectiveStartTime: 1,
          effectiveEndTime: 1.5,
          fromSceneId: 'scene-1',
          toSceneId: 'scene-2',
          startTime: 1,
          endTime: 1.5,
          effect: 'fade-black',
        }),
      ],
      duration: 2,
    });

    await exporter.export(makeOptions({
      width: 320,
      height: 240,
      fps: 8,
      frameRenderer: renderer,
      sequence,
    }));

    const transitionRenderCall = renderer.renderFrame.mock.calls.find(
      ([state]) => state.narration?.text === 'Two',
    );
    expect(transitionRenderCall).toBeDefined();
  });

  it('maps dialogue speaker id to display name when the sequence renderContext is provided', async () => {
    const renderer = createMockFrameRenderer();
    const exporter = createExporter();
    const renderContext = createRenderContextFixture();
    const sequence = createSequence({
      clips: [createClip({
        sceneId: 'scene-1',
        startTime: 0,
        endTime: 3,
        events: sampleEvents,
      })],
      duration: 3,
      renderContext,
    });

    await exporter.export(makeOptions({
      width: 320,
      height: 240,
      fps: 10,
      frameRenderer: renderer,
      sequence,
      assets: { renderContext },
    }));

    const dialogueCall = renderer.renderFrame.mock.calls.find((call) => call[0].dialogue);
    expect(dialogueCall).toBeDefined();
    expect(dialogueCall![0].dialogue?.speaker).toBe('Alice');
  });

  it('resolves dynamic media frames using sampled sequence time before rendering', async () => {
    dynamicResolverMocks.createDynamicMediaResolverMock.mockClear();
    dynamicResolverMocks.loadMock.mockClear();
    dynamicResolverMocks.resolveFramesMock.mockClear();
    dynamicResolverMocks.disposeMock.mockClear();

    const originalFetch = globalThis.fetch;
    const originalCreateImageBitmap = globalThis.createImageBitmap;
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      blob: async () => new Blob(['asset'], { type: 'image/gif' }),
    })) as typeof fetch;
    globalThis.createImageBitmap = vi.fn().mockResolvedValue({
      close: vi.fn(),
    }) as typeof createImageBitmap;

    const renderer = createMockFrameRenderer();
    const exporter = createExporter();
    const renderContext = createRenderContextFixture();
    const sequence = createSequence({
      clips: [createClip({
        sceneId: 'scene-1',
        startTime: 0,
        endTime: 3,
        events: sampleEvents,
      })],
      duration: 3,
      renderContext,
    });

    await exporter.export(makeOptions({
      width: 320,
      height: 240,
      fps: 10,
      frameRenderer: renderer,
      sequence,
      assets: { renderContext },
    }));

    expect(dynamicResolverMocks.createDynamicMediaResolverMock).toHaveBeenCalledTimes(1);
    expect(dynamicResolverMocks.loadMock).toHaveBeenCalledWith(new Map([
      ['/alice.png', 'animated'],
    ]));
    expect(dynamicResolverMocks.resolveFramesMock).toHaveBeenCalledWith(['/alice.png'], 0, { throwOnMissing: true });

    globalThis.fetch = originalFetch;
    globalThis.createImageBitmap = originalCreateImageBitmap;
  });

  it('rejects a required image failure, ignores unused images, and allows recovery', async () => {
    const originalFetch = globalThis.fetch;
    const originalBitmap = globalThis.createImageBitmap;
    const close = vi.fn();
    const renderContext = createRenderContextFixture();
    renderContext.variantMediaTypesByUrl.set('/alice.png', 'static');
    renderContext.imageUrls.push('/unused.png');
    const sequence = createSequence({
      clips: [createClip({ sceneId: 'scene-1', startTime: 0, endTime: 1, events: sampleEvents })],
      duration: 1, renderContext,
    });
    const exporter = createExporter();
    try {
      globalThis.fetch = vi.fn().mockResolvedValue({ ok: false }) as typeof fetch;
      const renderer = createMockFrameRenderer();
      await expect(exporter.export(makeOptions({ sequence, frameRenderer: renderer, assets: { renderContext } })))
        .rejects.toMatchObject({ code: 'MEDIA_UNAVAILABLE' });
      expect(renderer.dispose).toHaveBeenCalledOnce();
      expect(exporter.state).toBe('error');
      globalThis.fetch = vi.fn(async (url) => ({
        ok: url === '/alice.png', blob: async () => new Blob(),
      })) as typeof fetch;
      globalThis.createImageBitmap = vi.fn().mockResolvedValue({ close }) as typeof createImageBitmap;
      await expect(exporter.export(makeOptions({ sequence, assets: { renderContext } }))).resolves.toBeInstanceOf(Blob);
      expect(close).toHaveBeenCalledOnce();
    } finally {
      globalThis.fetch = originalFetch;
      globalThis.createImageBitmap = originalBitmap;
    }
  });

  it('fails instead of encoding an omitted required video and allows the next export', async () => {
    const renderContext = createRenderContextFixture();
    const sequence = createSequence({
      clips: [createClip({ sceneId: 'scene-1', startTime: 0, endTime: 1, events: sampleEvents })],
      duration: 1, renderContext,
    });
    const exporter = createExporter();
    const failedRenderer = createMockFrameRenderer();
    dynamicResolverMocks.resolveFramesMock.mockRejectedValueOnce(
      Object.assign(new Error('Missing video'), { code: 'DYNAMIC_MEDIA_UNAVAILABLE' }),
    );
    dynamicResolverMocks.disposeMock.mockClear();
    await expect(exporter.export(makeOptions({ sequence, frameRenderer: failedRenderer })))
      .rejects.toMatchObject({ code: 'DYNAMIC_MEDIA_UNAVAILABLE' });
    expect(exporter.state).toBe('error');
    expect(failedRenderer.dispose).toHaveBeenCalledOnce();
    expect(dynamicResolverMocks.disposeMock).toHaveBeenCalledOnce();
    const retryRenderer = createMockFrameRenderer();
    await expect(exporter.export(makeOptions({ sequence, frameRenderer: retryRenderer })))
      .resolves.toBeInstanceOf(Blob);
  });

  it('disposes the frame renderer and dynamic resolver on export error', async () => {
    const renderer = createMockFrameRenderer();
    const exporter = createExporter();
    mediaBunnyMockState.failOnAdd = true;
    const renderContext = createRenderContextFixture();
    const sequence = createSequence({
      clips: [createClip({
        sceneId: 'scene-1',
        startTime: 0,
        endTime: 3,
        events: sampleEvents,
      })],
      duration: 3,
      renderContext,
    });

    await expect(exporter.export(makeOptions({
      width: 320,
      height: 240,
      fps: 10,
      frameRenderer: renderer,
      sequence,
      assets: { renderContext },
    }))).rejects.toThrow('Encode failure');

    expect(renderer.dispose).toHaveBeenCalledTimes(1);
    expect(dynamicResolverMocks.disposeMock).toHaveBeenCalled();
  });
});

describe('createExporter audio', () => {
  const originalFetch = globalThis.fetch;
  const originalOfflineAudioContext = (globalThis as { OfflineAudioContext?: unknown }).OfflineAudioContext;

  class MockOfflineAudioContext {
    static rampCalls: Array<{ value: number; time: number }> = [];
    static setCalls: Array<{value: number; time: number}> = [];
    readonly destination = {};

    constructor(
      _channels: number,
      _length: number,
      _sampleRate: number,
    ) {}

    async decodeAudioData(_arrayBuffer: ArrayBuffer): Promise<AudioBuffer> {
      return { duration: 10 } as AudioBuffer;
    }

    createBufferSource() {
      return {
        buffer: null as AudioBuffer | null,
        loop: false,
        connect: () => {},
        disconnect: () => {},
        start: () => {},
        stop: () => {},
      };
    }

    createGain() {
      return {
        gain: {
          setValueAtTime: (value: number, time: number) => { MockOfflineAudioContext.setCalls.push({value, time}); },
          cancelScheduledValues: (_time: number) => {},
          linearRampToValueAtTime: (value: number, time: number) => {
            MockOfflineAudioContext.rampCalls.push({ value, time });
          },
        },
        connect: () => {},
        disconnect: () => {},
      };
    }

    async startRendering(): Promise<AudioBuffer> {
      return {} as AudioBuffer;
    }
  }

  beforeEach(() => {
    MockOfflineAudioContext.rampCalls = [];
    MockOfflineAudioContext.setCalls = [];
    (globalThis as { OfflineAudioContext?: unknown }).OfflineAudioContext = MockOfflineAudioContext;
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(16),
      blob: async () => new Blob(),
    })) as typeof fetch;
  });

  it('renders export audio from sequence.audioPlan', async () => {
    const exporter = createExporter();
    const events: TimelineEvent[] = [
      {
        type: 'say',
        at: 0,
        dur: 1.2,
        targetId: 'a',
        params: {
          text: 'Hello',
          audioUrl: 'assets/audio/tts-line.wav',
        },
      },
    ];
    const sequence = createSequence({
      clips: [createClip({
        sceneId: 'scene-1',
        startTime: 0,
        endTime: 1.2,
        events,
      })],
      duration: 1.2,
      audioPlan: compileAudioPlan(events, 1.2),
    });

    await exporter.export(makeOptions({
      width: 320,
      height: 240,
      fps: 10,
      sequence,
      assets: {
        renderContext: createEmptyRenderContext(),
        audioFiles: {
          'assets/audio/tts-line.wav': '/audio/tts-line.wav',
        },
      },
    }));

    expect(globalThis.fetch).toHaveBeenCalledWith('/audio/tts-line.wav');
  });

  it('rejects missing required audio without loading unused audio and supports recovery', async () => {
    const events: TimelineEvent[] = [{ type: 'say', at: 0, dur: 1, targetId: 'a',
      params: { text: 'Hello', audioUrl: 'voice.wav' } }];
    const sequence = createSequence({
      clips: [createClip({ sceneId: 'scene-1', startTime: 0, endTime: 1, events })],
      duration: 1, audioPlan: compileAudioPlan(events, 1),
    });
    const exporter = createExporter();
    const options = makeOptions({ sequence, assets: { renderContext: createEmptyRenderContext(),
      audioFiles: { 'voice.wav': '/voice.wav', 'unused.wav': '/unused.wav' } } });
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false }) as typeof fetch;
    await expect(exporter.export(options)).rejects.toMatchObject({ code: 'MEDIA_UNAVAILABLE' });
    expect(globalThis.fetch).not.toHaveBeenCalledWith('/unused.wav');
    await expect(exporter.export(makeOptions({ sequence })))
      .rejects.toMatchObject({ code: 'MEDIA_UNAVAILABLE' });
    globalThis.fetch = vi.fn(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(16) })) as typeof fetch;
    const decode = vi.spyOn(MockOfflineAudioContext.prototype, 'decodeAudioData')
      .mockRejectedValueOnce(new Error('Corrupt audio'));
    await expect(exporter.export(options)).rejects.toMatchObject({ code: 'MEDIA_UNAVAILABLE' });
    decode.mockRestore();
    vi.mocked(globalThis.fetch).mockClear();
    await expect(exporter.export(options)).resolves.toBeInstanceOf(Blob);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it('fades out BGM after pause and stop at the same boundary as preview', async () => {
    const events: TimelineEvent[] = [
      { type: 'bgm', at: 0, dur: 0, params: { action: 'play', asset: 'tone.wav', fade: 0.3 } },
      { type: 'bgm', at: 1, dur: 0, params: { action: 'pause', fade: 0.4 } },
      { type: 'bgm', at: 2, dur: 0, params: { action: 'resume' } },
      { type: 'bgm', at: 3, dur: 0, params: { action: 'stop', fade: 0.2 } },
    ];
    const sequence = createSequence({
      clips: [createClip({ sceneId: 'scene-1', startTime: 0, endTime: 4, events })],
      duration: 4, audioPlan: compileAudioPlan(events, 4),
    });
    await createExporter().export(makeOptions({
      width: 320, height: 240, fps: 10, sequence,
      assets: { renderContext: createEmptyRenderContext(), audioFiles: { 'tone.wav': '/tone.wav' } },
    }));
    expect(MockOfflineAudioContext.rampCalls).toContainEqual({ value: 0, time: 1.4 });
    expect(MockOfflineAudioContext.rampCalls).toContainEqual({ value: 0, time: 3.2 });
  });

  it('holds the instantaneous opening and duck gains when fades overlap', async () => {
    const events: TimelineEvent[] = [
      { type: 'bgm', at: 0, dur: 0, params: { asset: 'tone.wav', volume: 0.8, fade: 2, duck: 0.5 } },
      { type: 'say', at: 0.5, dur: 0.5, targetId: 'a', params: { text: 'Short line' } },
    ];
    const sequence = createSequence({
      clips: [createClip({ sceneId: 'scene-1', startTime: 0, endTime: 4, events })],
      duration: 4, audioPlan: compileAudioPlan(events, 4),
    });
    await createExporter().export(makeOptions({
      width: 320, height: 240, fps: 10, sequence,
      assets: { renderContext: createEmptyRenderContext(), audioFiles: { 'tone.wav': '/tone.wav' } },
    }));
    expect(MockOfflineAudioContext.rampCalls).toContainEqual({ value: 0.2, time: 0.5 });
    expect(MockOfflineAudioContext.rampCalls).toContainEqual({ value: 0.25, time: 1 });
  });

  it('applies duck and release ramps around speech windows', async () => {
    const exporter = createExporter();
    const events: TimelineEvent[] = [
      {
        type: 'bgm',
        at: 0,
        dur: 0,
        params: { action: 'play', asset: 'theme.mp3', volume: 0.8, fade: 0.2, duck: 0.5 },
      },
      ...sampleEvents,
    ];
    const sequence = createSequence({
      clips: [createClip({
        sceneId: 'scene-1',
        startTime: 0,
        endTime: 3,
        events,
      })],
      duration: 3,
      audioPlan: compileAudioPlan(events, 3),
    });

    await exporter.export(makeOptions({
      width: 320,
      height: 240,
      fps: 10,
      sequence,
      assets: {
        renderContext: createEmptyRenderContext(),
        audioFiles: { 'theme.mp3': '/audio/theme.mp3' },
      },
    }));

    const hasDuckRamp = MockOfflineAudioContext.rampCalls.some(
      (call) => Math.abs(call.value - 0.4) < 0.0001 && Math.abs(call.time - 0.7) < 0.0001,
    );
    const hasReleaseRamp = MockOfflineAudioContext.rampCalls.some(
      (call) => Math.abs(call.value - 0.8) < 0.0001 && Math.abs(call.time - 2.7) < 0.0001,
    );

    expect(MockOfflineAudioContext.setCalls).toContainEqual({value: 0.8, time: 0.5});
    expect(MockOfflineAudioContext.setCalls).toContainEqual({value: 0.4, time: 2.5});
    expect(hasDuckRamp).toBe(true);
    expect(hasReleaseRamp).toBe(true);
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    (globalThis as { OfflineAudioContext?: unknown }).OfflineAudioContext = originalOfflineAudioContext;
  });
});
