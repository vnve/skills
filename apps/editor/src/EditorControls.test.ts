// @vitest-environment happy-dom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { ProgressSlider } from "./EditorControls";
it("provides named scene ticks that seek through the same transport handler", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const host = document.createElement("div"),
    root = createRoot(host),
    onSeek = vi.fn();
  const props = {
    label: "预览进度",
    progress: 0,
    onSeek,
    markers: [{ id: "second", progress: 0.6, label: "第二场景" }],
  };
  try {
    await act(async () =>
      root.render(React.createElement(ProgressSlider, props)),
    );
    const tick = host.querySelector<HTMLButtonElement>(
      '[aria-label="跳转到场景：第二场景"]',
    )!;
    expect(tick.style.left).toBe("60%");
    await act(async () => tick.click());
    expect(onSeek).toHaveBeenLastCalledWith(0.6);
    await act(async () =>
      root.render(
        React.createElement(ProgressSlider, { ...props, disabled: true }),
      ),
    );
    await act(async () => tick.click());
    expect(onSeek).toHaveBeenCalledTimes(1);
  } finally {
    await act(async () => root.unmount());
    vi.unstubAllGlobals();
  }
});
