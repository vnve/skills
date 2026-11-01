import { probeMedia, validateDeclaredMetadata } from "./media-probe";
import { importDialogueFrame } from "./dialogue-frame";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { getTtsText, type Project } from "@vnve/core";
import type { openLocalWorkspace } from "../workspace/workspace";

export interface MediaImport {
  file: string;
  theme?: unknown;
  kind:
    | "character"
    | "background"
    | "prop"
    | "cg"
    | "bgm"
    | "sfx"
    | "voice"
    | "dialogue-frame"
    | "font";
  register?: boolean;
  expectedText?: string;
  expectedActorId?: string | null;
  expected?: { projectRevision: string; assetsRevision: string };
  /** Existing visual group; importing replaces only its selected image, preserving story identity. */
  groupId?: string;
  variantId?: string;
  groupName?: string;
  variantKey?: string;
  sceneId?: string;
  nodeId?: string;
  name?: string;
  width?: number;
  height?: number;
  duration?: number;
  sourceUrl?: string;
  license?: string;
}
export async function importMedia(
  workspace: Awaited<ReturnType<typeof openLocalWorkspace>>,
  projectId: string,
  input: MediaImport,
) {
  if (
    !input ||
    typeof input !== "object" ||
    typeof input.file !== "string" ||
    !input.file.trim()
  )
    throw Object.assign(new Error("Media file is required"), {
      code: "INVALID_IMPORT",
      path: "file",
      expected: "nonempty local file path",
    });
  if (input.groupName) {
    const loaded = await workspace.loadProject(projectId);
    const groups =
      loaded.assets.visual[input.kind as keyof Project["assets"]["visual"]];
    const matches = groups?.filter((g) => g.name === input.groupName) ?? [];
    if (matches.length !== 1)
      throw Object.assign(
        new Error("groupName must match exactly one existing group"),
        {
          code: "INVALID_IMPORT",
          path: "groupName",
          expected: "unique existing group name",
        },
      );
    if (input.groupId && input.groupId !== matches[0].id)
      throw new Error("groupId and groupName disagree");
    input = { ...input, groupId: matches[0].id };
  }
  if (input.variantKey) {
    const loaded = await workspace.loadProject(projectId);
    const group = (
      Object.values(
        loaded.assets.visual,
      ).flat() as Project["assets"]["visual"]["character"]
    ).find((g) => g.id === input.groupId);
    const matches =
      group?.variants.filter((v) => (v.key ?? v.name) === input.variantKey) ??
      [];
    if (matches.length !== 1)
      throw Object.assign(
        new Error("variantKey must match exactly one existing variant"),
        {
          code: "INVALID_IMPORT",
          path: "variantKey",
          expected: "unique existing variant key",
        },
      );
    if (input.variantId && input.variantId !== matches[0].id)
      throw new Error("variantId and variantKey disagree");
    input = { ...input, variantId: matches[0].id };
  }
  if (input.expected) {
    const loaded = await workspace.loadProject(projectId);
    if (
      loaded.projectRevision !== input.expected.projectRevision ||
      loaded.assetsRevision !== input.expected.assetsRevision
    )
      throw Object.assign(new Error("Import target changed; inspect again"), {
        code: "CONFLICT",
        path: "expected",
      });
  }
  if (input.kind === "dialogue-frame")
    return importDialogueFrame(workspace, projectId, input);
  const result = await workspace.loadProject(projectId);
  if (
    input.expected &&
    (input.expected.projectRevision !== result.projectRevision ||
      input.expected.assetsRevision !== result.assetsRevision)
  )
    throw new Error("Import target changed; inspect again");
  const project = result.project;
  const assets = result.assets;
  if (
    typeof input.file !== "string" ||
    ![
      "character",
      "background",
      "prop",
      "cg",
      "bgm",
      "sfx",
      "voice",
      "font",
    ].includes(input.kind)
  )
    throw Object.assign(new Error("Invalid media kind"), {
      code: "INVALID_IMPORT",
      path: "kind",
      expected:
        "character|background|prop|cg|bgm|sfx|voice|dialogue-frame|font",
    });
  const visual = ["character", "background", "prop", "cg"].includes(input.kind);
  const ext = path.extname(input.file).toLowerCase();
  if (
    visual
      ? ![".png", ".jpg", ".jpeg", ".webp", ".avif", ".gif"].includes(ext)
      : input.kind === "font"
        ? ![".ttf", ".otf", ".woff", ".woff2"].includes(ext)
        : ![".wav", ".mp3", ".ogg", ".m4a", ".aac", ".flac", ".webm"].includes(
            ext,
          )
  )
    throw new Error("Unsupported media format");
  if (input.sourceUrl) {
    const url = new URL(input.sourceUrl);
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      [...url.searchParams.keys()].some((key) =>
        /token|secret|signature|credential|password|authorization|(^|[-_])key($|[-_])/i.test(
          key,
        ),
      )
    )
      throw new Error("Use a public source page URL without credentials");
  }
  const metadata = await probeMedia(
    input.file,
    visual ? "image" : input.kind === "font" ? "font" : "audio",
  );
  validateDeclaredMetadata(input, metadata);
  if (metadata.kind === "image") {
    input = { ...input, width: metadata.width, height: metadata.height };
  } else if (metadata.kind === "audio") {
    input = { ...input, duration: metadata.duration };
  }
  if (input.kind === "voice") {
    const node = project.acts
      .flatMap((a) => a.scenes)
      .find((s) => s.id === input.sceneId)
      ?.script.nodes.find((n) => n.id === input.nodeId);
    if (!node) throw new Error("Select an existing dialogue node");
    if (
      typeof input.expectedText !== "string" ||
      input.expectedActorId === undefined ||
      input.expectedText !== getTtsText(node) ||
      (input.expectedActorId ?? undefined) !== node.actorId
    )
      throw new Error(
        "Voice requires the unchanged expectedText and expectedActorId snapshot",
      );
  }
  const id = randomUUID();
  const relative = `assets/${visual ? "visual" : input.kind === "font" ? "fonts" : "audio"}/${id}${ext}`;
  if (visual) {
    const groups =
      assets.visual[input.kind as keyof Project["assets"]["visual"]];
    let group = groups.find((group) => group.id === input.groupId);
    let variant = group?.variants.find(
      (v) => v.id === (input.variantId ?? group!.defaultVariantId),
    );
    if (input.register) {
      const groupId = input.groupId ?? randomUUID(),
        variantId = input.variantId ?? randomUUID();
      const all = Object.values(
        assets.visual,
      ).flat() as Project["assets"]["visual"]["character"];
      if (
        all.some((g) => g.variants.some((v) => v.id === variantId)) ||
        (!group && all.some((g) => g.id === groupId))
      )
        throw new Error("Media registration ID already exists");
      variant = {
        id: variantId,
        name: input.name ?? path.basename(input.file, ext),
        url: relative,
      };
      if (!group) {
        group = {
          id: groupId,
          name: input.name ?? path.basename(input.file, ext),
          variants: [],
          defaultVariantId: variantId,
          source: "workspace",
        };
        groups.push(group);
      }
      group.variants.push(variant);
      input = { ...input, groupId: group.id, variantId };
    }
    if (!variant)
      throw new Error(
        "Select an existing group/variant or explicitly register new media",
      );
    input = { ...input, groupId: group!.id, variantId: variant.id };
    variant.url = relative;
    variant.width = input.width!;
    variant.height = input.height!;
    variant.mediaType =
      metadata.kind === "image" ? metadata.mediaType : "static";
    delete variant.thumbnailUrl;
    delete variant.duration;
    group!.source = "workspace";
  } else if (input.kind === "voice") {
    const scene = project.acts
      .flatMap((act) => act.scenes)
      .find((scene) => scene.id === input.sceneId);
    const node = scene?.script.nodes.find((node) => node.id === input.nodeId);
    if (!node)
      throw new Error(
        "Select an existing scene and dialogue node from inspect output",
      );
    node.audioUrl = relative;
    node.audioDuration = input.duration;
    delete node.ttsSnapshot;
    node.audioImportSnapshot = {
      text: getTtsText(node),
      ...(node.actorId ? { actorId: node.actorId } : {}),
    };
  } else if (input.kind === "font") {
    if (!input.name?.trim()) throw new Error("Supply the font family name");
    if (assets.fonts.some((f) => f.name === input.name))
      throw new Error("Font family already registered");
    assets.fonts.push({ id, name: input.name.trim(), url: relative });
  } else {
    assets.audio[input.kind as "bgm" | "sfx"].push({
      id,
      name: input.name ?? path.basename(input.file, ext),
      url: relative,
      duration: input.duration!,
    });
  }
  const info = await stat(input.file);
  if (!info.isFile()) throw new Error("Media source must be a file");
  const owned: Array<{ path: string; revision: string }> = [];
  const sourcePath = `assets/sources/${id}.json`;
  let saved;
  try {
    const media = await workspace.files.writeStream(
      relative,
      createReadStream(input.file),
      null,
      512 * 1024 * 1024,
    );
    owned.push({ path: relative, revision: media.revision });
    const provenance = await workspace.files.write(
      sourcePath,
      Buffer.from(
        JSON.stringify(
          {
            assetPath: relative,
            sourceUrl: input.sourceUrl ?? null,
            license: input.license ?? null,
          },
          null,
          2,
        ),
      ),
      null,
    );
    owned.push({ path: sourcePath, revision: provenance.revision });
    saved = await workspace.execute({
      op: "save",
      projectId,
      project,
      assets,
      expected: {
        projectRevision: result.projectRevision,
        assetsRevision: result.assetsRevision,
      },
    });
  } catch (error) {
    const retained: string[] = [];
    for (const entry of owned.reverse()) {
      try {
        await workspace.files.remove(entry.path, entry.revision);
      } catch {
        retained.push(entry.path);
      }
    }
    if (retained.length)
      throw new Error(
        `${(error as Error).message}; uncommitted media retained: ${retained.join(", ")}`,
      );
    throw error;
  }
  return {
    path: relative,
    provenance: sourcePath,
    assetId: id,
    metadata,
    ...(visual
      ? {
          groupId: input.groupId,
          variantId: input.variantId,
          replaced: !input.register,
        }
      : {}),
    ...(input.kind === "font" ? { fontId: id } : {}),
    ...saved,
  };
}

/** Stage all metadata in memory; commit project and shared assets once. */
export async function importMediaBatch(
  workspace: Awaited<ReturnType<typeof openLocalWorkspace>>,
  projectId: string,
  items: MediaImport[],
) {
  if (!items.length)
    throw Object.assign(new Error("Import batch must not be empty"), {
      code: "INVALID_IMPORT",
      path: "items",
      expected: "nonempty array",
    });
  const loaded = await workspace.loadProject(projectId);
  const staged = structuredClone(loaded);
  const owned: Array<{ path: string; revision: string }> = [];
  const files = {
    ...workspace.files,
    async write(...args: Parameters<typeof workspace.files.write>) {
      const result = await workspace.files.write(...args);
      owned.push({ path: args[0], revision: result.revision });
      return result;
    },
    async writeStream(...args: Parameters<typeof workspace.files.writeStream>) {
      const result = await workspace.files.writeStream(...args);
      owned.push({ path: args[0], revision: result.revision });
      return result;
    },
  };
  const proxy = {
    ...workspace,
    files,
    async loadProject() {
      return staged;
    },
    async execute(input: Parameters<typeof workspace.execute>[0]) {
      if (input.op !== "save") throw new Error("Unexpected import operation");
      if (input.project) staged.project = input.project;
      if (input.assets) staged.assets = input.assets;
      return {
        projectRevision: loaded.projectRevision,
        assetsRevision: loaded.assetsRevision,
      };
    },
  };
  try {
    const results = [];
    for (let index = 0; index < items.length; index++) {
      try {
        results.push(await importMedia(proxy, projectId, items[index]));
      } catch (error) {
        const e = error as Error & { path?: string };
        e.path = `items[${index}]${e.path ? "." + (path.isAbsolute(e.path) ? "file" : e.path) : ""}`;
        throw e;
      }
    }
    const saved = await workspace.execute({
      op: "save",
      projectId,
      project: staged.project,
      assets: staged.assets,
      expected: {
        projectRevision: loaded.projectRevision,
        assetsRevision: loaded.assetsRevision,
      },
    });
    return {
      ok: true,
      items: results.map((result) =>
        Object.fromEntries(
          Object.entries(result).filter(
            ([key]) => !["projectRevision", "assetsRevision"].includes(key),
          ),
        ),
      ),
      ...saved,
    };
  } catch (error) {
    const retained = [];
    for (const entry of owned.reverse()) {
      try {
        await workspace.files.remove(entry.path, entry.revision);
      } catch (cleanup) {
        if (
          (cleanup as { code?: string }).code !== "NOT_FOUND" &&
          (cleanup as { code?: string }).code !== "ENOENT"
        )
          retained.push(entry.path);
      }
    }
    if (retained.length) Object.assign(error as object, { retained });
    throw error;
  }
}
