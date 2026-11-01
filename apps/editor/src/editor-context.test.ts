import { expect, it } from "vitest";
import { createDefaultProject } from "@vnve/core";
import { editorContext } from "./editor-context";

it("resolves selection only in its scene and keeps the page summary bounded", () => {
  const project = createDefaultProject();
  const scene = project.acts[0].scenes[0];
  scene.script.nodes = [{ id: "line", type: "text", text: "Selected words" }];
  const revision = { projectRevision: "p", assetsRevision: "a", project };
  const state = {
    sceneId: scene.id,
    nodeId: "line",
    time: 1.2,
    scope: "scene" as const,
    playing: false,
    unsaved: true,
    pendingTextEdits: true,
    revision,
  };
  const context = editorContext(project, state);
  expect(context.selection).toEqual({
    kind: "dialogue",
    id: "line",
    text: "Selected words",
  });
  expect(context.revision).toEqual({
    projectRevision: "p",
    assetsRevision: "a",
  });
  expect(context.unsaved).toBe(true);
  expect(context.pendingTextEdits).toBe(true);
  expect(
    editorContext(project, { ...state, sceneId: "missing" }).selection,
  ).toEqual({ kind: "none" });
  expect(
    editorContext(project, { ...state, nodeId: "removed" }).selection,
  ).toEqual({ kind: "none" });
});
