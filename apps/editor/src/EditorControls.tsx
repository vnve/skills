import React from "react";
import { Button } from "./components/ui/button";
import { Slider } from "./components/ui/slider";
import { cn } from "./components/ui/utils";

/** One icon-button treatment for compact editor actions. */
export const IconButton = React.forwardRef<
  HTMLButtonElement,
  Omit<React.ComponentProps<typeof Button>, "variant" | "size"> & {
    label: string;
  }
>(function IconButton({ label, className, children, ...props }, ref) {
  return (
    <Button
      {...props}
      ref={ref}
      variant="ghost"
      size="icon-sm"
      aria-label={label}
      title={props.title ?? label}
      className={cn(
        "vnve-ui editor-icon-button cursor-pointer disabled:cursor-default border-0 bg-transparent shadow-none",
        className,
      )}
    >
      {children}
    </Button>
  );
});

/** Normalized progress avoids rounding a media duration to a centisecond step. */
export function ProgressSlider({
  progress,
  onSeek,
  label,
  disabled,
  className,
  markers = [],
}: {
  progress: number;
  markers?: Array<{ id: string; progress: number; label: string }>;
  onSeek: (progress: number) => void;
  label: string;
  disabled?: boolean;
  className?: string;
}) {
  const value = Number.isFinite(progress)
    ? Math.min(1, Math.max(0, progress))
    : 0;
  return (
    <div className={cn("relative flex w-full min-w-0 items-center", className)}>
      <Slider
        className={cn(
          "vnve-ui editor-progress [&_[data-slot=slider-track]]:h-1.5 [&_[data-slot=slider-track]]:bg-white/10 [&_[data-slot=slider-range]]:bg-brand [&_[data-slot=slider-thumb]]:h-3 [&_[data-slot=slider-thumb]]:w-3 [&_[data-slot=slider-thumb]]:border-brand",
        )}
        aria-label={label}
        disabled={disabled}
        min={0}
        max={10000}
        step={1}
        value={[Math.round(value * 10000)]}
        onValueChange={([next]) => onSeek(next / 10000)}
      />
      {markers.map((marker) => (
        <button
          key={marker.id}
          type="button"
          aria-label={`跳转到场景：${marker.label}`}
          title={marker.label}
          disabled={disabled}
          className="absolute top-1/2 z-10 flex h-4 w-3 !p-0 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded focus-visible:outline focus-visible:outline-1 focus-visible:outline-blue-400 disabled:pointer-events-none"
          style={{
            left: `${Math.min(1, Math.max(0, marker.progress)) * 100}%`,
          }}
          onPointerDown={(event) => event.preventDefault()}
          onClick={() => onSeek(marker.progress)}
        >
          <span className="h-2 w-px shrink-0 bg-white/70" />
        </button>
      ))}
    </div>
  );
}
