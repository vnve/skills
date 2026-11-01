import React from "react";

/** vnve Progress presentation, using the shared blue brand token. */
export function ExportProgress({ value }: { value: number }) {
  const percent = Math.max(0, Math.min(100, value));
  return (
    <div
      className="export-progress"
      data-slot="progress"
      role="progressbar"
      aria-label="导出进度"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
    >
      <div
        data-slot="progress-indicator"
        style={{ transform: `translateX(-${100 - percent}%)` }}
      />
    </div>
  );
}
