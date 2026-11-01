import type { Project } from "@vnve/core";

export type ProjectDoc = Omit<Project, "assets">;

/** Opaque handle wrapping a workspace directory. */
export interface StorageHandle {
  /** Internal ID for handle lookup. */
  readonly id: string;
  /** Human-readable directory name. */
  readonly name: string;
}

export interface WorkspaceProjectRecord {
  id: string;
  title: string;
  dirName: string;
  createdAt: string;
  updatedAt: string;
}

export interface WorkspaceManifest {
  schemaVersion: number;
  meta: {
    id: string;
    name: string;
    createdAt: string;
    updatedAt: string;
  };
  projects: WorkspaceProjectRecord[];
}

/** Summary shown in workspace project list. */
export interface ProjectEntry {
  workspaceHandle: StorageHandle;
  projectId: string;
  title: string;
  dirName: string;
  lastSaved: string;
}
