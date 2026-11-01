import { TimelineService } from "@vnve/compiler";
import {
  createProjectReport,
  serializeProjectReport,
  type PreviewScope,
} from "@vnve/renderer/playback";
import { checkProjectMedia } from "../media/project-check";
import { buildAnimationSource } from "./animation-build";
import { runAnimationWorker } from "./animation-worker";
import path from "node:path";
import {
  dialogueThemeSchema,
  animationClipSchema,
  buildInputJsonSchema,
  scriptGenerationPayloadSchema,
  projectPatchPlanSchema,
  getTextNodeContent,
  createId,
} from "@vnve/core";
import { fileURLToPath } from "node:url";
import { access, readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { importMedia, importMediaBatch } from "../media/media-import";
import { openLocalWorkspace } from "../workspace/workspace";
import { startWorkspaceServer } from "../server/server.mjs";

const usage = `vnve standalone CLI
Usage: vnve serve <workspace> [--port <port>] [--project <id>]
       vnve schema <script|patch|animation|theme>
       vnve create <workspace> <title> [--script <script.json>]
       vnve inspect <workspace> [project-id] [--brief]
       vnve compile <workspace> <project-id> [--scene <id>|--act <id>]
       vnve check <workspace> <project-id> [--scene <id>|--act <id>] [--issues=summary|all]
       vnve import <workspace> <project-id> <media.json>
       vnve patch <workspace> <project-id> <plan.json>
       vnve apply <workspace> <preview.json>
       vnve preview frames <launch-url> <project-id> <times.json> <output-dir>\n       vnve animation build <workspace> <project-id> <source.js> <artifact.json>\n       vnve doctor\nSource development: pnpm dev -- <workspace> --project <id>.
The workspace directory must already exist. Serve prints a launch URL containing a temporary session token.
The editor auto-saves. External CLI changes reload automatically; unsaved page edits are checkpointed first.
Usage guide: skills/vnve/references/cli-guide.md (included with the Skill).
Open that URL in desktop Chrome/Edge. The token is removed from the address bar after session setup.
`;
export interface CliRuntime {
  webRoot?: string;
  webFiles?: Record<string, string>;
  build?: {
    version: string;
    apiVersion: number;
    sourceDigest: string;
    target: string;
    files: Record<string, string>;
  };
}

export function writeCliError(error: unknown) {
  const e = error as Error & {
    code?: string;
    path?: string;
    expected?: unknown;
    issues?: Array<{
      path?: Array<string | number>;
      expected?: unknown;
      received?: unknown;
    }>;
    retained?: string[];
  };
  process.stderr.write(
    JSON.stringify({
      ok: false,
      code:
        e.code ??
        (e.issues
          ? "INVALID_DOCUMENT"
          : e instanceof SyntaxError
            ? "INVALID_JSON"
            : "CLI_ERROR"),
      message: e.message,
      command: process.argv[2] ?? null,
      projectId:
        ["inspect", "import", "check", "compile", "patch"].includes(
          process.argv[2],
        ) && !process.argv[4]?.startsWith("--")
          ? (process.argv[4] ?? null)
          : null,
      path: e.path ?? e.issues?.[0]?.path?.join(".") ?? null,
      expected: e.expected ?? e.issues?.[0]?.expected ?? null,
      got: e.issues?.[0]?.received ?? null,
      issues: e.issues,
      retained: e.retained,
    }) + "\n",
  );
  process.exitCode = 1;
}

export async function runCli(runtime: CliRuntime = {}) {
  const [command, directory, ...args] = process.argv.slice(2);
  if (command === "preview" && directory === "frames") {
    if (args.length !== 4)
      throw new Error(
        "Usage: vnve preview frames <launch-url> <project-id> <times.json> <output-dir>",
      );
    const url = new URL(args[0]);
    if (url.hostname !== "127.0.0.1" || url.protocol !== "http:")
      throw new Error("Preview requires a loopback workspace launch URL");
    const token = new URLSearchParams(url.hash.slice(1)).get("session");
    if (!token)
      throw new Error(
        "Use the original launch URL containing the session token",
      );
    const times = JSON.parse(await readFile(args[2], "utf8"));
    const response = await fetch(`${url.origin}/__vnve/preview`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ projectId: args[1], times }),
      signal: AbortSignal.timeout(25000),
    });
    const result = (await response.json()) as {
      ok: boolean;
      code?: string;
      message?: string;
      frames?: Array<{ time: number; png: string }>;
    };
    if (!response.ok || !result.ok)
      throw Object.assign(
        new Error(result.message ?? "Browser preview was not verified"),
        { code: result.code ?? "PREVIEW_UNVERIFIED" },
      );
    await mkdir(args[3], { recursive: true });
    const frames = [];
    for (const [index, frame] of (result.frames ?? []).entries()) {
      if (!frame.png.startsWith("data:image/png;base64,"))
        throw new Error("Invalid browser frame");
      const output = path.resolve(
        args[3],
        `frame-${String(index).padStart(3, "0")}.png`,
      );
      await writeFile(output, Buffer.from(frame.png.slice(22), "base64"), {
        flag: "wx",
      });
      frames.push({ time: frame.time, path: output });
    }
    process.stdout.write(JSON.stringify({ ...result, frames }) + "\n");
    return;
  }
  if (command === "--animation-worker") {
    await runAnimationWorker();
    return;
  }
  if (command === "animation" && directory === "build") {
    if (args.length !== 4)
      throw new Error(
        "Usage: vnve animation build WORKSPACE PROJECT_ID source.js artifact.json",
      );
    const workspace = await openLocalWorkspace(path.resolve(args[0]));
    const loaded = await workspace.loadProject(args[1]);
    const scenes = loaded.project.acts.flatMap((a) => a.scenes);
    const base = new TimelineService().compileScenes(
      scenes,
      loaded.project.meta,
    );
    const source = await readFile(args[2], "utf8");
    const clip = await buildAnimationSource(
      source,
      {
        width: loaded.project.meta.width,
        height: loaded.project.meta.height,
        cues: base.cues,
      },
      runtime.build
        ? { executable: process.execPath, args: ["--animation-worker"] }
        : undefined,
    );
    const scene = scenes.find((s) => s.id === clip.sceneId);
    if (!scene) throw new Error("Animation scene does not exist");
    for (const target of clip.targets)
      if (
        target.kind === "actor" &&
        !scene.actors.some((a) => a.id === target.ref)
      )
        throw new Error("Animation actor does not exist");
    const compiled = new TimelineService().compileScenes(
      scenes.map((s) =>
        s.id === scene.id
          ? {
              ...s,
              script: s.script.nodes.some((node) =>
                getTextNodeContent(node).some(
                  (segment) =>
                    segment.type === "tag" &&
                    segment.name === "animation" &&
                    segment.params.clipId === clip.id,
                ),
              )
                ? s.script
                : {
                    nodes: [
                      {
                        id: createId(),
                        type: "text" as const,
                        text: "",
                        content: [
                          {
                            type: "tag" as const,
                            name: "animation" as const,
                            params: {
                              clipId: clip.id,
                              await: false,
                              enabled: true,
                            },
                          },
                        ],
                      },
                      ...s.script.nodes,
                    ],
                  },
              animationClips: [
                ...(s.animationClips ?? []).filter((c) => c.id !== clip.id),
                clip,
              ],
            }
          : s,
      ),
      loaded.project.meta,
    );
    const errors = compiled.diagnostics.filter((d) => d.level === "error");
    if (errors.length) throw new Error(errors.map((e) => e.message).join("; "));
    const current = await workspace.loadProject(args[1]);
    if (
      current.projectRevision !== loaded.projectRevision ||
      current.assetsRevision !== loaded.assetsRevision
    )
      throw new Error("Workspace changed during animation build");
    await writeFile(
      args[3],
      JSON.stringify(
        {
          projectId: args[1],
          expected: {
            projectRevision: loaded.projectRevision,
            assetsRevision: loaded.assetsRevision,
          },
          clip,
        },
        null,
        2,
      ) + "\n",
      { flag: "wx" },
    );
    process.stdout.write(
      JSON.stringify({ ok: true, output: path.resolve(args[3]), id: clip.id }) +
        "\n",
    );
    return;
  }
  if (!command || command === "--help") {
    process.stdout.write(usage);
    return;
  }
  if (command === "doctor") {
    if (!runtime.build || !runtime.webFiles)
      throw new Error(
        "Use a compiled vnve executable; run pnpm build for local development",
      );
    for (const [name, hash] of Object.entries(runtime.build.files)) {
      if (
        createHash("sha256")
          .update(await readFile(runtime.webFiles[name]))
          .digest("hex") !== hash
      )
        throw new Error(`Embedded resource integrity check failed: ${name}`);
    }
    process.stdout.write(
      `${JSON.stringify({ ok: true, ...runtime.build, files: undefined, platform: process.platform, arch: process.arch, runtime: "bun", embeddedFiles: Object.keys(runtime.webFiles).length })}\n`,
    );
    return;
  }
  if (command === "schema") {
    const schema =
      directory === "script"
        ? scriptGenerationPayloadSchema
        : directory === "patch"
          ? projectPatchPlanSchema
          : directory === "animation"
            ? animationClipSchema
            : directory === "theme"
              ? dialogueThemeSchema
              : null;
    if (!schema)
      throw new Error("Expected schema script, patch, animation or theme");
    process.stdout.write(
      `${JSON.stringify(buildInputJsonSchema(schema), null, 2)}\n`,
    );
    return;
  }
  if (
    !directory ||
    ![
      "serve",
      "inspect",
      "create",
      "patch",
      "apply",
      "import",
      "compile",
      "check",
    ].includes(command)
  )
    throw new Error(usage);
  const root = path.resolve(directory);
  const workspace = await openLocalWorkspace(root);
  if (command === "inspect") {
    const projectId = args.find((arg) => !arg.startsWith("--"));
    if (args.some((arg) => arg.startsWith("--") && arg !== "--brief"))
      throw new Error("Expected inspect [project-id] [--brief]");
    const loaded = projectId
      ? await workspace.loadProject(projectId)
      : undefined;
    const result = !loaded
      ? await workspace.execute({ op: "list" })
      : !args.includes("--brief")
        ? loaded
        : {
            projectId,
            title: loaded.project.meta.title,
            projectRevision: loaded.projectRevision,
            assetsRevision: loaded.assetsRevision,
            subjects: loaded.project.visualSubjects,
            scenes: loaded.project.acts.flatMap((act) =>
              act.scenes.map((scene) => ({
                id: scene.id,
                name: scene.name,
                nodes: scene.script.nodes.length,
              })),
            ),
            visual: Object.fromEntries(
              Object.entries(loaded.assets.visual).map(([kind, groups]) => [
                kind,
                (
                  groups as import("@vnve/core").Project["assets"]["visual"]["character"]
                ).map((group) => ({
                  id: group.id,
                  name: group.name,
                  defaultVariantId: group.defaultVariantId,
                  variants: group.variants.map(({ id, name, key }) => ({
                    id,
                    name,
                    key,
                  })),
                })),
              ]),
            ),
          };
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }
  if (command === "create") {
    const scriptIndex = args.indexOf("--script");
    const script =
      scriptIndex >= 0
        ? JSON.parse(await readFile(args[scriptIndex + 1], "utf8"))
        : undefined;
    if (script !== undefined) scriptGenerationPayloadSchema.parse(script);
    const title = (scriptIndex >= 0 ? args.slice(0, scriptIndex) : args).join(
      " ",
    );
    process.stdout.write(
      `${JSON.stringify(await workspace.execute({ op: "create", title, script }), null, 2)}\n`,
    );
    return;
  }
  if (command === "compile" || command === "check") {
    if (!args[0]) throw new Error("Supply a project ID");
    const issueOption = args.find((arg) => arg.startsWith("--issues="));
    if (
      issueOption &&
      !["--issues=summary", "--issues=all"].includes(issueOption)
    )
      throw new Error("Expected --issues=summary|all");
    if (issueOption) args.splice(args.indexOf(issueOption), 1);
    let scope: PreviewScope = { type: "project" };
    if (args.length > 1) {
      if (
        args.length !== 3 ||
        !["--scene", "--act"].includes(args[1]) ||
        !args[2]
      )
        throw new Error("Expected --scene ID or --act ID");
      scope =
        args[1] === "--scene"
          ? { type: "scene", sceneId: args[2] }
          : { type: "act", actId: args[2] };
    }
    const loaded = await workspace.loadProject(args[0]);
    const project = { ...loaded.project, assets: loaded.assets };
    const report =
      command === "check"
        ? await checkProjectMedia(project, {
            directory: root,
            webRoot:
              runtime.webRoot ??
              fileURLToPath(new URL("./web/", import.meta.url)),
            webFiles: runtime.webFiles,
            files: workspace.files,
            scope,
            includeEvents: false,
          })
        : serializeProjectReport(createProjectReport(project, { scope }), true);
    const issueSummary = Object.values(
      report.issues.reduce(
        (counts, issue) => {
          const key = `${issue.level}:${issue.code}`;
          counts[key] ??= { code: issue.code, level: issue.level, count: 0 };
          counts[key].count++;
          return counts;
        },
        {} as Record<string, { code: string; level: string; count: number }>,
      ),
    );
    process.stdout.write(
      `${JSON.stringify({ ...report, issues: issueOption === "--issues=summary" ? undefined : report.issues, issueSummary, revision: { projectRevision: loaded.projectRevision, assetsRevision: loaded.assetsRevision } }, null, 2)}\n`,
    );
    if (!report.ok) process.exitCode = 1;
    return;
  }
  if (command === "import") {
    if (!args[0] || !args[1])
      throw new Error("Expected import <workspace> <project-id> <media.json>");
    const input = JSON.parse(await readFile(args[1], "utf8"));
    const base = path.dirname(path.resolve(args[1]));
    const resolveFile = (item: import("../media/media-import").MediaImport) =>
      item && typeof item.file === "string"
        ? { ...item, file: path.resolve(base, item.file) }
        : item;
    const items = Array.isArray(input) ? input : input?.items;
    if (items !== undefined && !Array.isArray(items))
      throw Object.assign(new Error("items must be an array"), {
        code: "INVALID_IMPORT",
        path: "items",
        expected: "array",
      });
    process.stdout.write(
      `${JSON.stringify(await (items ? importMediaBatch(workspace, args[0], items.map(resolveFile)) : importMedia(workspace, args[0], resolveFile(input))), null, 2)}\n`,
    );
    return;
  }
  if (command === "patch") {
    const plan = projectPatchPlanSchema.parse(
      JSON.parse(await readFile(args[1], "utf8")),
    );
    process.stdout.write(
      `${JSON.stringify(await workspace.execute({ op: "patch", projectId: args[0], plan }), null, 2)}\n`,
    );
    return;
  }
  if (command === "apply") {
    const preview = JSON.parse(await readFile(args[0], "utf8"));
    if (!preview.projectId || !preview.expected || !preview.plan)
      throw new Error("Use the original patch preview file");
    process.stdout.write(
      `${JSON.stringify(await workspace.execute({ op: "patch", projectId: preview.projectId, plan: preview.plan, expected: preview.expected, apply: true }), null, 2)}\n`,
    );
    return;
  }
  let port = 0;
  let project = "";
  let devOrigin: string | undefined;
  for (let i = 0; i < args.length; i += 2) {
    if (args[i] === "--dev-origin" && args[i + 1]) devOrigin = args[i + 1];
    else if (args[i] === "--port") {
      port = Number(args[i + 1]);
      if (!Number.isInteger(port) || port < 0 || port > 65535)
        throw new Error("Invalid port");
    } else if (args[i] === "--project" && args[i + 1]) project = args[i + 1];
    else throw new Error(usage);
  }
  const webRoot =
    runtime.webRoot ?? fileURLToPath(new URL("./web/", import.meta.url));
  try {
    if (!devOrigin)
      await access(
        runtime.webFiles?.["index.html"] ?? path.join(webRoot, "index.html"),
      );
  } catch {
    throw new Error(
      "Editor resources are missing. Reinstall the vnve executable or rebuild it.",
    );
  }
  const server = await startWorkspaceServer({
    directory: root,
    port,
    workspace,
    webRoot: devOrigin || runtime.webFiles ? undefined : webRoot,
    webFiles: devOrigin ? undefined : runtime.webFiles,
    devOrigin,
  });
  const url = `${server.origin}/${project ? `?project=${encodeURIComponent(project)}` : ""}#session=${server.token}`;
  process.stdout.write(`${url}\n`);
  const stop = async () => {
    await server.close();
    process.exit(0);
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
}
