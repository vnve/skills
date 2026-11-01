import type { ComputedAudioState, VoicePlaybackState } from "@vnve/runtime";

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

interface ActiveVoiceNode {
  asset: string;
  source: AudioBufferSourceNode;
  gain: GainNode;
  startedAtContext: number;
  offsetAtStart: number;
}

export class AudioPlaybackService {
  private ctx: AudioContext | null = null;
  private masterCompressor: DynamicsCompressorNode | null = null;
  private bgmSource: AudioBufferSourceNode | null = null;
  private bgmGain: GainNode | null = null;
  private bgmTargetGain: number | null = null;
  private sfxSources = new Set<AudioBufferSourceNode>();
  private currentBgmAsset: string | null = null;
  private currentBgmStartedAt = -1;
  private bgmStartedAtContext = 0;
  private bgmOffsetAtStart = 0;
  private audioBufferCache = new Map<string, AudioBuffer>();
  private firedSfxSet = new Set<string>();
  private sfxSeekTime = 0;
  private activeVoices = new Map<string, ActiveVoiceNode>();
  private resolveAudioUrl: (assetName: string) => Promise<string>;
  private generation = 0;
  private syncInProgress = false;
  private playbackRate = 1;

  constructor(resolveAudioUrl: (assetName: string) => Promise<string>) {
    this.resolveAudioUrl = resolveAudioUrl;
  }

  private ensureContext(): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.masterCompressor = this.ctx.createDynamicsCompressor();
      this.masterCompressor.connect(this.ctx.destination);
    }
    return this.ctx;
  }

  private get masterOutput(): AudioNode {
    return this.masterCompressor ?? this.ensureContext().destination;
  }

  private async loadAudioBuffer(asset: string): Promise<AudioBuffer | null> {
    const cached = this.audioBufferCache.get(asset);
    if (cached) return cached;

    try {
      const url = await this.resolveAudioUrl(asset);
      const response = await fetch(url);
      if (!response.ok) return null;
      const arrayBuffer = await response.arrayBuffer();
      const ctx = this.ensureContext();
      const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
      this.audioBufferCache.set(asset, audioBuffer);
      return audioBuffer;
    } catch {
      return null;
    }
  }

  private calcTargetGain(
    volume: number,
    duck: number,
    ducking: boolean,
  ): number {
    const base = clamp01(volume);
    const duckFactor = clamp01(duck);
    return base * (ducking ? duckFactor : 1);
  }

  private setBgmGain(target: number, fade: number): void {
    if (!this.ctx || !this.bgmGain) return;
    const now = this.ctx.currentTime;
    const safeTarget = Math.max(0, target);
    const safeFade = Math.max(0, fade);
    // Frame sync must not keep moving the end of an unchanged fade.
    if (this.bgmTargetGain === safeTarget) return;
    this.bgmTargetGain = safeTarget;
    this.bgmGain.gain.cancelAndHoldAtTime(now);
    if (safeFade > 0) {
      this.bgmGain.gain.linearRampToValueAtTime(safeTarget, now + safeFade);
      return;
    }
    this.bgmGain.gain.setValueAtTime(safeTarget, now);
  }

  private clearBgmNodes(resetState: boolean): void {
    if (this.bgmSource) {
      this.bgmSource.onended = null;
      this.bgmSource.disconnect();
      this.bgmSource = null;
    }
    if (this.bgmGain) {
      this.bgmGain.disconnect();
      this.bgmGain = null;
    }
    this.bgmTargetGain = null;
    if (!resetState) return;
    this.currentBgmAsset = null;
    this.currentBgmStartedAt = -1;
    this.bgmStartedAtContext = 0;
    this.bgmOffsetAtStart = 0;
  }

  private hardStopBgm(): void {
    if (this.bgmSource) {
      try {
        this.bgmSource.stop();
      } catch {
        // already stopped
      }
    }
    this.clearBgmNodes(true);
  }

  private stopBgmWithFade(fade: number): void {
    if (!this.ctx || !this.bgmSource || !this.bgmGain) {
      this.clearBgmNodes(true);
      return;
    }
    const source = this.bgmSource;
    const gain = this.bgmGain;
    const now = this.ctx.currentTime;
    const safeFade = Math.max(0, fade);

    gain.gain.cancelAndHoldAtTime(now);
    if (safeFade > 0) {
      gain.gain.linearRampToValueAtTime(0, now + safeFade);
    } else {
      gain.gain.setValueAtTime(0, now);
    }

    source.onended = () => {
      source.disconnect();
      gain.disconnect();
    };
    try {
      source.stop(now + safeFade);
    } catch {
      // ignore
    }
    this.bgmSource = null;
    this.bgmGain = null;
    this.bgmTargetGain = null;
    this.currentBgmAsset = null;
    this.currentBgmStartedAt = -1;
    this.bgmStartedAtContext = 0;
    this.bgmOffsetAtStart = 0;
  }

  private getCurrentBgmOffset(): number {
    if (!this.ctx || !this.bgmSource) {
      return this.bgmOffsetAtStart;
    }
    return (
      this.bgmOffsetAtStart +
      Math.max(0, this.ctx.currentTime - this.bgmStartedAtContext) *
        this.playbackRate
    );
  }

  private startBgmSource(
    buffer: AudioBuffer,
    options: {
      asset: string;
      offset: number;
      loop: boolean;
      gain: number;
      fade: number;
      startedAt: number;
    },
  ): void {
    const ctx = this.ensureContext();
    const gain = ctx.createGain();
    gain.connect(this.masterOutput);

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = options.loop;
    source.playbackRate.value = this.playbackRate;
    source.connect(gain);

    const duration = buffer.duration || 0;
    const normalizedOffset =
      duration > 0 ? ((options.offset % duration) + duration) % duration : 0;

    if (options.fade > 0) {
      gain.gain.setValueAtTime(0, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(
        options.gain,
        ctx.currentTime + options.fade,
      );
    } else {
      gain.gain.setValueAtTime(options.gain, ctx.currentTime);
    }

    source.start(0, normalizedOffset);
    this.bgmSource = source;
    this.bgmGain = gain;
    this.bgmTargetGain = options.gain;
    this.currentBgmAsset = options.asset;
    this.currentBgmStartedAt = options.startedAt;
    this.bgmStartedAtContext = ctx.currentTime;
    // Keep logical elapsed offset for frame synchronization across loop boundaries.
    this.bgmOffsetAtStart = options.offset;
  }

  private stopAllSfx(): void {
    for (const source of this.sfxSources) {
      try {
        source.stop();
      } catch {
        // already stopped
      }
      source.onended = null;
      source.disconnect();
    }
    this.sfxSources.clear();
  }

  private stopVoice(key: string): void {
    const voice = this.activeVoices.get(key);
    if (!voice) return;
    try {
      voice.source.stop();
    } catch {
      // already stopped
    }
    voice.source.onended = null;
    voice.source.disconnect();
    voice.gain.disconnect();
    this.activeVoices.delete(key);
  }

  private stopAllVoices(): void {
    for (const key of this.activeVoices.keys()) {
      this.stopVoice(key);
    }
  }

  private getCurrentVoiceOffset(voice: ActiveVoiceNode): number {
    if (!this.ctx) return voice.offsetAtStart;
    return (
      voice.offsetAtStart +
      Math.max(0, this.ctx.currentTime - voice.startedAtContext) *
        this.playbackRate
    );
  }

  private async startVoice(
    ctx: AudioContext,
    voice: VoicePlaybackState,
    gen: number,
  ): Promise<void> {
    const buffer = await this.loadAudioBuffer(voice.asset);
    if (this.generation !== gen || !buffer) return;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(clamp01(voice.volume), ctx.currentTime);
    gain.connect(this.masterOutput);

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const playbackRate = this.playbackRate;
    source.playbackRate.value = playbackRate;
    source.connect(gain);

    const normalizedOffset =
      buffer.duration > 0
        ? Math.max(
            0,
            Math.min(voice.offset, Math.max(0, buffer.duration - 0.001)),
          )
        : Math.max(0, voice.offset);
    const maxDuration = Math.max(0, voice.duration - voice.offset);
    const remainingBufferDuration = Math.max(
      0,
      buffer.duration - normalizedOffset,
    );
    const maxPlayableDuration = Math.min(maxDuration, remainingBufferDuration);
    source.onended = () => {
      source.disconnect();
      gain.disconnect();
      this.activeVoices.delete(voice.key);
    };
    source.start(0, normalizedOffset);
    if (maxPlayableDuration > 0) {
      source.stop(ctx.currentTime + maxPlayableDuration / playbackRate);
    }

    this.activeVoices.set(voice.key, {
      asset: voice.asset,
      source,
      gain,
      startedAtContext: ctx.currentTime,
      offsetAtStart: voice.offset,
    });
  }

  private async syncVoices(
    ctx: AudioContext,
    voices: VoicePlaybackState[],
    gen: number,
  ): Promise<void> {
    const desiredKeys = new Set(voices.map((voice) => voice.key));

    for (const key of this.activeVoices.keys()) {
      if (!desiredKeys.has(key)) {
        this.stopVoice(key);
      }
    }

    for (const voice of voices) {
      const current = this.activeVoices.get(voice.key);
      if (!current) {
        await this.startVoice(ctx, voice, gen);
        if (this.generation !== gen) return;
        continue;
      }

      const offsetDelta = Math.abs(
        this.getCurrentVoiceOffset(current) - voice.offset,
      );
      if (current.asset !== voice.asset || offsetDelta > 0.15) {
        this.stopVoice(voice.key);
        await this.startVoice(ctx, voice, gen);
        if (this.generation !== gen) return;
      }
    }
  }

  async syncState(
    audio: ComputedAudioState,
    isPlaying: boolean,
  ): Promise<void> {
    if (!isPlaying) return;
    if (this.syncInProgress) return;
    this.syncInProgress = true;
    const gen = this.generation;

    try {
      const ctx = this.ensureContext();
      if (ctx.state === "suspended") {
        await ctx.resume();
      }
      if (this.generation !== gen) return;

      const desiredBgm = audio.bgm;
      if (!desiredBgm) {
        if (this.currentBgmAsset !== null) {
          this.stopBgmWithFade(audio.bgmFadeOut ?? 0.3);
        }
      } else {
        const desiredGain = this.calcTargetGain(
          desiredBgm.volume,
          desiredBgm.duck,
          desiredBgm.ducking,
        );
        const sameAsset = desiredBgm.asset === this.currentBgmAsset;
        const sameSegment = desiredBgm.startedAt === this.currentBgmStartedAt;
        const offsetDelta = Math.abs(
          this.getCurrentBgmOffset() - desiredBgm.offset,
        );

        if (
          !sameAsset ||
          !sameSegment ||
          !this.bgmSource ||
          offsetDelta > 0.15
        ) {
          const buffer = await this.loadAudioBuffer(desiredBgm.asset);
          if (this.generation !== gen) return;
          if (buffer) {
            this.stopBgmWithFade(0);
            this.startBgmSource(buffer, {
              asset: desiredBgm.asset,
              offset: desiredBgm.offset,
              loop: desiredBgm.loop,
              gain: desiredGain,
              fade: Math.max(0, desiredBgm.fade),
              startedAt: desiredBgm.startedAt,
            });
          }
        } else {
          if (this.bgmSource) {
            this.bgmSource.loop = desiredBgm.loop;
          }
          this.setBgmGain(desiredGain, desiredBgm.fade);
        }
      }

      for (const sfx of audio.sfxTriggers) {
        const key = `${sfx.asset}@${sfx.triggeredAt}`;
        if (this.firedSfxSet.has(key)) continue;
        this.firedSfxSet.add(key);

        const buffer = await this.loadAudioBuffer(sfx.asset);
        if (this.generation !== gen) return;
        if (!buffer) continue;
        const offset = Math.max(0, this.sfxSeekTime - sfx.triggeredAt);
        if (offset >= buffer.duration) continue;

        const gain = ctx.createGain();
        gain.gain.setValueAtTime(clamp01(sfx.volume), ctx.currentTime);
        gain.connect(this.masterOutput);

        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(gain);
        this.sfxSources.add(source);
        source.onended = () => {
          source.disconnect();
          gain.disconnect();
          this.sfxSources.delete(source);
        };
        if (offset > 0) source.start(0, offset);
        else source.start(0);
      }

      await this.syncVoices(ctx, audio.voices, gen);
    } finally {
      this.syncInProgress = false;
    }
  }

  async pause(): Promise<void> {
    if (this.ctx && this.ctx.state === "running") {
      await this.ctx.suspend();
    }
  }

  async resume(): Promise<void> {
    const ctx = this.ensureContext();
    if (ctx.state === "suspended") {
      await ctx.resume();
    }
  }

  setPlaybackRate(rate: number): void {
    if (!Number.isFinite(rate) || rate <= 0) return;
    this.playbackRate = rate;
    if (this.bgmSource) {
      this.bgmSource.playbackRate.value = rate;
    }
    for (const voice of this.activeVoices.values()) {
      voice.source.playbackRate.value = rate;
    }
  }

  resetForSeek(time: number): void {
    this.stopAll();
    this.sfxSeekTime = Math.max(0, time);
  }

  stopAll(): void {
    this.generation++;
    this.hardStopBgm();
    this.stopAllSfx();
    this.stopAllVoices();
    this.firedSfxSet.clear();
    this.sfxSeekTime = 0;
  }

  dispose(): void {
    this.generation++;
    this.hardStopBgm();
    this.stopAllSfx();
    this.stopAllVoices();
    if (this.masterCompressor) {
      this.masterCompressor.disconnect();
      this.masterCompressor = null;
    }
    if (this.ctx) {
      this.ctx.close().catch(() => {});
      this.ctx = null;
    }
    this.audioBufferCache.clear();
  }
}
