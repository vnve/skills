import {
  createProjectReport,
  serializeProjectReport,
  type PreviewScope,
} from "@vnve/renderer/playback";
import type { Project } from "@vnve/core";
import {
  probeMedia,
  validateDeclaredMetadata,
  type MediaMetadata,
} from "./media-probe";
import path from "node:path";
import { stat, mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import type { openLocalWorkspace } from "../workspace/workspace";
export async function checkProjectMedia(
  project: Project,
  options: {
    directory: string;
    webRoot: string;
    webFiles?: Record<string, string>;
    files: Awaited<ReturnType<typeof openLocalWorkspace>>["files"];
    scope?: PreviewScope;
    includeEvents?: boolean;
  },
) {
  const report = createProjectReport(project, { scope: options.scope }),
    cache = new Map<string, MediaMetadata>();
  const metadata: Array<{ path: string; metadata: MediaMetadata }> = [];
  for (const resource of report.resources) {
    let probeDirectory: string | undefined;
    try {
      let absolute: string;
      if (resource.path.startsWith("assets/")) {
        const file = await options.files.media(resource.path);
        if (!file)
          throw Object.assign(new Error("Referenced media file is missing"), {
            code: "MEDIA_MISSING",
          });
        absolute = path.join(options.directory, resource.path);
      } else if (
        /^\/(?:placeholders|dialogue-themes)\/[a-zA-Z0-9_.-]+$/.test(
          resource.path,
        )
      ) {
        const embedded = options.webFiles?.[resource.path.slice(1)];
        if (embedded) {
          // Bun supports readFile for embedded files; file-descriptor probes require disk files.
          probeDirectory = await mkdtemp(path.join(tmpdir(), "vnve-probe-"));
          absolute = path.join(probeDirectory, path.basename(resource.path));
          await writeFile(absolute, await readFile(embedded));
        } else absolute = path.join(options.webRoot, resource.path.slice(1));
        if (!(await stat(absolute)).isFile())
          throw new Error("Bundled image is missing");
      } else
        throw Object.assign(
          new Error("Import a local workspace file before using it"),
          { code: "MEDIA_NOT_LOCAL" },
        );
      const kind =
        resource.kind === "image"
          ? "image"
          : resource.kind === "font"
            ? "font"
            : "audio";
      const key = `${kind}:${absolute}`;
      let actual = cache.get(key);
      if (!actual) {
        actual = await probeMedia(absolute, kind);
        cache.set(key, actual);
        metadata.push({ path: resource.path, metadata: actual });
      }
      if (actual.kind === "image") {
        const variant = Object.values(project.assets.visual)
          .flatMap((groups: Project["assets"]["visual"]["character"]) =>
            groups.flatMap((g) => g.variants),
          )
          .find((v) => v.id === resource.id);
        if (variant) validateDeclaredMetadata(variant, actual);
      } else if (actual.kind === "audio") {
        const declared =
          resource.kind === "voice"
            ? project.acts
                .flatMap((a) => a.scenes.flatMap((s) => s.script.nodes))
                .filter((n) => n.audioUrl === resource.path)
                .map((n) => n.audioDuration)
            : [...project.assets.audio.bgm, ...project.assets.audio.sfx]
                .filter((a) => a.url === resource.path)
                .map((a) => a.duration);
        for (const duration of declared)
          validateDeclaredMetadata({ duration }, actual);
      }
    } catch (error) {
      const e = error as Error & { code?: string };
      report.issues.push({
        level: "error",
        code:
          e.code === "MEDIA_MISSING" || e.code === "ENOENT"
            ? "MEDIA_MISSING"
            : e.code === "MEDIA_NOT_LOCAL"
              ? "MEDIA_NOT_LOCAL"
              : "MEDIA_INVALID",
        message: e.message,
        path: resource.path,
        assetId: resource.id,
        nodeId: report.lines.find((l) => l.voice?.asset === resource.path)
          ?.nodeId,
      });
    } finally {
      if (probeDirectory)
        await rm(probeDirectory, { recursive: true, force: true });
    }
  }
  return {
    ...serializeProjectReport(report, options.includeEvents),
    media: metadata,
  };
}
