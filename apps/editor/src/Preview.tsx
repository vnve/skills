import { AddCharacterButton } from "./components/AddCharacterButton";
import { editorContext } from "./editor-context";
import { StoryboardWorkspace } from "./components/StoryboardWorkspace";
import { PlaybackBar } from "./components/PlaybackBar";
import { IconButton, ProgressSlider } from "./EditorControls";
import { CompactSelect } from "./CompactSelect";
import { CanvasTools } from "./CanvasTools";
import { CanvasLayerHandles } from "./CanvasLayerHandles";
import type { CanvasElement } from "./components/ContextToolbar";
import type { Patch } from "./panels/shared";
import { PointPicker } from "./PointPicker";
import { applyAnimations } from "@vnve/runtime";
import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  Play,
  Pause,
  Maximize2,
  Minimize2,
  Undo2,
  Redo2,
  SkipBack,
  SkipForward,
  Square,
  SlidersHorizontal,
} from "lucide-react";
import {
  CanvasHandles,
  type CanvasFrame,
  type ActorTransform,
} from "./CanvasControls";
import type { Project } from "@vnve/core";
import {
  KonvaFrameRenderer,
  sampleSequence,
  type CompiledSequence,
  type PreparedFrameInput,
} from "@vnve/renderer";
import { createDynamicMediaResolver, computeAudioState } from "@vnve/media";
import { AudioPlaybackService } from "./core/audio-playback-service";
export function Preview({
  project,
  sequence,
  audioFiles,
  onError,
  fontsReady = true,
  seekRequest,
  onTimeChange,
  editing,
  overlay,
}: {
  project: Project;
  overlay?: React.ReactNode;
  editing?: {
    sceneId: string;
    unsaved: boolean;
    pendingTextEdits: boolean;
    revision?: { projectRevision: string; assetsRevision: string };
    patch: Patch;
    canUndo: boolean;
    canRedo: boolean;
    undo: () => void;
    redo: () => void;
    maximized: boolean;
    toggleMaximize: () => void;
    selectedActorId?: string;
    onSelectActor: (id?: string) => boolean;
    onAddCharacter: (sceneId: string, subjectId: string) => string | undefined;
    onSelectCanvas: (kind?: CanvasElement) => boolean;
    beforePlayback: () => false | "ready" | "changed";
    stepLine: (direction: -1 | 1, playing: boolean) => void;
    selectedNodeId?: string;
    script?: (disabled: boolean, playing: boolean) => React.ReactNode;
    sceneNavigation?: (disabled: boolean) => React.ReactNode;
    scope: "scene" | "project";
    onScopeChange: (scope: "scene" | "project") => void;
    onSelectScene: (id: string) => void;
    placementSource?: (
      sceneId: string,
      actorId: string,
      time: number,
    ) => string;
    onTransform: (
      sceneId: string,
      actorId: string,
      change: ActorTransform,
      time: number,
    ) => boolean;
    onSelectTheme: (sceneId: string, themeId: string) => void;
    disabled: boolean;
  };
  seekRequest?: {
    time: number;
    token: number;
    playUntil?: number;
    play?: boolean;
  };
  onTimeChange?: (time: number) => void;
  fontsReady?: boolean;
  sequence: CompiledSequence;
  audioFiles: Record<string, string>;
  onError: (message: string) => void;
}) {
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [toolbarTarget, setToolbarTarget] = useState<HTMLDivElement | null>(
    null,
  );
  const [selectedElement, setSelectedElement] = useState<CanvasElement>();
  useEffect(() => {
    setSelectedElement(undefined);
  }, [editing?.sceneId, project.meta.id]);
  function selectActor(id?: string) {
    if (!editing?.onSelectActor(id)) return;
    pauseForEdit();
    setSelectedElement(undefined);
  }
  function selectElement(kind?: CanvasElement) {
    if (!editing?.onSelectCanvas(kind) || !editing.onSelectActor(undefined))
      return;
    pauseForEdit();
    setSelectedElement(kind);
  }
  useEffect(() => {
    if (editing?.selectedNodeId) setSelectedElement(undefined);
  }, [editing?.selectedNodeId]);
  const [canvasFrame, setCanvasFrame] = useState<CanvasFrame>();
  // Anchor the contextual toolbar to the sampled selection, with viewport collision avoidance.
  useLayoutEffect(() => {
    if (!toolbarTarget) return;
    const workbench = toolbarTarget.parentElement;
    const canvas = workbench?.querySelector<HTMLElement>(".canvas-size");
    const toolbar = toolbarTarget.querySelector<HTMLElement>(
      '[data-testid="canvas-selection-hud"]',
    );
    if (!workbench || !canvas || !toolbar) return;
    const position = () => {
      const area = workbench.getBoundingClientRect();
      const stage = canvas.getBoundingClientRect();
      const box = editing?.selectedActorId
        ? canvasFrame?.bounds.find((b) => b.id === editing.selectedActorId)
        : selectedElement === "dialogue"
          ? canvasFrame?.dialogueBox
          : undefined;
      const x = box
        ? stage.left -
          area.left +
          ((box.x + box.width / 2) / project.meta.width) * stage.width
        : stage.left - area.left + stage.width / 2;
      const top = box
        ? stage.top - area.top + (box.y / project.meta.height) * stage.height
        : stage.top - area.top;
      const bottom = box
        ? top + (box.height / project.meta.height) * stage.height
        : top;
      const height = toolbar.offsetHeight;
      const half = toolbar.offsetWidth / 2;
      const y =
        top - height - 28 >= 8
          ? top - height - 28
          : bottom + height + 8 <= area.height
            ? bottom + 8
            : Math.max(8, top + 8);
      toolbarTarget.style.setProperty(
        "--selection-x",
        `${Math.max(half + 8, Math.min(area.width - half - 8, x))}px`,
      );
      toolbarTarget.style.setProperty(
        "--selection-y",
        `${Math.min(Math.max(8, area.height - height - 8), y)}px`,
      );
    };
    position();
    const observer = new ResizeObserver(position);
    observer.observe(workbench);
    observer.observe(canvas);
    observer.observe(toolbar);
    return () => observer.disconnect();
  }, [
    toolbarTarget,
    canvasFrame,
    editing?.selectedActorId,
    selectedElement,
    project.meta.width,
    project.meta.height,
  ]);

  const frameRenderer = useRef<KonvaFrameRenderer>();
  const mediaResources = useRef(new Set<() => void>());
  const mount = useRef<HTMLDivElement>(null),
    [time, setTime] = useState(0),
    [playing, setPlaying] = useState(false),
    [ready, setReady] = useState(false);
  const resumeAfterCompile = useRef(false);
  const previewStopTime = useRef<number>();
  const clock = useRef({ time: 0, playing: false }),
    audio = useRef<AudioPlaybackService>();
  useEffect(() => {
    clock.current.time = time;
  }, [time]);
  useEffect(() => {
    clock.current.playing = playing;
    if (!playing) void audio.current?.pause();
  }, [playing]);
  const rendererProjectKey = useRef("");
  useEffect(() => {
    if (!mount.current) return;
    const parent = mount.current.parentElement!;
    const stage = parent.parentElement!;
    function fit() {
      const padding = getComputedStyle(stage);
      const availableWidth =
        stage.clientWidth -
        parseFloat(padding.paddingLeft) -
        parseFloat(padding.paddingRight);
      const availableHeight =
        stage.clientHeight -
        parseFloat(padding.paddingTop) -
        parseFloat(padding.paddingBottom);
      const width = Math.max(
        1,
        Math.min(
          availableWidth,
          (availableHeight * project.meta.width) / project.meta.height,
          1400,
        ),
      );
      parent.style.width = `${width}px`;
      stage
        .closest<HTMLElement>(".preview-column")
        ?.style.setProperty("--preview-canvas-width", `${width}px`);
      parent.style.setProperty(
        "--canvas-scale",
        String(width / project.meta.width),
      );
    }
    const resize = new ResizeObserver(fit);
    resize.observe(stage);
    fit();
    const renderer = new KonvaFrameRenderer({
      width: project.meta.width,
      height: project.meta.height,
      mode: "visible",
      mountTarget: mount.current,
    });
    frameRenderer.current = renderer;
    setReady(false);
    const projectKey = `${project.meta.id}/${project.meta.width}/${project.meta.height}`;
    if (rendererProjectKey.current !== projectKey) {
      setTime(0);
      clock.current = { time: 0, playing: false };
      rendererProjectKey.current = projectKey;
    }
    return () => {
      resize.disconnect();
      renderer.dispose();
      if (frameRenderer.current === renderer) frameRenderer.current = undefined;
      for (const release of mediaResources.current) release();
      mediaResources.current.clear();
    };
  }, [
    project.meta.id,
    project.meta.width,
    project.meta.height,
    editing?.maximized,
  ]);
  useEffect(() => {
    const activeRenderer = frameRenderer.current;
    if (!activeRenderer || !fontsReady) return;
    const renderer: KonvaFrameRenderer = activeRenderer;
    let disposed = false,
      raf = 0,
      busy = false,
      last = performance.now();
    const stills = new Map<string, ImageBitmap>(),
      dynamic = createDynamicMediaResolver();
    const sound = new AudioPlaybackService(
      async (key) => audioFiles[key] ?? key,
    );
    audio.current = sound;
    setPlaying(false);
    const release = () => {
      sound.dispose();
      dynamic.dispose();
      stills.forEach((image) => image.close());
      mediaResources.current.delete(release);
    };
    mediaResources.current.add(release);
    const draw = (f: PreparedFrameInput) => ({
      state: f.nextRenderState,
      images: f.imageMap,
      options: f.frameOptions,
    });
    let lastDrawnTime = NaN;
    async function frame(now: number) {
      if (disposed) return;
      const elapsed = (now - last) / 1000;
      last = now;
      if (clock.current.playing) {
        clock.current.time = Math.min(
          Math.min(
            sequence.duration,
            previewStopTime.current ?? sequence.duration,
          ),
          clock.current.time + elapsed,
        );
        setTime(clock.current.time);
        if (
          clock.current.time >=
          Math.min(
            sequence.duration,
            previewStopTime.current ?? sequence.duration,
          )
        ) {
          clock.current.playing = false;
          setPlaying(false);
        }
      }
      if (
        !busy &&
        (clock.current.playing || clock.current.time !== lastDrawnTime)
      ) {
        busy = true;
        try {
          const t = clock.current.time;
          const moving = await dynamic.resolveFrames(
            [...sequence.renderContext.imageUrls.values()],
            t,
            { waitForSeek: true, throwOnMissing: true },
          );
          if (disposed) return;
          const prepared = sampleSequence({
            sequence,
            time: t,
            imageResolver: (url) => moving.get(url) ?? stills.get(url) ?? null,
          });
          if (prepared.single) {
            const f = prepared.single;
            renderer.renderFrame(f.nextRenderState, f.imageMap, f.frameOptions);
            const sceneStart =
              sequence.sceneClips.find((c) => c.sceneId === f.currentSceneId)
                ?.contentStartTime ?? 0;
            const deltas = applyAnimations(
              {
                ...f.nextRenderState,
                actors: f.nextRenderState.actors.map((a) => ({
                  ...a,
                  x: 0,
                  y: 0,
                  scale: 1,
                })),
              },
              sequence.renderContext.sceneAnimations?.get(
                f.currentSceneId ?? "",
              ) ?? [],
              t - sceneStart,
            );
            setCanvasFrame({
              animationOffsets: Object.fromEntries(
                deltas.actors.map((a) => [
                  a.id,
                  { x: a.x, y: a.y, scale: a.scale },
                ]),
              ),
              speakerBoosts: Object.fromEntries(
                f.nextRenderState.actors.map((a) => [
                  a.id,
                  f.nextRenderState.dialogue &&
                  a.isSpeaker &&
                  f.frameOptions.speakerScale
                    ? 1.05
                    : 1,
                ]),
              ),
              sceneId: f.currentSceneId ?? "",
              actors: f.nextRenderState.actors,
              bounds: renderer.getActorEditingBounds(),
              ...renderer.getLayerEditingBounds(),
              canvasWidth: project.meta.width,
              canvasHeight: project.meta.height,
              cameraScale: f.nextRenderState.camera.scale,
              time: t,
            });
          }
          if (prepared.transition) {
            setCanvasFrame(undefined);
            const f = prepared.transition;
            renderer.renderTransitionFrame(draw(f.outgoing), draw(f.incoming), {
              effect: f.compositorPlan.effect,
              progress: f.progress,
              compositorPlan: f.compositorPlan,
            });
          }
          // Keep the previous frame's images alive until the replacement is drawn.
          if (prepared.single || prepared.transition) {
            for (const oldRelease of [...mediaResources.current])
              if (oldRelease !== release) oldRelease();
          }
          lastDrawnTime = t;
          await sound.syncState(
            computeAudioState(sequence.audioPlan, t),
            clock.current.playing,
          );
        } catch (e) {
          setPlaying(false);
          onError(String(e));
          return;
        } finally {
          busy = false;
        }
      }
      raf = requestAnimationFrame(frame);
    }
    void (async () => {
      try {
        await dynamic.load(sequence.renderContext.variantMediaTypesByUrl);
        const urls = [...new Set(sequence.renderContext.imageUrls.values())];
        await Promise.all(
          urls
            .filter(
              (url) =>
                !["video", "animated"].includes(
                  sequence.renderContext.variantMediaTypesByUrl.get(url) ??
                    "image",
                ),
            )
            .map(async (url) => {
              const response = await fetch(url);
              if (!response.ok) throw new Error(`素材加载失败: ${url}`);
              const bitmap = await createImageBitmap(await response.blob());
              if (disposed) bitmap.close();
              else stills.set(url, bitmap);
            }),
        );
        if (!disposed) {
          setReady(true);
          if (resumeAfterCompile.current) {
            resumeAfterCompile.current = false;
            void sound.resume();
            setPlaying(true);
          }
          raf = requestAnimationFrame(frame);
        }
      } catch (e) {
        if (!disposed) onError(String(e));
      }
    })();
    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      void sound.pause();
    };
  }, [
    sequence,
    fontsReady,
    project.meta.id,
    project.meta.width,
    project.meta.height,
    editing?.maximized,
  ]);
  useEffect(() => {
    if (!seekRequest) return;
    const t = Math.max(0, Math.min(sequence.duration, seekRequest.time));
    setPlaying(false);
    clock.current.playing = false;
    clock.current.time = t;
    audio.current?.resetForSeek(t);
    setTime(t);
    previewStopTime.current = seekRequest.playUntil;
    resumeAfterCompile.current = false;
    if (seekRequest.play || seekRequest.playUntil !== undefined) {
      if (ready) {
        clock.current.playing = true;
        void audio.current?.resume();
        setPlaying(true);
      } else resumeAfterCompile.current = true;
    }
  }, [seekRequest, sequence]);
  const onTimeChangeRef = useRef(onTimeChange);
  onTimeChangeRef.current = onTimeChange;
  useEffect(() => {
    onTimeChangeRef.current?.(time);
  }, [time]);
  const canvasScene = project.acts
    .flatMap((a) => a.scenes)
    .find((s) => s.id === (canvasFrame?.sceneId ?? editing?.sceneId));
  const lockedElements = canvasScene?.lockedElements ?? {};
  function commitActor(id: string, change: ActorTransform) {
    if (!editing || !canvasScene) return false;
    const motion = canvasFrame?.animationOffsets?.[id];
    const normalized = {
      ...change,
      // Commit only edited axes: the sampled frame can lag behind a previous field edit.
      ...(change.x !== undefined ? { x: change.x - (motion?.x ?? 0) } : {}),
      ...(change.y !== undefined ? { y: change.y - (motion?.y ?? 0) } : {}),
      ...(change.scale !== undefined
        ? { scale: change.scale / (motion?.scale || 1) }
        : {}),
    };
    return editing.onTransform(
      canvasScene.id,
      id,
      normalized,
      clock.current.time,
    );
  }
  function pauseForEdit() {
    setPlaying(false);
    clock.current.playing = false;
    void audio.current?.pause();
  }
  function togglePlayback() {
    previewStopTime.current = undefined;
    if (!ready || editing?.disabled) return;
    if (!playing) {
      const result = editing?.beforePlayback();
      if (result === false) return;
      if (result === "changed") {
        resumeAfterCompile.current = true;
        return;
      }
      void audio.current?.resume();
      if (time >= sequence.duration) {
        clock.current.time = 0;
        setTime(0);
      }
    } else void audio.current?.pause();
    setPlaying(!playing);
  }
  function stopPlayback() {
    previewStopTime.current = undefined;
    if (!ready || editing?.disabled) return;
    resumeAfterCompile.current = false;
    clock.current.playing = false;
    clock.current.time = 0;
    audio.current?.resetForSeek(0);
    void audio.current?.pause();
    setPlaying(false);
    setTime(0);
  }
  function stepLine(direction: -1 | 1) {
    if (!editing || editing.disabled) return;
    editing.stepLine(direction, clock.current.playing);
  }
  useEffect(() => {
    const keys = (e: KeyboardEvent) => {
      const target = e.target;
      if (
        e.metaKey ||
        e.ctrlKey ||
        e.altKey ||
        e.isComposing ||
        document.querySelector('[role="dialog"]') ||
        (target instanceof HTMLElement &&
          target.closest(
            'input, textarea, select, [contenteditable="true"], [role="menu"], [role="listbox"], [role="slider"]',
          ))
      )
        return;
      if (e.code === "Space") {
        if (target instanceof HTMLElement && target.closest("button")) return;
        e.preventDefault();
        togglePlayback();
      }
      if (e.key === "Escape") {
        if (
          editing?.selectedActorId ||
          selectedElement ||
          editing?.selectedNodeId
        ) {
          e.preventDefault();
          selectElement(undefined);
        } else if (editing?.maximized) editing.toggleMaximize();
      }
      const delta = {
        ArrowLeft: [-1, 0],
        ArrowRight: [1, 0],
        ArrowUp: [0, -1],
        ArrowDown: [0, 1],
      }[e.key];
      const actor = canvasFrame?.actors.find(
        (a) => a.id === editing?.selectedActorId,
      );
      if (
        delta &&
        !(
          target instanceof HTMLElement &&
          target.closest("button") &&
          !target.closest(".canvas-workbench")
        ) &&
        actor &&
        ready &&
        !playing &&
        !editing?.disabled &&
        !canvasScene?.actors.find((a) => a.id === actor.id)?.locked
      ) {
        e.preventDefault();
        const step = e.shiftKey ? 1 : 0.1;
        commitActor(actor.id, {
          x: actor.x + delta[0] * step,
          y: actor.y + delta[1] * step,
        });
      }
    };
    window.addEventListener("keydown", keys);
    return () => window.removeEventListener("keydown", keys);
  }, [ready, playing, time, editing, selectedElement, canvasFrame]);
  return (
    <>
      {editing && (
        <section
          className="sr-only"
          aria-label="编辑器当前上下文"
          data-vnve-context="1"
        >
          <pre>
            {JSON.stringify(
              editorContext(project, {
                sceneId: canvasScene?.id ?? editing.sceneId,
                actorId: editing.selectedActorId,
                nodeId: editing.selectedNodeId,
                element: selectedElement,
                time,
                scope: editing.scope,
                playing,
                unsaved: editing.unsaved,
                pendingTextEdits: editing.pendingTextEdits,
                revision: editing.revision,
              }),
              null,
              2,
            )}
          </pre>
        </section>
      )}
      <StoryboardWorkspace
        isMaximized={!!editing?.maximized}
        canvas={
          <div className="preview-column h-full flex-1">
            {" "}
            <div className="preview-heading">
              <span className="preview-scene-title">
                {canvasScene?.name ?? "预览"}
              </span>
              <div className="spacer" />
              {editing && canvasScene && (
                <AddCharacterButton
                  project={project}
                  scene={canvasScene}
                  disabled={editing.disabled || playing}
                  add={(subjectId) => {
                    const id = editing.onAddCharacter(
                      canvasScene.id,
                      subjectId,
                    );
                    if (id) selectActor(id);
                  }}
                />
              )}
              {editing && (
                <IconButton
                  label="场景设置"
                  aria-expanded={inspectorOpen}
                  aria-pressed={inspectorOpen}
                  className="text-white/60 hover:bg-white/5 hover:text-white/90 focus-visible:ring-1"
                  onClick={() => setInspectorOpen((v) => !v)}
                >
                  <SlidersHorizontal className="size-4" />
                </IconButton>
              )}
              {editing && (
                <>
                  <small>
                    {project.meta.width} × {project.meta.height}
                  </small>
                  {editing.maximized && (
                    <>
                      <button
                        aria-label="撤销"
                        disabled={!editing.canUndo || editing.disabled}
                        onClick={editing.undo}
                      >
                        <Undo2 />
                      </button>
                      <button
                        aria-label="重做"
                        disabled={!editing.canRedo || editing.disabled}
                        onClick={editing.redo}
                      >
                        <Redo2 />
                      </button>
                    </>
                  )}
                  <IconButton
                    label={editing.maximized ? "退出专注预览" : "专注预览"}
                    className="text-white/60 hover:bg-white/5 hover:text-white/90 focus-visible:ring-1"
                    onClick={editing.toggleMaximize}
                  >
                    {editing.maximized ? <Minimize2 /> : <Maximize2 />}
                  </IconButton>
                </>
              )}
            </div>
            <div className="canvas-workbench">
              {!editing?.selectedActorId && (
                <div
                  className="canvas-ui vnve-ui selection-shortcuts"
                  ref={setToolbarTarget}
                />
              )}
              <div className="stage">
                <div
                  className="canvas-size"
                  style={{
                    aspectRatio: `${project.meta.width}/${project.meta.height}`,
                  }}
                >
                  <div
                    className="native-canvas"
                    ref={mount}
                    style={{
                      width: project.meta.width,
                      height: project.meta.height,
                      transform: `scale(var(--canvas-scale, .5))`,
                    }}
                  />
                  {overlay}
                  {editing && !editing.disabled && (
                    <CanvasLayerHandles
                      frame={canvasFrame}
                      selectedElement={selectedElement}
                      selectElement={selectElement}
                      lockedElements={lockedElements}
                      pause={pauseForEdit}
                      moveDialogue={(dialogueX, dialogueY) => {
                        if (!canvasScene) return;
                        editing.patch([
                          {
                            type: "dialogue.layout.update",
                            sceneId: canvasScene.id,
                            x: dialogueX,
                            y: dialogueY,
                          },
                        ]);
                      }}
                    />
                  )}
                  {editing && <PointPicker pause={pauseForEdit} />}
                  {editing && (
                    <CanvasHandles
                      project={project}
                      scene={canvasScene}
                      frame={canvasFrame}
                      selectedActorId={editing.selectedActorId}
                      mountTools={setToolbarTarget}
                      selectActor={selectActor}
                      pause={pauseForEdit}
                      disabled={editing.disabled}
                      preview={(id, transform) =>
                        frameRenderer.current?.previewActorTransform(id, {
                          ...transform,
                          scale:
                            transform.scale *
                            (canvasFrame?.speakerBoosts?.[id] ?? 1),
                        })
                      }
                      commit={commitActor}
                    />
                  )}
                </div>
              </div>
            </div>
            <PlaybackBar>
              <button
                className="p-1.5 hover:bg-white/10 rounded-md text-white/80 hover:text-white transition-colors [&_svg]:size-4"
                onPointerDown={(e) => e.preventDefault()}
                aria-label="上一句"
                title="上一句"
                disabled={!ready || editing?.disabled}
                onClick={() => stepLine(-1)}
              >
                <SkipBack />
              </button>
              <button
                className="p-1.5 hover:bg-white/10 rounded-md text-white/80 hover:text-white transition-colors [&_svg]:size-4"
                disabled={!ready || editing?.disabled}
                onPointerDown={(e) => e.preventDefault()}
                onClick={togglePlayback}
              >
                {playing ? <Pause /> : <Play />}
                <span className="sr-only">{playing ? "暂停" : "播放"}</span>
              </button>
              <IconButton
                label="停止"
                disabled={
                  !ready || editing?.disabled || (!playing && time === 0)
                }
                onPointerDown={(event) => event.preventDefault()}
                onClick={stopPlayback}
                className="text-red-400 hover:bg-red-500/10 hover:text-red-300"
              >
                <Square className="size-3.5" />
              </IconButton>
              <button
                className="p-1.5 hover:bg-white/10 rounded-md text-white/80 hover:text-white transition-colors [&_svg]:size-4"
                onPointerDown={(e) => e.preventDefault()}
                aria-label="下一句"
                title="下一句"
                disabled={!ready || editing?.disabled}
                onClick={() => stepLine(1)}
              >
                <SkipForward />
              </button>
              <ProgressSlider
                className="transport-progress"
                disabled={!ready || editing?.disabled}
                label="预览进度"
                markers={
                  editing?.scope === "project" && sequence.sceneClips.length > 1
                    ? sequence.sceneClips.slice(1).map((clip) => ({
                        id: clip.clipId,
                        progress: sequence.duration
                          ? clip.startTime / sequence.duration
                          : 0,
                        label:
                          project.acts
                            .flatMap((act) => act.scenes)
                            .find((scene) => scene.id === clip.sceneId)?.name ??
                          clip.sceneId,
                      }))
                    : []
                }
                progress={sequence.duration ? time / sequence.duration : 0}
                onSeek={(progress) => {
                  if (editing && !editing.beforePlayback()) return;
                  previewStopTime.current = undefined;
                  const target = progress * sequence.duration;
                  audio.current?.resetForSeek(target);
                  clock.current.time = target;
                  setTime(target);
                }}
              />
              <output className="text-[10px] text-white/50 font-mono whitespace-nowrap">
                {time.toFixed(1)} / {sequence.duration.toFixed(1)}s
              </output>
              {editing && (
                <CompactSelect
                  label="播放范围"
                  disabled={editing.disabled}
                  value={editing.scope}
                  onValueChange={(v) =>
                    editing.onScopeChange(v as "scene" | "project")
                  }
                  options={[
                    { value: "scene", label: "当前场景" },
                    { value: "project", label: "所有场景" },
                  ]}
                />
              )}
            </PlaybackBar>
          </div>
        }
        filmstrip={editing?.sceneNavigation?.(editing.disabled || playing)}
        script={editing?.script?.(editing.disabled, playing)}
      />
      {editing && canvasScene && (
        <aside
          className={`property-inspector ${inspectorOpen ? "is-open" : ""}`}
          style={{ "--inspector-width": `340px` } as React.CSSProperties}
          aria-label="场景设置面板"
        >
          <CanvasTools
            inspectorOpen={inspectorOpen}
            closeInspector={() => setInspectorOpen(false)}
            toolbarTarget={toolbarTarget}
            revealInspector={() => {
              setInspectorOpen(true);
              if (editing.maximized) editing.toggleMaximize();
            }}
            project={project}
            scene={canvasScene}
            frame={canvasFrame}
            selectedActorId={editing.selectedActorId}
            selectedElement={selectedElement}
            selectActor={selectActor}
            selectElement={selectElement}
            lockedElements={lockedElements}
            toggleLockedElement={(kind) =>
              editing.patch([
                {
                  type: "scene.layer.lock",
                  sceneId: canvasScene.id,
                  layer: kind,
                  locked: !lockedElements[kind],
                },
              ])
            }
            patch={editing.patch}
            change={(id, change) => {
              pauseForEdit();
              return commitActor(id, change);
            }}
            selectTheme={(id) => editing.onSelectTheme(canvasScene.id, id)}
            disabled={editing.disabled || playing || !canvasFrame || !ready}
            onError={onError}
          />
        </aside>
      )}
    </>
  );
}
