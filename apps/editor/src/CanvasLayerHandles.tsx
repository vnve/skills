import React, { useRef, useState } from "react";
import type { CanvasFrame } from "./CanvasControls";
import type { CanvasElement } from "./components/ContextToolbar";
export function CanvasLayerHandles({
  frame,
  selectedElement,
  selectElement,
  lockedElements,
  pause,
  moveDialogue,
}: {
  frame?: CanvasFrame;
  selectedElement?: CanvasElement;
  selectElement: (kind: CanvasElement) => void;
  lockedElements: Partial<Record<CanvasElement, boolean>>;
  pause: () => void;
  moveDialogue: (x: number, y: number) => void;
}) {
  const drag = useRef<{
    x: number;
    y: number;
    dx: number;
    dy: number;
    width: number;
    height: number;
  }>();
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  return (
    <>
      <button
        className="canvas-layer-hit background-hit"
        aria-label="选择背景图层"
        data-vnve-kind="canvas-element"
        data-vnve-id="background"
        aria-pressed={selectedElement === "background"}
        onPointerDown={(e) => {
          e.stopPropagation();
          selectElement("background");
        }}
      />
      {frame?.hasCg && (
        <button
          className="canvas-layer-hit cg-hit"
          aria-label="选择 CG 图层"
          data-vnve-kind="canvas-element"
          data-vnve-id="cg"
          aria-pressed={selectedElement === "cg"}
          onPointerDown={(e) => {
            e.stopPropagation();
            selectElement("cg");
          }}
        />
      )}
      {frame?.dialogueBox && (
        <button
          className={`canvas-layer-hit dialogue-hit ${selectedElement === "dialogue" ? "is-selected" : ""}`}
          aria-label="选择并拖动对白框"
          data-vnve-kind="canvas-element"
          data-vnve-id="dialogue"
          aria-pressed={selectedElement === "dialogue"}
          style={{
            left: `calc(${(frame.dialogueBox.x / frame.canvasWidth) * 100}% + ${offset.x}px)`,
            top: `calc(${(frame.dialogueBox.y / frame.canvasHeight) * 100}% + ${offset.y}px)`,
            width: `${(frame.dialogueBox.width / frame.canvasWidth) * 100}%`,
            height: `${(frame.dialogueBox.height / frame.canvasHeight) * 100}%`,
            cursor: lockedElements.dialogue ? "default" : "move",
          }}
          onPointerDown={(e) => {
            e.stopPropagation();
            selectElement("dialogue");
            pause();
            if (lockedElements.dialogue) return;
            const canvas = e.currentTarget
              .closest(".canvas-size")!
              .getBoundingClientRect();
            drag.current = {
              x: e.clientX,
              y: e.clientY,
              dx: 0,
              dy: 0,
              width: canvas.width,
              height: canvas.height,
            };
            e.currentTarget.setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => {
            const d = drag.current;
            if (!d) return;
            d.dx = e.clientX - d.x;
            d.dy = e.clientY - d.y;
            setOffset({ x: d.dx, y: d.dy });
          }}
          onPointerUp={() => {
            const d = drag.current;
            drag.current = undefined;
            setOffset({ x: 0, y: 0 });
            if (!d || (!d.dx && !d.dy) || !frame.dialogueBox) return;
            moveDialogue(
              Math.max(
                0,
                Math.min(
                  100,
                  ((frame.dialogueBox.x + frame.dialogueBox.width / 2) /
                    frame.canvasWidth) *
                    100 +
                    (d.dx / d.width) * 100,
                ),
              ),
              Math.max(
                0,
                Math.min(
                  100,
                  ((frame.dialogueBox.y + frame.dialogueBox.height / 2) /
                    frame.canvasHeight) *
                    100 +
                    (d.dy / d.height) * 100,
                ),
              ),
            );
          }}
          onPointerCancel={() => {
            drag.current = undefined;
            setOffset({ x: 0, y: 0 });
          }}
        />
      )}
    </>
  );
}
