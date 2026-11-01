import {
  TimelineService,
  applyCompiledProjectPatchPlan as applyProjectPatchPlan,
} from "@vnve/compiler";
import path from "node:path";
import { randomUUID } from "node:crypto";
import {
  SCHEMA_VERSION,
  collectProjectReferences,
  animationClipSchema,
  createDefaultAssets,
  createDefaultProject,
  createProjectBuilder,
  scriptGenerationPayloadSchema,
  prepareProjectPatchPlan,
  scriptDocSchema,
  getAllVariants,
  getAllAudio,
  stripTimelineFromProject,
  type Project,
  type ProjectPatchPlan,
} from "@vnve/core";
import type {
  ProjectDoc,
  WorkspaceManifest,
  WorkspaceProjectRecord,
} from "./types";
import { openWorkspaceFiles, WorkspaceFileError } from "./workspace-files.mjs";
import { withWorkspaceLock } from "./workspace-lock.mjs";
import {
  commitWorkspaceDocuments,
  recoverWorkspaceTransaction,
} from "./workspace-transaction.mjs";

type Version = string | null;
type Snapshot = { projectRevision: Version; assetsRevision: Version };
const manifestPath = ".vnve/workspace.json";
const assetsPath = ".vnve/assets.json";
function fail(code: string, message: string): never {
  throw new WorkspaceFileError(code, message);
}
function validateManifest(value: WorkspaceManifest) {
  if (
    value?.schemaVersion !== 1 ||
    typeof value.meta?.id !== "string" ||
    typeof value.meta?.name !== "string" ||
    !Array.isArray(value.projects) ||
    value.projects.some(
      (p) => !p.id || !p.dirName || /[/\\]|^\.{1,2}$/.test(p.dirName),
    )
  ) {
    fail(
      "INVALID_DOCUMENT",
      "Workspace metadata is invalid; original file was preserved",
    );
  }
  return value;
}
function validateAssets(value: {
  schemaVersion: number;
  assets: Project["assets"];
}) {
  const a = value?.assets;
  if (
    value?.schemaVersion !== 1 ||
    !a ||
    !a.visual ||
    !a.audio ||
    !["character", "background", "prop", "cg"].every((key) =>
      Array.isArray(a.visual[key as keyof typeof a.visual]),
    ) ||
    !Array.isArray(a.audio.bgm) ||
    !Array.isArray(a.audio.sfx) ||
    !Array.isArray(a.fonts) ||
    !Array.isArray(a.themes)
  ) {
    fail(
      "INVALID_DOCUMENT",
      "Workspace assets are invalid; original file was preserved",
    );
  }
  return value;
}
function validateProject(value: ProjectDoc) {
  if (
    value?.schemaVersion !== SCHEMA_VERSION ||
    !value?.meta?.id ||
    typeof value.meta.title !== "string" ||
    !Number.isFinite(value.meta.width) ||
    value.meta.width <= 0 ||
    !Number.isFinite(value.meta.height) ||
    value.meta.height <= 0 ||
    !Number.isFinite(value.meta.fps) ||
    value.meta.fps <= 0 ||
    !Array.isArray(value.acts) ||
    !Array.isArray(value.visualSubjects) ||
    value.acts.some(
      (a) =>
        !a.id ||
        !Array.isArray(a.scenes) ||
        a.scenes.some(
          (s) =>
            !s.id ||
            !Array.isArray(s.actors) ||
            !Array.isArray(s.script?.nodes) ||
            !scriptDocSchema.safeParse(s.script).success ||
            s.script.nodes.some(
              (n) => n.type !== "text" || typeof n.text !== "string",
            ),
        ),
    )
  ) {
    fail(
      "INVALID_DOCUMENT",
      "Project document is invalid; original file was preserved",
    );
  }
  for (const scene of value.acts.flatMap((act) => act.scenes)) {
    if (
      scene.animationClips !== undefined &&
      (!Array.isArray(scene.animationClips) ||
        scene.animationClips.some(
          (c) => !animationClipSchema.safeParse(c).success,
        ))
    )
      fail("INVALID_DOCUMENT", "Invalid visual fragments");
  }
  // Shared normalization strips timeline; runtime assets never belong in project.json.
  const { assets: _assets, ...doc } = stripTimelineFromProject(
    value as Project,
  );
  return doc;
}

export async function openLocalWorkspace(directory: string) {
  const files = await openWorkspaceFiles(directory);
  let queue: Promise<unknown> = Promise.resolve();
  function serial<T>(fn: () => Promise<T>): Promise<T> {
    const pending = queue.then(() =>
      withWorkspaceLock(directory, async () => {
        await recoverWorkspaceTransaction(files);
        return fn();
      }),
    );
    queue = pending.catch(() => {});
    return pending;
  }
  async function readJson<T>(
    name: string,
  ): Promise<{ value: T; revision: string } | null> {
    const file = await files.read(name);
    if (!file) return null;
    try {
      return {
        value: JSON.parse(file.bytes.toString()),
        revision: file.revision,
      };
    } catch {
      return fail(
        "INVALID_DOCUMENT",
        "Invalid JSON; original file was preserved",
      );
    }
  }
  async function writeJson(name: string, value: unknown, expected: Version) {
    const revisions = await commitDocuments([{ path: name, value, expected }]);
    return { revision: revisions.get(name)! };
  }
  async function commitDocuments(
    changes: Array<{ path: string; value: unknown; expected: Version }>,
  ) {
    return commitWorkspaceDocuments(
      files,
      changes.map((change) => ({
        path: change.path,
        bytes: Buffer.from(JSON.stringify(change.value, null, 2)),
        expected: change.expected,
      })),
    );
  }
  async function manifest() {
    const file = await readJson<WorkspaceManifest>(manifestPath);
    if (!file) return fail("NOT_FOUND", "Workspace metadata unavailable");
    validateManifest(file.value);
    return file;
  }
  function entry(manifest: WorkspaceManifest, record: WorkspaceProjectRecord) {
    return {
      workspaceHandle: { id: manifest.meta.id, name: manifest.meta.name },
      projectId: record.id,
      title: record.title,
      dirName: record.dirName,
      lastSaved: record.updatedAt,
    };
  }
  async function record(id: string) {
    const m = await manifest();
    const p = m.value.projects.find((p) => p.id === id);
    if (!p) return fail("NOT_FOUND", "Project not found");
    return { m, p, file: `projects/${p.dirName}/project.json` };
  }
  async function assets() {
    const file = await readJson<{
      schemaVersion: number;
      assets: Project["assets"];
    }>(assetsPath);
    if (!file) return fail("NOT_FOUND", "Workspace assets unavailable");
    validateAssets(file.value);
    return file;
  }
  await serial(async () => {
    // Validate both documents before initializing either. Readers use the same lock.
    const oldManifest = await readJson<WorkspaceManifest>(manifestPath);
    const oldAssets = await readJson<{
      schemaVersion: number;
      assets: Project["assets"];
    }>(assetsPath);
    if (oldManifest) validateManifest(oldManifest.value);
    if (oldAssets) validateAssets(oldAssets.value);
    const changes: Array<{ path: string; value: unknown; expected: Version }> =
      [];
    if (!oldManifest) {
      const now = new Date().toISOString();
      changes.push({
        path: manifestPath,
        expected: null,
        value: {
          schemaVersion: 1,
          meta: {
            id: randomUUID(),
            name: path.basename(directory),
            createdAt: now,
            updatedAt: now,
          },
          projects: [],
        },
      });
    }
    if (!oldAssets)
      changes.push({
        path: assetsPath,
        expected: null,
        value: { schemaVersion: 1, assets: createDefaultAssets() },
      });
    await commitDocuments(changes);
  });

  async function list() {
    const m = await manifest();
    return {
      handle: { id: m.value.meta.id, name: m.value.meta.name },
      projects: [...m.value.projects]
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .map((p) => entry(m.value, p)),
    };
  }
  async function load(id: string) {
    const { file } = await record(id);
    const doc = await readJson<ProjectDoc>(file);
    if (!doc) return fail("NOT_FOUND", "Project document unavailable");
    const a = await assets();
    return {
      project: validateProject(doc.value),
      assets: a.value.assets,
      projectRevision: doc.revision,
      assetsRevision: a.revision,
    };
  }
  async function create(title: string, script?: unknown) {
    if (typeof title !== "string" || !title.trim() || title.length > 500)
      fail("INVALID_DOCUMENT", "Project title is required");
    const m = await manifest();
    const a = await assets();
    let project: Project;
    let nextAssets: Project["assets"] | undefined;
    if (script) {
      const parsed = scriptGenerationPayloadSchema.safeParse(script);
      if (!parsed.success)
        fail(
          "INVALID_DOCUMENT",
          "Script does not match the generated script contract",
        );
      project = createProjectBuilder().buildProjectFromScript(
        { ...parsed.data, model: "skill" },
        title,
        {
          characters: a.value.assets.visual.character,
          backgrounds: a.value.assets.visual.background,
        },
      );
      const merge = <T extends { id: string }>(old: T[], added: T[]) => [
        ...old.filter((item) => !added.some((next) => next.id === item.id)),
        ...added,
      ];
      const merged = {
        ...a.value.assets,
        visual: {
          ...a.value.assets.visual,
          character: merge(
            a.value.assets.visual.character,
            project.assets.visual.character,
          ),
          background: merge(
            a.value.assets.visual.background,
            project.assets.visual.background,
          ),
        },
      };
      nextAssets = merged;
    } else project = createDefaultProject({ title: title.trim() });
    const doc = validateProject(project);
    const now = project.meta.updatedAt;
    const p = {
      id: project.meta.id,
      title: project.meta.title,
      dirName: `project-${randomUUID()}`,
      createdAt: now,
      updatedAt: now,
    };
    await commitDocuments([
      ...(nextAssets
        ? [
            {
              path: assetsPath,
              value: { schemaVersion: 1, assets: nextAssets },
              expected: a.revision,
            },
          ]
        : []),
      {
        path: `projects/${p.dirName}/project.json`,
        value: doc,
        expected: null,
      },
      {
        path: manifestPath,
        value: {
          ...m.value,
          meta: { ...m.value.meta, updatedAt: now },
          projects: [...m.value.projects, p],
        },
        expected: m.revision,
      },
    ]);
    return { entry: entry(m.value, p), ...(await load(p.id)) };
  }
  function mediaPaths(
    project: Pick<ProjectDoc, "acts">,
    assets: Project["assets"],
  ) {
    return new Set([
      ...getAllVariants(assets).map((v) => v.url),
      ...getAllAudio(assets.audio).map((a) => a.url),
      ...assets.fonts.map((f) => f.url),
      ...assets.themes.flatMap((t) =>
        t.data.boxImageUrl ? [t.data.boxImageUrl] : [],
      ),
      ...project.acts.flatMap((a) =>
        a.scenes.flatMap((scene) =>
          scene.script.nodes.flatMap((n) => (n.audioUrl ? [n.audioUrl] : [])),
        ),
      ),
    ]);
  }
  async function validateNewMedia(
    previous: ProjectDoc,
    previousAssets: Project["assets"],
    next: ProjectDoc,
    nextAssets: Project["assets"],
  ) {
    const known = mediaPaths(previous, previousAssets);
    for (const url of mediaPaths(next, nextAssets)) {
      if (known.has(url)) continue;
      if (
        /^\/placeholders\/(?:character-(?:male|female)-[1-4]|background-[1-4])\.avif$/.test(
          url,
        )
      )
        continue;
      if (!url.startsWith("assets/") || !(await files.media(url)))
        fail("INVALID_DOCUMENT", `Import media before referencing '${url}'`);
    }
  }
  async function validateSharedReferences(
    nextAssets: Project["assets"],
    replacement?: ProjectDoc,
  ) {
    const previous = (await assets()).value.assets;
    const removed = new Set(
      [...getAllVariants(previous), ...previous.fonts]
        .filter(
          (asset) =>
            ![...getAllVariants(nextAssets), ...nextAssets.fonts].some(
              (next) => next.id === asset.id,
            ),
        )
        .map((asset) => asset.id),
    );
    const audioChanged =
      JSON.stringify(previous.audio) !== JSON.stringify(nextAssets.audio);
    if (!removed.size && !audioChanged) return;
    const listing = await manifest();
    for (const entry of listing.value.projects) {
      const stored =
        replacement?.meta.id === entry.id
          ? replacement
          : (
              await readJson<ProjectDoc>(
                `projects/${entry.dirName}/project.json`,
              )
            )?.value;
      if (!stored) continue;
      const references = collectProjectReferences(
        { ...stored, assets: previous },
        stored.acts.flatMap((a) => a.scenes),
      );
      if (
        [...references.variants, ...references.fonts].some((id) =>
          removed.has(id),
        ) ||
        [...references.audio].some(
          ([reference, kind]) =>
            kind !== "voice" &&
            previous.audio[kind].some((a) =>
              [a.id, a.name, a.url].includes(reference),
            ) &&
            !nextAssets.audio[kind].some((a) =>
              [a.id, a.name, a.url].includes(reference),
            ),
        )
      )
        fail(
          "INVALID_DOCUMENT",
          `Shared asset is still referenced by project '${stored.meta.title}'`,
        );
    }
  }
  async function save(
    id: string,
    input: {
      project?: ProjectDoc;
      assets?: Project["assets"];
      expected: Snapshot;
    },
  ) {
    const { m, p, file } = await record(id);
    const current = await readJson<ProjectDoc>(file);
    const a = await assets();
    if (
      !input.expected ||
      current?.revision !== input.expected.projectRevision ||
      a.revision !== input.expected.assetsRevision
    ) {
      throw Object.assign(
        new WorkspaceFileError(
          "CONFLICT",
          "Project or shared assets changed. Your edits remain open; preserve them before reopening the project.",
        ),
        {
          current: {
            projectRevision: current?.revision ?? null,
            assetsRevision: a.revision,
          },
        },
      );
    }
    const doc = input.project ? validateProject(input.project) : undefined;
    const candidate = {
      ...(doc ?? current.value),
      assets: input.assets ?? a.value.assets,
    };
    const visualError = new TimelineService()
      .compileProject(candidate)
      .diagnostics.find(
        (d) => d.level === "error" && d.code?.startsWith("ANIMATION_"),
      );
    const visualReference = collectProjectReferences(
      candidate,
      candidate.acts.flatMap((a) => a.scenes),
    ).issues.find((i) => !!i.animationId);
    if (visualError || visualReference)
      fail("INVALID_DOCUMENT", (visualError ?? visualReference)!.message);
    if (input.assets)
      await validateSharedReferences(input.assets, doc ?? current.value);
    if (input.assets)
      validateAssets({ schemaVersion: 1, assets: input.assets });
    await validateNewMedia(
      current.value,
      a.value.assets,
      doc ?? current.value,
      input.assets ?? a.value.assets,
    );
    const revisions = await commitDocuments([
      ...(input.assets
        ? [
            {
              path: assetsPath,
              value: { schemaVersion: 1, assets: input.assets },
              expected: a.revision,
            },
          ]
        : []),
      ...(doc ? [{ path: file, value: doc, expected: current.revision }] : []),
      ...(doc &&
      (doc.meta.title !== p.title || doc.meta.updatedAt !== p.updatedAt)
        ? [
            {
              path: manifestPath,
              value: {
                ...m.value,
                projects: m.value.projects.map((item) =>
                  item.id === id
                    ? {
                        ...item,
                        title: doc.meta.title,
                        updatedAt: doc.meta.updatedAt,
                      }
                    : item,
                ),
              },
              expected: m.revision,
            },
          ]
        : []),
    ]);
    return {
      projectRevision: revisions.get(file) ?? current.revision,
      assetsRevision: revisions.get(assetsPath) ?? a.revision,
    };
  }
  return {
    files,
    // HTTP cleanup may remove orphan uploads only. Check and unlink under the
    // same cross-process lock as saves so a newly committed reference wins.
    removeMedia: (relative: string, expectedRevision: string) =>
      serial(async () => {
        const shared = (await assets()).value.assets;
        if (mediaPaths({ acts: [] }, shared).has(relative))
          fail(
            "INVALID_DOCUMENT",
            "Media is still registered in shared assets",
          );
        const listing = await manifest();
        for (const entry of listing.value.projects) {
          const stored = await readJson<ProjectDoc>(
            `projects/${entry.dirName}/project.json`,
          );
          if (!stored)
            fail("NOT_FOUND", "Project unavailable; media was preserved");
          if (mediaPaths(stored.value, shared).has(relative))
            fail(
              "INVALID_DOCUMENT",
              `Media is still registered or referenced by project '${stored.value.meta.title}'`,
            );
          const recovery = await readJson<{
            project: ProjectDoc;
            assets: Project["assets"];
          }>(`.vnve/recovery/${entry.dirName}.json`);
          if (
            recovery &&
            mediaPaths(recovery.value.project, recovery.value.assets).has(
              relative,
            )
          )
            fail(
              "INVALID_DOCUMENT",
              `Media is still referenced by a recovery copy for '${stored.value.meta.title}'`,
            );
        }
        await files.remove(relative, expectedRevision);
      }),
    loadProject: (projectId: string) => serial(() => load(projectId)),
    execute(input: {
      op: string;
      projectId?: string;
      title?: string;
      project?: ProjectDoc;
      assets?: Project["assets"];
      expected?: Snapshot;
      script?: unknown;
      plan?: ProjectPatchPlan;
      apply?: boolean;
    }) {
      return serial(async () => {
        if (input.op === "list") return list();
        if (input.op === "create") return create(input.title!, input.script);
        if (input.op === "load") return load(input.projectId!);
        if (input.op === "checkpoint" || input.op === "recovery") {
          const { p } = await record(input.projectId!);
          const name = `.vnve/recovery/${p.dirName}.json`;
          const previous = await readJson<{
            formatVersion: number;
            projectId: string;
            savedAt: string;
            project: ProjectDoc;
            assets: Project["assets"];
            baseRevision: Snapshot;
          }>(name);
          if (input.op === "recovery") {
            if (!previous) fail("NOT_FOUND", "No recovery copy exists");
            return previous.value;
          }
          const project = validateProject(input.project!);
          if (project.meta.id !== p.id)
            fail("INVALID_DOCUMENT", "Recovery project ID does not match");
          validateAssets({ schemaVersion: 1, assets: input.assets! });
          await files.write(
            name,
            Buffer.from(
              JSON.stringify(
                {
                  formatVersion: 1,
                  projectId: p.id,
                  savedAt: new Date().toISOString(),
                  project,
                  assets: input.assets,
                  baseRevision: input.expected,
                },
                null,
                2,
              ),
            ),
            previous?.revision ?? null,
          );
          return { path: name };
        }
        if (input.op === "save")
          return save(input.projectId!, {
            ...input,
            expected: input.expected!,
          });
        if (input.op === "patch") {
          const loaded = await load(input.projectId!);
          if (
            input.apply &&
            (!input.expected ||
              loaded.projectRevision !== input.expected.projectRevision ||
              loaded.assetsRevision !== input.expected.assetsRevision)
          )
            fail("CONFLICT", "Patch target changed; generate a new preview");
          let patched;
          let prepared: ProjectPatchPlan;
          try {
            prepared = prepareProjectPatchPlan(input.plan!);
            patched = applyProjectPatchPlan(
              { ...loaded.project, assets: loaded.assets },
              prepared,
            );
          } catch {
            return fail("INVALID_DOCUMENT", "Invalid project patch plan");
          }
          if (!patched.ok)
            fail(
              "INVALID_DOCUMENT",
              patched.errors.map((error) => error.message).join("; "),
            );
          await validateNewMedia(
            loaded.project,
            loaded.assets,
            validateProject(patched.project),
            patched.project.assets,
          );
          if (!input.apply)
            return {
              projectId: input.projectId,
              expected: {
                projectRevision: loaded.projectRevision,
                assetsRevision: loaded.assetsRevision,
              },
              plan: prepared!,
              project: validateProject(patched.project),
              assets: patched.project.assets,
            };
          return save(input.projectId!, {
            project: validateProject(patched.project),
            ...(patched.project.assets !== loaded.assets
              ? { assets: patched.project.assets }
              : {}),
            expected: input.expected!,
          });
        }
        if (input.op === "assets") {
          const a = await assets();
          return { assets: a.value.assets, assetsRevision: a.revision };
        }
        if (input.op === "saveAssets") {
          const a = await assets();
          if (a.revision !== input.expected?.assetsRevision)
            fail("CONFLICT", "Shared assets changed; reload before saving");
          validateAssets({ schemaVersion: 1, assets: input.assets! });
          await validateSharedReferences(input.assets!);
          return {
            assetsRevision: (
              await writeJson(
                assetsPath,
                { schemaVersion: 1, assets: input.assets },
                a.revision,
              )
            ).revision,
          };
        }
        return fail("INVALID_OPERATION", "Unsupported workspace operation");
      });
    },
  };
}
