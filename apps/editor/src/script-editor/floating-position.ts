export interface FloatingPoint {
  top: number;
  left: number;
}

export interface FloatingSize {
  width: number;
  height: number;
}

export interface ViewportSize {
  width: number;
  height: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, max));
}

export function clampFloatingPosition(
  preferred: FloatingPoint,
  contentSize: FloatingSize,
  viewportSize: ViewportSize,
  margin = 8,
): FloatingPoint {
  const maxLeft = Math.max(
    margin,
    viewportSize.width - contentSize.width - margin,
  );
  const maxTop = Math.max(
    margin,
    viewportSize.height - contentSize.height - margin,
  );

  return {
    left: clamp(preferred.left, margin, maxLeft),
    top: clamp(preferred.top, margin, maxTop),
  };
}
