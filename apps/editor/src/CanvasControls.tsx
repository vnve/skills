import { ObjectSelectionTools } from "./ObjectSelectionTools";
import { computeAlignmentGuides } from "./core/stage-utils";
import React, { useRef, useState, useEffect } from "react";
import type { Project, Scene } from "@vnve/core";
import type { ActorRenderState } from "@vnve/runtime";
import { actorInfo } from "./panels/shared";
export type ActorBox = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
};
export type ActorTransform = {
  x?: number;
  y?: number;
  scale?: number;
  flipX?: boolean;
  visible?: boolean;
  zIndex?: number;
  variantId?: string;
};
export type CanvasFrame = {
  sceneId: string;
  actors: ActorRenderState[];
  bounds: ActorBox[];
  dialogueBox?: Omit<ActorBox, "id">;
  hasCg?: boolean;
  canvasWidth: number;
  canvasHeight: number;
  cameraScale: number;
  actorSpace?: number[];
  time: number;
  animationOffsets?: Record<string, { x: number; y: number; scale: number }>;
  speakerBoosts?: Record<string, number>;
};
export function CanvasHandles({
  project,
  scene,
  frame,
  selectedActorId,
  mountTools,
  selectActor,
  preview,
  commit,
  pause,
  disabled,
}: {
  project: Project;
  scene?: Scene;
  frame?: CanvasFrame;
  selectedActorId?: string;
  mountTools?: (element: HTMLDivElement | null) => void;
  selectActor: (id?: string) => void;
  preview: (id: string, t: { x: number; y: number; scale: number }) => void;
  commit: (id: string, t: ActorTransform) => boolean;
  pause: () => void;
  disabled: boolean;
}) {
  const [drag, setDrag] = useState<{
    id: string;
    dx: number;
    dy: number;
    ratio: number;
    guides: ReturnType<typeof computeAlignmentGuides>["guides"];
    bounds: ActorBox;
    released?: boolean;
    next?: { x: number; y: number; scale: number };
  }>();
  const session = useRef<{
    id: string;
    startX: number;
    startY: number;
    actor: ActorRenderState;
    size: { width: number; height: number };
    bounds: ActorBox;
    resize: false | "nw" | "ne" | "sw" | "se";
    next: { x: number; y: number; scale: number };
  }>();
  useEffect(() => {
    session.current = undefined;
    setDrag(undefined);
  }, [scene?.id, disabled]);
  // Keep the optimistic selection until the sampled frame acknowledges the edit.
  useEffect(() => {
    if (!drag?.released || !drag.next) return;
    const actor = frame?.actors.find((a) => a.id === drag.id);
    if (
      actor &&
      Math.abs(actor.x - drag.next.x) < 0.001 &&
      Math.abs(actor.y - drag.next.y) < 0.001 &&
      Math.abs(actor.scale - drag.next.scale) < 0.001
    )
      setDrag(undefined);
  }, [frame, drag]);
  function start(
    e: React.PointerEvent<HTMLButtonElement>,
    box: ActorBox,
    resize: false | "nw" | "ne" | "sw" | "se",
  ) {
    if (disabled || !frame) return;
    e.stopPropagation();
    selectActor(box.id);
    pause();
    const actor = frame.actors.find((a) => a.id === box.id);
    if (!actor || scene?.actors.find((a) => a.id === box.id)?.locked) return;
    const surface = e.currentTarget
      .closest(".canvas-size")!
      .getBoundingClientRect();
    session.current = {
      id: box.id,
      startX: e.clientX,
      startY: e.clientY,
      actor,
      size: surface,
      bounds: box,
      resize,
      next: { x: actor.x, y: actor.y, scale: actor.scale },
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function move(e: React.PointerEvent<HTMLButtonElement>) {
    const s = session.current;
    if (!s || !frame) return;
    const dx =
        (((e.clientX - s.startX) / s.size.width) * 100) /
        (frame.cameraScale || 1),
      dy =
        (((e.clientY - s.startY) / s.size.height) * 100) /
        (frame.cameraScale || 1);
    const width = Math.max(
      20,
      (s.bounds.width / project.meta.width) * s.size.width,
    );
    const height = Math.max(
      20,
      (s.bounds.height / project.meta.height) * s.size.height,
    );
    const signX = s.resize && s.resize.endsWith("w") ? -1 : 1;
    const signY = s.resize && s.resize.startsWith("n") ? -1 : 1;
    const ratio = s.resize
      ? Math.max(
          0.1 / s.actor.scale,
          Math.min(
            4 / s.actor.scale,
            1 +
              ((e.clientX - s.startX) * signX * width +
                (e.clientY - s.startY) * signY * height) /
                (width * width + height * height),
          ),
        )
      : 1;
    // Scale from the opposite corner while preserving the actor's bottom-center pivot.
    const shiftX = s.resize
      ? (((signX * width * (ratio - 1)) / 2 / s.size.width) * 100) /
        (frame.cameraScale || 1)
      : dx;
    const shiftY = s.resize
      ? signY === 1
        ? (((height * (ratio - 1)) / s.size.height) * 100) /
          (frame.cameraScale || 1)
        : 0
      : dy;
    s.next = {
      x: Math.max(-200, Math.min(300, s.actor.x + shiftX)),
      y: Math.max(-200, Math.min(300, s.actor.y + shiftY)),
      scale: s.actor.scale * ratio,
    };
    let guides: ReturnType<typeof computeAlignmentGuides>["guides"] = [];
    if (!s.resize) {
      const snap = computeAlignmentGuides(
        s.next.x,
        s.next.y,
        frame.actors.filter(
          (a) => a.id !== s.id && a.visible && a.opacity > 0.02,
        ),
        2,
        project.meta.width,
        project.meta.height,
      );
      guides = snap.guides;
      s.next.x = snap.snapX ?? s.next.x;
      s.next.y = snap.snapY ?? s.next.y;
    }
    preview(s.id, s.next);
    setDrag({
      id: s.id,
      dx: (s.next.x - s.actor.x) * (frame.cameraScale || 1),
      dy: (s.next.y - s.actor.y) * (frame.cameraScale || 1),
      ratio,
      guides,
      bounds: s.bounds,
    });
  }
  function end(e: React.PointerEvent<HTMLButtonElement>, cancel = false) {
    const s = session.current;
    if (!s) return;
    session.current = undefined;
    if (
      s.next.x === s.actor.x &&
      s.next.y === s.actor.y &&
      s.next.scale === s.actor.scale
    ) {
      setDrag(undefined);
      return;
    }
    if (
      cancel ||
      !commit(
        s.id,
        s.resize
          ? { x: s.next.x, y: s.next.y, scale: s.next.scale }
          : { x: s.next.x, y: s.next.y },
      )
    ) {
      setDrag(undefined);
      preview(s.id, { x: s.actor.x, y: s.actor.y, scale: s.actor.scale });
    } else {
      setDrag((value) =>
        value ? { ...value, released: true, next: s.next, guides: [] } : value,
      );
    }
  }
  return (
    <div
      className="canvas-handles"
      onPointerDown={() => selectActor(undefined)}
    >
      {drag?.guides.map((guide, index) => {
        const matrix = frame?.actorSpace ?? [1, 0, 0, 1, 0, 0];
        const position =
          guide.orientation === "v"
            ? guide.position * matrix[0] +
              (matrix[4] / project.meta.width) * 100
            : guide.position * matrix[3] +
              (matrix[5] / project.meta.height) * 100;
        return (
          <div
            key={index}
            data-testid="canvas-snap-guide"
            className={`canvas-snap-guide ${guide.orientation}`}
            style={
              guide.orientation === "v"
                ? { left: `${position}%` }
                : { top: `${position}%` }
            }
          />
        );
      })}
      {!disabled &&
        frame?.bounds.map((box) => {
          const selected = selectedActorId === box.id;
          const active = drag?.id === box.id ? drag : undefined;
          const actor = scene?.actors.find((a) => a.id === box.id);
          if (!actor) return null;
          const label = actorInfo(project, actor).name;
          const displayBox = active ? active.bounds : box;
          return (
            <div
              key={box.id}
              className={`actor-hit-region ${selected ? "is-selected" : ""} ${actor.locked ? "is-locked" : ""} ${active && !active.released ? "is-dragging" : ""}`}
              style={{
                left: `${(displayBox.x / project.meta.width) * 100 + (active?.dx ?? 0)}%`,
                top: `${(displayBox.y / project.meta.height) * 100 + (active?.dy ?? 0)}%`,
                width: `${(displayBox.width / project.meta.width) * 100}%`,
                height: `${(displayBox.height / project.meta.height) * 100}%`,
                transform: active ? `scale(${active.ratio})` : undefined,
              }}
            >
              <button
                className="actor-drag-surface"
                data-vnve-kind="actor"
                data-vnve-id={actor.id}
                aria-pressed={selected}
                aria-label={`选择并拖动人物：${label}`}
                onPointerDown={(e) => start(e, box, false)}
                onPointerMove={move}
                onPointerUp={(e) => end(e)}
                onPointerCancel={(e) => end(e, true)}
              />
              {selected && (
                <>
                  {mountTools && <ObjectSelectionTools mount={mountTools} />}
                  {!actor.locked &&
                    (["nw", "ne", "sw", "se"] as const).map((corner) => (
                      <button
                        key={corner}
                        className={`actor-resize-handle corner-${corner}`}
                        aria-label={`缩放人物：${label}（${{ nw: "左上", ne: "右上", sw: "左下", se: "右下" }[corner]}）`}
                        onPointerDown={(e) => start(e, box, corner)}
                        onPointerMove={move}
                        onPointerUp={(e) => end(e)}
                        onPointerCancel={(e) => end(e, true)}
                      />
                    ))}
                </>
              )}
            </div>
          );
        })}
    </div>
  );
}
