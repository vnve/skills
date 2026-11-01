import { type MediaType } from '@vnve/core';
import { type CompiledAudioPlan } from '@vnve/runtime';
import { sampleSequence, type PreparedFrameInput, type RenderContext } from '@vnve/renderer';
import { AudioBufferSource, BufferTarget, StreamTarget, CanvasSource, Mp4OutputFormat, Output } from 'mediabunny';
import type { ExportState, ExportProgress, ExportOptions } from './types';
import { createDynamicMediaResolver, type DynamicMediaResolver } from './dynamic-media-resolver';

export interface Exporter {
  export(options: ExportOptions): Promise<Blob>;
  cancel(): void;
  onProgress(cb: (progress: ExportProgress) => void): () => void;
  readonly state: ExportState;
}

function defaultBitrate(width: number, height: number): number {
  return width * height * 8;
}

function validateOptions(options: ExportOptions) {
  const { width, height, fps } = options;
  if (width <= 0 || height <= 0 || fps <= 0) {
    throw new Error('Invalid export options: width, height and fps must be positive');
  }
}

function ensureVideoEncoderSupport() {
  const Encoder = (globalThis as { VideoEncoder?: { isConfigSupported?: (config: VideoEncoderConfig) => Promise<{ supported: boolean; config: VideoEncoderConfig }> } }).VideoEncoder;
  if (!Encoder) {
    throw new Error('VideoEncoder is not supported in this environment');
  }
  if (typeof Encoder.isConfigSupported !== 'function') {
    Encoder.isConfigSupported = async (config: VideoEncoderConfig) => ({ supported: true, config });
  }
}

class MediaUnavailableError extends Error {
  readonly code = 'MEDIA_UNAVAILABLE';

  constructor() {
    super('Required media could not be loaded. Restore or replace it and retry.');
    this.name = 'MediaUnavailableError';
  }
}

// --- Image preloading ---

interface LoadedAssets {
  imagesByUrl: Map<string, ImageBitmap>;
  failedImageUrls: Set<string>;
}

async function loadImageFromUrl(url: string): Promise<ImageBitmap | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const blob = await response.blob();
    return await createImageBitmap(blob);
  } catch {
    return null;
  }
}

async function preloadAssets(renderContext: RenderContext): Promise<LoadedAssets> {
  const imagesByUrl = new Map<string, ImageBitmap>();
  const failedImageUrls = new Set<string>();
  const urls = renderContext.imageUrls.filter((url) => {
    const mediaType = renderContext.variantMediaTypesByUrl.get(url);
    return mediaType !== 'animated' && mediaType !== 'video';
  });
  const bitmaps = await Promise.all(urls.map((url) => loadImageFromUrl(url)));

  for (let i = 0; i < urls.length; i++) {
    const bitmap = bitmaps[i];
    if (!bitmap) {
      failedImageUrls.add(urls[i]);
      continue;
    }
    imagesByUrl.set(urls[i], bitmap);
  }

  return { imagesByUrl, failedImageUrls };
}

async function createDynamicResolver(renderContext?: RenderContext): Promise<DynamicMediaResolver | null> {
  if (!renderContext) return null;
  const entries = new Map(
    [...renderContext.variantMediaTypesByUrl].filter(([, mediaType]) => mediaType === 'animated' || mediaType === 'video'),
  );
  if (entries.size === 0) return null;

  const resolver = createDynamicMediaResolver();
  await resolver.load(entries);
  return resolver;
}

function collectDynamicUrls(
  prepared: PreparedFrameInput,
  mediaTypesByUrl: Map<string, MediaType>,
): string[] {
  const urls = new Set<string>();
  const maybeAdd = (value: CanvasImageSource | null | undefined) => {
    if (typeof value !== 'string') return;
    const mediaType = mediaTypesByUrl.get(value);
    if (mediaType === 'animated' || mediaType === 'video') {
      urls.add(value);
    }
  };

  for (const value of prepared.imageMap.actors.values()) maybeAdd(value);
  for (const value of prepared.imageMap.actorPrevious?.values() ?? []) maybeAdd(value);
  for(const value of prepared.imageMap.layerVariants?.values()??[])maybeAdd(value);
  maybeAdd(prepared.imageMap.background);
  maybeAdd(prepared.imageMap.cg);
  maybeAdd(prepared.frameOptions.dialogueBoxImage);

  return [...urls];
}

function closeAllBitmaps(loaded: LoadedAssets): void {
  for (const bitmap of loaded.imagesByUrl.values()) bitmap.close();
}

// --- Audio preloading & rendering ---

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

async function loadAudioBufferFromUrl(
  url: string,
  sampleRate: number,
): Promise<AudioBuffer> {
  try {
    const response = await fetch(url);
    if (!response.ok) throw new MediaUnavailableError();
    const arrayBuffer = await response.arrayBuffer();
    // Use OfflineAudioContext for decoding to ensure consistent sample rate
    const decodeCtx = new OfflineAudioContext(2, 1, sampleRate);
    return await decodeCtx.decodeAudioData(arrayBuffer);
  } catch {
    throw new MediaUnavailableError();
  }
}

async function preloadAudioAssets(
  audioFiles: Record<string, string>,
  sampleRate: number,
  audioPlan: CompiledAudioPlan,
): Promise<Map<string, AudioBuffer>> {
  const buffers = new Map<string, AudioBuffer>();
  const requiredAssets = new Set([
    ...audioPlan.bgmSegments.map((segment) => segment.asset),
    ...audioPlan.sfxTriggers.map((trigger) => trigger.asset),
    ...audioPlan.voiceSegments.map((segment) => segment.asset),
  ]);
  const entries = [...requiredAssets].map((asset) => {
    const url = audioFiles[asset];
    if (!url) throw new MediaUnavailableError();
    return [asset, url] as const;
  });
  const results = await Promise.all(
    entries.map(([, url]) => loadAudioBufferFromUrl(url, sampleRate)),
  );
  for (let i = 0; i < entries.length; i++) {
    const buffer = results[i];
    if (buffer) buffers.set(entries[i][0], buffer);
  }
  return buffers;
}

async function renderAudioTrack(
  audioPlan: CompiledAudioPlan,
  audioBuffers: Map<string, AudioBuffer>,
): Promise<AudioBuffer | null> {
  if (
    audioPlan.bgmSegments.length === 0 &&
    audioPlan.sfxTriggers.length === 0 &&
    audioPlan.voiceSegments.length === 0
  ) {
    return null;
  }

  // Check that at least one event has a loaded buffer
  const hasAnyBuffer =
    audioPlan.bgmSegments.some((segment) => audioBuffers.has(segment.asset)) ||
    audioPlan.sfxTriggers.some((trigger) => audioBuffers.has(trigger.asset)) ||
    audioPlan.voiceSegments.some((voice) => audioBuffers.has(voice.asset));
  if (!hasAnyBuffer) return null;

  const sampleRate = 44100;
  const channels = 2;
  const totalSamples = Math.ceil(audioPlan.duration * sampleRate);
  if (totalSamples <= 0) return null;

  const offlineCtx = new OfflineAudioContext(channels, totalSamples, sampleRate);
  const speechWindows = audioPlan.speechWindows;

  for (const segment of audioPlan.bgmSegments) {
    const buffer = audioBuffers.get(segment.asset);
    if (!buffer) continue;
    const playDuration = segment.end - segment.start;
    if (playDuration <= 0) continue;

    const source = offlineCtx.createBufferSource();
    source.buffer = buffer;
    source.loop = segment.loop;

    const gain = offlineCtx.createGain();
    const safeFade = Math.max(0, segment.fade);
    const duckFactor = clamp01(segment.duck);
    const isSpeechActiveAt = (time: number) =>
      speechWindows.some((window) => time >= window.start && time < window.end);
    const computeGain = (ducked: boolean) => segment.volume * (ducked ? duckFactor : 1);

    const initialDucked = isSpeechActiveAt(segment.start);
    const initialGain = computeGain(initialDucked);
    if (safeFade > 0) {
      gain.gain.setValueAtTime(0, segment.start);
      gain.gain.linearRampToValueAtTime(initialGain, Math.min(segment.end, segment.start + safeFade));
    } else {
      gain.gain.setValueAtTime(initialGain, segment.start);
    }

    let gainRamp = {
      start: segment.start,
      end: Math.min(segment.end, segment.start + safeFade),
      from: safeFade > 0 ? 0 : initialGain,
      to: initialGain,
    };
    const rampGain = (target: number, time: number, end: number) => {
      const progress = gainRamp.end > gainRamp.start
        ? Math.max(0, Math.min(1, (time - gainRamp.start) / (gainRamp.end - gainRamp.start)))
        : 1;
      const held = gainRamp.from + (gainRamp.to - gainRamp.from) * progress;
      // Offline cancelAndHold alone does not anchor a later ramp after a constant interval.
      if (time < gainRamp.end) {
        gain.gain.cancelScheduledValues(time);
        gain.gain.linearRampToValueAtTime(held, time);
      } else {
        gain.gain.setValueAtTime(held, time);
      }
      if (end > time) gain.gain.linearRampToValueAtTime(target, end);
      else gain.gain.setValueAtTime(target, time);
      gainRamp = { start: time, end, from: held, to: target };
    };

    if (duckFactor < 1) {
      for (const window of speechWindows) {
        if (window.end <= segment.start || window.start >= segment.end) continue;
        const boundaryStart = Math.max(segment.start, window.start);
        const boundaryEnd = Math.min(segment.end, window.end);
        if (boundaryStart > segment.start) {
          rampGain(computeGain(true), boundaryStart, Math.min(segment.end, boundaryStart + safeFade));
        }
        if (boundaryEnd > segment.start && boundaryEnd < segment.end) {
          rampGain(computeGain(false), boundaryEnd, Math.min(segment.end, boundaryEnd + safeFade));
        }
      }
    }

    source.connect(gain);
    gain.connect(offlineCtx.destination);
    const offset = buffer.duration > 0 ? ((segment.offset % buffer.duration) + buffer.duration) % buffer.duration : 0;
    source.start(segment.start, offset);
    const fadeOut = Math.max(0, segment.fadeOut ?? 0);
    const stopAt = Math.min(audioPlan.duration, segment.end + fadeOut);
    if (fadeOut > 0 && stopAt > segment.end) {
      rampGain(0, segment.end, stopAt);
    }
    source.stop(stopAt);
  }

  // Process SFX events: each SFX plays once at its trigger time
  for (const sfx of audioPlan.sfxTriggers) {
    const buffer = audioBuffers.get(sfx.asset);
    if (!buffer) continue;

    const source = offlineCtx.createBufferSource();
    source.buffer = buffer;

    const gain = offlineCtx.createGain();
    gain.gain.setValueAtTime(sfx.volume, sfx.triggeredAt);

    source.connect(gain);
    gain.connect(offlineCtx.destination);
    source.start(sfx.triggeredAt);
  }

  for (const voice of audioPlan.voiceSegments) {
    const buffer = audioBuffers.get(voice.asset);
    if (!buffer) continue;
    if ((voice.offset ?? 0) >= buffer.duration) continue;

    const source = offlineCtx.createBufferSource();
    source.buffer = buffer;

    const gain = offlineCtx.createGain();
    gain.gain.setValueAtTime(voice.volume, voice.start);

    source.connect(gain);
    gain.connect(offlineCtx.destination);
    source.start(voice.start, voice.offset ?? 0);

    const duration = voice.end - voice.start;
    const available = buffer.duration - (voice.offset ?? 0);
    const stopAt = voice.start + Math.min(available, duration);
    if (stopAt > voice.start) {
      source.stop(stopAt);
    }
  }

  return offlineCtx.startRendering();
}

function createOutput(options: ExportOptions) {
  const target = options.outputStream
    ? new StreamTarget(options.outputStream, { chunked: true, chunkSize: 1024 * 1024 })
    : new BufferTarget();
  const output = new Output({
    format: new Mp4OutputFormat({ fastStart: options.outputStream ? false : 'in-memory' }),
    target,
  });

  return { output, target };
}

async function renderFrames(
  options: ExportOptions,
  canvas: OffscreenCanvas,
  videoSource: CanvasSource,
  isCancelled: () => boolean,
  onFrame: (frame: number, total: number) => void,
  loaded?: LoadedAssets,
  dynamicResolver?: DynamicMediaResolver | null,
) {
  const { fps, frameRenderer, sequence } = options;
  const totalFrames = Math.ceil(sequence.duration * fps);
  const ctx = canvas.getContext('2d')!;
  const frameDurationSec = 1 / fps;
  const renderContext = sequence.renderContext;

  for (let i = 0; i < totalFrames; i++) {
    if (isCancelled()) break;

    const time = i / fps;
    let frameCanvas: HTMLCanvasElement;

    const frameForUrls = sampleSequence({
      sequence,
      time,
      imageResolver: (url) => url as unknown as CanvasImageSource,
    });

    const allDynamicUrls = new Set<string>();
    const collectPrepared = (prepared: PreparedFrameInput | undefined) => {
      if (!prepared) return;
      for (const url of collectDynamicUrls(prepared, renderContext.variantMediaTypesByUrl)) {
        allDynamicUrls.add(url);
      }
    };
    collectPrepared(frameForUrls.single);
    collectPrepared(frameForUrls.transition?.outgoing);
    collectPrepared(frameForUrls.transition?.incoming);

    const dynamicFrames = allDynamicUrls.size > 0 && dynamicResolver
      ? await dynamicResolver.resolveFrames([...allDynamicUrls], time, { throwOnMissing: true })
      : new Map<string, CanvasImageSource>();

    const resolvedFrame = sampleSequence({
      sequence,
      time,
      imageResolver: loaded
        ? (url) => {
          if (loaded.failedImageUrls.has(url)) throw new MediaUnavailableError();
          return dynamicFrames.get(url) ?? loaded.imagesByUrl.get(url) ?? null;
        }
        : (url) => dynamicFrames.get(url) ?? null,
    });

    if (resolvedFrame.transition && frameRenderer.renderTransitionFrame) {
      frameCanvas = frameRenderer.renderTransitionFrame(
        {
          state: resolvedFrame.transition.outgoing.nextRenderState,
          images: resolvedFrame.transition.outgoing.imageMap,
          options: resolvedFrame.transition.outgoing.frameOptions,
        },
        {
          state: resolvedFrame.transition.incoming.nextRenderState,
          images: resolvedFrame.transition.incoming.imageMap,
          options: resolvedFrame.transition.incoming.frameOptions,
        },
        {
          effect: resolvedFrame.transition.compositorPlan.effect,
          progress: resolvedFrame.transition.progress,
          compositorPlan: resolvedFrame.transition.compositorPlan,
        },
      );
    } else {
      const single = resolvedFrame.single ?? resolvedFrame.transition?.incoming;
      if (!single) {
        throw new Error(`Export failed: no sequence frame at ${time.toFixed(3)}s`);
      }
      frameCanvas = frameRenderer.renderFrame(
        single.nextRenderState,
        single.imageMap,
        single.frameOptions,
      );
    }

    ctx.drawImage(frameCanvas, 0, 0);

    await videoSource.add(time, frameDurationSec);

    onFrame(i + 1, totalFrames);

    // Yield to main thread every frame to keep UI responsive
    await new Promise<void>((r) => setTimeout(r, 0));
  }

  return totalFrames;
}

async function safeCancel(output: Output | null) {
  if (!output) return;
  try { await output.cancel(); } catch { /* ignore */ }
}

export function createExporter(): Exporter {
  let _state: ExportState = 'idle';
  let _cancelled = false;
  const listeners = new Set<(progress: ExportProgress) => void>();

  function notify(currentFrame: number, totalFrames: number) {
    const progress: ExportProgress = {
      state: _state,
      currentFrame,
      totalFrames,
      percent: totalFrames > 0 ? Math.round((currentFrame / totalFrames) * 100) : 0,
    };
    for (const cb of listeners) cb(progress);
  }

  function setState(s: ExportState, currentFrame: number, totalFrames: number) {
    _state = s;
    notify(currentFrame, totalFrames);
  }

  const exporter: Exporter = {
    async export(options) {
      if (_state === 'running') {
        throw new Error('Export already in progress');
      }

      validateOptions(options);

      const duration = options.sequence.duration;
      if (duration <= 0) {
        throw new Error('No events to export');
      }

      const totalFrames = Math.ceil(duration * options.fps);
      _cancelled = false;
      setState('running', 0, totalFrames);

      let output: Output | null = null;
      let dynamicResolver: DynamicMediaResolver | null = null;
      let loaded: LoadedAssets | undefined;

      try {
        ensureVideoEncoderSupport();

        const result = createOutput(options);
        output = result.output;

        const canvas = new OffscreenCanvas(options.width, options.height);
        const videoSource = new CanvasSource(canvas, {
          codec: 'avc',
          bitrate: options.bitrate ?? defaultBitrate(options.width, options.height),
          keyFrameInterval: 2,
        });
        output.addVideoTrack(videoSource, { frameRate: options.fps });

        // Set up audio track if audio assets are provided
        let audioSource: AudioBufferSource | null = null;
        let renderedAudio: AudioBuffer | null = null;
        const audioFiles = options.assets?.audioFiles ?? {};
        const audioPlan = options.sequence.audioPlan;
        if (
          audioPlan.bgmSegments.length > 0 ||
          audioPlan.sfxTriggers.length > 0 ||
          audioPlan.voiceSegments.length > 0
        ) {
          const audioBuffers = await preloadAudioAssets(audioFiles, 44100, audioPlan);
          renderedAudio = await renderAudioTrack(audioPlan, audioBuffers);
          if (renderedAudio) {
            audioSource = new AudioBufferSource({ codec: 'aac', bitrate: 128_000 });
            output.addAudioTrack(audioSource);
          }
        }

        await output.start();

        // Preload image assets if provided
        if (options.assets) {
          loaded = await preloadAssets(options.sequence.renderContext);
        }
        dynamicResolver = await createDynamicResolver(options.sequence.renderContext);

        await renderFrames(
          options, canvas, videoSource,
          () => _cancelled,
          (frame, total) => notify(frame, total),
          loaded,
          dynamicResolver,
        );

        if (_cancelled) {
          videoSource.close();
          if (audioSource) audioSource.close();
          await safeCancel(output);
          setState('cancelled', 0, totalFrames);
          return new Blob();
        }

        // Finalize audio track
        if (audioSource && renderedAudio) {
          await audioSource.add(renderedAudio);
          audioSource.close();
        }

        videoSource.close();
        await output.finalize();
        if (options.outputStream) {
          setState('done', totalFrames, totalFrames);
          return new Blob();
        }
        if (!(result.target instanceof BufferTarget)) throw new Error('Invalid export target');
        const buffer = result.target.buffer;
        if (!buffer) {
          throw new Error('Export failed: output buffer is empty');
        }

        const blob = new Blob([buffer], { type: 'video/mp4' });
        setState('done', totalFrames, totalFrames);
        return blob;
      } catch (err) {
        if (_cancelled) {
          await safeCancel(output);
          setState('cancelled', 0, totalFrames);
          return new Blob();
        }
        await safeCancel(output);
        setState('error', 0, totalFrames);
        throw err;
      } finally {
        if (loaded) closeAllBitmaps(loaded);
        dynamicResolver?.dispose();
        options.frameRenderer.dispose();
      }
    },

    cancel() {
      if (_state === 'running') {
        _cancelled = true;
      }
    },

    onProgress(cb) {
      listeners.add(cb);
      return () => {
        listeners.delete(cb);
      };
    },

    get state() {
      return _state;
    },
  };

  return exporter;
}
