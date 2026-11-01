import { useEffect, useState } from "react";
/** Cancels obsolete generations; a late worker result cannot replace current edits. */
export function useCompilation<T>(
  compile:
    | ((
        scope: "scene" | "project",
        sceneId?: string,
        signal?: AbortSignal,
      ) => Promise<T>)
    | null,
  scope: "scene" | "project",
  sceneId?: string,
) {
  const targetSceneId = scope === "scene" ? sceneId : undefined;
  const [state, setState] = useState<{
    compile: typeof compile;
    scope: typeof scope;
    sceneId?: string;
    value: T;
  } | null>(null);
  useEffect(() => {
    if (!compile) return;
    const controller = new AbortController();
    compile(scope, targetSceneId, controller.signal)
      .then((value) => {
        if (!controller.signal.aborted)
          setState({ compile, scope, sceneId: targetSceneId, value });
      })
      .catch(() => {});
    return () => controller.abort();
  }, [compile, scope, targetSceneId]);
  const matching =
    state?.scope === scope &&
    (scope === "project" || state.sceneId === targetSceneId);
  return {
    value: compile && matching ? state!.value : null,
    pending: !!compile && (!matching || state?.compile !== compile),
  };
}
