import React, { useCallback, useMemo } from "react";
import { IconButton } from "../EditorControls";
import { useTranslation } from "react-i18next";
import {
  SET_TARGET_BACKGROUND,
  SET_TARGET_CG,
  type AssetAudio,
  type InlineTag,
} from "@vnve/core";
import {
  Eye,
  EyeOff,
  Move,
  Vibrate,
  Palette,
  MessageSquare,
  BookOpen,
  Clock,
  Music,
  Volume2,
  X,
  Terminal,
  SunDim,
  Zap,
  Droplets,
  RotateCw,
  ZoomIn,
  Focus,
  ArrowUpFromLine,
  SmilePlus,
  CloudRain,
  Snowflake,
  type LucideIcon,
} from "lucide-react";
import { useEditorStore } from "../stores/editor-store";
import { getCurrentScene } from "../stores/editor-store";
import { buildSceneActorOptions } from "./scene-actor-options";
import { findSlotByCoords } from "../core/stage-utils";
import { getCommandLabel, getScriptOptionLabel, getSlotLabel } from "./i18n";

const TAG_ICONS: Record<string, LucideIcon> = {
  parallax: Move,
  rackfocus: Focus,
  presence: Eye,
  reaction: Vibrate,
  weather: CloudRain,
  animation: Zap,
  comic: Zap,
  duel: Focus,
  introduce: Eye,
  memory: Palette,
  awake: Eye,
  wipe: Move,
  show: Eye,
  hide: EyeOff,
  move: Move,
  shake: Vibrate,
  hop: ArrowUpFromLine,
  set: Palette,
  say: MessageSquare,
  narrate: BookOpen,
  wait: Clock,
  bgm: Music,
  sfx: Volume2,
  dim: SunDim,
  blur: Droplets,
  filter: SunDim,
  flash: Zap,
  vibrate: Vibrate,
  tint: Droplets,
  rotate: RotateCw,
  zoom: ZoomIn,
  camera: Focus,
  rain: CloudRain,
  snow: Snowflake,
  interjection: SmilePlus,
};

const TAG_COLORS: Record<string, { text: string; bg: string; border: string }> =
  {
    show: {
      text: "text-emerald-300",
      bg: "bg-emerald-500/15",
      border: "border-emerald-500/25",
    },
    hide: {
      text: "text-rose-300",
      bg: "bg-rose-500/15",
      border: "border-rose-500/25",
    },
    move: {
      text: "text-sky-300",
      bg: "bg-sky-500/15",
      border: "border-sky-500/25",
    },
    shake: {
      text: "text-amber-300",
      bg: "bg-amber-500/15",
      border: "border-amber-500/25",
    },
    hop: {
      text: "text-lime-300",
      bg: "bg-lime-500/15",
      border: "border-lime-500/25",
    },
    set: {
      text: "text-violet-300",
      bg: "bg-violet-500/15",
      border: "border-violet-500/25",
    },
    say: {
      text: "text-blue-300",
      bg: "bg-blue-500/15",
      border: "border-blue-500/25",
    },
    narrate: {
      text: "text-slate-300",
      bg: "bg-slate-500/15",
      border: "border-slate-500/25",
    },
    wait: {
      text: "text-orange-300",
      bg: "bg-orange-500/15",
      border: "border-orange-500/25",
    },
    bgm: {
      text: "text-pink-300",
      bg: "bg-pink-500/15",
      border: "border-pink-500/25",
    },
    sfx: {
      text: "text-teal-300",
      bg: "bg-teal-500/15",
      border: "border-teal-500/25",
    },
    dim: {
      text: "text-yellow-300",
      bg: "bg-yellow-500/15",
      border: "border-yellow-500/25",
    },
    blur: {
      text: "text-cyan-300",
      bg: "bg-cyan-500/15",
      border: "border-cyan-500/25",
    },
    filter: {
      text: "text-yellow-300",
      bg: "bg-yellow-500/15",
      border: "border-yellow-500/25",
    },
    flash: {
      text: "text-amber-200",
      bg: "bg-amber-400/15",
      border: "border-amber-400/25",
    },
    vibrate: {
      text: "text-rose-300",
      bg: "bg-rose-400/15",
      border: "border-rose-400/25",
    },
    tint: {
      text: "text-fuchsia-300",
      bg: "bg-fuchsia-500/15",
      border: "border-fuchsia-500/25",
    },
    rotate: {
      text: "text-indigo-300",
      bg: "bg-indigo-500/15",
      border: "border-indigo-500/25",
    },
    zoom: {
      text: "text-cyan-300",
      bg: "bg-cyan-500/15",
      border: "border-cyan-500/25",
    },
    camera: {
      text: "text-violet-300",
      bg: "bg-violet-500/15",
      border: "border-violet-500/25",
    },
    rain: {
      text: "text-blue-300",
      bg: "bg-blue-500/15",
      border: "border-blue-500/25",
    },
    snow: {
      text: "text-sky-200",
      bg: "bg-sky-400/15",
      border: "border-sky-400/25",
    },
    interjection: {
      text: "text-amber-300",
      bg: "bg-amber-500/15",
      border: "border-amber-500/25",
    },
  };

export { TAG_ICONS, TAG_COLORS };

/** Resolve a character ID to its display name. */
function actorName(
  id: unknown,
  actorOptions: Array<{ actorId: string; label: string }>,
): string {
  if (typeof id !== "string" || !id) return "?";
  return actorOptions.find((actor) => actor.actorId === id)?.label ?? id;
}

/** Resolve a variant ID to its display name. */
function variantName(
  variantId: unknown,
  actorId: unknown,
  actorOptions: Array<{
    actorId: string;
    variants: Array<{ id: string; name: string }>;
  }>,
): string {
  if (typeof variantId !== "string" || !variantId) return "?";
  if (typeof actorId !== "string") return variantId;
  const actor = actorOptions.find((item) => item.actorId === actorId);
  return actor?.variants.find((v) => v.id === variantId)?.name ?? variantId;
}

/** Resolve an audio asset ID to its display name. */
function audioName(id: unknown, audioAssets: AssetAudio[]): string {
  if (typeof id !== "string" || !id) return "?";
  return audioAssets.find((a) => a.id === id)?.name ?? id;
}

function getTagSummary(
  t: (key: string, options?: Record<string, unknown>) => string,
  tag: InlineTag,
  actorOptions: Array<{
    actorId: string;
    label: string;
    variants: Array<{ id: string; name: string }>;
  }>,
  audioAssets: AssetAudio[],
  canvasWidth = 1920,
  canvasHeight = 1080,
): string {
  const p = tag.params as Record<string, unknown>;
  switch (tag.name) {
    case "presence":
      return `${p.action === "hide" ? "退场" : "出场"} ${actorName(p.actor, actorOptions)}`;
    case "reaction":
      return `${p.action === "hop" ? "跳动" : "轻抖"} ${actorName(p.actor, actorOptions)}`;
    case "weather":
      return `${p.kind === "snow" ? "雪" : "雨"}${p.stop ? " 停止" : ""}`;
    case "transition":
      return String(
        {
          cut: "直切",
          dissolve: "交叉淡化",
          "fade-black": "淡黑",
          "fade-white": "淡白",
          "wipe-left": "向左擦除",
          "wipe-right": "向右擦除",
          "soft-dissolve": "柔化溶解",
        }[String(p.effect) as "cut"] ?? p.effect,
      );
    case "comic":
    case "awake":
      return p.actor ? actorName(p.actor, actorOptions) : "";
    case "duel":
      return `${actorName(p.actor, actorOptions)} / ${actorName(p.other, actorOptions)}`;
    case "introduce":
      return String(p.title || actorName(p.actor, actorOptions));
    case "memory":
      return `${Array.isArray(p.images) ? p.images.length : 0} 张图片`;
    case "wipe":
      return String(p.direction === "right" ? "向右" : "向左");
    case "show":
    case "hide":
      return actorName(p.actor, actorOptions);
    case "move": {
      const toX = typeof p.toX === "number" ? p.toX : undefined;
      const toY = typeof p.toY === "number" ? p.toY : undefined;
      if (toX === undefined || toY === undefined) {
        return `${actorName(p.actor, actorOptions)} → ?`;
      }
      const slot = findSlotByCoords(toX, toY, 3, canvasWidth, canvasHeight);
      const posLabel = slot ? getSlotLabel(t, slot) : `${toX},${toY}`;
      return `${actorName(p.actor, actorOptions)} → ${posLabel}`;
    }
    case "shake":
      return actorName(p.actor, actorOptions);
    case "hop":
      return actorName(p.actor, actorOptions);
    case "set": {
      const target = typeof p.target === "string" ? p.target : "";
      const targetLabel =
        target === SET_TARGET_BACKGROUND
          ? t("editor.script.setTargetBackground")
          : target === SET_TARGET_CG
            ? t("editor.script.setTargetCg")
            : actorName(target, actorOptions);
      return `${targetLabel}: ${variantName(p.variant, target, actorOptions)}`;
    }
    case "say":
      return actorName(p.actor, actorOptions);
    case "bgm":
      if (p.action === "stop") return t("editor.script.option.stop");
      if (p.action === "pause") return t("editor.script.option.pause");
      if (p.action === "resume")
        return `${t("editor.script.option.resume")} ${audioName(p.asset, audioAssets)}`;
      return `${t("editor.script.option.play")} ${audioName(p.asset, audioAssets)}`;
    case "sfx":
      return audioName(p.asset, audioAssets);
    case "dim":
      return `${actorName(p.actor, actorOptions)} ${Math.round((typeof p.brightness === "number" ? p.brightness : 1) * 100)}%`;
    case "blur":
      return `${actorName(p.actor, actorOptions)} ${p.blur ?? "?"}px`;
    case "filter":
      return `${actorName(p.actor, actorOptions)} ${[
        typeof p.brightness === "number"
          ? `${t("editor.script.param.brightness")}=${Math.round(p.brightness * 100)}%`
          : "",
        typeof p.blur === "number"
          ? `${t("editor.script.param.blur")}=${p.blur}px`
          : "",
      ]
        .filter(Boolean)
        .join(" ")}`.trim();
    case "wait":
      return `${p.seconds ?? "?"}s`;
    case "flash":
      return typeof p.color === "string" ? p.color : "";
    case "vibrate":
      return `amp=${p.amp ?? "?"}`;
    case "tint":
      return actorName(p.actor, actorOptions);
    case "rotate":
      return `${actorName(p.actor, actorOptions)} ${p.angle ?? "?"}°`;
    case "zoom":
      return `${actorName(p.actor, actorOptions)} ${p.scale ?? "?"}x`;
    case "camera":
      if (p.action !== "focus" && p.action !== "reset")
        return String(
          {
            push: "轻推",
            pull: "拉远",
            duo: "双人构图",
            rackfocus: "拉焦增强",
            parallax: "视差增强",
          }[String(p.action) as "push"] ?? p.action,
        );
      if (p.action === "reset") return t("editor.script.option.reset");
      if (p.target === "point" && typeof p.x === "number") {
        return `${t("editor.script.option.focus")} (${p.x},${p.y ?? "?"}) ${p.zoom ?? "1.5"}x`;
      }
      return `${t("editor.script.option.focus")} ${actorName(p.actor, actorOptions)} ${p.zoom ?? "1.5"}x`;
    case "rain": {
      if (p.stop) return t("editor.script.option.stop");
      const intensity =
        typeof p.intensity === "string" ? p.intensity : "normal";
      return getScriptOptionLabel(t, intensity, intensity);
    }
    case "snow": {
      if (p.stop) return t("editor.script.option.stop");
      const intensity =
        typeof p.intensity === "string" ? p.intensity : "normal";
      return getScriptOptionLabel(t, intensity, intensity);
    }
    case "interjection":
      return getScriptOptionLabel(t, String(p.kind), String(p.kind));
    default:
      return "";
  }
}

interface InlineTagPillProps {
  tag: InlineTag;
  tagIndex: number;
  readOnly?: boolean;
  hasError?: boolean;
  onClick?: (e: React.MouseEvent) => void;
  onDelete?: () => void;
}

export const InlineTagPill = React.memo(function InlineTagPill({
  tag,
  tagIndex,
  readOnly,
  hasError,
  onClick,
  onDelete,
}: InlineTagPillProps) {
  const { t } = useTranslation();
  const characters = useEditorStore((s) => s.project.assets.visual.character);
  const props = useEditorStore((s) => s.project.assets.visual.prop);
  const visualSubjects = useEditorStore((s) => s.project.visualSubjects);
  const currentScene = useEditorStore(getCurrentScene);
  const bgmAssets = useEditorStore((s) => s.project.assets.audio.bgm);
  const sfxAssets = useEditorStore((s) => s.project.assets.audio.sfx);
  const audioAssets = useMemo(
    () => [...bgmAssets, ...sfxAssets],
    [bgmAssets, sfxAssets],
  );
  const actorOptions = useMemo(() => {
    if (!currentScene) return [];
    return buildSceneActorOptions(
      currentScene,
      visualSubjects,
      characters,
      props,
    );
  }, [currentScene, visualSubjects, characters, props]);

  const canvasWidth = useEditorStore((s) => s.project.meta.width);
  const canvasHeight = useEditorStore((s) => s.project.meta.height);

  const Icon = TAG_ICONS[tag.name] ?? Terminal;
  const colors = TAG_COLORS[tag.name] ?? {
    text: "text-white/60",
    bg: "bg-white/5",
    border: "border-white/10",
  };
  const summary = useMemo(
    () =>
      tag.name === "animation"
        ? (currentScene.animationClips?.find((c) => c.id === tag.params.clipId)
            ?.name ??
          tag.params.clipId ??
          "?")
        : getTagSummary(
            t,
            tag,
            actorOptions,
            audioAssets,
            canvasWidth,
            canvasHeight,
          ),
    [
      t,
      tag,
      actorOptions,
      audioAssets,
      canvasWidth,
      canvasHeight,
      currentScene.animationClips,
    ],
  );

  const handleDelete = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      onDelete?.();
    },
    [onDelete],
  );

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      onClick?.(e);
    },
    [onClick],
  );

  return (
    <span
      contentEditable={false}
      data-tag-index={tagIndex}
      className={`
        relative inline-flex items-center gap-1 px-1.5 py-0 rounded text-[0.9em]
        font-medium border cursor-pointer select-none align-baseline
        whitespace-nowrap group/pill
        ${colors.bg} ${colors.border} ${colors.text}
        ${hasError ? "ring-1 ring-red-500/50" : ""}
        hover:brightness-125 transition-all
      `}
      style={{ lineHeight: "inherit" }}
    >
      <button
        type="button"
        disabled={!onClick}
        tabIndex={!onClick ? -1 : 0}
        onClick={handleClick}
        className="inline-flex items-center gap-1 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400"
      >
        <Icon className="h-[0.9em] w-[0.9em] shrink-0" />
        <span className="max-w-[120px] truncate">
          {getCommandLabel(t, tag.name)}
          {summary ? ` ${summary}` : ""}
        </span>
      </button>
      {!readOnly && (
        <IconButton
          className="absolute -top-1.5 -right-1.5 size-4 rounded-full bg-red-500 text-white hover:bg-red-400 hover:text-white opacity-0 group-hover/pill:opacity-100 focus-visible:opacity-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400 transition-opacity z-10"
          type="button"
          label={t("editor.script.deleteTag")}
          tabIndex={0}
          onMouseDown={handleDelete}
          onClick={(event) => {
            if (event.detail === 0) handleDelete(event);
          }}
        >
          <X className="size-2.5" strokeWidth={2} />
        </IconButton>
      )}
    </span>
  );
});
