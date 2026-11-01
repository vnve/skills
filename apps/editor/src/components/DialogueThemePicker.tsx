import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Palette, Check, Plus, Pencil } from "lucide-react";
import {
  DIALOGUE_THEMES,
  canonicalDialogueThemeId,
  resolveDialogueTheme,
  type DialogueThemeConfig,
} from "@vnve/renderer";
import type { AssetTheme } from "@vnve/core";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { ThemePreviewSwatch } from "./ThemePreviewSwatch";

interface DialogueThemePickerProps {
  disabled?: boolean;
  currentThemeId?: string;
  onSelectTheme: (themeId: string) => void;
  onCreateCustom?: () => void;
  onEditTheme?: (themeId: string) => void;
  customThemes?: AssetTheme[];
  resolvedBoxImageUrls?: Map<string, string>;
}

function ThemeRow({
  theme,
  displayName,
  isActive,
  boxImageUrl,
  onClick,
  onEdit,
  editLabel,
}: {
  theme: DialogueThemeConfig;
  displayName: string;
  isActive: boolean;
  boxImageUrl?: string;
  onClick: () => void;
  onEdit?: () => void;
  editLabel: string;
}) {
  return (
    <div className="flex items-center gap-0.5">
      <DropdownMenuItem
        onSelect={onClick}
        className={`min-w-0 flex-1 items-center gap-3 px-2 py-1.5 ${isActive ? "bg-white/10" : ""}`}
      >
        <ThemePreviewSwatch
          fill={theme.boxFill}
          stroke={theme.boxStroke}
          text={theme.textColor}
          nameplate={theme.nameplateFill}
          radius={theme.cornerRadius}
          boxImageUrl={boxImageUrl ?? theme.boxImageUrl}
        />
        <span className="min-w-0 flex-1 truncate text-xs font-medium text-white/80">
          {displayName}
        </span>
        {isActive ? <Check className="size-3.5 shrink-0 text-brand" /> : null}
      </DropdownMenuItem>
      {onEdit ? (
        <DropdownMenuItem
          data-testid={`dialogue-theme-picker-edit-${theme.id}`}
          onSelect={onEdit}
          className="px-2 text-white/50 hover:text-brand"
          aria-label={editLabel}
          title={editLabel}
        >
          <Pencil className="size-3.5" />
        </DropdownMenuItem>
      ) : null}
    </div>
  );
}

export function DialogueThemePicker({
  disabled = false,
  currentThemeId,
  onSelectTheme,
  onCreateCustom,
  onEditTheme,
  customThemes = [],
  resolvedBoxImageUrls,
}: DialogueThemePickerProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const activeThemeId = canonicalDialogueThemeId(currentThemeId);

  const resolveCustomBoxImage = (theme: AssetTheme) => {
    if (!theme.data.boxImageUrl) return undefined;
    return (
      resolvedBoxImageUrls?.get(theme.data.boxImageAssetId ?? "") ??
      theme.data.boxImageUrl
    );
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          data-testid="dialogue-theme-picker"
          disabled={disabled}
          className={`rounded-md p-2 transition-colors hover:bg-white/10 ${
            open
              ? "bg-brand-muted text-brand"
              : "text-white/60 hover:text-white"
          }`}
          title={t("editor.properties.dialogueTheme")}
          aria-label={t("editor.properties.dialogueTheme")}
        >
          <Palette className="size-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="center"
        className="max-h-[min(24rem,var(--radix-dropdown-menu-content-available-height))] w-56 overflow-y-auto p-1.5"
      >
        <div className="px-2 py-1.5">
          <span className="text-[10px] font-semibold tracking-wider text-white/40 uppercase">
            {t("editor.properties.dialogueTheme")}
          </span>
        </div>
        {DIALOGUE_THEMES.map((theme) => (
          <ThemeRow
            key={theme.id}
            theme={theme}
            displayName={t(
              `editor.dialogue.themeNames.${theme.id}`,
              theme.name,
            )}
            isActive={theme.id === activeThemeId}
            onClick={() => onSelectTheme(theme.id)}
            editLabel={t("editor.dialogue.edit")}
          />
        ))}
        {customThemes.length > 0 ? (
          <>
            <DropdownMenuSeparator className="bg-white/10" />
            <div className="px-2 py-1.5">
              <span className="text-[9px] font-semibold tracking-wider text-white/30 uppercase">
                {t("editor.dialogue.custom")}
              </span>
            </div>
            {customThemes.map((ct) => {
              const resolved = resolveDialogueTheme(ct.baseThemeId, ct.data);
              return (
                <ThemeRow
                  key={ct.id}
                  theme={{ ...resolved, id: ct.id, name: ct.name }}
                  displayName={ct.name}
                  isActive={ct.id === activeThemeId}
                  boxImageUrl={resolveCustomBoxImage(ct)}
                  onClick={() => onSelectTheme(ct.id)}
                  onEdit={onEditTheme ? () => onEditTheme(ct.id) : undefined}
                  editLabel={t("editor.dialogue.edit")}
                />
              );
            })}
          </>
        ) : null}
        {onCreateCustom && (
          <>
            <DropdownMenuSeparator className="bg-white/10" />
            <DropdownMenuItem
              data-testid="dialogue-theme-picker-create-custom"
              onSelect={() => onCreateCustom?.()}
              className="text-xs text-white/80"
            >
              <Plus className="size-3.5" />
              {t("editor.dialogue.createCustom")}
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
