// @vitest-environment happy-dom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { createDefaultProject } from "@vnve/core";
import { ScriptPanel } from "./ScriptPanel";
vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
vi.mock("../components/ui/scroll-area", () => ({
  ScrollArea: ({ children }: any) => children,
}));
vi.mock("../script-editor/DraggableNodeRow", () => ({
  DraggableNodeRow: ({ children }: any) => children,
}));
vi.mock("../script-editor/TextNodeRow", () => ({
  TextNodeRow: ({ node }: any) =>
    React.createElement("div", { id: `script-line-${node.id}` }),
}));
vi.mock("../VoicePreview", () => ({ VoicePreview: () => null }));
it("follows the active playback line even when selection does not change", () => {
  const project = createDefaultProject();
  const scene = project.acts[0].scenes[0];
  scene.script.nodes = [
    { id: "first", type: "text", text: "First" },
    { id: "last", type: "text", text: "Last" },
  ];
  const host = document.createElement("div");
  const root = createRoot(host);
  const scroll = vi
    .spyOn(HTMLElement.prototype, "scrollIntoView")
    .mockImplementation(() => {});
  const props = {
    project,
    scene,
    selectedNodeId: "first",
    select: vi.fn(),
    renderEditor: () => null,
    previewPlaying: true,
    changeSpeaker: vi.fn(),
    moveNode: vi.fn(),
    insertNode: vi.fn(),
    deleteNode: vi.fn(),
  };
  try {
    act(() =>
      root.render(
        React.createElement(ScriptPanel, { ...props, activeNodeId: "first" }),
      ),
    );
    act(() =>
      root.render(
        React.createElement(ScriptPanel, { ...props, activeNodeId: "last" }),
      ),
    );
    expect(scroll.mock.instances.at(-1)).toBe(
      host.querySelector("#script-line-last"),
    );
    expect(scroll).toHaveBeenLastCalledWith({ block: "nearest" });
    act(() =>
      root.render(
        React.createElement(ScriptPanel, {
          ...props,
          activeNodeId: "last",
          previewPlaying: false,
        }),
      ),
    );
    expect(scroll.mock.instances.at(-1)).toBe(
      host.querySelector("#script-line-last"),
    );
  } finally {
    act(() => root.unmount());
    scroll.mockRestore();
  }
});
