import React, { useCallback, useEffect, useRef, useState } from "react";
import { useEditorRef, useEditorSelection } from "platejs/react";
import { Range, Editor } from "slate";
import { Bold, Italic, Palette } from "lucide-react";
import { useTranslation } from "react-i18next";

// ---------------------------------------------------------------------------
// Predefined color palette
// ---------------------------------------------------------------------------

const COLOR_PRESETS = [
  "#ef4444", // red
  "#f97316", // orange
  "#eab308", // yellow
  "#22c55e", // green
  "#06b6d4", // cyan
  "#3b82f6", // blue
  "#8b5cf6", // violet
  "#ec4899", // pink
  "#ffffff", // white (default)
];

// ---------------------------------------------------------------------------
// FloatingTextToolbar
// ---------------------------------------------------------------------------

/**
 * A floating toolbar that appears above the current text selection when
 * the user selects text. Provides Bold, Italic, and text Color controls.
 *
 * Must be rendered **inside** a `<Plate>` provider so hooks work.
 */
export function FloatingTextToolbar() {
  const editor = useEditorRef();
  const selection = useEditorSelection();
  const { t } = useTranslation();

  const toolbarRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{
    top: number;
    left: number;
  } | null>(null);
  const [showColorPicker, setShowColorPicker] = useState(false);

  // ---- Determine if selection is expanded (non-collapsed) ----
  const isExpanded = selection != null && Range.isExpanded(selection);

  // ---- Position the toolbar above the selection ----
  useEffect(() => {
    if (!isExpanded) {
      setPosition(null);
      setShowColorPicker(false);
      return;
    }

    // Use requestAnimationFrame to let the browser settle the selection rect
    const rafId = requestAnimationFrame(() => {
      const domSelection = window.getSelection();
      if (!domSelection || domSelection.rangeCount === 0) {
        setPosition(null);
        return;
      }
      const domRange = domSelection.getRangeAt(0);
      const rect = domRange.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) {
        setPosition(null);
        return;
      }

      const toolbarWidth = toolbarRef.current?.offsetWidth ?? 160;
      let left = rect.left + rect.width / 2 - toolbarWidth / 2;
      // Clamp to viewport
      left = Math.max(8, Math.min(left, window.innerWidth - toolbarWidth - 8));
      const top = rect.top - 40; // 40px above selection

      setPosition({ top: Math.max(4, top), left });
    });

    return () => cancelAnimationFrame(rafId);
  }, [isExpanded, selection]);

  // ---- Read active marks ----
  const getMarks = useCallback(() => {
    try {
      return Editor.marks(editor as any) as Record<string, unknown> | null;
    } catch {
      return null;
    }
  }, [editor]);

  const marks = getMarks();
  const isBold = !!marks?.bold;
  const isItalic = !!marks?.italic;
  const activeColor = (marks?.color as string) ?? undefined;

  // ---- Toggle handlers ----
  const toggleBold = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      editor.tf.toggleMark("bold");
    },
    [editor],
  );

  const toggleItalic = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      editor.tf.toggleMark("italic");
    },
    [editor],
  );

  const applyColor = useCallback(
    (color: string) => {
      // Remove existing color first, then set new one (unless it's white = default)
      if (color === "#ffffff") {
        editor.tf.removeMark("color");
      } else {
        editor.tf.addMark("color", color);
      }
      setShowColorPicker(false);
    },
    [editor],
  );

  const toggleColorPicker = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setShowColorPicker((v) => !v);
  }, []);

  // ---- Don't render when collapsed ----
  if (!isExpanded || !position) return null;

  return (
    <div
      ref={toolbarRef}
      className="fixed z-[999] flex items-center gap-0.5 rounded-lg border border-white/10 bg-[#1e1e1e] shadow-xl px-1 py-0.5"
      style={{ top: position.top, left: position.left }}
      onMouseDown={(e) => {
        // Prevent toolbar clicks from stealing focus / collapsing selection
        e.preventDefault();
      }}
    >
      {/* Bold */}
      <button
        className={`p-1.5 rounded transition-colors ${
          isBold
            ? "bg-white/15 text-white"
            : "text-white/60 hover:text-white hover:bg-white/10"
        }`}
        onMouseDown={toggleBold}
        title={t("editor.script.toolbarBold")}
      >
        <Bold className="w-3.5 h-3.5" />
      </button>

      {/* Italic */}
      <button
        className={`p-1.5 rounded transition-colors ${
          isItalic
            ? "bg-white/15 text-white"
            : "text-white/60 hover:text-white hover:bg-white/10"
        }`}
        onMouseDown={toggleItalic}
        title={t("editor.script.toolbarItalic")}
      >
        <Italic className="w-3.5 h-3.5" />
      </button>

      {/* Separator */}
      <div className="w-px h-4 bg-white/10 mx-0.5" />

      {/* Color */}
      <div className="relative">
        <button
          className={`p-1.5 rounded transition-colors ${
            activeColor && activeColor !== "#ffffff"
              ? "bg-white/15 text-white"
              : "text-white/60 hover:text-white hover:bg-white/10"
          }`}
          onMouseDown={toggleColorPicker}
          title={t("editor.script.toolbarTextColor")}
        >
          <Palette className="w-3.5 h-3.5" />
          {/* Active color indicator */}
          {activeColor && activeColor !== "#ffffff" && (
            <div
              className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-2.5 h-0.5 rounded-full"
              style={{ backgroundColor: activeColor }}
            />
          )}
        </button>

        {/* Color picker dropdown */}
        {showColorPicker && (
          <div
            className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 p-2 rounded-lg border border-white/10 bg-[#1e1e1e] shadow-xl"
            onMouseDown={(e) => e.preventDefault()}
          >
            <div className="grid w-[118px] grid-cols-3 gap-1.5">
              {COLOR_PRESETS.map((color) => (
                <button
                  key={color}
                  className={`relative h-7 w-7 rounded-full border transition-transform hover:scale-105 ${
                    activeColor === color
                      ? "border-white ring-1 ring-white/40"
                      : "border-white/20"
                  }`}
                  style={{ backgroundColor: color }}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    applyColor(color);
                  }}
                  title={color === "#ffffff" ? t("common.default") : color}
                >
                  {color === "#ffffff" && (
                    <span className="absolute inset-1 rounded-full border border-black/30" />
                  )}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
