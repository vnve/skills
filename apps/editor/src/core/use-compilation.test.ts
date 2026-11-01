// @vitest-environment happy-dom
import { it, expect, vi } from "vitest";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { useCompilation } from "./use-compilation";
vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
it("ignores late results and aborts obsolete compilation generations", async () => {
  const host = document.createElement("div"),
    root = createRoot(host);
  let resolveA!: (v: string) => void,
    resolveB!: (v: string) => void,
    oldSignal: AbortSignal | undefined;
  const a = (_scope: unknown, _scene: unknown, signal?: AbortSignal) => {
    oldSignal = signal;
    return new Promise<string>((r) => (resolveA = r));
  };
  const b = () => new Promise<string>((r) => (resolveB = r));
  function View({ compile }: { compile: typeof a }) {
    const { value, pending } = useCompilation(compile, "project");
    return React.createElement("span", null, `${value ?? "none"}:${pending}`);
  }
  await act(async () => root.render(React.createElement(View, { compile: a })));
  await act(async () => root.render(React.createElement(View, { compile: b })));
  expect(oldSignal?.aborted).toBe(true);
  await act(async () => resolveB("new"));
  expect(host.textContent).toBe("new:false");
  await act(async () => resolveA("old"));
  expect(host.textContent).toBe("new:false");
  await act(async () => root.unmount());
});
it("does not rebuild project playback when the playhead selects another scene", async () => {
  const host = document.createElement("div"),
    root = createRoot(host);
  const compile = vi.fn(async (_scope: unknown, _scene?: string) => ({
    duration: 20,
  }));
  function View({
    sceneId,
    scope = "project",
  }: {
    sceneId: string;
    scope?: "project" | "scene";
  }) {
    const { value } = useCompilation(compile, scope, sceneId);
    return React.createElement("span", null, value?.duration);
  }
  try {
    await act(async () =>
      root.render(React.createElement(View, { sceneId: "first" })),
    );
    expect(compile).toHaveBeenCalledTimes(1);
    await act(async () =>
      root.render(React.createElement(View, { sceneId: "second" })),
    );
    expect(
      compile,
      "A cross-scene seek must retain the same project sequence",
    ).toHaveBeenCalledTimes(1);
    await act(async () =>
      root.render(
        React.createElement(View, { sceneId: "first", scope: "scene" }),
      ),
    );
    await act(async () =>
      root.render(
        React.createElement(View, { sceneId: "second", scope: "scene" }),
      ),
    );
    expect(compile).toHaveBeenCalledTimes(3);
  } finally {
    await act(async () => root.unmount());
  }
});
