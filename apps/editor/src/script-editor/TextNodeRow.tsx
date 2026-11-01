import React, { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Diagnostic, RichContent, TextNode, TtsEmotion } from "@vnve/core";
import { getTextNodeContent, getTextNodePlainText } from "@vnve/core";
import {
  Trash2,
  AlertCircle,
  AlertTriangle,
  Plus,
  Loader2,
  Volume2,
  VolumeX,
} from "lucide-react";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "../components/ui/tooltip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import { PlateRichTextEditor } from "./PlateRichTextEditor";

import { IconButton } from "../EditorControls";
import type { SceneActorOption } from "./scene-actor-options";

type VoiceLineDisplayStatus =
  | "ready"
  | "missingVoice"
  | "missingAudio"
  | "staleAudio"
  | "failed"
  | "generating";
interface TextNodeRowProps {
  editor?: React.ReactNode;
  voiceControls?: React.ReactNode;
  actions?: React.ReactNode;
  disabled?: boolean;
  showVoiceStatus?: boolean;
  node: TextNode;
  index: number;
  isSelected: boolean;
  actorOptions: SceneActorOption[];
  diagnostics: Diagnostic[];
  onSelect: () => void;
  onContentChange?: (content: RichContent[]) => void;
  onSpeakerChange: (actorId: string | undefined) => void;
  onDelete?: () => void;
  onSlashTrigger?: (
    position: { top: number; left: number },
    charOffset: number,
  ) => void;
  onKeyDown?: (e: React.KeyboardEvent) => void;
  onBackspaceWhenEmpty?: () => void;
  onTagParamChange?: (
    tagIndex: number,
    paramKey: string,
    value: unknown,
  ) => void;
  onTagDelete?: (tagIndex: number) => void;
  onInsertBelow?: () => void;
  onPreviewTag?: (tag: {
    name: string;
    params: Record<string, unknown>;
  }) => void;
  autoOpenTag?: { tagIndex: number; token: number };
  onAutoOpenTagHandled?: () => void;
  onTTSPreview?: (index: number) => void;
  onResolveVoice?: () => void;
  voiceName?: string;
  onEmotionChange?: (emotion?: TtsEmotion) => void;
  canGenerateTts?: boolean;
  voiceDisplayStatus?: VoiceLineDisplayStatus;
  onTTSGenerate?: () => void;
  onTTSRegenerate?: () => void;
  isTTSGenerating?: boolean;
  onVoiceVolumeChange?: (volume: number) => void;
}

export function TextNodeRow({
  editor,
  voiceControls,
  actions,
  disabled = false,
  showVoiceStatus = true,
  node,
  index,
  isSelected,
  actorOptions,
  diagnostics,
  onSelect,
  onContentChange = () => {},
  onSpeakerChange,
  onDelete,
  onSlashTrigger = () => {},
  onKeyDown = () => {},
  onBackspaceWhenEmpty = () => {},
  onTagParamChange = () => {},
  onTagDelete = () => {},
  onInsertBelow,
  onPreviewTag,
  autoOpenTag,
  onAutoOpenTagHandled,
  onTTSPreview,
  onResolveVoice,
  voiceName,
  onEmotionChange,
  canGenerateTts = false,
  voiceDisplayStatus,
  onTTSGenerate,
  onTTSRegenerate,
  isTTSGenerating = false,
  onVoiceVolumeChange,
}: TextNodeRowProps) {
  const rowRef = useRef<HTMLDivElement>(null);
  const { t } = useTranslation();
  const [showTtsBar, setShowTtsBar] = useState(isSelected);

  const content = getTextNodeContent(node);
  const isActionOnly =
    getTextNodePlainText(node).trim().length === 0 &&
    content.some((segment) => segment.type === "tag");
  const speakerOptions = actorOptions.filter(
    (actor) => actor.assetType === "character",
  );
  const selectedSpeakerId = node.actorId || "none";
  const missingSpeaker =
    Boolean(node.actorId) &&
    !speakerOptions.some((actor) => actor.actorId === node.actorId);

  const hasError = diagnostics.some((d) => d.level === "error");
  const hasWarning =
    !hasError && diagnostics.some((d) => d.level === "warning");
  const ttsOpen = isSelected && !isActionOnly;
  const audioStatusTitle =
    voiceDisplayStatus === "staleAudio"
      ? t("editor.script.voiceStale")
      : voiceDisplayStatus === "failed"
        ? t("editor.script.voiceFailed")
        : voiceDisplayStatus === "generating"
          ? t("editor.script.voiceGenerating")
          : voiceDisplayStatus === "missingVoice"
            ? t("editor.script.voiceMissingVoice")
            : voiceDisplayStatus === "missingAudio"
              ? t("editor.script.voiceMissingAudio")
              : node.audioUrl
                ? t("editor.script.ttsPlay")
                : t("editor.script.ttsNoAudio");

  useEffect(() => {
    if (isSelected && !isActionOnly) {
      setShowTtsBar(true);
      return;
    }

    const timer = window.setTimeout(() => setShowTtsBar(false), 180);
    return () => window.clearTimeout(timer);
  }, [isActionOnly, isSelected]);

  return (
    <>
      <div
        ref={rowRef}
        id={`script-line-${node.id}`}
        data-vnve-kind="dialogue"
        data-vnve-id={node.id}
        aria-current={isSelected ? "true" : undefined}
        className={`group flex items-center gap-2 px-2 py-2 rounded-md cursor-pointer transition-colors ${
          isSelected
            ? "bg-brand-muted border border-brand/30"
            : "border border-transparent hover:bg-white/5"
        }`}
        onClick={() => {
          if (!disabled) onSelect();
        }}
      >
        {/* Speaker selector */}
        {isActionOnly ? (
          <div className="shrink-0 w-20 text-[11px] font-medium text-white/30">
            {t("editor.script.actionLine")}
          </div>
        ) : (
          <div className="shrink-0 w-20" onClick={(e) => e.stopPropagation()}>
            <Select
              disabled={disabled}
              value={selectedSpeakerId}
              onValueChange={(value) => {
                const nextId = value === "none" ? undefined : value;
                onSpeakerChange(nextId);
              }}
            >
              <SelectTrigger
                size="inline"
                className="h-6 text-brand font-semibold hover:[&>svg]:text-brand/70 [&>svg]:text-brand/80 [&>svg]:opacity-70"
              >
                <SelectValue className="truncate leading-none" />
              </SelectTrigger>
              <SelectContent className="min-w-[140px]">
                {missingSpeaker && (
                  <SelectItem
                    value={selectedSpeakerId}
                    disabled
                    className="text-xs text-amber-300"
                  >
                    {t("editor.voiceProduction.unboundActor")}
                  </SelectItem>
                )}
                <SelectItem
                  value="none"
                  className="text-xs text-white/80 focus:bg-white/10 focus:text-white"
                >
                  {t("editor.script.narratorOption")}
                </SelectItem>
                {speakerOptions.map((actor) => (
                  <SelectItem
                    key={actor.actorId}
                    value={actor.actorId}
                    className="text-xs text-white/80 focus:bg-white/10 focus:text-white"
                  >
                    {actor.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Rich text editor (Plate-based) */}
        <div className="min-w-0 flex-1">
          {editor ?? (
            <PlateRichTextEditor
              content={content}
              actorOptions={actorOptions}
              placeholder={t("editor.script.textPlaceholder")}
              onChange={onContentChange}
              onSlashTrigger={onSlashTrigger}
              onKeyDown={onKeyDown}
              onBackspaceWhenEmpty={onBackspaceWhenEmpty}
              onTagParamChange={onTagParamChange}
              onTagDelete={onTagDelete}
              onPreviewTag={onPreviewTag}
              autoOpenTag={autoOpenTag}
              onAutoOpenTagHandled={onAutoOpenTagHandled}
            />
          )}
        </div>
        <div className="ml-auto flex items-center gap-1 shrink-0">
          {/* Audio status is only relevant to spoken lines. */}
          {showVoiceStatus && !isActionOnly && (
            <button
              type="button"
              className={`p-1 rounded shrink-0 transition-all ${
                isTTSGenerating || voiceDisplayStatus === "generating"
                  ? "text-brand/70"
                  : voiceDisplayStatus === "failed"
                    ? "text-red-300/80 hover:text-red-300"
                    : voiceDisplayStatus === "staleAudio" ||
                        voiceDisplayStatus === "missingVoice"
                      ? "text-amber-300/70 hover:text-amber-300"
                      : voiceDisplayStatus === "ready"
                        ? "text-emerald-400/60 hover:text-emerald-400"
                        : "text-white/20 hover:text-white/40"
              }`}
              onClick={(e) => {
                e.stopPropagation();
                if (isTTSGenerating) return;
                if (node.audioUrl && onTTSPreview) {
                  onTTSPreview(index);
                }
              }}
              title={audioStatusTitle}
            >
              {isTTSGenerating || voiceDisplayStatus === "generating" ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : voiceDisplayStatus === "failed" ? (
                <AlertCircle className="w-3.5 h-3.5" />
              ) : node.audioUrl ? (
                <Volume2 className="w-3.5 h-3.5" />
              ) : (
                <VolumeX className="w-3.5 h-3.5" />
              )}
            </button>
          )}

          {(hasError || hasWarning) && (
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="p-1 shrink-0">
                  {hasError ? (
                    <AlertCircle className="w-3.5 h-3.5 text-red-400" />
                  ) : (
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                  )}
                </div>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-xs text-xs">
                {diagnostics.map((d, i) => (
                  <div
                    key={i}
                    className={
                      d.level === "error" ? "text-red-300" : "text-amber-300"
                    }
                  >
                    {d.message}
                  </div>
                ))}
              </TooltipContent>
            </Tooltip>
          )}

          {actions}
          {onInsertBelow && (
            <IconButton
              label={t("editor.script.insertBelow")}
              disabled={disabled}
              className="opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 text-white/60 hover:text-white/90"
              onPointerDown={(event) => event.preventDefault()}
              onClick={(event) => {
                event.stopPropagation();
                onInsertBelow();
              }}
            >
              <Plus
                className="size-3"
                size={12}
                strokeWidth={1.25}
                absoluteStrokeWidth
              />
            </IconButton>
          )}
          {onDelete && (
            <IconButton
              label={t("editor.script.deleteNode")}
              disabled={disabled}
              className="opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 text-white/60 hover:text-red-400"
              onPointerDown={(event) => event.preventDefault()}
              onClick={(event) => {
                event.stopPropagation();
                onDelete();
              }}
            >
              <Trash2
                className="size-3"
                size={12}
                strokeWidth={1.25}
                absoluteStrokeWidth
              />
            </IconButton>
          )}
        </div>
      </div>

      {/* TTS audio bar with smooth reveal/collapse */}
      {showTtsBar && !isActionOnly && (
        <div
          className={`overflow-hidden transition-[max-height,opacity,transform,margin] duration-200 ease-out ${
            ttsOpen
              ? "max-h-28 opacity-100 translate-y-0 mt-0.5"
              : "max-h-0 opacity-0 -translate-y-1 mt-0"
          }`}
        >
          <div className="pl-1 pr-1 pb-1">{voiceControls}</div>
        </div>
      )}
    </>
  );
}
