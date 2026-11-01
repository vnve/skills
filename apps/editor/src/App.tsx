import { CompilationStatus } from "./CompilationStatus";
import { compileTagPreview } from "./tag-preview";
import { ExportProgress } from "./ExportProgress";
import { stepDialogueCue } from "./dialogue-navigation";
import {
  saveExportCopy,
  saveRecoveryCopy,
  supportsNativeSaveAs,
} from "./core/save-copy";
import { useExternalUpdates } from "./external-updates";
import { addSceneCharacter } from "./scene-characters";
import { removeScene } from "./scene-edits";
import { EditorHeader } from "./components/EditorHeader";
import { Button } from "./components/ui/button";
import { IconButton } from "./EditorControls";
import { Toaster, toast } from "./components/ui/sonner";
import { CompactSelect } from "./CompactSelect";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { CredentialsPanel } from "./panels/CredentialsPanel";
import {
  createId,
  collectProjectReferences,
  getTextNodeContent,
  getAllVariants,
  getThemeBoxImageAssets,
  getAllAudio,
  type ProjectPatchPlan,
  type Project,
} from "@vnve/core";
import { KonvaExportRenderer, findSequenceSceneAtTime } from "@vnve/renderer";
import { createExporter } from "@vnve/media";
import {
  workspaceRequest,
  localMediaUrl,
  localExportPath,
  openLocalExport,
} from "./core/local-workspace";
import {
  getBrowserLayoutProblem,
  openCheckedExportFile,
} from "./core/export-preflight";
import { compilePlaybackInWorker } from "./core/timeline-compiler";
import { useCompilation } from "./core/use-compilation";
import { Session, type Loaded } from "./session";
import {
  EditBuffers,
  EditBufferMap,
  flushEdits,
} from "./script-editor/EditBuffers";
import { actorPlacementEdits, currentLookEdits } from "./canvas-edits";
import { RichEditor } from "./script-editor/RichEditor";
import { Preview } from "./Preview";
import { SceneNavigation } from "./panels/SceneNavigation";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "./components/ui/dialog";
import { ScriptPanel } from "./panels/ScriptPanel";
import { Undo2, Redo2, Save, Download, Settings } from "lucide-react";
const resolve = (url: string) =>
  url.startsWith("assets/") ? localMediaUrl(url) : url;
export function App() {
  const [session, setSession] = useState<Session>(),
    [, redraw] = useState(0),
    [projects, setProjects] = useState<{ projectId: string; title: string }[]>(
      [],
    ),
    [sceneId, setSceneId] = useState(""),
    [exportOpen, setExportOpen] = useState(false),
    [saving, setSaving] = useState(false),
    [progress, setProgress] = useState<number | null>(null),
    [scope, setScope] = useState<"scene" | "project">("scene");
  const [exportScope, setExportScope] = useState<"scene" | "project">(
    "project",
  );
  const [pendingEdits, setPendingEdits] = useState(0);
  const [syncBusy, setSyncBusy] = useState(false);
  const [savedAt, setSavedAt] = useState<number>();
  const lastEditAt = useRef(Date.now());
  const editBuffers = useRef(
    new EditBufferMap((size) => {
      lastEditAt.current = Date.now();
      setPendingEdits(size);
    }),
  );
  const [selectedActorId, setSelectedActorId] = useState<string>();
  const [selectedNodeId, setSelectedNodeId] = useState<string>();
  const [nodeSeek, setNodeSeek] = useState<{
    sceneId: string;
    nodeId: string;
    token: number;
    play?: boolean;
  }>();
  const [tagPreview, setTagPreview] = useState<
    Awaited<ReturnType<typeof compileTagPreview>> & {
      source: Project;
      returnTime: number;
    }
  >();
  const tagPreviewTask = useRef<AbortController>();
  const [tagPreviewPending, setTagPreviewPending] = useState(false);
  const [credentialsOpen, setCredentialsOpen] = useState(false);
  const [exportResult, setExportResult] = useState<string>();
  const [savingCopy, setSavingCopy] = useState(false);
  const [canvasMaximized, setCanvasMaximized] = useState(false);
  const [fontsReady, setFontsReady] = useState(false);
  const [seekRequest, setSeekRequest] = useState<{
    time: number;
    token: number;
    playUntil?: number;
    play?: boolean;
  }>();
  const [activeNodeId, setActiveNodeId] = useState<string>();
  const previewTime = useRef(0);
  function finishTagPreview() {
    tagPreviewTask.current?.abort();
    setTagPreviewPending(false);
    if (tagPreview)
      setSeekRequest({ time: tagPreview.returnTime, token: performance.now() });
    setTagPreview(undefined);
  }
  useEffect(() => () => tagPreviewTask.current?.abort(), []);

  function selectScene(id: string) {
    if (!flushEdits(editBuffers.current)) return;
    const clip =
      scope === "project" && compiled && !("error" in compiled)
        ? compiled.sequence.sceneClips.find((c) => c.sceneId === id)
        : undefined;
    setSeekRequest(
      clip
        ? { time: clip.contentStartTime + 0.05, token: performance.now() }
        : undefined,
    );
    setNodeSeek(undefined);
    setActiveNodeId(undefined);
    setSelectedNodeId(undefined);
    setSelectedActorId(undefined);
    setSceneId(id);
  }
  const exporter = useRef<Pick<ReturnType<typeof createExporter>, "cancel">>();
  const notify = useCallback((text: string) => {
    if (/失败|冲突|错误/.test(text)) toast.error(text, { duration: Infinity });
    else toast.success(text);
  }, []);
  const activeSession = useRef(session);
  activeSession.current = session;
  const [uploading, setUploading] = useState(false);
  async function media(action: () => Promise<void>) {
    setUploading(true);
    try {
      await action();
      update();
      notify("已导入，将自动保存");
    } catch (e) {
      notify(String(e));
    } finally {
      setUploading(false);
    }
  }
  const project = session?.project,
    scenes = project?.acts.flatMap((a) => a.scenes) ?? [],
    scene = scenes.find((s) => s.id === sceneId) ?? scenes[0];
  const update = () => redraw((n) => n + 1);
  async function list() {
    const result = await workspaceRequest<{ projects: typeof projects }>({
      op: "list",
    });
    setProjects(result.projects);
    return result.projects;
  }
  async function open(id: string) {
    if (!flushEdits(editBuffers.current)) return;
    if (session?.dirty && !confirm("放弃未保存修改并打开项目？")) return;
    try {
      const loaded = await workspaceRequest<Loaded>({
        op: "load",
        projectId: id,
      });
      setSeekRequest(undefined);
      setNodeSeek(undefined);
      setActiveNodeId(undefined);
      setSelectedNodeId(undefined);
      setSelectedActorId(undefined);
      setSession(new Session(id, loaded));
      setExportResult(undefined);
      setSceneId(loaded.project.acts[0]?.scenes[0]?.id ?? "");
      toast.dismiss();
      history.replaceState(null, "", `?project=${encodeURIComponent(id)}`);
    } catch (e) {
      notify(String(e));
    }
  }
  useEffect(() => {
    void list()
      .then((p) => {
        const id =
          new URLSearchParams(location.search).get("project") ??
          p[0]?.projectId;
        if (id) void open(id);
      })
      .catch((e) => notify(String(e)));
  }, []);
  useExternalUpdates({
    current: activeSession,
    buffers: editBuffers,
    disabled: saving || progress !== null || uploading,
    lastEditAt,
    onBusy: setSyncBusy,
    onSaved: () => {
      setSavedAt(Date.now());
      update();
    },
    onError: (message) => toast.error(message, { duration: Infinity }),
    onLoaded: (current, loaded, recoveryPath) => {
      setSession(new Session(current.id, loaded));
      setSeekRequest({ time: previewTime.current, token: performance.now() });
      setExportResult(undefined);
      void list().catch(() => {});
      toast.success(
        recoveryPath
          ? `已载入外部更新，之前修改已备份：${recoveryPath}`
          : "已载入外部更新",
        {
          duration: recoveryPath ? Infinity : 4000,
          action: recoveryPath
            ? {
                label: "保存之前修改",
                onClick: () =>
                  void saveRecoveryCopy(current.id).catch((error) =>
                    toast.error(`保存恢复副本失败：${String(error)}`),
                  ),
              }
            : undefined,
        },
      );
    },
  });
  useEffect(() => {
    lastEditAt.current = Date.now();
  }, [project]);
  async function save() {
    if (!session || saving || syncBusy || !flushEdits(editBuffers.current))
      return;
    if (document.activeElement instanceof HTMLInputElement)
      document.activeElement.blur();
    setSaving(true);
    try {
      await session.save();
      update();
      setSavedAt(Date.now());
      notify("已保存");
    } catch (e) {
      if ((e as { code?: string }).code === "CONFLICT")
        toast.info("检测到外部更新，将备份页面修改后自动载入");
      else notify(`保存失败，页面修改已保留：${e}`);
    } finally {
      setSaving(false);
    }
  }
  useEffect(() => {
    const unload = (e: BeforeUnloadEvent) => {
      if (
        session?.dirty ||
        editBuffers.current.size ||
        progress !== null ||
        uploading
      )
        e.preventDefault();
    };
    const keys = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        void save();
      }
      if (
        (e.metaKey || e.ctrlKey) &&
        e.key === "z" &&
        !(
          e.target instanceof HTMLInputElement ||
          e.target instanceof HTMLTextAreaElement ||
          (e.target instanceof HTMLElement && e.target.isContentEditable)
        )
      ) {
        e.preventDefault();
        if (!flushEdits(editBuffers.current)) return;
        e.shiftKey ? session?.redo() : session?.undo();
        update();
      }
    };
    window.addEventListener("beforeunload", unload);
    window.addEventListener("keydown", keys);
    return () => {
      window.removeEventListener("beforeunload", unload);
      window.removeEventListener("keydown", keys);
    };
  }, [session, project, saving, syncBusy, progress, uploading]);
  function patch(
    operations: ProjectPatchPlan["operations"],
    assets?: Project["assets"],
  ) {
    try {
      session!.edit({ summary: "网页微调", operations }, assets);
      setSeekRequest({ time: previewTime.current, token: performance.now() });
      update();
      toast.dismiss();
      return true;
    } catch (e) {
      notify(String(e));
      return false;
    }
  }
  const compileScope = useCallback(
    async (
      targetScope: "scene" | "project",
      targetSceneId?: string,
      signal?: AbortSignal,
    ) => {
      if (!project || (targetScope === "scene" && !targetSceneId)) return null;
      try {
        const map = new Map<string, string>();
        for (const a of [
          ...getAllVariants(project.assets),
          ...getThemeBoxImageAssets(project.assets.themes ?? []),
        ]) {
          map.set(a.id, resolve(a.url));
          map.set(a.url, resolve(a.url));
        }
        const audioFiles: Record<string, string> = {};
        for (const a of getAllAudio(project.assets.audio)) {
          audioFiles[a.id] = resolve(a.url);
          audioFiles[a.name] = resolve(a.url);
          audioFiles[a.url] = resolve(a.url);
        }
        for (const s of scenes)
          for (const n of s.script.nodes)
            if (n.audioUrl) audioFiles[n.audioUrl] = resolve(n.audioUrl);
        return {
          ...(await compilePlaybackInWorker(
            {
              project,
              scope:
                targetScope === "project"
                  ? { type: "project" }
                  : { type: "scene", sceneId: targetSceneId! },
              resolvedUrlMap: map,
            },
            signal,
          )),
          audioFiles,
        };
      } catch (e) {
        return { error: String(e) };
      }
    },
    [project],
  );
  const { value: compiled, pending: compiling } = useCompilation(
    compileScope,
    scope,
    scene?.id,
  );
  const { value: exportCompiled, pending: exportCompiling } = useCompilation(
    exportOpen ? compileScope : null,
    exportScope,
    scene?.id,
  );
  useEffect(() => {
    if (tagPreview && tagPreview.source !== project) finishTagPreview();
  }, [project, tagPreview]);
  useEffect(() => {
    if (!nodeSeek || !compiled || "error" in compiled) return;
    const cue = compiled.cues.find(
      (c) => c.sceneId === nodeSeek.sceneId && c.nodeId === nodeSeek.nodeId,
    );
    if (cue)
      setSeekRequest({
        time: Math.min(cue.start + 0.05, cue.end),
        token: nodeSeek.token,
        play: nodeSeek.play,
      });
    setNodeSeek(undefined);
  }, [nodeSeek, compiled]);
  function beforePlayback(): false | "ready" | "changed" {
    const before = session?.project;
    const active = document.activeElement;
    if (active instanceof HTMLInputElement) active.blur();
    if (!flushEdits(editBuffers.current)) return false;
    return before !== session?.project ? "changed" : "ready";
  }
  const usedFonts = project
    ? collectProjectReferences(project, scenes).fonts
    : new Set<string>();
  const selectedFonts =
    project?.assets.fonts.filter((f) => usedFonts.has(f.id)) ?? [];
  const fontKey = JSON.stringify(selectedFonts);
  useEffect(() => {
    let disposed = false;
    const faces: FontFace[] = [];
    setFontsReady(false);
    void Promise.all(
      selectedFonts.map(async (f) => {
        const font = new FontFace(f.name, `url("${resolve(f.url)}")`);
        document.fonts.add(font);
        faces.push(font);
        await font.load();
      }),
    )
      .then(() => document.fonts.ready)
      .then(() => {
        if (!disposed) setFontsReady(true);
      })
      .catch((e) => {
        if (!disposed) notify(`字体加载失败：${e}`);
      });
    return () => {
      disposed = true;
      faces.forEach((f) => document.fonts.delete(f));
    };
  }, [fontKey]);
  async function exportVideo() {
    const compiled = exportCompiled;
    if (
      !project ||
      !compiled ||
      "error" in compiled ||
      !fontsReady ||
      exportCompiling
    )
      return;
    toast.dismiss();
    setProgress(0);
    let file: Awaited<ReturnType<typeof openCheckedExportFile>> | undefined;
    const engine = createExporter();
    const cancellation = new AbortController();
    exporter.current = {
      cancel() {
        cancellation.abort();
        engine.cancel();
      },
    };
    const renderer = new KonvaExportRenderer({
      width: project.meta.width,
      height: project.meta.height,
    });
    try {
      await document.fonts.ready;
      cancellation.signal.throwIfAborted();
      const name = `${project.meta.title.replace(/[/\\\0]/g, "_")}-${exportScope}.mp4`;
      file = await openCheckedExportFile(
        name,
        () => confirm("覆盖已有导出文件？"),
        compiled.sequence,
        project,
      );
      cancellation.signal.throwIfAborted();
      engine.onProgress((p) => setProgress(p.percent));
      await engine.export({
        width: project.meta.width,
        height: project.meta.height,
        fps: project.meta.fps,
        sequence: compiled.sequence,
        assets: {
          renderContext: compiled.sequence.renderContext,
          audioFiles: compiled.audioFiles,
        },
        frameRenderer: renderer,
        outputStream: file.stream,
      });
      if (engine.state === "cancelled" || cancellation.signal.aborted) {
        await file.rollback();
        notify("已取消导出");
      } else {
        await file.commit();
        setExportResult(name);
        notify(`已导出到 ${localExportPath(name)}`);
      }
    } catch (e) {
      await file?.rollback();
      if (
        (e instanceof Error || e instanceof DOMException) &&
        e.name === "AbortError"
      )
        notify("已取消导出");
      else notify(`导出失败：${e}`);
    } finally {
      renderer.dispose();
      exporter.current = undefined;
      setProgress(null);
    }
  }
  const previewLayoutProblem = useMemo(
    () =>
      fontsReady && !compiling && project && compiled && !("error" in compiled)
        ? getBrowserLayoutProblem(compiled.sequence, project)
        : undefined,
    [fontsReady, compiling, project, compiled],
  );
  const exportLayoutProblem = useMemo(
    () =>
      fontsReady &&
      !exportCompiling &&
      project &&
      exportCompiled &&
      !("error" in exportCompiled)
        ? getBrowserLayoutProblem(exportCompiled.sequence, project)
        : undefined,
    [fontsReady, exportCompiling, project, exportCompiled],
  );
  return (
    <EditBuffers.Provider value={editBuffers.current}>
      <main
        className={`editor-shell ${canvasMaximized ? "canvas-maximized" : ""}`}
      >
        <EditorHeader>
          {projects.length > 1 ? (
            <CompactSelect
              label="项目"
              value={session?.id ?? ""}
              disabled={saving || progress !== null}
              onValueChange={(id) => void open(id)}
              options={projects.map((p) => ({
                value: p.projectId,
                label: p.title,
              }))}
            />
          ) : (
            <span className="preview-scene-title">
              {project?.meta.title ?? "作品"}
            </span>
          )}
          <span className="save-state" role="status">
            {saving || syncBusy
              ? "保存中…"
              : session?.dirty || pendingEdits
                ? "待自动保存"
                : savedAt
                  ? "已自动保存"
                  : ""}
          </span>
          <div className="spacer" />
          <Button
            variant="ghost"
            size="sm"
            disabled={
              (!session?.undoStack.length && !pendingEdits) || progress !== null
            }
            onClick={() => {
              if (!flushEdits(editBuffers.current)) return;
              session?.undo();
              update();
            }}
          >
            <Undo2 />
            <span className="sr-only">撤销</span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={!session?.redoStack.length || progress !== null}
            onClick={() => {
              if (!flushEdits(editBuffers.current)) return;
              session?.redo();
              update();
            }}
          >
            <Redo2 />
            <span className="sr-only">重做</span>
          </Button>
          <IconButton
            label={saving ? "保存中" : "保存"}
            disabled={!session || saving || syncBusy || progress !== null}
            onClick={() => void save()}
          >
            <Save />
          </IconButton>
          <IconButton label="API 设置" onClick={() => setCredentialsOpen(true)}>
            <Settings />
          </IconButton>
          <Button
            variant="brand"
            size="sm"
            disabled={
              compiling ||
              !compiled ||
              "error" in compiled ||
              progress !== null ||
              !fontsReady ||
              uploading
            }
            onClick={() => {
              if (flushEdits(editBuffers.current)) setExportOpen(true);
            }}
          >
            <Download />
            导出
          </Button>
        </EditorHeader>
        <Dialog open={credentialsOpen} onOpenChange={setCredentialsOpen}>
          <DialogContent
            className="vnve-ui sm:max-w-md max-h-[85dvh] overflow-y-auto"
            aria-describedby={undefined}
          >
            <DialogHeader>
              <DialogTitle>API 设置</DialogTitle>
            </DialogHeader>
            <CredentialsPanel />
          </DialogContent>
        </Dialog>
        <Toaster />
        {progress !== null && (
          <div className="export-progress-notice" role="status">
            <span>正在导出 MP4 · {progress}%</span>
            <ExportProgress value={progress} />
            <Button
              variant="ghost"
              size="sm"
              onClick={() => exporter.current?.cancel()}
            >
              取消导出
            </Button>
          </div>
        )}
        {exportResult && (
          <div className="export-progress-notice" role="status">
            <span>已导出：</span>
            <a
              className="export-local-path"
              href={localMediaUrl(`exports/${exportResult}`)}
              title="用系统播放器打开本地视频"
              onClick={(event) => {
                event.preventDefault();
                void openLocalExport(exportResult).catch((error) =>
                  toast.error(String(error)),
                );
              }}
            >
              {localExportPath(exportResult)}
            </a>
            <Button
              variant="link"
              size="sm"
              disabled={savingCopy}
              onClick={() => {
                setSavingCopy(true);
                void saveExportCopy(exportResult)
                  .then((result) => {
                    if (result === "saved") toast.success("已另存视频副本");
                    if (result === "download")
                      toast.info("浏览器将按下载设置保存副本");
                  })
                  .catch((error) => toast.error(`另存失败：${String(error)}`))
                  .finally(() => setSavingCopy(false));
              }}
            >
              {savingCopy
                ? "保存副本中…"
                : supportsNativeSaveAs()
                  ? "另存为…"
                  : "保存副本"}
            </Button>
            <button onClick={() => setExportResult(undefined)}>关闭</button>
          </div>
        )}
        {!project ? (
          <div className="empty">
            通过 Skill 创建作品后，在这里预览、微调和导出。
          </div>
        ) : (
          <>
            {previewLayoutProblem && (
              <div role="alert" className="px-3 py-2 text-xs text-amber-300">
                {previewLayoutProblem}
              </div>
            )}
            <section className="editor-workspace">
              <CompilationStatus pending={compiling} />
              {compiled && "error" in compiled ? (
                <div role="alert">{compiled.error}</div>
              ) : compiled ? (
                <Preview
                  project={project}
                  fontsReady={fontsReady}
                  sequence={tagPreview?.sequence ?? compiled.sequence}
                  audioFiles={tagPreview?.audioFiles ?? compiled.audioFiles}
                  onError={(message) => {
                    if (tagPreview) finishTagPreview();
                    notify(message);
                  }}
                  seekRequest={seekRequest}
                  editing={{
                    sceneId: scene!.id,
                    unsaved: !!session?.dirty || pendingEdits > 0,
                    pendingTextEdits: pendingEdits > 0,
                    revision: session?.revision,
                    sceneNavigation: (previewDisabled) => (
                      <SceneNavigation
                        project={project}
                        sceneId={scene?.id}
                        disabled={
                          previewDisabled || progress !== null || uploading
                        }
                        selectScene={selectScene}
                        patch={(operations) =>
                          flushEdits(editBuffers.current) && patch(operations)
                        }
                        deleteScene={(id) => {
                          if (!flushEdits(editBuffers.current)) return;
                          try {
                            session!.replace(removeScene(session!.project, id));
                            if (sceneId === id)
                              selectScene(
                                session!.project.acts.flatMap(
                                  (a) => a.scenes,
                                )[0].id,
                              );
                            update();
                          } catch (e) {
                            notify(String(e));
                          }
                        }}
                      />
                    ),
                    patch: (operations) =>
                      patch(
                        operations.flatMap((op) => {
                          if (op.type === "actor.update" && op.variantId) {
                            const target = scenes.find(
                              (s) => s.id === op.sceneId,
                            );
                            return target
                              ? [
                                  op,
                                  ...currentLookEdits(
                                    target,
                                    op.actorId,
                                    op.variantId,
                                    previewTime.current,
                                    compiled.cues.filter(
                                      (c) => c.sceneId === op.sceneId,
                                    ),
                                  ),
                                ]
                              : [op];
                          }
                          if (
                            op.type === "scene.update" &&
                            (op.backgroundId || op.cgId)
                          ) {
                            const target = scenes.find(
                              (s) => s.id === op.sceneId,
                            );
                            return target
                              ? [
                                  op,
                                  ...currentLookEdits(
                                    target,
                                    op.backgroundId ? "$background" : "$cg",
                                    (op.backgroundId ?? op.cgId)!,
                                    previewTime.current,
                                    compiled.cues.filter(
                                      (c) => c.sceneId === op.sceneId,
                                    ),
                                  ),
                                ]
                              : [op];
                          }
                          return [op];
                        }),
                      ),
                    canUndo: !!session?.undoStack.length || !!pendingEdits,
                    canRedo: !!session?.redoStack.length,
                    undo: () => {
                      if (flushEdits(editBuffers.current)) {
                        session?.undo();
                        update();
                      }
                    },
                    redo: () => {
                      if (flushEdits(editBuffers.current)) {
                        session?.redo();
                        update();
                      }
                    },
                    maximized: canvasMaximized,
                    toggleMaximize: () => setCanvasMaximized((v) => !v),
                    selectedActorId,
                    onAddCharacter: (sceneId, subjectId) => {
                      if (!session || !flushEdits(editBuffers.current)) return;
                      const target = session.project.acts
                        .flatMap((act) => act.scenes)
                        .find((scene) => scene.id === sceneId);
                      if (!target) return;
                      const id = createId();
                      const operations = addSceneCharacter(
                        session.project,
                        target,
                        subjectId,
                        id,
                      );
                      if (operations.length && patch(operations)) return id;
                    },
                    onSelectActor: (id) => {
                      if (!flushEdits(editBuffers.current)) return false;
                      setSelectedNodeId(undefined);
                      setSelectedActorId(id);
                      return true;
                    },
                    onSelectCanvas: () => {
                      if (!flushEdits(editBuffers.current)) return false;
                      setSelectedNodeId(undefined);
                      return true;
                    },
                    beforePlayback,
                    stepLine: (direction, playing) => {
                      if (!flushEdits(editBuffers.current)) return;
                      const cue = stepDialogueCue(
                        compiled.cues,
                        previewTime.current,
                        direction,
                      );
                      if (!cue) return;
                      if (scope === "project") setSceneId(cue.sceneId);
                      setSelectedActorId(undefined);
                      setSelectedNodeId(cue.nodeId);
                      setNodeSeek({
                        sceneId: cue.sceneId,
                        nodeId: cue.nodeId,
                        token: performance.now(),
                        play: playing,
                      });
                    },
                    selectedNodeId,
                    script: scene
                      ? (previewDisabled: boolean, previewPlaying: boolean) => (
                          <>
                            <ScriptPanel
                              project={project}
                              scene={scene}
                              moveNode={(from, index) => {
                                if (flushEdits(editBuffers.current))
                                  patch([
                                    {
                                      type: "dialogue.move",
                                      sceneId: scene.id,
                                      nodeId: scene.script.nodes[from].id!,
                                      index,
                                    },
                                  ]);
                              }}
                              insertNode={(index) => {
                                if (!flushEdits(editBuffers.current)) return;
                                const id = createId();
                                if (
                                  patch([
                                    {
                                      type: "dialogue.insert",
                                      sceneId: scene.id,
                                      id,
                                      index,
                                      text: "新台词",
                                      actorId:
                                        index > 0
                                          ? scene.script.nodes[index - 1]
                                              ?.actorId
                                          : undefined,
                                    },
                                  ])
                                ) {
                                  setSelectedNodeId(id);
                                  setSelectedActorId(undefined);
                                }
                              }}
                              deleteNode={(nodeId) => {
                                if (flushEdits(editBuffers.current))
                                  patch([
                                    {
                                      type: "dialogue.remove",
                                      sceneId: scene.id,
                                      nodeId,
                                    },
                                  ]);
                              }}
                              previewPlaying={previewPlaying}
                              changeSpeaker={(nodeId, actorId) => {
                                if (flushEdits(editBuffers.current))
                                  patch([
                                    {
                                      type: "dialogue.settings",
                                      sceneId: scene.id,
                                      nodeId,
                                      actorId: actorId || null,
                                    },
                                  ]);
                              }}
                              activeNodeId={activeNodeId}
                              selectedNodeId={selectedNodeId}
                              disabled={
                                previewDisabled ||
                                progress !== null ||
                                uploading
                              }
                              renderEditor={(nodeId, readOnly) => (
                                <RichEditor
                                  onPreview={(tag) => {
                                    if (!flushEdits(editBuffers.current))
                                      return;
                                    tagPreviewTask.current?.abort();
                                    const controller = new AbortController();
                                    tagPreviewTask.current = controller;
                                    const source = session!.project;
                                    const returnTime = previewTime.current;
                                    setTagPreviewPending(true);
                                    void compileTagPreview(
                                      source,
                                      scene.id,
                                      tag,
                                      resolve,
                                      controller.signal,
                                    )
                                      .then((result) => {
                                        if (controller.signal.aborted) return;
                                        setTagPreview({
                                          ...result,
                                          source,
                                          returnTime,
                                        });
                                        setTagPreviewPending(false);
                                        setSeekRequest({
                                          time: 0,
                                          token: performance.now(),
                                          playUntil: result.sequence.duration,
                                        });
                                      })
                                      .catch((error) => {
                                        if (controller.signal.aborted) return;
                                        setTagPreviewPending(false);
                                        notify(String(error));
                                      });
                                  }}
                                  tagsReadOnly={
                                    previewPlaying ||
                                    previewDisabled ||
                                    progress !== null ||
                                    uploading
                                  }
                                  autoFocus={!readOnly}
                                  key={nodeId}
                                  nodeId={nodeId}
                                  content={getTextNodeContent(
                                    scene.script.nodes.find(
                                      (n) => n.id === nodeId,
                                    )!,
                                  )}
                                  project={project}
                                  scene={scene}
                                  readOnly={
                                    readOnly ||
                                    previewDisabled ||
                                    progress !== null ||
                                    uploading
                                  }
                                  onChange={(content) =>
                                    patch([
                                      {
                                        type: "dialogue.content.update",
                                        sceneId: scene.id,
                                        nodeId,
                                        content,
                                      },
                                    ])
                                  }
                                  onEnter={() => {}}
                                />
                              )}
                              select={(nodeId) => {
                                if (!flushEdits(editBuffers.current)) return;
                                setSelectedNodeId(nodeId);
                                setSelectedActorId(undefined);
                                setNodeSeek({
                                  sceneId: scene.id,
                                  nodeId,
                                  token: performance.now(),
                                });
                              }}
                            />
                          </>
                        )
                      : undefined,
                    scope,
                    onScopeChange: (value) => {
                      if (!flushEdits(editBuffers.current)) return;
                      setSeekRequest(undefined);
                      setScope(value);
                    },
                    onSelectScene: selectScene,
                    disabled:
                      progress !== null ||
                      uploading ||
                      !!tagPreview ||
                      tagPreviewPending,
                    onSelectTheme: (targetSceneId, themeId) => {
                      if (scene && flushEdits(editBuffers.current))
                        patch([
                          {
                            type: "dialogue.theme.apply",
                            sceneId: targetSceneId,
                            themeId,
                            scope: "scene",
                          },
                        ]);
                    },
                    placementSource: (id, actorId, time) => {
                      const target = scenes.find((s) => s.id === id);
                      if (!target) return "位置来源：本场基础值";
                      const source = actorPlacementEdits(
                        target,
                        actorId,
                        {
                          x:
                            target.actors.find((a) => a.id === actorId)?.x ??
                            50,
                        },
                        time,
                        compiled.cues.filter((c) => c.sceneId === id),
                      ).find((op) => op.type === "direction.update");
                      if (source?.type === "direction.update") {
                        const index = target.script.nodes.findIndex(
                          (n) => n.id === source.nodeId,
                        );
                        return `位置：本场基础值 + 第 ${index + 1} 句${source.direction.name === "move" ? "移动" : "入场"} · 查看范围`;
                      }
                      return "位置：本场基础值 · 查看范围";
                    },
                    onTransform: (id, actorId, change, time) => {
                      if (!flushEdits(editBuffers.current)) return false;
                      const target = scenes.find((s) => s.id === id);
                      if (!target) return false;
                      const ok = patch(
                        actorPlacementEdits(
                          target,
                          actorId,
                          change,
                          time,
                          compiled.cues.filter((c) => c.sceneId === id),
                          project.meta,
                        ),
                      );
                      if (ok)
                        setSeekRequest({ time, token: performance.now() });
                      return ok;
                    },
                  }}
                  onTimeChange={(time) => {
                    if (tagPreview) {
                      if (time >= tagPreview.sequence.duration)
                        finishTagPreview();
                      return;
                    }
                    previewTime.current = time;
                    const cue = compiled.cues.find(
                      (c) => time >= c.start && time < c.end,
                    );
                    setActiveNodeId(cue?.nodeId);
                    const playbackSceneId = findSequenceSceneAtTime(
                      compiled.sequence,
                      time,
                    )?.sceneId;
                    if (
                      scope === "project" &&
                      playbackSceneId &&
                      playbackSceneId !== scene?.id
                    ) {
                      setSceneId(playbackSceneId);
                      setSelectedNodeId((id) =>
                        scenes
                          .find((s) => s.id === playbackSceneId)
                          ?.script.nodes.some((n) => n.id === id)
                          ? id
                          : undefined,
                      );
                      setSelectedActorId(undefined);
                    }
                  }}
                />
              ) : (
                <div className="empty">暂无场景</div>
              )}
            </section>

            <Dialog open={exportOpen} onOpenChange={setExportOpen}>
              <DialogContent className="vnve-ui bg-[#191a1d] text-white sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>导出 MP4</DialogTitle>
                  <DialogDescription>选择要导出的场景范围。</DialogDescription>
                </DialogHeader>
                <div className="export-settings">
                  <label>
                    导出范围
                    <CompactSelect
                      label="导出范围"
                      value={exportScope}
                      onValueChange={(value) => {
                        setExportScope(value as typeof exportScope);
                      }}
                      options={[
                        {
                          value: "scene",
                          label: `仅「${scene?.name ?? "本场"}」`,
                        },
                        {
                          value: "project",
                          label: `整个作品（${scenes.length} 个场景）`,
                        },
                      ]}
                    />
                  </label>
                  <p>
                    {project.meta.width} × {project.meta.height} ·{" "}
                    {project.meta.fps} fps
                  </p>
                  {exportLayoutProblem && (
                    <p role="alert">{exportLayoutProblem}</p>
                  )}
                  <button
                    className="primary"
                    disabled={
                      exportCompiling ||
                      !exportCompiled ||
                      "error" in exportCompiled ||
                      !fontsReady ||
                      !!exportLayoutProblem ||
                      uploading ||
                      progress !== null
                    }
                    onClick={() => {
                      setExportOpen(false);
                      void exportVideo();
                    }}
                  >
                    {exportScope === "project" ? "导出整个作品" : "导出本场"}
                  </button>
                </div>
              </DialogContent>
            </Dialog>
          </>
        )}
      </main>
    </EditBuffers.Provider>
  );
}
