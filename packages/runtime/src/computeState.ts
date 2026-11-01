import {
  DEFAULT_BGM_DUCK,
  DEFAULT_BGM_FADE,
  DEFAULT_BGM_LOOP,
  DEFAULT_BGM_VOLUME,
  DEFAULT_SFX_VOLUME,
  SET_TARGET_BACKGROUND,
  SET_TARGET_CG,
  type TimelineEvent,
} from '@vnve/core';
import type { ActorRenderState, BgmState, SfxTrigger, DialogueState, NarrationState, FlashState, ScreenShakeState, LayerImageState, CameraRenderState, RenderState } from './types';
import { lerp, progress, easeInOutCubic } from './interpolation';

const SHAKE_FREQUENCY = 30;

export function createDefaultActor(id: string): ActorRenderState {
  return {
    id,
    x: 0,
    y: 0,
    visible: false,
    opacity: 0,
    sprite: null,
    shakeOffsetX: 0,
    shakeOffsetY: 0,
    scale: 1,
    flipX: false,
    isSpeaker: false,
    brightness: 1,
    blur: 0,
    rotation: 0,
    tintColor: null,
    tintOpacity: 0,
  };
}

function computeSpeechProgress(
  elapsed: number,
  dur: number,
  inlinePauses?: Array<{ ratio: number; dur: number }>,
  textAnimDur?: number,
): number {
  // Use textAnimDur (raw text typing time) when provided so short text
  // finishes animation early instead of being stretched to the min-duration clamp.
  const effectiveDur = textAnimDur ?? dur;
  if (effectiveDur <= 0) return 1;
  if (!inlinePauses || inlinePauses.length === 0) {
    return Math.max(0, Math.min(1, elapsed / effectiveDur));
  }

  const pauses = inlinePauses.filter((p) => p.dur > 0);
  if (pauses.length === 0) {
    return Math.max(0, Math.min(1, elapsed / effectiveDur));
  }

  const totalPause = pauses.reduce((sum, p) => sum + p.dur, 0);
  const baseTextDur = effectiveDur - totalPause;
  if (baseTextDur <= 0) return elapsed >= effectiveDur ? 1 : 0;

  let virtualElapsed = elapsed;
  let accumulatedPause = 0;

  for (const pause of pauses) {
    const pauseStart = pause.ratio * baseTextDur + accumulatedPause;
    if (elapsed <= pauseStart) break;
    const consumed = Math.min(pause.dur, elapsed - pauseStart);
    virtualElapsed -= consumed;
    accumulatedPause += pause.dur;
  }

  return Math.max(0, Math.min(1, virtualElapsed / baseTextDur));
}

function shouldHoldCompletedSpeechAtBoundary(
  active: boolean,
  speechProgress: number,
  latestCompletedSpeech:
    | { kind: 'dialogue'; state: DialogueState }
    | { kind: 'narration'; state: NarrationState }
    | null,
): boolean {
  return active && speechProgress <= 0 && latestCompletedSpeech !== null;
}

function getOrCreateActor(
  actors: Map<string, ActorRenderState>,
  id: string,
): ActorRenderState {
  let actor = actors.get(id);
  if (!actor) {
    actor = createDefaultActor(id);
    actors.set(id, actor);
  }
  return actor;
}

function applyLayerSet(
  current: LayerImageState | null,
  variant: string,
  withEffect: 'cut' | 'fade',
  active: boolean,
  t: number,
): LayerImageState {
  if (withEffect === 'fade' && active) {
    return {
      asset: variant,
      previousAsset: current?.asset,
      transition: { effect: 'fade', progress: t },
    };
  }
  return { asset: variant };
}

export function computeDuration(events: TimelineEvent[]): number {
  let dur = 0;
  for (const e of events) {
    const end = e.at + e.dur;
    if (end > dur) dur = end;
  }
  return dur;
}

export function computeRenderState(
  events: TimelineEvent[],
  time: number,
  durationOverride?: number,
  actorDefaults?: ReadonlyMap<string, { defaultSprite?: string | null; x?: number; y?: number }>,
): RenderState {
  const duration = Math.max(computeDuration(events), durationOverride ?? 0);
  const clampedTime = Math.max(0, Math.min(time, duration));

  const actors = new Map<string, ActorRenderState>();
  const blends = new Map<
    string,
    {
      at: number;
      dur: number;
      from: Array<{ variant: string; weight: number }>;
      to: string;
    }
  >();
  const mixAt = (
    blend: NonNullable<ReturnType<typeof blends.get>>,
    time: number,
  ) => {
    const p =
      blend.dur > 0
        ? Math.max(0, Math.min(1, (time - blend.at) / blend.dur))
        : 1;
    const weights = new Map(
      blend.from.map((m) => [m.variant, m.weight * (1 - p)]),
    );
    weights.set(blend.to, (weights.get(blend.to) ?? 0) + p);
    return [...weights]
      .filter(([, weight]) => weight > 0)
      .map(([variant, weight]) => ({ variant, weight }));
  };
  let dialogue: DialogueState | null = null;
  let narration: NarrationState | null = null;
  let bgm: BgmState | null = null;
  const sfxTriggers: SfxTrigger[] = [];
  let activeEventIndex = -1;
  let flash: FlashState | null = null;
  let screenShake: ScreenShakeState | null = null;
  let background: LayerImageState | null = null;
  let cg: LayerImageState | null = null;
  let activeSpeech = false;
  let latestCompletedSpeech:
    | { kind: 'dialogue'; state: DialogueState }
    | { kind: 'narration'; state: NarrationState }
    | null = null;
  const camera: CameraRenderState = { x: 50, y: 50, scale: 1 };
  let weather: import('./types').WeatherRenderState | null = null;

  for (let i = 0; i < events.length; i++) {
    const event = events[i];

    // Future event — since events are sorted by at, we can break
    if (event.at > clampedTime) break;

    const envelope=(values:number[])=>{const local=Math.max(0,Math.min(event.dur,clampedTime-event.at)),i=Math.min(values.length-1,Math.floor(local*event.envelope!.sampleRate)),j=Math.min(values.length-1,i+1),a=i/event.envelope!.sampleRate,b=Math.min(event.dur,j/event.envelope!.sampleRate),p=b>a?(local-a)/(b-a):0;return values[i]+(values[j]-values[i])*p;};
    const t = event.envelope?envelope(event.envelope.progress):progress(clampedTime,event.at,event.dur);
    const eased=event.envelope?envelope(event.envelope.eased):easeInOutCubic(t);
    const completed = t >= 1;
    const active = !completed; // at <= clampedTime < at + dur

    if (active) {
      activeEventIndex = i;
    }

    switch (event.type) {
      case 'show': {
        const actor = getOrCreateActor(actors, event.targetId!);
        actor.visible = true;
        const targetX = event.params.x !== undefined ? event.params.x : actor.x;
        const targetY = event.params.y !== undefined ? event.params.y : actor.y;
        const showEffect = (event.params.with as string) || 'fade';
        const easedShowT = eased;

        if (completed) {
          actor.x = targetX;
          actor.y = targetY;
          actor.opacity = 1;
        } else {
          switch (showEffect) {
            case 'none':
              actor.x = targetX;
              actor.y = targetY;
              actor.opacity = 1;
              break;
            case 'slide-left':
              actor.x = lerp(targetX - 20, targetX, easedShowT);
              actor.y = targetY;
              actor.opacity = 1;
              break;
            case 'slide-right':
              actor.x = lerp(targetX + 20, targetX, easedShowT);
              actor.y = targetY;
              actor.opacity = 1;
              break;
            case 'slide-up':
              actor.x = targetX;
              actor.y = lerp(targetY + 15, targetY, easedShowT);
              actor.opacity = 1;
              break;
            case 'slide-down':
              actor.x = targetX;
              actor.y = lerp(targetY - 15, targetY, easedShowT);
              actor.opacity = 1;
              break;
            default: // 'fade'
              actor.x = targetX;
              actor.y = targetY;
              actor.opacity = lerp(actor.opacity, 1, t);
              break;
          }
        }
        break;
      }

      case 'hide': {
        const actor = getOrCreateActor(actors, event.targetId!);
        const hideEffect = (event.params.with as string) || 'fade';
        const easedHideT = eased;

        if (completed) {
          actor.visible = false;
          actor.opacity = 0;
        } else {
          const baseX = actor.x;
          const baseY = actor.y;
          switch (hideEffect) {
            case 'none':
              actor.visible = false;
              actor.opacity = 0;
              break;
            case 'slide-left':
              actor.x = lerp(baseX, baseX - 20, easedHideT);
              actor.opacity = 1;
              break;
            case 'slide-right':
              actor.x = lerp(baseX, baseX + 20, easedHideT);
              actor.opacity = 1;
              break;
            case 'slide-up':
              actor.y = lerp(baseY, baseY - 15, easedHideT);
              actor.opacity = 1;
              break;
            case 'slide-down':
              actor.y = lerp(baseY, baseY + 15, easedHideT);
              actor.opacity = 1;
              break;
            default: // 'fade'
              actor.opacity = 1 - t;
              break;
          }
        }
        break;
      }

      case 'move': {
        const actor = getOrCreateActor(actors, event.targetId!);
        if (completed) {
          actor.x = event.params.toX;
          actor.y = event.params.toY;
        } else {
          const fromX = actor.x;
          const fromY = actor.y;
          const easedT = event.params.ease === 'ease'
            ? eased
            : t;
          actor.x = lerp(fromX, event.params.toX, easedT);
          actor.y = lerp(fromY, event.params.toY, easedT);
        }
        break;
      }

      case 'shake': {
        const actor = getOrCreateActor(actors, event.targetId!);
        if (completed) {
          actor.shakeOffsetX = 0;
          actor.shakeOffsetY = 0;
        } else {
          const decay = 1 - t;
          actor.shakeOffsetX =
            Math.sin(clampedTime * SHAKE_FREQUENCY) * event.params.amp * decay;
          actor.shakeOffsetY =
            Math.cos(clampedTime * SHAKE_FREQUENCY * 0.7) * event.params.amp * decay * 0.5;
        }
        break;
      }

      case 'hop': {
        const actor = getOrCreateActor(actors, event.targetId!);
        if (completed) {
          actor.shakeOffsetY = 0;
        } else {
          // Parabolic arc: t=0 → 0, t=0.5 → peak, t=1 → 0
          const hopHeight = event.params.amp ?? 20;
          actor.shakeOffsetY = -hopHeight * 4 * t * (1 - t);
        }
        break;
      }

      case "set": {
        const target = event.params.target;
        const variant = event.params.variant;
        if (typeof target !== "string" || target.length === 0) {
          break;
        }
        if (typeof variant !== "string" || variant.length === 0) {
          break;
        }

        const withEffect = event.params.with === "fade" ? "fade" : "cut";
        if (target === SET_TARGET_BACKGROUND) {
          background = applyLayerSet(
            background,
            variant,
            withEffect,
            active,
            t,
          );
        } else if (target === SET_TARGET_CG) {
          cg = applyLayerSet(cg, variant, withEffect, active, t);
        } else {
          const actor = getOrCreateActor(actors, target);
          if (!actor.sprite)
            actor.sprite = actorDefaults?.get(target)?.defaultSprite ?? null;
          const prior = blends.get(target);
          if (prior?.at === event.at && prior.to !== variant)
            throw new Error("Simultaneous expression switches");
          const from = prior
            ? mixAt(prior, event.at)
            : actor.sprite
              ? [{ variant: actor.sprite, weight: 1 }]
              : [];
          if (actor.sprite !== variant) {
            const blend = {
              at: event.at,
              dur: withEffect === "fade" && from.length ? event.dur : 0,
              from,
              to: variant,
            };
            if (
              mixAt(blend, event.at).length +
                (from.some((m) => m.variant === variant) ? 0 : 1) >
              8
            )
              throw new Error("Expression blend exceeds 8 variants");
            blends.set(target, blend);
            actor.spriteMix = mixAt(blend, clampedTime);
          } else if (prior) actor.spriteMix = mixAt(prior, clampedTime);
          if (
            withEffect === "fade" &&
            active &&
            actor.sprite &&
            actor.sprite !== variant
          ) {
            actor.previousSprite = actor.sprite;
            actor.sprite = variant;
            actor.spriteTransition = { effect: "fade", progress: t };
          } else {
            actor.sprite = variant;
            actor.previousSprite = undefined;
            actor.spriteTransition = undefined;
          }
        }
        break;
      }

      case 'filter': {
        const actor = getOrCreateActor(actors, event.targetId!);
        if (event.params.brightness !== undefined) {
          actor.brightness = event.params.brightness;
        }
        if (event.params.blur !== undefined) {
          actor.blur = event.params.blur;
        }
        break;
      }

      case 'say': {
        const elapsed = Math.max(0, clampedTime - event.at);
        const speechProgress = computeSpeechProgress(
          elapsed,
          event.dur,
          event.params.inlinePauses,
          event.params.textAnimDur,
        );
        if (shouldHoldCompletedSpeechAtBoundary(active, speechProgress, latestCompletedSpeech)) {
          break;
        }
        if (active) {
          activeSpeech = true;
          const revealDuration = event.params.textAnimDur ?? event.dur;
          dialogue = {
            speaker: event.targetId!,
            text: event.params.text,
            segments: event.params.segments,
            progress: speechProgress,
            elapsedSeconds: elapsed,
            revealDurationSeconds: revealDuration,
            theme: event.params.theme,
            themeOverrides: event.params.themeOverrides,
            displayMode: event.params.displayMode,
          };
          // A new dialogue line clears narration
          narration = null;
        } else {
          // Track the latest completed speech line for fallback when no speech
          // is currently active.
          latestCompletedSpeech = {
            kind: 'dialogue',
            state: {
              speaker: event.targetId!,
              text: event.params.text,
              segments: event.params.segments,
              progress: 1,
              elapsedSeconds: event.params.textAnimDur ?? event.dur,
              revealDurationSeconds: event.params.textAnimDur ?? event.dur,
              theme: event.params.theme,
              themeOverrides: event.params.themeOverrides,
              displayMode: event.params.displayMode,
            },
          };
        }
        break;
      }

      case 'narrate': {
        const elapsed = Math.max(0, clampedTime - event.at);
        const speechProgress = computeSpeechProgress(
          elapsed,
          event.dur,
          event.params.inlinePauses,
          event.params.textAnimDur,
        );
        if (active) {
          if (shouldHoldCompletedSpeechAtBoundary(active, speechProgress, latestCompletedSpeech)) {
            break;
          }
          activeSpeech = true;
          const revealDuration = event.params.textAnimDur ?? event.dur;
          narration = {
            text: event.params.text,
            segments: event.params.segments,
            progress: speechProgress,
            elapsedSeconds: elapsed,
            revealDurationSeconds: revealDuration,
            theme: event.params.theme,
            themeOverrides: event.params.themeOverrides,
            displayMode: event.params.displayMode,
          };
          dialogue = null;
        } else {
          // Track the latest completed speech line for fallback when no speech
          // is currently active.
          latestCompletedSpeech = {
            kind: 'narration',
            state: {
              text: event.params.text,
              segments: event.params.segments,
              progress: 1,
              elapsedSeconds: event.params.textAnimDur ?? event.dur,
              revealDurationSeconds: event.params.textAnimDur ?? event.dur,
              theme: event.params.theme,
              themeOverrides: event.params.themeOverrides,
              displayMode: event.params.displayMode,
            },
          };
        }
        break;
      }

      case 'wait': {
        // No visual effect
        break;
      }

      case 'bgm': {
        const action =
          event.params.action ??
          'play';
        if (action === 'stop') {
          bgm = null;
          break;
        }
        if (action === 'pause') {
          if (bgm) {
            bgm = {
              ...(bgm as BgmState),
              status: 'paused',
              fade: event.params.fade ?? bgm.fade,
            };
          }
          break;
        }
        if (action === 'resume') {
          if (bgm) {
            bgm = {
              ...(bgm as BgmState),
              status: 'playing',
              volume: event.params.volume ?? bgm.volume,
              fade: event.params.fade ?? bgm.fade,
              loop: event.params.loop ?? bgm.loop,
              duck: event.params.duck ?? bgm.duck,
            };
          }
          break;
        }
        const asset = event.params.asset;
        if (typeof asset === 'string' && asset.length > 0) {
          bgm = {
            asset,
            status: 'playing',
            volume: event.params.volume ?? DEFAULT_BGM_VOLUME,
            fade: event.params.fade ?? DEFAULT_BGM_FADE,
            loop: event.params.loop ?? DEFAULT_BGM_LOOP,
            duck: event.params.duck ?? DEFAULT_BGM_DUCK,
            ducking: false,
            startedAt: event.at,
          };
        }
        break;
      }

      case 'sfx': {
        sfxTriggers.push({
          asset: event.params.asset,
          volume: event.params.volume ?? DEFAULT_SFX_VOLUME,
          triggeredAt: event.at,
        });
        break;
      }

      case 'flash': {
        if (active) {
          flash = {
            color: event.params.color ?? 'white',
            progress: t,
          };
        } else {
          flash = null;
        }
        break;
      }

      case 'vibrate': {
        if (completed) {
          screenShake = null;
        } else {
          const decay = 1 - t;
          screenShake = {
            offsetX: Math.sin(clampedTime * SHAKE_FREQUENCY) * event.params.amp * decay,
            offsetY: Math.cos(clampedTime * SHAKE_FREQUENCY * 0.7) * event.params.amp * decay * 0.5,
          };
        }
        break;
      }

      case 'tint': {
        const actor = getOrCreateActor(actors, event.targetId!);
        actor.tintColor = event.params.color;
        actor.tintOpacity = event.params.opacity ?? 0.3;
        break;
      }

      case 'rotate': {
        const actor = getOrCreateActor(actors, event.targetId!);
        if (completed) {
          actor.rotation = event.params.angle;
        } else {
          const fromAngle = actor.rotation;
          const easedT = eased;
          actor.rotation = lerp(fromAngle, event.params.angle, easedT);
        }
        break;
      }

      case 'zoom': {
        const actor = getOrCreateActor(actors, event.targetId!);
        if (completed) {
          actor.scale = event.params.scale;
        } else {
          const fromScale = actor.scale;
          const easedT = eased;
          actor.scale = lerp(fromScale, event.params.scale, easedT);
        }
        break;
      }

      case 'camera-focus': {
        // Determine target coordinates
        let targetX = event.params.x ?? 50;
        let targetY = event.params.y ?? 50;
        if (event.targetId) {
          const actor = actors.get(event.targetId) ?? actorDefaults?.get(event.targetId);
          if (actor && actor.x !== undefined && actor.y !== undefined) {
            targetX = actor.x;
            // Focus on the actor's head area (~20% from top) rather than feet
            targetY = actor.y * 0.2;
          }
        }
        let targetZoom = event.params.zoom;
        if (event.params.other && event.targetId) {
          const a = actors.get(event.targetId) ?? actorDefaults?.get(event.targetId);
          const b = actors.get(event.params.other) ?? actorDefaults?.get(event.params.other);
          if (a?.x !== undefined && a.y !== undefined && b?.x !== undefined && b.y !== undefined) {
            targetX = (a.x + b.x) / 2;
            targetY = (a.y + b.y) * .1;
            if (event.params.fitPair) targetZoom = Math.max(1, Math.min(1.2, .9 / (Math.abs(a.x - b.x) / 100 + .45)));
          }
        }

        if (completed) {
          camera.x = targetX;
          camera.y = targetY;
          camera.scale = targetZoom;
        } else {
          const easedT = eased;
          camera.x = lerp(camera.x, targetX, easedT);
          camera.y = lerp(camera.y, targetY, easedT);
          camera.scale = lerp(camera.scale, targetZoom, easedT);
        }
        break;
      }

      case 'camera-reset': {
        if (completed) {
          camera.x = 50;
          camera.y = 50;
          camera.scale = 1;
        } else {
          const easedT = eased;
          camera.x = lerp(camera.x, 50, easedT);
          camera.y = lerp(camera.y, 50, easedT);
          camera.scale = lerp(camera.scale, 1, easedT);
        }
        break;
      }

      case 'weather-start': {
        const weatherParams = event.params as { weather: 'rain' | 'snow'; intensity: 'light' | 'normal' | 'heavy' };
        if (completed) {
          weather = {
            type: weatherParams.weather,
            intensity: weatherParams.intensity,
            opacity: 1,
          };
        } else {
          weather = {
            type: weatherParams.weather,
            intensity: weatherParams.intensity,
            opacity: t,
          };
        }
        break;
      }

      case 'weather-stop': {
        if (completed) {
          weather = null;
        } else if (weather) {
          weather = {
            ...(weather as import('./types').WeatherRenderState),
            opacity: 1 - t,
          };
        }
        break;
      }

    }
  }

  if (!activeSpeech && latestCompletedSpeech) {
    if (latestCompletedSpeech.kind === 'dialogue') {
      dialogue = latestCompletedSpeech.state;
      narration = null;
    } else {
      narration = latestCompletedSpeech.state;
      dialogue = null;
    }
  }

  // Mark the speaking actor
  if (dialogue) {
    const speaker = actors.get(dialogue.speaker);
    if (speaker) {
      speaker.isSpeaker = true;
    }
  }
  if (bgm) {
    bgm.ducking = activeSpeech && bgm.duck < 1;
  }

  return {
    time: clampedTime,
    duration,
    actors: Array.from(actors.values()),
    dialogue,
    narration,
    activeEventIndex,
    audio: { bgm, sfxTriggers },
    flash,
    screenShake,
    background,
    cg,
    camera,
    weather,
  };
}
