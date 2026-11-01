import React, { useEffect } from "react";
import { usePointPicker, useUIStore } from "./stores/ui-store";
export function PointPicker({ pause }: { pause: () => void }) {
  const request = usePointPicker();
  useEffect(() => {
    if (!request) return;
    pause();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopImmediatePropagation();
        useUIStore.getState().setPointPickerRequest(null);
      }
    };
    window.addEventListener("keydown", key, true);
    return () => window.removeEventListener("keydown", key, true);
  }, [request]);
  if (!request) return null;
  return (
    <div
      className="canvas-point-picker"
      role="button"
      tabIndex={0}
      aria-label="点击画布取点，Esc 取消"
      onPointerDown={(e) => {
        e.preventDefault();
        e.stopPropagation();
        const rect = e.currentTarget.getBoundingClientRect();
        request.callback({
          x: Math.round(((e.clientX - rect.left) / rect.width) * 10000) / 100,
          y: Math.round(((e.clientY - rect.top) / rect.height) * 10000) / 100,
        });
        useUIStore.getState().setPointPickerRequest(null);
      }}
    >
      <span>点击画布取点 · Esc 取消</span>
    </div>
  );
}
