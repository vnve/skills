import { getTextNodePlainText, type Project } from "@vnve/core";
import { actorInfo } from "./panels/shared";

/** Read-only page context; never contains credentials or writes the project. */
export function editorContext(
  project: Project,
  state: {
    sceneId?: string;
    actorId?: string;
    nodeId?: string;
    element?: string;
    time: number;
    scope: "scene" | "project";
    playing: boolean;
    unsaved: boolean;
    pendingTextEdits: boolean;
    revision?: { projectRevision: string; assetsRevision: string };
  },
) {
  const scene = project.acts
    .flatMap((act) => act.scenes)
    .find((scene) => scene.id === state.sceneId);
  const actor = scene?.actors.find((actor) => actor.id === state.actorId);
  const node = scene?.script.nodes.find((node) => node.id === state.nodeId);
  const selection = actor
    ? { kind: "actor", id: actor.id, name: actorInfo(project, actor).name }
    : node
      ? { kind: "dialogue", id: node.id, text: getTextNodePlainText(node) }
      : scene && state.element
        ? { kind: "canvas-element", id: state.element }
        : { kind: "none" };
  return {
    version: 1,
    project: { id: project.meta.id, title: project.meta.title },
    scene: scene ? { id: scene.id, name: scene.name } : null,
    selection,
    playback: { scope: state.scope, time: state.time, playing: state.playing },
    unsaved: state.unsaved,
    pendingTextEdits: state.pendingTextEdits,
    revision: state.revision
      ? {
          projectRevision: state.revision.projectRevision,
          assetsRevision: state.revision.assetsRevision,
        }
      : undefined,
  };
}
