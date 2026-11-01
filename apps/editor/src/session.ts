import { applyCompiledProjectPatchPlan as applyProjectPatchPlan } from "@vnve/compiler";
import {
  stripTimelineFromProject,
  type Project,
  type ProjectPatchPlan,
} from "@vnve/core";
import { workspaceRequest } from "./core/local-workspace";
export type Revision = { projectRevision: string; assetsRevision: string };
export type Loaded = Revision & {
  project: Omit<Project, "assets">;
  assets: Project["assets"];
};
/** One consistent snapshot, one undo entry per edit; failed saves retain local edits. */
export class Session {
  project: Project;
  revision: Revision;
  saved: Project;
  undoStack: Project[] = [];
  redoStack: Project[] = [];
  constructor(
    public id: string,
    loaded: Loaded,
  ) {
    this.project = { ...loaded.project, assets: loaded.assets };
    this.saved = this.project;
    this.revision = loaded;
  }
  get dirty() {
    return this.project !== this.saved;
  }
  edit(plan: ProjectPatchPlan, assets?: Project["assets"]) {
    const result = applyProjectPatchPlan(
      assets ? { ...this.project, assets } : this.project,
      plan,
    );
    if (!result.ok)
      throw new Error(result.errors.map((e) => e.message).join("\n"));
    this.replace(result.project);
  }
  replace(next: Project) {
    this.undoStack.push(this.project);
    this.redoStack = [];
    this.project = next;
  }
  undo() {
    const p = this.undoStack.pop();
    if (p) {
      this.redoStack.push(this.project);
      this.project = p;
    }
  }
  redo() {
    const p = this.redoStack.pop();
    if (p) {
      this.undoStack.push(this.project);
      this.project = p;
    }
  }
  async save() {
    const current = this.project;
    const { assets, ...project } = stripTimelineFromProject(current);
    this.revision = await workspaceRequest<Revision>({
      op: "save",
      projectId: this.id,
      project,
      assets,
      expected: this.revision,
    });
    this.saved = current;
  }
}
