import { cameraActionDefaults, performanceCommands, isPerformanceCommand } from "@vnve/core";
import {
  createTimeline,
  span,
  attach,
  masterTime,
  disposeTimeline,
} from "./schedule";
export {
  createTimeline,
  span,
  attach,
  masterTime,
  disposeTimeline,
} from "./schedule";
import type {
  ScriptDoc,
  ScriptNode,
  TimelineEvent,
  Diagnostic,
  ShowEvent,
  HideEvent,
  MoveEvent,
  ShakeEvent,
  HopEvent,
  SetEvent,
  SayEvent,
  NarrateEvent,
  WaitEvent,
  BgmEvent,
  SfxEvent,
  FilterEvent,
  FlashEvent,
  VibrateEvent,
  TintEvent,
  RotateEvent,
  ZoomEvent,
  CameraFocusEvent,
  CameraResetEvent,
  WeatherStartEvent,
  WeatherStopEvent,
  BgmAction,
  RichContent,
  InlineTag,
  TextSegment,
  StyledSegment,
  TextDisplayMode,
} from "@vnve/core";
import { getTextNodeContent, getTextNodePlainText } from "@vnve/core";
import {
  DEFAULT_DURATIONS,
  DEFAULT_LINE_GAP,
  DEFAULT_READING_PACE,
  estimateTextDuration,
  estimateTextRevealDuration,
} from "./defaults";
import { validateParams } from "./validate";
import { makeDiag, D } from "./diagnostics";

export {
  DEFAULT_DURATIONS,
  estimateTextDuration,
  estimateTextRevealDuration,
  DEFAULT_READING_PACE,
  MIN_TEXT_DURATION,
  DEFAULT_LINE_GAP,
} from "./defaults";
export { COMMAND_SCHEMAS } from "./validate";

export interface ActorEntranceConfig {
  id: string;
  x: number;
  y: number;
  effect?: string;
}

export interface ParseOptions {
  /** Finite intrinsic lengths supplied by the trusted animation compiler. */
  animationDurations?: ReadonlyMap<string, number>;
  disabledAnimations?: ReadonlySet<string>;
  autoEntrance?: boolean;
  defaultEffect?: string;
  actorDefaults?: ActorEntranceConfig[];
  defaultDisplayMode?: TextDisplayMode;
  /** Reading pace multiplier for text duration estimation (1.0 = default). */
  readingPace?: number;
  /** Pause in seconds inserted between consecutive dialogue lines. */
  lineGap?: number;
  /** Actors already on stage at t=0; first-speak auto show is skipped for them. */
  alreadyShownActorIds?: string[];
}

export interface ParseResult {
  events: TimelineEvent[];
  diagnostics: Diagnostic[];
  /** eventSourceMap[i] = node index in ScriptDoc.nodes that produced events[i] */
  eventSourceMap: number[];
}

interface EmitContext {
  animationDurations?: ReadonlyMap<string, number>;
  disabledAnimations?: ReadonlySet<string>;
  params: Record<string, unknown>;
  index: number;
  currentTime: number;
  actorDefaultsMap?: Map<string, ActorEntranceConfig>;
  readingPace?: number;
}

interface EmitResult {
  event: TimelineEvent | null;
  diagnostics: Diagnostic[];
  timeAdvance: number;
}

function resolveNumericParam(
  params: Record<string, unknown>,
  key: string,
  fallback: number,
): number {
  const val = params[key];
  if (typeof val === "number" && val >= 0) return val;
  return fallback;
}

/**
 * Resolve time advance based on the `await` parameter:
 * - `await: true`  → blocking (use dur, minimum 0.5 if dur=0)
 * - `await: false` → non-blocking/parallel (advance 0)
 * - not set        → use the default behavior for this command
 */
function resolveTimeAdvance(
  ctx: EmitContext,
  defaultAdvance: number,
  dur: number,
): number {
  const a = ctx.params.await;
  if (a === false) return 0;
  if (a === true) return dur > 0 ? dur : DEFAULT_DURATIONS.show;
  return defaultAdvance;
}

/** Strip the `await` param so it doesn't pollute the timeline event. */
function stripAwaitParam(
  params: Record<string, unknown>,
): Record<string, unknown> {
  if (!("await" in params)) return params;
  const { await: _, ...rest } = params;
  return rest;
}

function emitShow(ctx: EmitContext): EmitResult {
  const p = stripAwaitParam(ctx.params);
  const diagnostics = validateParams("show", p, ctx.index);
  const dur = resolveNumericParam(p, "dur", DEFAULT_DURATIONS.show);
  const timeAdvance = resolveTimeAdvance(ctx, dur, dur);
  if (diagnostics.some((d) => d.level === "error")) {
    return { event: null, diagnostics, timeAdvance };
  }
  const actorId = p.actor as string;
  const defaults = ctx.actorDefaultsMap?.get(actorId);
  const event: ShowEvent = {
    type: "show",
    at: ctx.currentTime,
    dur,
    targetId: actorId,
    params: {
      x: typeof p.x === "number" ? p.x : defaults?.x,
      y: typeof p.y === "number" ? p.y : defaults?.y,
      with: typeof p.with === "string" ? p.with : defaults?.effect,
    },
  };
  return { event, diagnostics, timeAdvance };
}

function emitHide(ctx: EmitContext): EmitResult {
  const p = stripAwaitParam(ctx.params);
  const diagnostics = validateParams("hide", p, ctx.index);
  const dur = resolveNumericParam(p, "dur", DEFAULT_DURATIONS.hide);
  const timeAdvance = resolveTimeAdvance(ctx, dur, dur);
  if (diagnostics.some((d) => d.level === "error")) {
    return { event: null, diagnostics, timeAdvance };
  }
  const event: HideEvent = {
    type: "hide",
    at: ctx.currentTime,
    dur,
    targetId: p.actor as string,
    params: {
      with: typeof p.with === "string" ? p.with : undefined,
    },
  };
  return { event, diagnostics, timeAdvance };
}

// ---------------------------------------------------------------------------
// Semantic Slot Positions — named positions that can be used instead of raw
// coordinates in move/show commands (e.g. `move actor=Bob to=right`).
// Coordinates are percentages (0-100), matching ActorState.x/y.
// ---------------------------------------------------------------------------

const SLOT_POSITIONS: Record<string, { x: number; y: number }> = {
  center: { x: 50, y: 100 },
  left: { x: 25, y: 100 },
  right: { x: 75, y: 100 },
  "support-left": { x: 12, y: 100 },
  "support-right": { x: 88, y: 100 },
  "off-left": { x: -20, y: 100 },
  "off-right": { x: 120, y: 100 },
};

/**
 * Resolve the `to` parameter (slot name) into toX/toY numeric coordinates.
 * If `to` is a known slot name and toX/toY are missing, fills them in.
 */
function resolveSlotPosition(p: Record<string, unknown>): void {
  const to = p.to;
  if (typeof to === "string") {
    const slot = SLOT_POSITIONS[to.toLowerCase()];
    if (slot) {
      if (p.toX === undefined || p.toX === null) p.toX = slot.x;
      if (p.toY === undefined || p.toY === null) p.toY = slot.y;
    }
  }
}

function emitMove(ctx: EmitContext): EmitResult {
  const p = stripAwaitParam(ctx.params);
  // Resolve slot name (e.g. `to=right`) → toX/toY before validation
  resolveSlotPosition(p);
  const diagnostics = validateParams("move", p, ctx.index);
  const dur = resolveNumericParam(p, "dur", DEFAULT_DURATIONS.move);
  const timeAdvance = resolveTimeAdvance(ctx, dur, dur);
  if (diagnostics.some((d) => d.level === "error")) {
    return { event: null, diagnostics, timeAdvance };
  }
  const event: MoveEvent = {
    type: "move",
    at: ctx.currentTime,
    dur,
    targetId: p.actor as string,
    params: {
      toX: p.toX as number,
      toY: p.toY as number,
      ease: typeof p.ease === "string" ? p.ease : undefined,
    },
  };
  return { event, diagnostics, timeAdvance };
}

function emitShake(ctx: EmitContext): EmitResult {
  const p = stripAwaitParam(ctx.params);
  const diagnostics = validateParams("shake", p, ctx.index);
  const dur = resolveNumericParam(p, "dur", DEFAULT_DURATIONS.shake);
  const timeAdvance = resolveTimeAdvance(ctx, dur, dur);
  if (diagnostics.some((d) => d.level === "error")) {
    return { event: null, diagnostics, timeAdvance };
  }
  const event: ShakeEvent = {
    type: "shake",
    at: ctx.currentTime,
    dur,
    targetId: p.actor as string,
    params: {
      amp: p.amp as number,
    },
  };
  return { event, diagnostics, timeAdvance };
}

function emitSet(ctx: EmitContext): EmitResult {
  const p = stripAwaitParam(ctx.params);
  const diagnostics = validateParams("set", p, ctx.index);
  const target = p.target;
  if (typeof target !== "string" || target.trim().length === 0) {
    diagnostics.push(
      makeDiag(
        "error",
        D.INVALID_PARAM_TYPE,
        "Param 'target' of 'set' must be a non-empty string",
        ctx.index,
        "target",
      ),
    );
  }
  if (typeof p.with === "string" && p.with !== "fade" && p.with !== "cut") {
    diagnostics.push(
      makeDiag(
        "error",
        D.INVALID_PARAM_TYPE,
        "Param 'with' of 'set' must be one of cut|fade",
        ctx.index,
        "with",
      ),
    );
  }
  const withEffect = typeof p.with === "string" ? p.with : "cut";
  const defaultDur = withEffect === "fade" ? DEFAULT_DURATIONS.show : 0;
  const dur = resolveNumericParam(p, "dur", defaultDur);
  const defaultTimeAdvance = withEffect === "fade" ? dur : 0;
  const timeAdvance = resolveTimeAdvance(ctx, defaultTimeAdvance, dur);
  if (diagnostics.some((d) => d.level === "error")) {
    return { event: null, diagnostics, timeAdvance };
  }
  const event: SetEvent = {
    type: "set",
    at: ctx.currentTime,
    dur,
    params: {
      target: target as string,
      variant: p.variant as string,
      with: withEffect === "fade" ? "fade" : undefined,
    },
  };
  return { event, diagnostics, timeAdvance };
}

function emitSay(ctx: EmitContext): EmitResult {
  const p = stripAwaitParam(ctx.params);
  const diagnostics = validateParams("say", p, ctx.index);
  const text = p.text as string | undefined;
  if (text !== undefined && text.trim().length === 0) {
    diagnostics.push(
      makeDiag(
        "warning",
        D.EMPTY_TEXT,
        "Say command has empty text",
        ctx.index,
        "text",
      ),
    );
  }
  const dur = resolveNumericParam(
    p,
    "dur",
    text ? estimateTextDuration(text, ctx.readingPace) : 1,
  );
  const timeAdvance = resolveTimeAdvance(ctx, dur, dur);
  if (diagnostics.some((d) => d.level === "error")) {
    return { event: null, diagnostics, timeAdvance };
  }
  const event: SayEvent = {
    type: "say",
    at: ctx.currentTime,
    dur,
    targetId: p.actor as string,
    params: {
      text: text!,
      ...(Array.isArray(p.segments)
        ? { segments: p.segments as StyledSegment[] }
        : {}),
      theme: typeof p.theme === "string" ? p.theme : undefined,
      ...(typeof p.displayMode === "string"
        ? { displayMode: p.displayMode as TextDisplayMode }
        : {}),
    },
  };
  return { event, diagnostics, timeAdvance };
}

function emitNarrate(ctx: EmitContext): EmitResult {
  const p = stripAwaitParam(ctx.params);
  const diagnostics = validateParams("narrate", p, ctx.index);
  const text = p.text as string | undefined;
  if (text !== undefined && text.trim().length === 0) {
    diagnostics.push(
      makeDiag(
        "warning",
        D.EMPTY_TEXT,
        "Narrate command has empty text",
        ctx.index,
        "text",
      ),
    );
  }
  const dur = resolveNumericParam(
    p,
    "dur",
    text ? estimateTextDuration(text, ctx.readingPace) : 1,
  );
  const timeAdvance = resolveTimeAdvance(ctx, dur, dur);
  if (diagnostics.some((d) => d.level === "error")) {
    return { event: null, diagnostics, timeAdvance };
  }
  const event: NarrateEvent = {
    type: "narrate",
    at: ctx.currentTime,
    dur,
    params: {
      text: text!,
      ...(Array.isArray(p.segments)
        ? { segments: p.segments as StyledSegment[] }
        : {}),
      ...(typeof p.displayMode === "string"
        ? { displayMode: p.displayMode as TextDisplayMode }
        : {}),
    },
  };
  return { event, diagnostics, timeAdvance };
}

function emitWait(ctx: EmitContext): EmitResult {
  const p = stripAwaitParam(ctx.params);
  const diagnostics = validateParams("wait", p, ctx.index);
  const seconds = p.seconds;
  if (typeof seconds === "number" && seconds < 0) {
    diagnostics.push(
      makeDiag(
        "error",
        D.NEGATIVE_DURATION,
        "Wait seconds must not be negative",
        ctx.index,
        "seconds",
      ),
    );
  }
  const dur =
    typeof seconds === "number" && seconds >= 0
      ? seconds
      : DEFAULT_DURATIONS.wait;
  const timeAdvance = resolveTimeAdvance(ctx, dur, dur);
  if (diagnostics.some((d) => d.level === "error")) {
    return { event: null, diagnostics, timeAdvance };
  }
  const event: WaitEvent = {
    type: "wait",
    at: ctx.currentTime,
    dur,
    params: {
      seconds: dur,
    },
  };
  return { event, diagnostics, timeAdvance };
}

function emitBgm(ctx: EmitContext): EmitResult {
  const p = stripAwaitParam(ctx.params);
  const diagnostics = validateParams("bgm", p, ctx.index);
  const timeAdvance = resolveTimeAdvance(ctx, 0, 0);
  const rawAction = typeof p.action === "string" ? p.action : undefined;
  const action: BgmAction =
    rawAction === "play" ||
    rawAction === "stop" ||
    rawAction === "pause" ||
    rawAction === "resume"
      ? rawAction
      : "play";
  if (rawAction && rawAction !== action) {
    diagnostics.push(
      makeDiag(
        "error",
        D.INVALID_PARAM_TYPE,
        "Param 'action' of 'bgm' must be one of play|stop|pause|resume",
        ctx.index,
        "action",
      ),
    );
  }
  if (action === "play") {
    if (typeof p.asset !== "string" || p.asset.trim().length === 0) {
      diagnostics.push(
        makeDiag(
          "error",
          D.MISSING_PARAM,
          "Command 'bgm' with action 'play' requires param 'asset'",
          ctx.index,
          "asset",
        ),
      );
    }
  }
  if (typeof p.volume === "number" && (p.volume < 0 || p.volume > 1)) {
    diagnostics.push(
      makeDiag(
        "error",
        D.INVALID_PARAM_TYPE,
        "Param 'volume' of 'bgm' must be in [0,1]",
        ctx.index,
        "volume",
      ),
    );
  }
  if (typeof p.duck === "number" && (p.duck < 0 || p.duck > 1)) {
    diagnostics.push(
      makeDiag(
        "error",
        D.INVALID_PARAM_TYPE,
        "Param 'duck' of 'bgm' must be in [0,1]",
        ctx.index,
        "duck",
      ),
    );
  }
  if (typeof p.fade === "number" && p.fade < 0) {
    diagnostics.push(
      makeDiag(
        "error",
        D.NEGATIVE_DURATION,
        "Param 'fade' of 'bgm' must not be negative",
        ctx.index,
        "fade",
      ),
    );
  }
  if (diagnostics.some((d) => d.level === "error")) {
    return { event: null, diagnostics, timeAdvance };
  }
  const event: BgmEvent = {
    type: "bgm",
    at: ctx.currentTime,
    dur: 0,
    params: {
      action,
      asset: typeof p.asset === "string" ? p.asset : undefined,
      volume: typeof p.volume === "number" ? p.volume : undefined,
      fade: typeof p.fade === "number" ? p.fade : undefined,
      loop: typeof p.loop === "boolean" ? p.loop : undefined,
      duck: typeof p.duck === "number" ? p.duck : undefined,
    },
  };
  return { event, diagnostics, timeAdvance };
}

function emitSfx(ctx: EmitContext): EmitResult {
  const p = stripAwaitParam(ctx.params);
  const diagnostics = validateParams("sfx", p, ctx.index);
  const timeAdvance = resolveTimeAdvance(ctx, 0, 0);
  if (diagnostics.some((d) => d.level === "error")) {
    return { event: null, diagnostics, timeAdvance };
  }
  const event: SfxEvent = {
    type: "sfx",
    at: ctx.currentTime,
    dur: 0,
    params: {
      asset: p.asset as string,
      volume: typeof p.volume === "number" ? p.volume : undefined,
    },
  };
  return { event, diagnostics, timeAdvance };
}

function emitFilter(ctx: EmitContext): EmitResult {
  const p = stripAwaitParam(ctx.params);
  const diagnostics = validateParams("filter", p, ctx.index);
  if (typeof p.brightness !== "number" && typeof p.blur !== "number") {
    diagnostics.push(
      makeDiag(
        "error",
        D.MISSING_PARAM,
        "Command 'filter' requires 'brightness' or 'blur'",
        ctx.index,
      ),
    );
  }
  const timeAdvance = resolveTimeAdvance(ctx, 0, 0);
  if (diagnostics.some((d) => d.level === "error")) {
    return { event: null, diagnostics, timeAdvance };
  }
  const event: FilterEvent = {
    type: "filter",
    at: ctx.currentTime,
    dur: 0,
    targetId: p.actor as string,
    params: {
      brightness: typeof p.brightness === "number" ? p.brightness : undefined,
      blur: typeof p.blur === "number" ? p.blur : undefined,
    },
  };
  return { event, diagnostics, timeAdvance };
}

/**
 * `interjection` 不产生时间线事件、不推进时间；语音文本中的 `(kind)` 语气词
 * 由 @vnve/core 的 getTtsText() 在 TTS 阶段注入。
 */
function emitInterjection(ctx: EmitContext): EmitResult {
  const diagnostics = validateParams("interjection", ctx.params, ctx.index);
  return { event: null, diagnostics, timeAdvance: 0 };
}

function emitDim(ctx: EmitContext): EmitResult {
  const p = stripAwaitParam(ctx.params);
  const diagnostics = validateParams("dim", p, ctx.index);
  const timeAdvance = resolveTimeAdvance(ctx, 0, 0);
  if (diagnostics.some((d) => d.level === "error")) {
    return { event: null, diagnostics, timeAdvance };
  }
  const event: FilterEvent = {
    type: "filter",
    at: ctx.currentTime,
    dur: 0,
    targetId: p.actor as string,
    params: {
      brightness: p.brightness as number,
    },
  };
  return { event, diagnostics, timeAdvance };
}

function emitHop(ctx: EmitContext): EmitResult {
  const p = stripAwaitParam(ctx.params);
  const diagnostics = validateParams("hop", p, ctx.index);
  const dur = resolveNumericParam(p, "dur", DEFAULT_DURATIONS.hop);
  const timeAdvance = resolveTimeAdvance(ctx, dur, dur);
  if (diagnostics.some((d) => d.level === "error")) {
    return { event: null, diagnostics, timeAdvance };
  }
  const event: HopEvent = {
    type: "hop",
    at: ctx.currentTime,
    dur,
    targetId: p.actor as string,
    params: {
      amp: typeof p.amp === "number" ? p.amp : 20,
    },
  };
  return { event, diagnostics, timeAdvance };
}

function emitBlur(ctx: EmitContext): EmitResult {
  const p = stripAwaitParam(ctx.params);
  const diagnostics = validateParams("blur", p, ctx.index);
  const timeAdvance = resolveTimeAdvance(ctx, 0, 0);
  if (diagnostics.some((d) => d.level === "error")) {
    return { event: null, diagnostics, timeAdvance };
  }
  const event: FilterEvent = {
    type: "filter",
    at: ctx.currentTime,
    dur: 0,
    targetId: p.actor as string,
    params: {
      blur: p.blur as number,
    },
  };
  return { event, diagnostics, timeAdvance };
}

function emitFlash(ctx: EmitContext): EmitResult {
  const p = stripAwaitParam(ctx.params);
  const diagnostics = validateParams("flash", p, ctx.index);
  const dur = resolveNumericParam(p, "dur", DEFAULT_DURATIONS.flash);
  const timeAdvance = resolveTimeAdvance(ctx, dur, dur);
  if (diagnostics.some((d) => d.level === "error")) {
    return { event: null, diagnostics, timeAdvance };
  }
  const event: FlashEvent = {
    type: "flash",
    at: ctx.currentTime,
    dur,
    params: {
      color: typeof p.color === "string" ? p.color : undefined,
    },
  };
  return { event, diagnostics, timeAdvance };
}

function emitVibrate(ctx: EmitContext): EmitResult {
  const p = stripAwaitParam(ctx.params);
  const diagnostics = validateParams("vibrate", p, ctx.index);
  const dur = resolveNumericParam(p, "dur", DEFAULT_DURATIONS.vibrate);
  const timeAdvance = resolveTimeAdvance(ctx, dur, dur);
  if (diagnostics.some((d) => d.level === "error")) {
    return { event: null, diagnostics, timeAdvance };
  }
  const event: VibrateEvent = {
    type: "vibrate",
    at: ctx.currentTime,
    dur,
    params: {
      amp: p.amp as number,
    },
  };
  return { event, diagnostics, timeAdvance };
}

function emitTint(ctx: EmitContext): EmitResult {
  const p = stripAwaitParam(ctx.params);
  const diagnostics = validateParams("tint", p, ctx.index);
  const timeAdvance = resolveTimeAdvance(ctx, 0, 0);
  if (diagnostics.some((d) => d.level === "error")) {
    return { event: null, diagnostics, timeAdvance };
  }
  const event: TintEvent = {
    type: "tint",
    at: ctx.currentTime,
    dur: 0,
    targetId: p.actor as string,
    params: {
      color: p.color as string,
      opacity: typeof p.opacity === "number" ? p.opacity : undefined,
    },
  };
  return { event, diagnostics, timeAdvance };
}

function emitRotate(ctx: EmitContext): EmitResult {
  const p = stripAwaitParam(ctx.params);
  const diagnostics = validateParams("rotate", p, ctx.index);
  const dur = resolveNumericParam(p, "dur", DEFAULT_DURATIONS.rotate);
  const timeAdvance = resolveTimeAdvance(ctx, dur, dur);
  if (diagnostics.some((d) => d.level === "error")) {
    return { event: null, diagnostics, timeAdvance };
  }
  const event: RotateEvent = {
    type: "rotate",
    at: ctx.currentTime,
    dur,
    targetId: p.actor as string,
    params: {
      angle: p.angle as number,
    },
  };
  return { event, diagnostics, timeAdvance };
}

function emitZoom(ctx: EmitContext): EmitResult {
  const p = stripAwaitParam(ctx.params);
  const diagnostics = validateParams("zoom", p, ctx.index);
  const dur = resolveNumericParam(p, "dur", DEFAULT_DURATIONS.zoom);
  const timeAdvance = resolveTimeAdvance(ctx, dur, dur);
  if (diagnostics.some((d) => d.level === "error")) {
    return { event: null, diagnostics, timeAdvance };
  }
  const event: ZoomEvent = {
    type: "zoom",
    at: ctx.currentTime,
    dur,
    targetId: p.actor as string,
    params: {
      scale: p.scale as number,
    },
  };
  return { event, diagnostics, timeAdvance };
}

interface CameraEmitResult {
  events: TimelineEvent[];
  diagnostics: Diagnostic[];
  timeAdvance: number;
}

function emitCameraMulti(ctx: EmitContext): CameraEmitResult {
  const p = stripAwaitParam(ctx.params);
  const diagnostics = validateParams("camera", p, ctx.index);
  const defaults=cameraActionDefaults(String(p.action));
  const dur = resolveNumericParam(p, "dur", Number(defaults.dur??DEFAULT_DURATIONS.camera));
  const timeAdvance = resolveTimeAdvance(ctx, dur, dur);

  const action = p.action as string;
  if (
    ![
      "push",
      "pull",
      "focus",
      "duo",
      "reset",
      "rackfocus",
      "parallax",
    ].includes(action)
  )
    diagnostics.push(
      makeDiag(
        "error",
        D.CAMERA_INVALID_ACTION,
        `Unknown camera action '${action}'`,
        ctx.index,
        "action",
      ),
    );

  if (diagnostics.some((d) => d.level === "error")) {
    return { events: [], diagnostics, timeAdvance };
  }

  if (action === "rackfocus" || action === "parallax") {
    const { action, ...values } = p;
    const length =
      typeof p.dur === "number"
        ? p.dur
        : performanceCommands[action as "rackfocus" | "parallax"].dur;
    return {
      events: [
        {
          type: "performance",
          at: ctx.currentTime,
          dur: length,
          params: { name: action as "rackfocus" | "parallax", values },
        },
      ],
      diagnostics,
      timeAdvance: ctx.params.await === false ? 0 : length,
    };
  }
  // --- action=reset ---
  if (action === "reset") {
    const event: CameraResetEvent = {
      type: "camera-reset",
      at: ctx.currentTime,
      dur,
      params: {} as Record<string, never>,
    };
    return { events: [event], diagnostics, timeAdvance };
  }

  // --- action=focus ---
  const hasActor = typeof p.actor === "string" && p.actor.length > 0;
  const hasCoords = typeof p.x === "number" || typeof p.y === "number";
  if (action === "focus" && !hasActor && !hasCoords) {
    diagnostics.push(
      makeDiag(
        "error",
        D.CAMERA_NO_TARGET,
        "camera focus requires 'actor' or 'x'/'y' params",
        ctx.index,
        "actor",
      ),
    );
    return { events: [], diagnostics, timeAdvance };
  }

  const zoom = resolveNumericParam(p, "zoom", Number(defaults.zoom??1));
  const clampedZoom = Math.max(1, Math.min(3.0, zoom));

  const focusEvent: CameraFocusEvent = {
    type: "camera-focus",
    at: ctx.currentTime,
    dur,
    ...(hasActor ? { targetId: p.actor as string } : {}),
    params: {
      ...(typeof p.x === "number" ? { x: p.x } : {}),
      ...(typeof p.y === "number" ? { y: p.y } : {}),
      zoom: clampedZoom,
      ...(action === "duo"
        ? { other: p.other as string, fitPair: p.zoom === undefined }
        : {}),
      ...(typeof p.ease === "string" ? { ease: p.ease } : {}),
    },
  };

  return { events: [focusEvent], diagnostics, timeAdvance };
}

/** Adapter: wraps emitCameraMulti to fit the single-event EmitResult interface for EMITTERS */
function emitCamera(ctx: EmitContext): EmitResult {
  const result = emitCameraMulti(ctx);
  return {
    event: result.events[0] ?? null,
    diagnostics: result.diagnostics,
    timeAdvance: result.timeAdvance,
  };
}

function emitWeather(weatherType: "rain" | "snow") {
  return function (ctx: EmitContext): EmitResult {
    const p = stripAwaitParam(ctx.params);
    const diagnostics = validateParams(weatherType, p, ctx.index);
    const dur = resolveNumericParam(p, "dur", DEFAULT_DURATIONS[weatherType]);
    const timeAdvance = resolveTimeAdvance(ctx, 0, dur);
    if (diagnostics.some((d) => d.level === "error")) {
      return { event: null, diagnostics, timeAdvance };
    }

    if (p.stop === true) {
      const event: WeatherStopEvent = {
        type: "weather-stop",
        at: ctx.currentTime,
        dur,
        params: { weather: weatherType },
      };
      return { event, diagnostics, timeAdvance };
    }

    const intensity = typeof p.intensity === "string" ? p.intensity : "normal";
    const event: WeatherStartEvent = {
      type: "weather-start",
      at: ctx.currentTime,
      dur,
      params: {
        weather: weatherType,
        intensity: intensity as "light" | "normal" | "heavy",
      },
    };
    return { event, diagnostics, timeAdvance };
  };
}

const EMITTERS: Record<string, (ctx: EmitContext) => EmitResult> = {
  presence: (ctx) => {
    const { action, x, y, ...p } = ctx.params;
    const diagnostics = validateParams(
      "presence",
      stripAwaitParam(ctx.params),
      ctx.index,
    );
    if (diagnostics.some((d) => d.level === "error"))
      return { event: null, diagnostics, timeAdvance: 0 };
    return (action === "hide" ? emitHide : emitShow)({
      ...ctx,
      params: { ...p, ...(action === "show" ? { x, y } : {}) },
    });
  },
  reaction: (ctx) => {
    const { action, ...p } = ctx.params;
    const diagnostics = validateParams(
      "reaction",
      stripAwaitParam(ctx.params),
      ctx.index,
    );
    if (diagnostics.some((d) => d.level === "error"))
      return { event: null, diagnostics, timeAdvance: 0 };
    return (action === "hop" ? emitHop : emitShake)({
      ...ctx,
      params: { ...p, amp: p.amp ?? (action === "hop" ? 20 : 5) },
    });
  },
  weather: (ctx) => {
    const { kind, ...p } = ctx.params;
    const diagnostics = validateParams(
      "weather",
      stripAwaitParam(ctx.params),
      ctx.index,
    );
    if (diagnostics.some((d) => d.level === "error"))
      return { event: null, diagnostics, timeAdvance: 0 };
    return emitWeather(kind as "rain" | "snow")({ ...ctx, params: p });
  },

  ...Object.fromEntries(
    Object.entries(performanceCommands).map(([name, definition]) => [
      name,
      (ctx: EmitContext): EmitResult => {
        const values = stripAwaitParam(ctx.params),
          diagnostics = validateParams(name, values, ctx.index);
        const dur =
          values.enabled === false || name === "wipe" || name === "transition"
            ? 0
            : Number(values.dur ?? definition.dur);
        return {
          event: diagnostics.length
            ? null
            : {
                type: "performance",
                at: ctx.currentTime,
                dur,
                params: {
                  name: name as import("@vnve/core").PerformanceCommandName,
                  values,
                },
              },
          diagnostics,
          timeAdvance: ctx.params.await === false ? 0 : dur,
        };
      },
    ]),
  ),
  animation: (ctx) => {
    const params = { ...stripAwaitParam(ctx.params) };
    const diagnostics = validateParams("animation", params, ctx.index);
    const duration = ctx.animationDurations?.get(String(params.clipId));
    if (duration === undefined)
      diagnostics.push({
        level: "error",
        code: "ANIMATION_UNKNOWN_CLIP",
        message: `程序演出「${params.clipId}」不存在或无法编译`,
        location: { index: ctx.index, field: "clipId" },
      });
    const enabled =
      typeof params.enabled === "boolean"
        ? params.enabled
        : !ctx.disabledAnimations?.has(String(params.clipId));
    params.enabled = enabled;
    const dur = enabled ? (duration ?? 0) : 0;
    return {
      event: diagnostics.length
        ? null
        : {
            type: "animation",
            at: ctx.currentTime,
            dur,
            params: params as import("@vnve/core").AnimationEvent["params"],
          },
      diagnostics,
      timeAdvance: !enabled || ctx.params.await === false ? 0 : dur,
    };
  },
  show: emitShow,
  hide: emitHide,
  move: emitMove,
  shake: emitShake,
  hop: emitHop,
  set: emitSet,
  say: emitSay,
  narrate: emitNarrate,
  wait: emitWait,
  bgm: emitBgm,
  sfx: emitSfx,
  interjection: emitInterjection,
  dim: emitDim,
  blur: emitBlur,
  filter: emitFilter,
  flash: emitFlash,
  vibrate: emitVibrate,
  tint: emitTint,
  rotate: emitRotate,
  zoom: emitZoom,
  camera: emitCamera,
  rain: emitWeather("rain"),
  snow: emitWeather("snow"),
};

function extractStyledSegments(content: RichContent[]): StyledSegment[] {
  return content
    .filter((seg): seg is TextSegment => seg.type === "text")
    .map((seg) => ({
      text: seg.text,
      ...(seg.bold ? { bold: true } : {}),
      ...(seg.italic ? { italic: true } : {}),
      ...(seg.color ? { color: seg.color } : {}),
    }));
}

function isInlineSequential(tag: InlineTag): boolean {
  return tag.params.await === true;
}

/** Query the same command defaults used during compilation, including set/fade. */
export function isInlineTagBlocking(tag: InlineTag): boolean {
  if (
    isPerformanceCommand(tag.name) &&
    (tag.name === "wipe" ||
      tag.name === "transition" ||
      ("enabled" in tag.params && tag.params.enabled === false))
  )
    return false;
  if (tag.params.await !== undefined) return tag.params.await;
  if (isPerformanceCommand(tag.name)) return true;
  if (tag.name === "animation") return true;
  return (
    EMITTERS[tag.name]({
      params: tag.params,
      index: 0,
      currentTime: 0,
    }).timeAdvance > 0
  );
}

/**
 * Handle a TextNode, potentially containing inline tags in its `content` array.
 *
 * When `content` is present and contains tags, we:
 * 1. Extract all plain text to form the main Say/Narrate event
 * 2. Calculate each inline tag's trigger time based on its character-position
 *    ratio within the overall text duration
 * 3. Emit the inline tag events at their computed times
 *
 * Returns the primary event plus any inline tag events, and the total duration.
 */
function handleTextNode(
  node: import("@vnve/core").TextNode,
  currentTime: number,
  nodeIndex: number,
  actorDefaultsMap?: Map<string, ActorEntranceConfig>,
  defaultDisplayMode?: TextDisplayMode,
  readingPace?: number,
  animationDurations?: ReadonlyMap<string, number>,
  disabledAnimations?: ReadonlySet<string>,
): { events: TimelineEvent[]; diagnostics: Diagnostic[]; dur: number } | null {
  const content = getTextNodeContent(node);
  const plainText = getTextNodePlainText(node);

  if (!plainText || plainText.trim().length === 0) {
    // Even if text is empty, there may be standalone inline tags
    const tags = content.filter((seg): seg is InlineTag => seg.type === "tag");
    if (tags.length === 0) return null;

    // Emit inline tags. Sequential tags (`await: true`) shift subsequent tags.
    const events: TimelineEvent[] = [];
    const diagnostics: Diagnostic[] = [];
    const blocking = createTimeline();
    for (const tag of tags) {
      const emitter = EMITTERS[tag.name];
      if (!emitter) {
        diagnostics.push(
          makeDiag(
            "error",
            D.UNKNOWN_COMMAND,
            `Unknown command '${tag.name}'`,
            nodeIndex,
          ),
        );
        continue;
      }
      const result = emitter({
        animationDurations,
        disabledAnimations,
        params: tag.params,
        index: nodeIndex,
        currentTime: currentTime + blocking.duration(),
        actorDefaultsMap,
        readingPace,
      });
      diagnostics.push(...result.diagnostics);
      if (result.event) events.push(result.event);
      span(blocking, result.timeAdvance, ">");
    }
    const dur = blocking.duration();
    disposeTimeline(blocking);
    return { events, diagnostics, dur };
  }

  // When TTS audioDuration is available, use it instead of text estimation
  const hasAudioDuration =
    typeof node.audioDuration === "number" && node.audioDuration > 0;
  const naturalBaseTextDur = hasAudioDuration
    ? node.audioDuration!
    : estimateTextDuration(plainText, readingPace);
  // Raw text animation time without min-duration clamp (for typewriter pacing)
  const rawTextAnimDur =
    node.timing?.revealDuration ??
    estimateTextRevealDuration(plainText, readingPace);
  const leadIn = node.timing?.leadIn ?? 0;
  const hold = node.timing?.holdDuration ?? 0;
  const baseTextDur = Math.max(
    rawTextAnimDur,
    node.timing
      ? Math.max(
          hasAudioDuration ? node.audioDuration! : 0,
          node.timing.revealDuration ?? naturalBaseTextDur,
        )
      : naturalBaseTextDur,
  );
  const textStart = currentTime + leadIn;
  // Only include textAnimDur when it differs from baseTextDur (short text hit the min clamp)
  const needsTextAnimDur = rawTextAnimDur < baseTextDur + hold;

  // Extract styled segments for rich text rendering
  const segments = extractStyledSegments(content);
  const hasStyles = segments.some((s) => s.bold || s.italic || s.color);

  // Build the primary text event (say or narrate)
  const displayMode = defaultDisplayMode;
  const audioUrl = node.audioUrl;
  const voiceVolume = node.voiceVolume;
  const primaryEvent: TimelineEvent = node.actorId
    ? {
        type: "say",
        at: textStart,
        dur: baseTextDur,
        targetId: node.actorId,
        params: {
          text: plainText,
          ...(hasStyles ? { segments } : {}),
          ...(displayMode ? { displayMode } : {}),
          ...(needsTextAnimDur ? { textAnimDur: rawTextAnimDur } : {}),
          ...(audioUrl
            ? {
                audioUrl,
                ...(hasAudioDuration
                  ? { voiceDuration: node.audioDuration }
                  : {}),
              }
            : {}),
          ...(voiceVolume != null ? { voiceVolume } : {}),
        },
      }
    : {
        type: "narrate",
        at: textStart,
        dur: baseTextDur,
        params: {
          text: plainText,
          ...(hasStyles ? { segments } : {}),
          ...(displayMode ? { displayMode } : {}),
          ...(needsTextAnimDur ? { textAnimDur: rawTextAnimDur } : {}),
          ...(audioUrl
            ? {
                audioUrl,
                ...(hasAudioDuration
                  ? { voiceDuration: node.audioDuration }
                  : {}),
              }
            : {}),
          ...(voiceVolume != null ? { voiceVolume } : {}),
        },
      };

  const resultEvents: TimelineEvent[] = [primaryEvent];
  const diagnostics: Diagnostic[] = [];
  const blocking = createTimeline();
  const inlinePauses: Array<{ ratio: number; dur: number; at?: number }> = [];
  // Check for inline tags
  const hasTags = content.some((seg) => seg.type === "tag");
  if (hasTags) {
    // Calculate character offset for each inline tag
    const totalTextChars = plainText.length;
    let charsSoFar = 0;

    for (const seg of content) {
      if (seg.type === "text") {
        charsSoFar += seg.text.length;
      } else if (seg.type === "tag") {
        // Tag trigger time is based on the ratio of text chars before it
        const ratio = totalTextChars > 0 ? charsSoFar / totalTextChars : 0;
        const tagTime =
          textStart + ratio * rawTextAnimDur + blocking.duration();

        const emitter = EMITTERS[seg.name];
        if (!emitter) {
          diagnostics.push(
            makeDiag(
              "error",
              D.UNKNOWN_COMMAND,
              `Unknown command '${seg.name}'`,
              nodeIndex,
            ),
          );
        } else {
          const tagResult = emitter({
            animationDurations,
            disabledAnimations,
            params: seg.params,
            index: nodeIndex,
            currentTime: tagTime,
            actorDefaultsMap,
            readingPace,
          });
          diagnostics.push(...tagResult.diagnostics);
          if (tagResult.event) {
            resultEvents.push(tagResult.event);
          }
          if (tagResult.timeAdvance > 0) {
            if (isInlineSequential(seg) || seg.params.await === undefined) {
              inlinePauses.push({
                ratio,
                dur: tagResult.timeAdvance,
                at: ratio * rawTextAnimDur,
              });
            }
          }
          span(blocking, tagResult.timeAdvance, ">");
        }
      }
    }
  }

  const contentClock = createTimeline();
  span(contentClock, baseTextDur, 0);
  span(contentClock, blocking.duration(), ">");
  span(contentClock, hold, ">");
  const totalDur = contentClock.duration();
  disposeTimeline(contentClock);
  disposeTimeline(blocking);
  primaryEvent.dur = totalDur;
  if (inlinePauses.length > 0) {
    primaryEvent.params = {
      ...primaryEvent.params,
      inlinePauses,
      // Tag positions, text reveal, and recording pauses share the same body clock.
      textAnimDur: rawTextAnimDur + blocking.duration(),
    };
  }
  return { events: resultEvents, diagnostics, dur: totalDur + leadIn };
}

function isDialogueNode(node: ScriptNode | undefined): boolean {
  if (!node) return false;
  const plainText = getTextNodePlainText(node);
  if (plainText.trim().length > 0) return true;
  return (
    node.content?.some(
      (segment) =>
        segment.type === "tag" &&
        (segment.name === "say" || segment.name === "narrate"),
    ) ?? false
  );
}

function hasLeadingShowForActor(node: ScriptNode, actorId: string): boolean {
  for (const segment of getTextNodeContent(node)) {
    if (segment.type === "text") {
      if (segment.text.length > 0) return false;
      continue;
    }
    if (
      (segment.name === "show" ||
        (segment.name === "presence" && segment.params.action === "show")) &&
      segment.params.actor === actorId
    )
      return true;
  }
  return false;
}

export function parseTimeline(
  doc: ScriptDoc,
  options?: ParseOptions,
): ParseResult & { tree: ReturnType<typeof createTimeline> } {
  const events: TimelineEvent[] = [];
  const diagnostics: Diagnostic[] = [];
  const eventSourceMap: number[] = [];
  const tree = createTimeline();
  tree.addLabel("flow", 0);

  const autoEntrance = options?.autoEntrance ?? false;
  const lineGap =
    typeof options?.lineGap === "number" && options.lineGap >= 0
      ? options.lineGap
      : DEFAULT_LINE_GAP;
  const actorDefaultsMap = new Map<string, ActorEntranceConfig>();
  if (options?.actorDefaults) {
    for (const cfg of options.actorDefaults) {
      actorDefaultsMap.set(cfg.id, cfg);
    }
  }
  const shownActors = new Set(options?.alreadyShownActorIds ?? []);

  for (let i = 0; i < doc.nodes.length; i++) {
    const currentTime = tree.labels.flow;
    const node = doc.nodes[i];

    if (node.type === "text") {
      // Auto-inject ShowEvent if actor speaks but hasn't been shown
      if (
        autoEntrance &&
        getTextNodePlainText(node).trim().length > 0 &&
        node.actorId &&
        !shownActors.has(node.actorId) &&
        !hasLeadingShowForActor(node, node.actorId)
      ) {
        const defaults = actorDefaultsMap.get(node.actorId);
        const showEvent: ShowEvent = {
          type: "show",
          at: currentTime,
          dur: DEFAULT_DURATIONS.show,
          targetId: node.actorId,
          params: {
            x: defaults?.x,
            y: defaults?.y,
            with: defaults?.effect ?? options?.defaultEffect,
          },
        };
        events.push(showEvent);
        eventSourceMap.push(i);
        shownActors.add(node.actorId);
      }

      const textResult = handleTextNode(
        node,
        currentTime,
        i,
        actorDefaultsMap,
        options?.defaultDisplayMode,
        options?.readingPace ?? DEFAULT_READING_PACE,
        options?.animationDurations,
        options?.disabledAnimations,
      );
      if (textResult) {
        diagnostics.push(...textResult.diagnostics);
        for (const evt of textResult.events) {
          events.push(evt);
          eventSourceMap.push(i);
          if (autoEntrance && evt.targetId) {
            if (evt.type === "show") shownActors.add(evt.targetId);
            if (evt.type === "hide") shownActors.delete(evt.targetId);
          }
        }
        const flow = span(tree, textResult.dur, "flow");
        tree.addLabel("flow", flow.endTime());
        if (
          lineGap > 0 &&
          isDialogueNode(node) &&
          isDialogueNode(doc.nodes[i + 1])
        ) {
          const gap = span(tree, lineGap, "flow");
          tree.addLabel("flow", gap.endTime());
        }
      }
    }
  }

  return { events, diagnostics, eventSourceMap, tree };
}

/** Convenience projection for callers that only need a local compiled scene. */
export function parse(doc: ScriptDoc, options?: ParseOptions): ParseResult {
  const { tree, ...result } = parseTimeline(doc, options);
  disposeTimeline(tree);
  return result;
}
