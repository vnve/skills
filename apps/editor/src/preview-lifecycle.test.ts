// @vitest-environment happy-dom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { createDefaultProject, applyProjectPatchPlan } from "@vnve/core";
import { compilePlaybackScope } from "@vnve/renderer/playback";
const rendererState = vi.hoisted(() => ({
  created: 0,
  disposed: 0,
  mediaDisposed: 0,
}));
vi.mock("@vnve/renderer", () => ({
  KonvaFrameRenderer: class {
    canvas: HTMLCanvasElement;
    constructor({ mountTarget }: { mountTarget: HTMLElement }) {
      rendererState.created++;
      this.canvas = document.createElement("canvas");
      mountTarget.append(this.canvas);
    }
    renderFrame() {}
    getActorEditingBounds() {
      return [];
    }
    getLayerEditingBounds() {
      return {};
    }
    dispose() {
      rendererState.disposed++;
      this.canvas.remove();
    }
  },
  sampleSequence: vi.fn(() => ({
    single: {
      nextRenderState: { actors: [], camera: { x: 0, y: 0, scale: 1 } },
      currentSceneId: "test",
      imageMap: new Map(),
      frameOptions: {},
    },
  })),
}));
vi.mock("@vnve/media", () => ({
  createDynamicMediaResolver: () => ({
    load: async () => {},
    dispose() {
      rendererState.mediaDisposed++;
    },
    resolveFrames: async () => new Map(),
  }),
  computeAudioState: () => ({}),
}));
vi.mock("./core/audio-playback-service", () => ({
  AudioPlaybackService: class {
    resume() {
      return Promise.resolve();
    }
    pause() {}
    dispose() {}
    resetForSeek() {}
    syncState() {
      return Promise.resolve();
    }
  },
}));
vi.mock("./CanvasTools", () => ({ CanvasTools: () => null }));
vi.mock("./CanvasLayerHandles", () => ({ CanvasLayerHandles: () => null }));
vi.mock("./CanvasControls", () => ({ CanvasHandles: () => null }));
vi.mock("./PointPicker", () => ({ PointPicker: () => null }));
import { Preview } from "./Preview";
afterEach(() => vi.unstubAllGlobals());
it("retains the visible canvas when a project edit recompiles its sequence", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  let nextFrame: FrameRequestCallback | undefined;
  vi.stubGlobal(
    "requestAnimationFrame",
    vi.fn((callback) => {
      nextFrame = callback;
      return 1;
    }),
  );
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  rendererState.created =
    rendererState.disposed =
    rendererState.mediaDisposed =
      0;
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const project = createDefaultProject();
  const sceneId = project.acts[0].scenes[0].id;
  const compile = (p: typeof project) =>
    compilePlaybackScope({
      project: p,
      scope: { type: "scene", sceneId },
      resolvedUrlMap: new Map(),
    }).sequence;
  try {
    await act(async () =>
      root.render(
        React.createElement(Preview, {
          project,
          sequence: compile(project),
          audioFiles: {},
          onError: vi.fn(),
        }),
      ),
    );
    const canvas = host.querySelector("canvas");
    expect(canvas).not.toBeNull();
    await act(async () => {
      await nextFrame?.(0);
    });
    const changed = applyProjectPatchPlan(project, {
      summary: "Canvas adjustment",
      operations: [
        { type: "scene.update", sceneId, backgroundColor: "#121212" },
      ],
    });
    if (!changed.ok) throw new Error("Fixture patch failed");
    await act(async () =>
      root.render(
        React.createElement(Preview, {
          project: changed.project,
          sequence: compile(changed.project),
          audioFiles: {},
          onError: vi.fn(),
        }),
      ),
    );
    expect(
      host.contains(canvas),
      "A local edit must not disconnect the visible canvas",
    ).toBe(true);
    expect(rendererState.created).toBe(1);
    expect(rendererState.disposed).toBe(0);
    expect(
      rendererState.mediaDisposed,
      "Keep previous-frame resources until its replacement is painted",
    ).toBe(0);
    await act(async () => {
      await nextFrame?.(16);
    });
    expect(
      rendererState.mediaDisposed,
      "Release previous resources after the new frame is painted",
    ).toBe(1);
  } finally {
    await act(async () => root.unmount());
    host.remove();
    expect(rendererState.disposed).toBe(1);
    expect(rendererState.mediaDisposed).toBe(2);
  }
});

it("reaches exactly 100% for a duration between centisecond steps", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  let nextFrame: FrameRequestCallback | undefined;
  vi.stubGlobal(
    "requestAnimationFrame",
    vi.fn((callback) => {
      nextFrame = callback;
      return 1;
    }),
  );
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  const project = createDefaultProject();
  const sequence = compilePlaybackScope({
    project,
    scope: { type: "project" },
    resolvedUrlMap: new Map(),
  }).sequence;
  sequence.duration = 3.745;
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const onTimeChange = vi.fn();
  try {
    await act(async () =>
      root.render(
        React.createElement(Preview, {
          project,
          sequence,
          audioFiles: {},
          onError: vi.fn(),
          onTimeChange,
        }),
      ),
    );
    await act(async () => {
      await nextFrame?.(0);
    });
    const play = Array.from(
      host.querySelectorAll<HTMLButtonElement>("button"),
    ).find((button) => button.textContent === "播放");
    expect(play).not.toBeNull();
    await act(async () => play!.click());
    await act(async () => {
      await nextFrame?.(100000);
    });
    const slider = host.querySelector<HTMLElement>(
      '[role="slider"][aria-label="预览进度"]',
    )!;
    expect(slider, "Use the shared shadcn slider thumb").not.toBeNull();
    expect(
      Number(slider.getAttribute("aria-valuenow")) /
        Number(slider.getAttribute("aria-valuemax")),
      "The displayed thumb must reach the endpoint",
    ).toBe(1);
    expect(onTimeChange).toHaveBeenLastCalledWith(3.745);
    const stop = host.querySelector<HTMLButtonElement>(
      'button[aria-label="停止"]',
    )!;
    expect(stop.disabled).toBe(false);
    await act(async () => stop.click());
    expect(onTimeChange).toHaveBeenLastCalledWith(0);
    expect(Number(slider.getAttribute("aria-valuenow"))).toBe(0);
    expect(stop.disabled).toBe(true);
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});

it("keeps the current playback state when stepping between dialogue lines", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  let nextFrame: FrameRequestCallback | undefined;
  vi.stubGlobal(
    "requestAnimationFrame",
    vi.fn((callback) => {
      nextFrame = callback;
      return 1;
    }),
  );
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  const project = createDefaultProject(),
    sceneId = project.acts[0].scenes[0].id;
  const sequence = compilePlaybackScope({
    project,
    scope: { type: "project" },
    resolvedUrlMap: new Map(),
  }).sequence;
  sequence.duration = 10;
  project.acts[0].scenes.push({
    ...project.acts[0].scenes[0],
    id: "next-scene",
    name: "Next scene",
  });
  sequence.sceneClips.push({
    ...sequence.sceneClips[0],
    clipId: "scene:next-scene",
    sceneId: "next-scene",
    startTime: 5,
    contentStartTime: 5,
    endTime: 10,
  });
  const onTimeChange = vi.fn();
  const step = vi.fn();
  function Harness() {
    const [seekRequest, setSeekRequest] = React.useState<{
      time: number;
      token: number;
      play?: boolean;
    }>();
    return React.createElement(Preview, {
      project,
      sequence,
      audioFiles: {},
      onError: vi.fn(),
      onTimeChange,
      seekRequest,
      editing: {
        sceneId,
        unsaved: false,
        pendingTextEdits: false,
        canUndo: false,
        canRedo: false,
        undo() {},
        redo() {},
        maximized: false,
        toggleMaximize() {},
        patch: () => true,
        onSelectActor: () => true,
        onAddCharacter: () => undefined,
        onSelectCanvas: () => true,
        beforePlayback: () => "ready",
        scope: "project",
        onScopeChange() {},
        onSelectScene() {},
        onTransform: () => true,
        onSelectTheme() {},
        disabled: false,
        stepLine: (direction, playing?: boolean) => {
          step(direction, playing);
          setSeekRequest({ time: 2, token: performance.now(), play: playing });
        },
      },
    });
  }
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const button = (label: string) =>
    Array.from(host.querySelectorAll<HTMLButtonElement>("button")).find(
      (b) => b.getAttribute("aria-label") === label || b.textContent === label,
    )!;
  try {
    await act(async () => root.render(React.createElement(Harness)));
    await act(async () => {
      await nextFrame?.(performance.now());
    });
    expect(host.querySelectorAll('[aria-label^="跳转到场景："]')).toHaveLength(
      1,
    );
    expect(
      host.querySelector('[aria-label="跳转到场景：Next scene"]'),
    ).not.toBeNull();
    await act(async () => button("下一句").click());
    expect(step).toHaveBeenLastCalledWith(1, false);
    expect(button("播放")).toBeDefined();
    await act(async () => button("播放").click());
    await act(async () => button("下一句").click());
    expect(step).toHaveBeenLastCalledWith(1, true);
    expect(button("暂停")).toBeDefined();
    await act(async () => {
      await nextFrame?.(performance.now() + 100);
    });
    expect(onTimeChange.mock.lastCall?.[0]).toBeGreaterThan(2);
    await act(async () => button("上一句").click());
    expect(step).toHaveBeenLastCalledWith(-1, true);
    expect(button("暂停")).toBeDefined();
    const slider = host.querySelector<HTMLElement>(
      '[role="slider"][aria-label="预览进度"]',
    )!;
    await act(async () =>
      slider.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }),
      ),
    );
    expect(
      button("暂停"),
      "Seeking with the progress bar must not pause playback",
    ).toBeDefined();
    await act(async () => button("暂停").click());
    await act(async () =>
      slider.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }),
      ),
    );
    expect(
      button("播放"),
      "Seeking while paused must stay paused",
    ).toBeDefined();
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});
