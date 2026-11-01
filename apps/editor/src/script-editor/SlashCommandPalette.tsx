import { COMMON_VISUAL_COMMANDS, commonEffectLabels } from "@vnve/core";
import { performanceCommands, type PerformanceCommandName } from "@vnve/core";
import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { CommandName, CommandParamsByName } from "@vnve/core";
import { useTranslation } from "react-i18next";
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "../components/ui/command";
import {
  Eye,
  EyeOff,
  Move,
  Vibrate,
  Palette,
  Clock,
  Music,
  Volume2,
  SunDim,
  Zap,
  Droplets,
  RotateCw,
  ZoomIn,
  Focus,
  ArrowUpFromLine,
  MessageSquareText,
  Type,
  SmilePlus,
  CloudRain,
  Snowflake,
  type LucideIcon,
} from "lucide-react";
import { clampFloatingPosition } from "./floating-position";

import { getDefaultCommandParams } from "./command-param-schema";

type CommandInfo = {
  [K in CommandName]: {
    id: string;
    name: K;
    label: string;
    description: string;
    icon: LucideIcon;
    defaultParams: CommandParamsByName[K];
  };
}[CommandName];

interface CommandGroupDef {
  heading: string;
  commands: CommandInfo[];
}

const COMMAND_ORDER: ReadonlyArray<ReadonlyArray<CommandName>> = [
  ["presence", "set", "move", "reaction"],
  ["bgm", "sfx"],
  ["wait"],
  ["camera"],
  [
    "vibrate",
    "flash",
    "weather",
    "interjection",
    "comic",
    "duel",
    "introduce",
    "memory",
    "awake",
    "transition",
    "animation",
  ],
];
function buildCommandInfo(
  t: (key: string) => string,
): Record<CommandName, CommandInfo> {
  return {
    ...(Object.fromEntries(
      Object.entries(performanceCommands).map(([name, def]) => [
        name,
        {
          id: name,
          name,
          label: def.label,
          description: def.description,
          icon: Zap,
          defaultParams: getDefaultCommandParams(
            name as PerformanceCommandName,
          ),
        },
      ]),
    ) as Record<PerformanceCommandName, CommandInfo>),
    ...(Object.fromEntries(
      (["presence", "reaction", "weather"] as const).map((name) => [
        name,
        {
          id: name,
          name,
          label: commonEffectLabels[name],
          description: {
            presence: "选择出场或退场方式",
            reaction: "轻抖或跳动强调人物反应",
            weather: "选择雨雪与强度",
          }[name],
          icon: Zap,
          defaultParams: getDefaultCommandParams(name),
        },
      ]),
    ) as Pick<
      Record<CommandName, CommandInfo>,
      "presence" | "reaction" | "weather"
    >),
    animation: {
      id: "animation",
      name: "animation",
      label: t("editor.script.cmdAnimation"),
      description: t("editor.script.cmdAnimationDesc"),
      icon: Zap,
      defaultParams: getDefaultCommandParams("animation"),
    },
    show: {
      id: "show",
      name: "show",
      label: t("editor.script.cmdShow"),
      description: t("editor.script.cmdShowDesc"),
      icon: Eye,
      defaultParams: getDefaultCommandParams("show"),
    },
    set: {
      id: "set",
      name: "set",
      label: t("editor.script.cmdSet"),
      description: t("editor.script.cmdSetDesc"),
      icon: Palette,
      defaultParams: getDefaultCommandParams("set"),
    },
    move: {
      id: "move",
      name: "move",
      label: t("editor.script.cmdMove"),
      description: t("editor.script.cmdMoveDesc"),
      icon: Move,
      defaultParams: getDefaultCommandParams("move"),
    },
    hide: {
      id: "hide",
      name: "hide",
      label: t("editor.script.cmdHide"),
      description: t("editor.script.cmdHideDesc"),
      icon: EyeOff,
      defaultParams: getDefaultCommandParams("hide"),
    },
    shake: {
      id: "shake",
      name: "shake",
      label: t("editor.script.cmdShake"),
      description: t("editor.script.cmdShakeDesc"),
      icon: Vibrate,
      defaultParams: getDefaultCommandParams("shake"),
    },
    hop: {
      id: "hop",
      name: "hop",
      label: t("editor.script.cmdHop"),
      description: t("editor.script.cmdHopDesc"),
      icon: ArrowUpFromLine,
      defaultParams: getDefaultCommandParams("hop"),
    },
    dim: {
      id: "dim",
      name: "dim",
      label: t("editor.script.cmdDim"),
      description: t("editor.script.cmdDimDesc"),
      icon: SunDim,
      defaultParams: getDefaultCommandParams("dim"),
    },
    blur: {
      id: "blur",
      name: "blur",
      label: t("editor.script.cmdBlur"),
      description: t("editor.script.cmdBlurDesc"),
      icon: Droplets,
      defaultParams: getDefaultCommandParams("blur"),
    },
    filter: {
      id: "filter",
      name: "filter",
      label: t("editor.script.cmdFilter"),
      description: t("editor.script.cmdFilterDesc"),
      icon: Droplets,
      defaultParams: getDefaultCommandParams("filter"),
    },
    tint: {
      id: "tint",
      name: "tint",
      label: t("editor.script.cmdTint"),
      description: t("editor.script.cmdTintDesc"),
      icon: Droplets,
      defaultParams: getDefaultCommandParams("tint"),
    },
    rotate: {
      id: "rotate",
      name: "rotate",
      label: t("editor.script.cmdRotate"),
      description: t("editor.script.cmdRotateDesc"),
      icon: RotateCw,
      defaultParams: getDefaultCommandParams("rotate"),
    },
    zoom: {
      id: "zoom",
      name: "zoom",
      label: t("editor.script.cmdZoom"),
      description: t("editor.script.cmdZoomDesc"),
      icon: ZoomIn,
      defaultParams: getDefaultCommandParams("zoom"),
    },
    bgm: {
      id: "bgm",
      name: "bgm",
      label: t("editor.script.cmdBgm"),
      description: t("editor.script.cmdBgmDesc"),
      icon: Music,
      defaultParams: getDefaultCommandParams("bgm"),
    },
    sfx: {
      id: "sfx",
      name: "sfx",
      label: t("editor.script.cmdSfx"),
      description: t("editor.script.cmdSfxDesc"),
      icon: Volume2,
      defaultParams: getDefaultCommandParams("sfx"),
    },
    interjection: {
      id: "interjection",
      name: "interjection",
      label: t("editor.script.cmdInterjection"),
      description: t("editor.script.cmdInterjectionDesc"),
      icon: SmilePlus,
      defaultParams: getDefaultCommandParams("interjection"),
    },
    wait: {
      id: "wait",
      name: "wait",
      label: t("editor.script.cmdWait"),
      description: t("editor.script.cmdWaitDesc"),
      icon: Clock,
      defaultParams: getDefaultCommandParams("wait"),
    },
    say: {
      id: "say",
      name: "say",
      label: t("editor.script.cmdSay"),
      description: t("editor.script.cmdSayDesc"),
      icon: MessageSquareText,
      defaultParams: getDefaultCommandParams("say"),
    },
    narrate: {
      id: "narrate",
      name: "narrate",
      label: t("editor.script.cmdNarrate"),
      description: t("editor.script.cmdNarrateDesc"),
      icon: Type,
      defaultParams: getDefaultCommandParams("narrate"),
    },
    camera: {
      id: "camera",
      name: "camera",
      label: t("editor.script.cmdCameraName"),
      description: t("editor.script.cmdCameraDesc"),
      icon: Focus,
      defaultParams: getDefaultCommandParams("camera"),
    },
    flash: {
      id: "flash",
      name: "flash",
      label: t("editor.script.cmdFlash"),
      description: t("editor.script.cmdFlashDesc"),
      icon: Zap,
      defaultParams: getDefaultCommandParams("flash"),
    },
    vibrate: {
      id: "vibrate",
      name: "vibrate",
      label: t("editor.script.cmdVibrate"),
      description: t("editor.script.cmdVibrateDesc"),
      icon: Vibrate,
      defaultParams: getDefaultCommandParams("vibrate"),
    },
    rain: {
      id: "rain",
      name: "rain",
      label: t("editor.script.cmdRain"),
      description: t("editor.script.cmdRainDesc"),
      icon: CloudRain,
      defaultParams: getDefaultCommandParams("rain"),
    },
    snow: {
      id: "snow",
      name: "snow",
      label: t("editor.script.cmdSnow"),
      description: t("editor.script.cmdSnowDesc"),
      icon: Snowflake,
      defaultParams: getDefaultCommandParams("snow"),
    },
  };
}

export function buildCommandGroups(
  t: (key: string) => string,
  recentCommands: CommandName[] = [],
): CommandGroupDef[] {
  const commands = buildCommandInfo(t);
  const groups: CommandGroupDef[] = [];

  const allowed = new Set<string>([
    ...COMMON_VISUAL_COMMANDS,
    "bgm",
    "sfx",
    "wait",
  ]);
  recentCommands = recentCommands.filter((name) => allowed.has(name));
  if (recentCommands.length > 0) {
    groups.push({
      heading: t("editor.script.cmdRecent"),
      commands: recentCommands
        .map((name) => commands[name])
        .filter((command): command is CommandInfo => !!command),
    });
  }

  groups.push(
    {
      heading: t("editor.script.cmdCharacter"),
      commands: COMMAND_ORDER[0].map((name) => commands[name]),
    },
    {
      heading: t("editor.script.cmdAudio"),
      commands: COMMAND_ORDER[1].map((name) => commands[name]),
    },
    {
      heading: t("editor.script.cmdControl"),
      commands: COMMAND_ORDER[2].map((name) => commands[name]),
    },
    {
      heading: t("editor.script.cmdCamera"),
      commands: COMMAND_ORDER[3].map((name) => commands[name]),
    },
    {
      heading: t("editor.script.cmdEffects"),
      commands: COMMAND_ORDER[4].map((name) => commands[name]),
    },
  );

  return groups;
}

interface SlashCommandPaletteProps {
  open: boolean;
  position: { top: number; left: number };
  recentCommands: CommandName[];
  onSelect: <K extends CommandName>(
    name: K,
    defaultParams: CommandParamsByName[K],
  ) => void;
  onClose: () => void;
}

export function SlashCommandPalette({
  open,
  position,
  recentCommands,
  onSelect,
  onClose,
}: SlashCommandPaletteProps) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const [displayPosition, setDisplayPosition] = useState(position);

  const commandGroups = useMemo(
    () => buildCommandGroups(t, recentCommands),
    [t, recentCommands],
  );

  useEffect(() => {
    if (!open) return;

    function handleClickOutside(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        onClose();
      }
    }

    function handleEscape(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open, onClose]);

  const clampPosition = useCallback(() => {
    if (!open || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const next = clampFloatingPosition(
      position,
      { width: rect.width, height: rect.height },
      { width: window.innerWidth, height: window.innerHeight },
    );
    setDisplayPosition((prev) =>
      prev.top === next.top && prev.left === next.left ? prev : next,
    );
  }, [open, position]);

  useLayoutEffect(() => {
    if (!open) return;
    clampPosition();
  }, [clampPosition, open, position]);

  useEffect(() => {
    if (!open) return;
    window.addEventListener("resize", clampPosition);
    return () => window.removeEventListener("resize", clampPosition);
  }, [open, clampPosition]);

  if (!open) return null;

  return (
    <div
      ref={containerRef}
      className="fixed z-50 w-64 rounded-lg border border-white/10 bg-popover shadow-xl overflow-hidden"
      style={{ top: displayPosition.top, left: displayPosition.left }}
    >
      <Command className="bg-transparent">
        <CommandInput
          placeholder={t("editor.script.searchCommands")}
          className="text-white/90 text-sm"
          autoFocus
        />
        <CommandList className="max-h-72">
          <CommandEmpty className="text-white/40 text-xs py-4">
            {t("editor.script.noCommandsFound")}
          </CommandEmpty>
          {commandGroups.map((group, groupIndex) => (
            <CommandGroup
              key={group.heading}
              heading={group.heading}
              className="[&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-white/30 [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5"
            >
              {group.commands.map((cmd) => {
                const Icon = cmd.icon;
                const itemValue =
                  groupIndex === 0 && recentCommands.length > 0
                    ? `recent-${cmd.id}`
                    : cmd.id;
                return (
                  <CommandItem
                    key={itemValue}
                    value={itemValue}
                    keywords={[cmd.name, cmd.label, cmd.description]}
                    onSelect={() =>
                      onSelect(cmd.name, { ...cmd.defaultParams })
                    }
                    className="flex items-start gap-2 px-3 py-2 text-white/80 cursor-pointer data-[selected=true]:bg-white/10 data-[selected=true]:text-white rounded-md"
                  >
                    <Icon className="w-4 h-4 mt-0.5 text-brand shrink-0" />
                    <div className="flex flex-col min-w-0">
                      <span className="text-sm font-medium leading-5">
                        {cmd.label}
                      </span>
                      <span className="text-xs text-white/40 truncate">
                        {cmd.description}
                      </span>
                    </div>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          ))}
        </CommandList>
      </Command>
    </div>
  );
}
