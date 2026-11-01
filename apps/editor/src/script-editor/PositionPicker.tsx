import React, { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  type ExtendedSlotName,
  getExtendedSlotPositions,
  findSlotByCoords,
} from "../core/stage-utils";
import { useEditorStore } from "../stores/editor-store";
import { NumberField } from "../NumberField";
import { ArrowLeftFromLine, ArrowRightFromLine } from "lucide-react";
import { getSlotLabel, getSlotShortLabel } from "./i18n";

// ---------------------------------------------------------------------------
// PositionPicker — slot quick-select buttons + coordinate fine-tuning
// ---------------------------------------------------------------------------

/** On-screen slot buttons displayed as a horizontal row. */
const STAGE_SLOTS: ExtendedSlotName[] = [
  "support-left",
  "left",
  "center",
  "right",
  "support-right",
];

interface PositionPickerProps {
  /** Current X coordinate (0-100 percentage). */
  x: number | undefined;
  /** Current Y coordinate (0-100 percentage). */
  y: number | undefined;
  /** Hide slot quick-select buttons (5 stage positions). */
  hideSlots?: boolean;
  /** Hide off-screen slot buttons (off-left / off-right). */
  hideOffScreen?: boolean;
  /** Called when position changes. */
  onChangeX: (value: number) => void;
  onChangeY: (value: number) => void;
}

export function PositionPicker({
  x,
  y,
  hideSlots,
  hideOffScreen,
  onChangeX,
  onChangeY,
}: PositionPickerProps) {
  const { t } = useTranslation();
  const canvasWidth = useEditorStore((s) => s.project.meta.width);
  const canvasHeight = useEditorStore((s) => s.project.meta.height);
  const activeSlot = useMemo(() => {
    if (x === undefined || y === undefined) return null;
    return findSlotByCoords(x, y, 3, canvasWidth, canvasHeight);
  }, [x, y, canvasWidth, canvasHeight]);

  const handleSlotClick = useCallback(
    (name: ExtendedSlotName) => {
      const pos = getExtendedSlotPositions(canvasWidth, canvasHeight)[name];
      onChangeX(pos.x);
      onChangeY(pos.y);
    },
    [onChangeX, onChangeY, canvasWidth, canvasHeight],
  );

  return (
    <div className="flex flex-col gap-2">
      {/* Stage slot buttons — a single row of 5 positions */}
      {!hideSlots && (
        <div className="grid grid-cols-5 gap-1">
          {STAGE_SLOTS.map((name) => {
            const isActive = activeSlot === name;
            return (
              <button
                key={name}
                type="button"
                title={getSlotLabel(t, name)}
                className={`
                py-1 rounded text-[11px] font-medium leading-none
                border transition-all duration-100
                ${
                  isActive
                    ? "bg-sky-500/20 text-sky-300 border-sky-500/30 shadow-[0_0_6px_rgba(56,189,248,0.15)]"
                    : "bg-white/[0.03] text-white/40 border-white/[0.06] hover:bg-white/[0.07] hover:text-white/60"
                }
              `}
                onClick={() => handleSlotClick(name)}
              >
                {getSlotShortLabel(t, name)}
              </button>
            );
          })}
        </div>
      )}

      {/* Off-screen buttons */}
      {!hideOffScreen && (
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            className={`
            flex-1 inline-flex items-center justify-center gap-1 py-1 rounded text-[11px] font-medium
            border transition-all duration-100
            ${
              activeSlot === "off-left"
                ? "bg-sky-500/20 text-sky-300 border-sky-500/30"
                : "bg-white/[0.03] text-white/40 border-white/[0.06] hover:bg-white/[0.07] hover:text-white/60"
            }
          `}
            onClick={() => handleSlotClick("off-left")}
            title={getSlotLabel(t, "off-left")}
          >
            <ArrowLeftFromLine className="w-3 h-3" />
            {getSlotLabel(t, "off-left")}
          </button>
          <button
            type="button"
            className={`
            flex-1 inline-flex items-center justify-center gap-1 py-1 rounded text-[11px] font-medium
            border transition-all duration-100
            ${
              activeSlot === "off-right"
                ? "bg-sky-500/20 text-sky-300 border-sky-500/30"
                : "bg-white/[0.03] text-white/40 border-white/[0.06] hover:bg-white/[0.07] hover:text-white/60"
            }
          `}
            onClick={() => handleSlotClick("off-right")}
            title={getSlotLabel(t, "off-right")}
          >
            {getSlotLabel(t, "off-right")}
            <ArrowRightFromLine className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* Fine-tune number inputs */}
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1 flex-1 min-w-0">
          <span className="text-[11px] text-white/30 font-bold uppercase w-4 shrink-0">
            X
          </span>
          <NumberField
            aria-label="X 坐标"
            wrapperClassName="flex-1"
            className="h-7 px-1.5 bg-white/5 border-white/10 text-xs text-white/80 font-mono focus-visible:border-brand/50 focus-visible:ring-brand/20"
            min={-20}
            max={120}
            step={1}
            value={x}
            onCommit={onChangeX}
          />
          <span className="text-[11px] text-white/25 shrink-0">%</span>
        </div>
        <div className="flex items-center gap-1 flex-1 min-w-0">
          <span className="text-[11px] text-white/30 font-bold uppercase w-4 shrink-0">
            Y
          </span>
          <NumberField
            aria-label="Y 坐标"
            wrapperClassName="flex-1"
            className="h-7 px-1.5 bg-white/5 border-white/10 text-xs text-white/80 font-mono focus-visible:border-brand/50 focus-visible:ring-brand/20"
            min={0}
            max={100}
            step={1}
            value={y}
            onCommit={onChangeY}
          />
          <span className="text-[11px] text-white/25 shrink-0">%</span>
        </div>
      </div>
    </div>
  );
}
