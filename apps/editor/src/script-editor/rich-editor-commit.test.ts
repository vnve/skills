// @vitest-environment happy-dom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { createDefaultProject } from "@vnve/core";
import { RichEditor } from "./RichEditor";
import { EditBuffers, flushEdits } from "./EditBuffers";
let edit: (content: unknown[]) => void;
vi.mock("./PlateRichTextEditor", () => ({
  PlateRichTextEditor: (props: any) => {
    edit = props.onChange;
    return null;
  },
}));
vi.mock("./SlashCommandPalette", () => ({ SlashCommandPalette: () => null }));
vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
it("reports a rejected draft once until the draft or project changes", () => {
  const project = createDefaultProject(),
    buffers = new Map<string, () => boolean>();
  const onChange = vi.fn(() => false);
  const root = createRoot(document.createElement("div"));
  const render = (p = project) =>
    act(() =>
      root.render(
        React.createElement(
          EditBuffers.Provider,
          { value: buffers },
          React.createElement(RichEditor, {
            content: [],
            nodeId: "line",
            project: p,
            scene: p.acts[0].scenes[0],
            onChange,
            onEnter: () => {},
          }),
        ),
      ),
    );
  try {
    render();
    act(() => edit([{ type: "text", text: "draft" }]));
    expect(flushEdits(buffers)).toBe(false);
    expect(flushEdits(buffers)).toBe(false);
    expect(onChange).toHaveBeenCalledTimes(1);
    act(() => edit([{ type: "text", text: "changed" }]));
    expect(flushEdits(buffers)).toBe(false);
    expect(onChange).toHaveBeenCalledTimes(2);
    render({ ...project });
    expect(flushEdits(buffers)).toBe(false);
    expect(onChange).toHaveBeenCalledTimes(3);
    expect(buffers.size).toBe(1);
  } finally {
    act(() => root.unmount());
  }
});
