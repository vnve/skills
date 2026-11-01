// @vitest-environment happy-dom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { VoicePreview } from "./VoicePreview";

it("puts the progress thumb at exactly 100% when fractional-duration audio ends", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () =>
      root.render(
        React.createElement(VoicePreview, { src: "/voice.wav", label: "test" }),
      ),
    );
    const audio = host.querySelector("audio")!;
    Object.defineProperty(audio, "duration", {
      configurable: true,
      value: 3.745,
    });
    await act(async () => {
      audio.dispatchEvent(new Event("loadedmetadata"));
    });
    audio.currentTime = 3.74;
    await act(async () => {
      audio.dispatchEvent(new Event("timeupdate"));
      audio.dispatchEvent(new Event("ended"));
    });
    const slider = host.querySelector<HTMLElement>(
      '[role="slider"][aria-label="test录音进度"]',
    )!;
    const now = Number(
      slider.getAttribute("aria-valuenow") ??
        (slider as HTMLInputElement).value,
    );
    const max = Number(
      slider.getAttribute("aria-valuemax") ?? (slider as HTMLInputElement).max,
    );
    expect(now / max).toBe(1);
  } finally {
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});
