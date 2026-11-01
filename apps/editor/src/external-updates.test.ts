// @vitest-environment happy-dom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { createDefaultProject } from "@vnve/core";
import { Session, type Loaded } from "./session";
import { useExternalUpdates } from "./external-updates";
const request = vi.hoisted(() => vi.fn());
vi.mock("./core/local-workspace", () => ({ workspaceRequest: request }));
vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
let dispose: (() => void) | undefined;
afterEach(() => {
  dispose?.();
  vi.useRealTimers();
  vi.resetAllMocks();
});
function setup() {
  vi.useFakeTimers();
  const { assets, ...project } = createDefaultProject();
  const loaded: Loaded = {
    project,
    assets,
    projectRevision: "p0",
    assetsRevision: "a0",
  };
  const current = {
    current: new Session(project.meta.id, loaded) as Session | undefined,
  };
  const buffers = { current: new Map<string, () => boolean>() };
  const lastEditAt = { current: Date.now() };
  const onLoaded = vi.fn(),
    onSaved = vi.fn(),
    onBusy = vi.fn(),
    onError = vi.fn();
  const root = createRoot(document.createElement("div"));
  function Harness({ disabled = false }) {
    useExternalUpdates({
      current,
      buffers,
      lastEditAt,
      disabled,
      onLoaded,
      onSaved,
      onBusy,
      onError,
    });
    return null;
  }
  act(() => root.render(React.createElement(Harness)));
  dispose = () => act(() => root.unmount());
  request.mockImplementation(async (input) =>
    input.op === "load"
      ? loaded
      : input.op === "checkpoint"
        ? { path: ".vnve/recovery/test.json" }
        : { projectRevision: "p1", assetsRevision: "a0" },
  );
  return {
    loaded,
    current,
    buffers,
    lastEditAt,
    onLoaded,
    onSaved,
    onBusy,
    onError,
    root,
    Harness,
  };
}
const tick = (ms: number) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
it("auto-saves a quiet edit while retaining the editor undo stack", async () => {
  const s = setup();
  s.current.current!.replace({ ...s.current.current!.project });
  await tick(1999);
  expect(s.onSaved).not.toHaveBeenCalled();
  await tick(1);
  expect(s.onSaved).toHaveBeenCalledOnce();
  expect(s.current.current!.dirty).toBe(false);
  expect(s.current.current!.undoStack).toHaveLength(1);
});
it("flushes text buffers and saves during prolonged continuous editing", async () => {
  const s = setup();
  s.buffers.current.set("line", () => {
    s.current.current!.replace({ ...s.current.current!.project });
    s.buffers.current.delete("line");
    return true;
  });
  for (let i = 0; i < 11; i++) {
    s.lastEditAt.current = Date.now();
    await tick(1000);
  }
  expect(s.onSaved).toHaveBeenCalledOnce();
});
it("checkpoints unsaved page state before accepting an external revision", async () => {
  const s = setup();
  const session = s.current.current!;
  session.replace({
    ...session.project,
    meta: { ...session.project.meta, title: "page draft" },
  });
  request.mockImplementation(async (input) =>
    input.op === "load"
      ? { ...s.loaded, projectRevision: "external" }
      : { path: ".vnve/recovery/test.json" },
  );
  await tick(1000);
  expect(request.mock.calls.map(([input]) => input.op)).toEqual([
    "load",
    "checkpoint",
  ]);
  expect(request.mock.calls[1][0].project.meta.title).toBe("page draft");
  expect(s.onLoaded).toHaveBeenCalledWith(
    session,
    expect.objectContaining({ projectRevision: "external" }),
    ".vnve/recovery/test.json",
  );
  expect(s.onSaved).not.toHaveBeenCalled();
});
it("preserves the page if recovery storage fails", async () => {
  const s = setup();
  s.current.current!.replace({ ...s.current.current!.project });
  request.mockImplementation(async (input) => {
    if (input.op === "load") return { ...s.loaded, assetsRevision: "external" };
    throw new Error("disk full");
  });
  await tick(1000);
  expect(s.onLoaded).not.toHaveBeenCalled();
  expect(s.onError).toHaveBeenCalledOnce();
});
it.each(["edit", "buffer", "switch", "disable", "unmount"])(
  "does not replace the page after %s while checkpointing",
  async (reason) => {
    const s = setup();
    s.current.current!.replace({ ...s.current.current!.project });
    let resolve!: (value: { path: string }) => void;
    request.mockImplementation(async (input) =>
      input.op === "load"
        ? { ...s.loaded, projectRevision: "external" }
        : new Promise((r) => {
            resolve = r;
          }),
    );
    await tick(1000);
    if (reason === "edit")
      s.current.current!.replace({ ...s.current.current!.project });
    if (reason === "buffer") s.buffers.current.set("new", () => true);
    if (reason === "switch") s.current.current = new Session("other", s.loaded);
    if (reason === "disable")
      act(() =>
        s.root.render(React.createElement(s.Harness, { disabled: true })),
      );
    if (reason === "unmount") {
      dispose!();
      dispose = undefined;
    }
    await act(async () => resolve({ path: ".vnve/recovery/test.json" }));
    expect(s.onLoaded).not.toHaveBeenCalled();
  },
);
it("defers sync during IME composition", async () => {
  const s = setup();
  s.current.current!.replace({ ...s.current.current!.project });
  document.dispatchEvent(new Event("compositionstart"));
  await tick(4000);
  expect(request).not.toHaveBeenCalled();
  document.dispatchEvent(new Event("compositionend"));
  await tick(1000);
  expect(s.onSaved).toHaveBeenCalledOnce();
});
