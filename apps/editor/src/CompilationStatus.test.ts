// @vitest-environment happy-dom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { CompilationStatus } from "./CompilationStatus";
it("shows only slow updates and never occupies canvas layout space", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.useFakeTimers();
  const host = document.createElement("div"),
    root = createRoot(host);
  const render = async (pending: boolean) =>
    act(async () =>
      root.render(React.createElement(CompilationStatus, { pending })),
    );
  try {
    await render(true);
    expect(host.querySelector('[role="status"]')).toBeNull();
    await act(async () => {
      vi.advanceTimersByTime(100);
    });
    await render(false);
    await act(async () => {
      vi.advanceTimersByTime(300);
    });
    expect(host.querySelector('[role="status"]')).toBeNull();
    await render(true);
    await act(async () => {
      vi.advanceTimersByTime(200);
    });
    expect(
      host.querySelector('[role="status"]')?.classList.contains("absolute"),
    ).toBe(true);
    await render(false);
    expect(host.querySelector('[role="status"]')).toBeNull();
  } finally {
    await act(async () => root.unmount());
    vi.useRealTimers();
    vi.unstubAllGlobals();
  }
});
