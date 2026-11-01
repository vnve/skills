import {
  applyProjectPatchPlan,
  type Project,
  type ProjectPatchPlan,
  type ApplyProjectPatchResult,
} from "@vnve/core";
import { TimelineService } from "./timeline-service";
/** Validate resolved timing after the entire structural patch, before committing any result. */
export function applyCompiledProjectPatchPlan(
  project: Project,
  plan: ProjectPatchPlan,
): ApplyProjectPatchResult {
  const result = applyProjectPatchPlan(project, plan);
  if (!result.ok) return result;
  const compiled = new TimelineService().compileProject(result.project);
  const error = compiled.diagnostics.find(
    (d) => d.level === "error" && d.code?.startsWith("ANIMATION_"),
  );
  if (error)
    return {
      ok: false,
      project,
      errors: [
        {
          operationIndex: plan.operations.length - 1,
          code: "ANIMATION_INVALID",
          message: error.message,
        },
      ],
    };
  return result;
}
