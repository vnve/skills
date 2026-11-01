import React, { useCallback, useLayoutEffect, useRef } from "react";
/** Toolbar belongs to the selection frame; it is not a second canvas-wide overlay. */
export function ObjectSelectionTools({
  mount,
}: {
  mount: (element: HTMLDivElement | null) => void;
}) {
  const root = useRef<HTMLDivElement | null>(null);
  useLayoutEffect(() => {
    const element = root.current;
    const boundary = element?.closest(".canvas-workbench");
    if (!element || !boundary) return;
    const fit = () => {
      element.style.translate = "0px";
      element.dataset.below = "false";
      element.style.setProperty(
        "--selection-max-width",
        `${Math.max(0, boundary.clientWidth - 16)}px`,
      );
      const box = element.getBoundingClientRect(),
        area = boundary.getBoundingClientRect();
      const shift =
        box.left < area.left + 8
          ? area.left + 8 - box.left
          : box.right > area.right - 8
            ? area.right - 8 - box.right
            : 0;
      element.style.translate = `${shift}px`;
      if (box.top < area.top + 8) element.dataset.below = "true";
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(element);
    observer.observe(boundary);
    return () => observer.disconnect();
  });
  const bind = useCallback(
    (element: HTMLDivElement | null) => {
      root.current = element;
      mount(element);
    },
    [mount],
  );
  return (
    <div
      className="object-selection-tools vnve-ui"
      ref={bind}
      onPointerDown={(e) => e.stopPropagation()}
    />
  );
}
