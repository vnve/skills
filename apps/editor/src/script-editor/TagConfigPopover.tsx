import { Button } from "../components/ui/button";
import { PerformanceField } from "./PerformanceFields";
import { NumberField } from "../NumberField";
import { isInlineTagBlocking } from "@vnve/parser";
import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import * as DismissableLayerPrimitive from "@radix-ui/react-dismissable-layer";
import { commandParamsSchemas, type InlineTag } from "@vnve/core";
import {
  Crosshair,
  GripHorizontal,
  Play,
  Trash2,
  ChevronsUpDown,
  Check,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { TAG_ICONS, TAG_COLORS } from "./InlineTagPill";
import { getCurrentScene, useEditorStore } from "../stores/editor-store";
import { useUIStore } from "../stores/ui-store";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "../components/ui/popover";
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "../components/ui/command";
import { Checkbox } from "../components/ui/checkbox";
import { Slider } from "../components/ui/slider";
import { Input } from "../components/ui/input";
import { Textarea } from "../components/ui/textarea";
import { clampFloatingPosition } from "./floating-position";
import {
  buildSceneSetTargetOptions,
  type SceneActorOption,
  type SceneSetTargetOption,
} from "./scene-actor-options";
import { PositionPicker } from "./PositionPicker";
import {
  getExtendedSlotPositions,
  type ExtendedSlotName,
} from "../core/stage-utils";
import {
  BGM_SIMPLIFIED_PARAM_KEYS,
  TAG_PARAM_SCHEMAS,
  getResolvedCommandParams,
  resolveBgmAction,
  type ParamSchema,
} from "./command-param-schema";
import {
  getCommandLabel,
  getScriptOptionLabel,
  getScriptParamLabel,
} from "./i18n";

function resolveSetTarget(params: Record<string, unknown>): string {
  const target = params.target;
  if (typeof target === "string") {
    return target;
  }
  return "";
}

// ---------------------------------------------------------------------------
// Validation helper (exported for use in InlineTagElement)
// ---------------------------------------------------------------------------

export function hasValidationErrors(tag: InlineTag): boolean {
  const schema = TAG_PARAM_SCHEMAS[tag.name];
  if (!schema) return false;
  if (!commandParamsSchemas[tag.name].safeParse(tag.params).success) {
    return true;
  }
  if (tag.name === "set") {
    if (
      typeof tag.params.target !== "string" ||
      tag.params.target.trim().length === 0
    ) {
      return true;
    }
    if (
      typeof tag.params.variant !== "string" ||
      tag.params.variant.trim().length === 0
    ) {
      return true;
    }
    if (
      tag.params.with !== undefined &&
      tag.params.with !== "cut" &&
      tag.params.with !== "fade"
    ) {
      return true;
    }
  }
  if (tag.name === "filter") {
    const hasBrightness = typeof tag.params.brightness === "number";
    const hasBlur = typeof tag.params.blur === "number";
    if (!hasBrightness && !hasBlur) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Shared dark-theme class constants
// ---------------------------------------------------------------------------

const SELECT_TRIGGER_CLS =
  "h-8 bg-white/5 border-white/10 text-xs text-white/80 focus-visible:border-brand/50 focus-visible:ring-brand/20";
const SELECT_CONTENT_CLS = "";
const SELECT_ITEM_CLS =
  "text-xs text-white/70 focus:bg-white/10 focus:text-white";

function resolveSchemaPlaceholder(
  t: (key: string, options?: Record<string, unknown>) => unknown,
  placeholder?: string,
): string | undefined {
  if (!placeholder) return undefined;
  if (placeholder === "Enter dialogue text...")
    return String(t("editor.script.dialogueTextPlaceholder"));
  if (placeholder === "Enter narration text...")
    return String(t("editor.script.narrationTextPlaceholder"));
  if (placeholder === "Enter text...")
    return String(t("editor.script.inputPlaceholder"));
  return placeholder;
}

// ---------------------------------------------------------------------------
// Field sub-components
// ---------------------------------------------------------------------------

interface FieldProps {
  paramKey: string;
  value: unknown;
  onChange: (value: unknown) => void;
}

function ActorSelectField({
  paramKey,
  allowEmpty = false,
  value,
  onChange,
  actorOptions,
}: FieldProps & { actorOptions: SceneActorOption[]; allowEmpty?: boolean }) {
  const { t } = useTranslation();
  const strVal = typeof value === "string" ? value : "";
  return (
    <Select
      value={strVal || (allowEmpty ? "$all" : "")}
      onValueChange={(v) => onChange(v === "$all" ? undefined : v)}
    >
      <SelectTrigger
        className={SELECT_TRIGGER_CLS}
        aria-label={getScriptParamLabel(t, paramKey)}
      >
        <SelectValue placeholder={t("editor.script.selectPlaceholder")} />
      </SelectTrigger>
      <SelectContent className={SELECT_CONTENT_CLS}>
        {allowEmpty && (
          <SelectItem value="$all" className={SELECT_ITEM_CLS}>
            全场景（不限定人物）
          </SelectItem>
        )}
        {actorOptions.map((actor) => (
          <SelectItem
            key={actor.actorId}
            value={actor.actorId}
            className={SELECT_ITEM_CLS}
          >
            {actor.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function SetTargetSelectField({
  paramKey,
  value,
  onChange,
  options,
}: FieldProps & { options: SceneSetTargetOption[] }) {
  const { t } = useTranslation();
  const strVal = typeof value === "string" ? value : "";
  const selectedVal = options.some((option) => option.targetId === strVal)
    ? strVal
    : "";
  return (
    <Select value={selectedVal} onValueChange={(v) => onChange(v)}>
      <SelectTrigger
        className={SELECT_TRIGGER_CLS}
        aria-label={getScriptParamLabel(t, paramKey)}
      >
        <SelectValue
          placeholder={
            options.length === 0
              ? t("editor.script.noTargets")
              : t("editor.script.selectPlaceholder")
          }
        />
      </SelectTrigger>
      <SelectContent className={SELECT_CONTENT_CLS}>
        {options.map((option) => (
          <SelectItem
            key={option.targetId}
            value={option.targetId}
            className={SELECT_ITEM_CLS}
          >
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function SetVariantSelectField({
  value,
  onChange,
  setTargetOptions,
  allParams,
}: FieldProps & {
  setTargetOptions: SceneSetTargetOption[];
  allParams: Record<string, unknown>;
}) {
  const { t } = useTranslation();
  const target = resolveSetTarget(allParams);
  const options =
    setTargetOptions.find((option) => option.targetId === target)?.variants ??
    [];

  const strVal = typeof value === "string" ? value : "";
  const selectedVal = options.some((opt) => opt.id === strVal) ? strVal : "";

  return (
    <Select value={selectedVal} onValueChange={(v) => onChange(v)}>
      <SelectTrigger className={SELECT_TRIGGER_CLS}>
        <SelectValue
          placeholder={
            options.length === 0
              ? t("editor.script.noVariants")
              : t("editor.script.selectPlaceholder")
          }
        />
      </SelectTrigger>
      <SelectContent className={SELECT_CONTENT_CLS}>
        {options.map((opt) => (
          <SelectItem key={opt.id} value={opt.id} className={SELECT_ITEM_CLS}>
            {opt.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function AudioSelectField({
  value,
  onChange,
  category,
}: FieldProps & { category: "bgm" | "sfx" }) {
  const { t } = useTranslation();
  const filtered = useEditorStore((s) => s.project.assets.audio[category]);
  const strVal = typeof value === "string" ? value : "";
  const selectedAsset = filtered.find((asset) => asset.id === strVal);
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          role="combobox"
          aria-expanded={open}
          className={`${SELECT_TRIGGER_CLS} flex items-center justify-between w-full gap-1 px-2 rounded-md border`}
        >
          <span className="truncate text-left flex-1">
            {selectedAsset
              ? selectedAsset.name
              : filtered.length === 0
                ? t("editor.script.noAudioAssets")
                : t("editor.script.selectPlaceholder")}
          </span>
          <ChevronsUpDown className="w-3 h-3 shrink-0 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-60 p-0 bg-[#1c1c1c] border-white/10"
        align="start"
      >
        <Command className="bg-transparent">
          <CommandInput
            placeholder={t("editor.script.searchAudio")}
            className="text-white/90 text-xs h-8"
          />
          <CommandList className="max-h-48">
            <CommandEmpty className="text-white/40 text-xs py-3 text-center">
              {t("editor.script.noAudioFound")}
            </CommandEmpty>
            <CommandGroup>
              {filtered.map((asset) => (
                <CommandItem
                  key={asset.id}
                  value={asset.name}
                  onSelect={() => {
                    onChange(asset.id);
                    setOpen(false);
                  }}
                  className="text-xs text-white/70 cursor-pointer data-[selected=true]:bg-white/10 data-[selected=true]:text-white"
                >
                  <Check
                    className={`w-3 h-3 mr-1.5 shrink-0 ${strVal === asset.id ? "opacity-100" : "opacity-0"}`}
                  />
                  <span className="truncate">{asset.name}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function EnumSelectField({
  value,
  onChange,
  options,
  required,
}: FieldProps & {
  options: { value: string; label: string }[];
  required?: boolean;
}) {
  const { t } = useTranslation();
  const strVal = typeof value === "string" ? value : "";
  const placeholder =
    required === false
      ? t("editor.script.optionalPlaceholder")
      : t("editor.script.selectPlaceholder");
  return (
    <Select value={strVal} onValueChange={(v) => onChange(v)}>
      <SelectTrigger className={SELECT_TRIGGER_CLS}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent className={SELECT_CONTENT_CLS}>
        {options.map((opt) => (
          <SelectItem
            key={opt.value}
            value={opt.value}
            className={SELECT_ITEM_CLS}
          >
            {getScriptOptionLabel(t, opt.value, opt.label)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function ToggleField({ value, onChange }: FieldProps) {
  const { t } = useTranslation();
  const checked = value === true;
  return (
    <label className="inline-flex items-center gap-2 cursor-pointer select-none">
      <Checkbox
        checked={checked}
        onCheckedChange={(next) => onChange(next === true)}
        aria-label={t("editor.script.toggle")}
        className="size-4 border-white/25 data-[state=checked]:bg-brand data-[state=checked]:border-brand"
      />
      <span className="text-xs text-white/70">
        {checked
          ? t("editor.script.option.true")
          : t("editor.script.option.false")}
      </span>
    </label>
  );
}

function NumberInputField({
  paramKey,
  value,
  onChange,
  schema,
}: FieldProps & { schema: Extract<ParamSchema, { control: "number" }> }) {
  const numVal = typeof value === "number" ? value : (schema.min ?? 0);
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-1.5">
      <NumberField
        value={numVal}
        min={schema.min}
        max={schema.max}
        step={schema.step}
        aria-label={getScriptParamLabel(t, paramKey)}
        className="h-8 bg-white/5 border-white/10 text-xs text-white/80 font-mono focus-visible:border-brand/50 focus-visible:ring-brand/20"
        onCommit={onChange}
      />
      {schema.unit && (
        <span className="text-[11px] text-white/30 shrink-0">
          {schema.unit}
        </span>
      )}
    </div>
  );
}

function SliderField({
  paramKey,
  value,
  onChange,
  schema,
}: FieldProps & { schema: Extract<ParamSchema, { control: "slider" }> }) {
  const { t } = useTranslation();
  const numVal = typeof value === "number" ? value : schema.min;
  const precision = schema.step < 1 ? Math.ceil(-Math.log10(schema.step)) : 0;

  const roundValue = (v: number) => {
    const factor = Math.pow(10, precision);
    return Math.round(v * factor) / factor;
  };

  return (
    <div className="flex items-center gap-3">
      <Slider
        className="flex-1 [&_[data-slot=slider-track]]:h-1 [&_[data-slot=slider-track]]:bg-white/10 [&_[data-slot=slider-range]]:bg-brand [&_[data-slot=slider-thumb]]:size-3.5 [&_[data-slot=slider-thumb]]:bg-white [&_[data-slot=slider-thumb]]:border-brand"
        aria-label={getScriptParamLabel(t, paramKey)}
        min={schema.min}
        max={schema.max}
        step={schema.step}
        value={[numVal]}
        onValueChange={([v]) => onChange(roundValue(v))}
      />
      <span className="text-xs font-mono text-white/60 tabular-nums w-10 text-right shrink-0">
        {roundValue(numVal).toFixed(precision)}
        {schema.unit ?? ""}
      </span>
    </div>
  );
}

function TextareaField({
  value,
  onChange,
  schema,
}: FieldProps & { schema: Extract<ParamSchema, { control: "textarea" }> }) {
  const { t } = useTranslation();
  const strVal = typeof value === "string" ? value : "";
  return (
    <Textarea
      className="bg-white/5 border-white/10 text-xs text-white/80 min-h-[60px] focus-visible:border-brand/50 focus-visible:ring-brand/20"
      placeholder={resolveSchemaPlaceholder(t, schema.placeholder)}
      value={strVal}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

function TextInputField({
  value,
  onChange,
  schema,
}: FieldProps & { schema: Extract<ParamSchema, { control: "text" }> }) {
  const { t } = useTranslation();
  const strVal = typeof value === "string" ? value : "";
  return (
    <Input
      className="h-8 bg-white/5 border-white/10 text-xs text-white/80 focus-visible:border-brand/50 focus-visible:ring-brand/20"
      placeholder={
        resolveSchemaPlaceholder(t, schema.placeholder) ??
        t("editor.script.inputPlaceholder")
      }
      value={strVal}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

// ---------------------------------------------------------------------------
// ParamField dispatcher
// ---------------------------------------------------------------------------

function ParamField({
  paramKey,
  schema,
  value,
  onChange,
  actorOptions,
  setTargetOptions,
  allParams,
}: FieldProps & {
  schema: ParamSchema;
  actorOptions: SceneActorOption[];
  setTargetOptions: SceneSetTargetOption[];
  allParams: Record<string, unknown>;
}) {
  switch (schema.control) {
    case "image-list":
    case "scene-select":
    case "color":
    case "image-select":
      return (
        <PerformanceField
          kind={schema.control}
          value={value}
          onChange={onChange}
        />
      );
    case "actor-select":
      return (
        <ActorSelectField
          paramKey={paramKey}
          value={value}
          onChange={onChange}
          allowEmpty={!schema.required}
          actorOptions={
            paramKey === "other"
              ? actorOptions.filter((a) => a.actorId !== allParams.actor)
              : actorOptions
          }
        />
      );
    case "set-target-select":
      return (
        <SetTargetSelectField
          paramKey={paramKey}
          value={value}
          onChange={onChange}
          options={setTargetOptions.filter((o) =>
            paramKey === "fromTarget"
              ? o.targetId !== allParams.toTarget
              : paramKey === "toTarget"
                ? o.targetId !== (allParams.fromTarget ?? "$background")
                : true,
          )}
        />
      );
    case "set-variant-select":
      return (
        <SetVariantSelectField
          paramKey={paramKey}
          value={value}
          onChange={onChange}
          setTargetOptions={setTargetOptions}
          allParams={allParams}
        />
      );
    case "audio-select":
      return (
        <AudioSelectField
          paramKey={paramKey}
          value={value}
          onChange={onChange}
          category={schema.category}
        />
      );
    case "enum-select":
      return (
        <EnumSelectField
          paramKey={paramKey}
          value={value}
          onChange={onChange}
          options={schema.options}
          required={schema.required}
        />
      );
    case "toggle":
      return (
        <ToggleField paramKey={paramKey} value={value} onChange={onChange} />
      );
    case "number":
      return (
        <NumberInputField
          paramKey={paramKey}
          value={value}
          onChange={onChange}
          schema={schema}
        />
      );
    case "slider":
      return (
        <SliderField
          paramKey={paramKey}
          value={value}
          onChange={onChange}
          schema={schema}
        />
      );
    case "text":
      return (
        <TextInputField
          paramKey={paramKey}
          value={value}
          onChange={onChange}
          schema={schema}
        />
      );
    case "textarea":
      return (
        <TextareaField
          paramKey={paramKey}
          value={value}
          onChange={onChange}
          schema={schema}
        />
      );
    case "position-picker":
      return null; // Rendered as a merged widget — see special handling in popover body
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// TagConfigPopover
// ---------------------------------------------------------------------------

interface TagConfigPopoverProps {
  readOnly?: boolean;
  tag: InlineTag;
  tagIndex: number;
  position: { top: number; left: number };
  actorOptions: SceneActorOption[];
  onParamChange: (tagIndex: number, paramKey: string, value: unknown) => void;
  onDelete: (tagIndex: number) => void;
  onClose: () => void;
  onPreview?: () => void;
}

export function TagConfigPopover({
  readOnly = false,
  tag,
  tagIndex,
  position,
  actorOptions,
  onParamChange,
  onDelete,
  onClose,
  onPreview,
}: TagConfigPopoverProps) {
  const { t } = useTranslation();
  const contentRef = useRef<HTMLDivElement>(null);
  const [displayPosition, setDisplayPosition] = useState(position);
  const [codeExpanded, setCodeExpanded] = useState(false);

  const clampToViewport = useCallback(
    (preferred: { top: number; left: number }) => {
      if (!contentRef.current) return preferred;
      const rect = contentRef.current.getBoundingClientRect();
      return clampFloatingPosition(
        preferred,
        { width: rect.width, height: rect.height },
        { width: window.innerWidth, height: window.innerHeight },
      );
    },
    [],
  );

  useEffect(() => {
    setDisplayPosition(position);
  }, [position.left, position.top]);

  const clampPosition = useCallback(() => {
    setDisplayPosition((prev) => {
      const next = clampToViewport(prev);
      return prev.top === next.top && prev.left === next.left ? prev : next;
    });
  }, [clampToViewport]);

  useLayoutEffect(() => {
    clampPosition();
  }, [clampPosition, displayPosition, tag.name, tag.params, codeExpanded]);

  useEffect(() => {
    window.addEventListener("resize", clampPosition);
    return () => window.removeEventListener("resize", clampPosition);
  }, [clampPosition]);

  const handleDragStart = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();

      const startX = e.clientX;
      const startY = e.clientY;
      const origin = displayPosition;

      const handleMove = (ev: PointerEvent) => {
        ev.preventDefault();
        const preferred = {
          left: origin.left + (ev.clientX - startX),
          top: origin.top + (ev.clientY - startY),
        };
        setDisplayPosition(clampToViewport(preferred));
      };

      const handleUp = () => {
        window.removeEventListener("pointermove", handleMove);
        window.removeEventListener("pointerup", handleUp);
      };

      window.addEventListener("pointermove", handleMove);
      window.addEventListener("pointerup", handleUp);
    },
    [clampToViewport, displayPosition],
  );

  const currentScene = useEditorStore(getCurrentScene);
  const animation =
    tag.name === "animation"
      ? currentScene.animationClips?.find(
          (clip) => clip.id === tag.params.clipId,
        )
      : undefined;
  const schema = TAG_PARAM_SCHEMAS[tag.name];
  const tagParamMap = tag.params as Record<string, unknown>;
  const resolvedParamMap = getResolvedCommandParams(
    tag.name,
    (tag.name === "animation"
      ? { ...animation?.overrides, ...tag.params }
      : tag.params) as never,
  ) as Record<string, unknown>;

  const Icon = TAG_ICONS[tag.name];
  const colors = TAG_COLORS[tag.name] ?? {
    text: "text-white/60",
    bg: "bg-white/5",
    border: "border-white/10",
  };
  const images = useEditorStore((s) => s.project.assets.visual);
  const meta = useEditorStore((s) => s.project.meta);
  const moveSlot =
    tag.name === "move" && typeof tagParamMap.to === "string"
      ? getExtendedSlotPositions(meta.width, meta.height)[
          tagParamMap.to as ExtendedSlotName
        ]
      : undefined;
  const setTargetOptions = React.useMemo(
    () =>
      buildSceneSetTargetOptions(
        currentScene,
        actorOptions,
        images.background,
        images.cg,
        t,
      ).filter(
        (o) =>
          !(
            tag.name === "rackfocus" ||
            (tag.name === "camera" && tag.params.action === "rackfocus")
          ) ||
          ((o.targetId !== "$background" || !!currentScene.backgroundId) &&
            (o.targetId !== "$cg" || !!currentScene.cgId)),
      ),
    [
      currentScene,
      actorOptions,
      images.background,
      images.cg,
      t,
      tag.name,
      tag.params,
    ],
  );
  if (!schema) return null;

  const CAMERA_ACTOR_KEYS = new Set([
    "action",
    "target",
    "actor",
    "zoom",
    "dur",
    "ease",
  ]);
  const CAMERA_POINT_KEYS = new Set([
    "action",
    "target",
    "x",
    "y",
    "zoom",
    "dur",
    "ease",
  ]);

  const cameraAction =
    tag.name === "camera" ? (tagParamMap.action as string) : null;
  const cameraTarget =
    tag.name === "camera"
      ? (tagParamMap.target as string) ||
        (!tagParamMap.actor &&
        (tagParamMap.x !== undefined || tagParamMap.y !== undefined)
          ? "point"
          : "actor")
      : null;
  const entries = Object.entries(schema).filter(([key]) => {
    if (tag.name === "set" && key === "stateId") return false;
    if (tag.name === "animation") return key === "clipId" || key === "enabled";
    if (tag.name === "bgm") return BGM_SIMPLIFIED_PARAM_KEYS.has(key);
    if (
      tag.name === "presence" &&
      tagParamMap.action === "hide" &&
      ["x", "y"].includes(key)
    )
      return false;
    if (tag.name === "camera") {
      if (cameraAction === "rackfocus")
        return [
          "action",
          "fromTarget",
          "toTarget",
          "blur",
          "moveX",
          "moveY",
          "zoom",
          "dur",
        ].includes(key);
      if (cameraAction === "parallax")
        return [
          "action",
          "moveX",
          "moveY",
          "zoom",
          "backgroundDepth",
          "actorDepth",
          "foregroundDepth",
          "foreground",
          "dur",
        ].includes(key);
      if (cameraAction === "push" || cameraAction === "pull")
        return ["action", "zoom", "x", "y", "dur", "ease"].includes(key);
      if (cameraAction === "duo")
        return ["action", "actor", "other", "zoom", "dur", "ease"].includes(
          key,
        );
      if (cameraAction === "reset") return key === "action" || key === "dur";
      if (cameraTarget === "point") return CAMERA_POINT_KEYS.has(key);
      return CAMERA_ACTOR_KEYS.has(key);
    }
    return true;
  });
  const bgmAction = tag.name === "bgm" ? resolveBgmAction(tagParamMap) : null;

  const handleParamChange = (paramKey: string) => (value: unknown) => {
    onParamChange(tagIndex, paramKey, value);

    // Keep `set` params valid when target changes.
    if (paramKey === "target" && tag.name === "set") {
      onParamChange(tagIndex, "variant", "");
    }
  };

  return (
    <DismissableLayerPrimitive.DismissableLayer
      ref={contentRef}
      data-tag-config-popover=""
      role="dialog"
      className={`vnve-ui fixed z-50 ${tag.name === "animation" && codeExpanded ? "w-[min(40rem,calc(100vw-1rem))]" : "w-72"} overflow-hidden rounded-lg border border-white/10 bg-popover text-popover-foreground shadow-xl`}
      onClick={(event) => event.stopPropagation()}
      style={{ top: displayPosition.top, left: displayPosition.left }}
      onDismiss={() => {
        if (useUIStore.getState().pointPickerRequest) return;
        onClose();
      }}
      onEscapeKeyDown={(event) => {
        if (useUIStore.getState().pointPickerRequest) {
          event.preventDefault();
        }
      }}
      onInteractOutside={(event) => {
        if (useUIStore.getState().pointPickerRequest) {
          event.preventDefault();
          return;
        }
        const target =
          event.target instanceof HTMLElement
            ? event.target
            : ((event.target as ChildNode | null)?.parentElement ?? null);
        if (
          target?.closest(
            [
              "[data-radix-popper-content-wrapper]",
              '[data-slot="select-content"]',
              '[data-slot="select-trigger"]',
              '[role="listbox"]',
              '[role="option"]',
            ].join(", "),
          )
        ) {
          event.preventDefault();
        }
      }}
    >
      <fieldset disabled={readOnly} className="min-w-0 border-0 p-0 m-0">
        {/* Header */}
        <div
          className={`flex items-center gap-2 px-3 py-2 border-b border-white/5 ${colors.bg}`}
        >
          <button
            type="button"
            onPointerDown={handleDragStart}
            className="p-1 rounded text-white/30 hover:text-white/60 hover:bg-white/10 cursor-grab active:cursor-grabbing"
            title={t("editor.script.dragPanel")}
          >
            <GripHorizontal className="w-3.5 h-3.5" />
          </button>
          {Icon && <Icon className={`w-4 h-4 ${colors.text}`} />}
          <span className={`text-xs font-semibold ${colors.text}`}>
            {getCommandLabel(t, tag.name)}
          </span>
          {tag.name !== "wait" &&
            tag.name !== "wipe" &&
            tag.name !== "transition" && (
              <label
                className="ml-auto flex items-center gap-1.5 text-[11px] uppercase text-white/50 select-none"
                title={t("editor.script.sequentialHint")}
              >
                <Checkbox
                  checked={isInlineTagBlocking(tag)}
                  onCheckedChange={(checked) =>
                    onParamChange(tagIndex, "await", checked === true)
                  }
                  aria-label={t("editor.script.sequential")}
                  className="size-4 border-white/20"
                />
                {t("editor.script.sequential")}
              </label>
            )}
          {(tag.name === "wait" ||
            tag.name === "wipe" ||
            tag.name === "transition") && <span className="ml-auto" />}
          {onPreview && (
            <button
              className="p-1 rounded hover:bg-white/10 text-white/30 hover:text-emerald-400 transition-colors"
              onClick={onPreview}
              title="预览此效果"
            >
              <Play className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            className={`${onPreview ? "" : "ml-auto "}p-1 rounded hover:bg-white/10 text-white/30 hover:text-red-400 transition-colors`}
            onClick={() => onDelete(tagIndex)}
            title={t("editor.script.deleteTag")}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Params */}
        <div className="flex flex-col space-y-3 p-3 max-h-96 overflow-y-auto">
          {(() => {
            // Track whether we've already rendered the PositionPicker for a pair
            const renderedPositionPicker = new Set<string>();
            return entries.map(([key, spec]) => {
              if (tag.name === "bgm" && bgmAction) {
                if (key === "asset" && bgmAction !== "play") return null;
                if (key === "volume" && bgmAction !== "play") return null;
              }

              // Merge position-picker pair into a single widget
              if (spec.control === "position-picker") {
                const pairKey = `${key}-${spec.pairedKey}`;
                const reversePairKey = `${spec.pairedKey}-${key}`;
                if (renderedPositionPicker.has(reversePairKey)) return null;
                renderedPositionPicker.add(pairKey);

                const xKey = spec.coordKey === "x" ? key : spec.pairedKey;
                const yKey = spec.coordKey === "y" ? key : spec.pairedKey;
                const xVal =
                  typeof tagParamMap[xKey] === "number"
                    ? (tagParamMap[xKey] as number)
                    : moveSlot?.x;
                const yVal =
                  typeof tagParamMap[yKey] === "number"
                    ? (tagParamMap[yKey] as number)
                    : moveSlot?.y;
                const bothEmpty = xVal === undefined && yVal === undefined;

                return (
                  <div key={key} className="flex flex-col gap-1">
                    <div className="flex items-center justify-between">
                      <label className="text-[11px] font-bold uppercase text-white/35">
                        {t("editor.script.position")}
                        {spec.required && (
                          <span className="text-red-400/60 ml-0.5">*</span>
                        )}
                      </label>
                      <button
                        type="button"
                        title={t("editor.script.pickOnCanvas")}
                        className="flex items-center gap-1 h-5 px-1.5 text-[11px] font-medium rounded bg-yellow-500/15 text-yellow-300 hover:bg-yellow-500/25 transition-colors border border-yellow-500/20"
                        onClick={() => {
                          useUIStore.getState().setPointPickerRequest({
                            callback: (point) => {
                              handleParamChange(xKey)(point.x);
                              handleParamChange(yKey)(point.y);
                            },
                            ghostActorId:
                              typeof tagParamMap.actor === "string"
                                ? tagParamMap.actor
                                : undefined,
                          });
                        }}
                      >
                        <Crosshair className="w-2.5 h-2.5" />
                        {t("editor.script.pick")}
                      </button>
                    </div>
                    <PositionPicker
                      x={xVal}
                      y={yVal}
                      hideOffScreen={spec.hideOffScreen}
                      hideSlots={spec.hideSlots}
                      onChangeX={handleParamChange(xKey)}
                      onChangeY={handleParamChange(yKey)}
                    />
                    {spec.required && bothEmpty && (
                      <span className="text-[11px] text-red-400/70">
                        {t("editor.script.required")}
                      </span>
                    )}
                  </div>
                );
              }

              // Point picker is rendered inline with x/y row — skip standalone
              if (spec.control === "point-picker") return null;

              const value =
                tag.name === "camera" && key === "target"
                  ? cameraTarget
                  : tag.name === "bgm" && key === "action"
                    ? (tagParamMap[key] ?? bgmAction)
                    : resolvedParamMap[key];
              const isRequired =
                spec.required ||
                (tag.name === "bgm" &&
                  key === "asset" &&
                  bgmAction === "play") ||
                (tag.name === "camera" &&
                  ((key === "toTarget" && cameraAction === "rackfocus") ||
                    (key === "actor" &&
                      (cameraAction === "duo" ||
                        (cameraAction === "focus" &&
                          cameraTarget === "actor"))) ||
                    (key === "other" && cameraAction === "duo")));
              const isEmpty =
                value === undefined ||
                value === null ||
                value === "" ||
                (Array.isArray(value) && value.length === 0);
              const showError = isRequired && isEmpty;

              return (
                <div key={key} className="flex flex-col gap-1">
                  <label className="text-[11px] font-bold uppercase text-white/35">
                    {tag.name === "animation" && key === "clipId"
                      ? "名称"
                      : getScriptParamLabel(t, key)}
                    {isRequired && (
                      <span className="text-red-400/60 ml-0.5">*</span>
                    )}
                  </label>
                  <div
                    className={
                      showError ? "[&>*:first-child]:border-red-500/50" : ""
                    }
                  >
                    {tag.name === "animation" && key === "clipId" ? (
                      <Select
                        value={String(value ?? "")}
                        onValueChange={handleParamChange(key)}
                      >
                        <SelectTrigger
                          className={SELECT_TRIGGER_CLS}
                          aria-label="演出片段"
                        >
                          <SelectValue placeholder="选择演出片段" />
                        </SelectTrigger>
                        <SelectContent className={SELECT_CONTENT_CLS}>
                          {(currentScene.animationClips ?? []).map((clip) => (
                            <SelectItem key={clip.id} value={clip.id}>
                              {clip.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : tag.name === "camera" &&
                      cameraAction === "duo" &&
                      key === "zoom" ? (
                      <div className="flex items-center gap-1">
                        <NumberField
                          aria-label="双人倍率（空白自动）"
                          value={typeof value === "number" ? value : undefined}
                          min={1}
                          max={3}
                          step={0.01}
                          onCommit={handleParamChange(key)}
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => handleParamChange(key)(undefined)}
                        >
                          自动
                        </Button>
                      </div>
                    ) : (
                      <ParamField
                        paramKey={key}
                        schema={
                          tag.name === "reaction" && key === "amp"
                            ? {
                                control: "number",
                                required: false,
                                min: tag.params.action === "hop" ? 0 : 0.1,
                                step: 0.1,
                              }
                            : tag.name === "camera" &&
                                key === "dur" &&
                                (cameraAction === "rackfocus" ||
                                  cameraAction === "parallax")
                              ? {
                                  control: "number",
                                  required: false,
                                  min: 0.2,
                                  max: 30,
                                  step: 0.1,
                                }
                              : tag.name === "camera" &&
                                  key === "zoom" &&
                                  (cameraAction === "rackfocus" ||
                                    cameraAction === "parallax")
                                ? {
                                    control: "number",
                                    required: false,
                                    min: 1,
                                    max: 1.2,
                                    step: 0.01,
                                  }
                                : tag.name === "camera" &&
                                    (key === "actor" || key === "other")
                                  ? { ...spec, required: true }
                                  : spec
                        }
                        value={value}
                        onChange={handleParamChange(key)}
                        actorOptions={actorOptions}
                        setTargetOptions={setTargetOptions}
                        allParams={tag.params}
                      />
                    )}
                  </div>
                  {showError && (
                    <span className="text-[11px] text-red-400/70">
                      {t("editor.script.required")}
                    </span>
                  )}
                </div>
              );
            });
          })()}
          {tag.name === "animation" && (
            <details
              className="min-w-0 border-t border-white/10 pt-2"
              onToggle={(event) => setCodeExpanded(event.currentTarget.open)}
            >
              <summary className="cursor-pointer text-xs text-white/60">
                查看代码
              </summary>
              {animation?.source ? (
                <pre
                  aria-label="演出代码"
                  tabIndex={0}
                  className="mt-2 max-h-64 overflow-auto rounded bg-black/30 p-3 font-mono text-[11px] leading-relaxed text-white/75 select-text"
                >
                  <code>{animation.source}</code>
                </pre>
              ) : (
                <p className="mt-2 text-xs text-white/40">
                  该演出未保存源代码。
                </p>
              )}
            </details>
          )}
        </div>
      </fieldset>
    </DismissableLayerPrimitive.DismissableLayer>
  );
}
