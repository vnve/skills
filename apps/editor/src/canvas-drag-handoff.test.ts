// @vitest-environment happy-dom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { createDefaultProject } from "@vnve/core";
import { CanvasHandles, type CanvasFrame } from "./CanvasControls";

it("keeps the released selection at its preview position until the committed frame arrives", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const project = createDefaultProject();
  const scene = project.acts[0].scenes[0];
  scene.actors = [
    { id: "actor", x: 25, y: 100, scale: 1 } as (typeof scene.actors)[number],
  ];
  const frame = {
    sceneId: scene.id,
    time: 0,
    cameraScale: 1,
    canvasWidth: 1280,
    canvasHeight: 720,
    actors: [{ id: "actor", x: 25, y: 100, scale: 1 }],
    bounds: [{ id: "actor", x: 200, y: 200, width: 200, height: 400 }],
  } as CanvasFrame;
  const host = document.createElement("div");
  host.className = "canvas-size";
  host.getBoundingClientRect = () => ({ width: 1000, height: 600 }) as DOMRect;
  document.body.append(host);
  const root = createRoot(host);
  const commit = vi.fn(() => true);
  const render = (value: CanvasFrame) =>
    root.render(
      React.createElement(CanvasHandles, {
        project,
        scene,
        frame: value,
        selectedActorId: "actor",
        selectActor: () => {},
        preview: () => {},
        commit,
        pause: () => {},
        disabled: false,
      }),
    );
  try {
    await act(async () => render(frame));
    const surface = host.querySelector<HTMLButtonElement>(
      ".actor-drag-surface",
    )!;
    surface.setPointerCapture = () => {};
    const pointer = (type: string, x: number) =>
      surface.dispatchEvent(
        new PointerEvent(type, {
          bubbles: true,
          clientX: x,
          clientY: 200,
          pointerId: 1,
        }),
      );
    await act(async () => {
      pointer("pointerdown", 200);
      pointer("pointermove", 300);
    });
    const box = host.querySelector<HTMLElement>(".actor-hit-region")!;
    const releasedLeft = box.style.left;
    await act(async () => pointer("pointerup", 300));
    expect(commit).toHaveBeenCalledOnce();
    expect(
      box.style.left,
      "Do not jump back to the old sampled bounds on release",
    ).toBe(releasedLeft);
    await act(async () =>
      render({
        ...frame,
        actors: [{ ...frame.actors[0], x: 35 }],
        bounds: [{ ...frame.bounds[0], x: 200 + project.meta.width * 0.1 }],
      }),
    );
    expect(box.classList.contains("is-dragging")).toBe(false);
    expect(box.style.left).toBe(releasedLeft);
  } finally {
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});
