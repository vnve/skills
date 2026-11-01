// Read-only project context for editor components. Session owns all writes.
import { createContext, useContext } from "react";
import type { Project, Scene } from "@vnve/core";
type EditorView = { project: Project; currentScene: Scene };
const Context = createContext<EditorView | null>(null);
export const EditorReadProvider = Context.Provider;
export function useEditorStore<T>(selector: (state: EditorView) => T): T {
  const state = useContext(Context);
  if (!state) throw new Error("Missing editor read context");
  return selector(state);
}
export const getCurrentScene = (state: EditorView) => state.currentScene;
