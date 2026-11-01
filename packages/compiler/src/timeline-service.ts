import { getSceneTransitionDirection, isDissolveTransition } from "@vnve/core";
import { buildPerformance } from "./performance";
import { compileAnimation, animationDiagnostic } from "./animation";
import { collectCues, type DialogueCue } from "./cues";
import type { CompiledAnimation } from "@vnve/core";
import {
  findSceneAtTime,
  getTextNodeContent,
  resolveSceneProps,
  resolveDialogueProps,
  type Act,
  type ActorState,
  type Diagnostic,
  type DialogueThemeOverrides,
  type Project,
  type ProjectMeta,
  type Scene,
  type SceneTransitionType,
  type ScriptDoc,
  type TextDisplayMode,
  type Timeline,
  type TimelineEvent,
} from "@vnve/core";
import {
  parseTimeline,
  createTimeline,
  span,
  attach,
  masterTime,
  disposeTimeline,
} from "@vnve/parser";
import type { ParseOptions } from "@vnve/parser";
import {
  computeRenderState,
  compileAudioPlan,
  type CompiledAudioPlan,
} from "@vnve/runtime";

export interface TimelineCompileResult {
  timeline: Timeline;
  diagnostics: Diagnostic[];
  eventSourceMap: number[];
  cues: DialogueCue[];
  animations: CompiledAnimation[];
}

export interface SceneTimeRange {
  sceneId: string;
  startTime: number;
  contentStartTime: number;
  endTime: number;
  transitionIn?: { type: SceneTransitionType; duration: number };
}

export interface SceneTimeline {
  renderStartTime?: number;
  renderEndTime?: number;
  sceneId: string;
  events: TimelineEvent[];
  startTime: number;
  contentStartTime: number;
  endTime: number;
  transitionIn?: { type: SceneTransitionType; duration: number };
}

export interface CompiledTransition {
  id: string;
  fromSceneId: string;
  toSceneId: string;
  startTime: number;
  endTime: number;
  effectiveStartTime: number;
  effectiveEndTime: number;
  effect: SceneTransitionType;
}
export interface MultiSceneCompileResult {
  transitions: CompiledTransition[];
  timeline: Timeline;
  diagnostics: Diagnostic[];
  eventSourceMap: number[];
  sceneTimeRanges: SceneTimeRange[];
  sceneTimelines: SceneTimeline[];
  cues: DialogueCue[];
  sceneAnimations: Map<string, CompiledAnimation[]>;
  audioPlan: CompiledAudioPlan;
  inputFingerprint: string;
}

function diagnoseActorReferences(
  script: ScriptDoc,
  actors?: ActorState[],
): Diagnostic[] {
  if (!actors) return [];
  const knownIds = new Set(actors.map((actor) => actor.id));
  const diagnostics: Diagnostic[] = [];
  script.nodes.forEach((node, index) => {
    const missing = new Set<string>();
    const check = (id: unknown, field: string) => {
      if (typeof id !== "string" || !id || knownIds.has(id) || missing.has(id))
        return;
      missing.add(id);
      diagnostics.push({
        level: "error",
        code: "UNKNOWN_ACTOR",
        message: `Actor '${id}' is not in this scene`,
        location: { index, field },
      });
    };
    check(node.actorId, "actorId");
    for (const segment of getTextNodeContent(node)) {
      if (segment.type === "tag" && "actor" in segment.params)
        check(segment.params.actor, "actor");
      if (segment.type === "tag" && "other" in segment.params)
        check(segment.params.other, "other");
    }
  });
  return diagnostics;
}

function buildParseOptions(
  scene?: Partial<Scene>,
  projectMeta?: ProjectMeta,
): ParseOptions | undefined {
  if (!scene) return undefined;

  let autoEntrance: boolean;
  let entranceEffect: string | undefined;
  let defaultDisplayMode: TextDisplayMode | undefined;
  let readingPace: number | undefined;
  let lineGap: number | undefined;

  const fullScene = scene as Scene;
  const sceneProps =
    projectMeta &&
    (fullScene.sceneSettingsLinked ?? fullScene.scenePropsLinked) !== false
      ? resolveSceneProps(fullScene, projectMeta.sceneDefaults)
      : null;
  const dialogueProps =
    projectMeta &&
    (fullScene.sceneSettingsLinked ?? fullScene.dialoguePropsLinked) !== false
      ? resolveDialogueProps(fullScene, projectMeta)
      : null;

  autoEntrance = sceneProps?.autoEntrance ?? scene.autoEntrance ?? true;
  entranceEffect = sceneProps?.entranceEffect ?? scene.entranceEffect;
  defaultDisplayMode =
    dialogueProps?.defaultDisplayMode ?? scene.defaultDisplayMode;
  readingPace =
    dialogueProps?.readingPace ??
    scene.readingPace ??
    projectMeta?.sceneDefaults?.readingPace ??
    projectMeta?.readingPace;
  lineGap =
    dialogueProps?.lineGap ??
    scene.lineGap ??
    projectMeta?.sceneDefaults?.lineGap ??
    projectMeta?.lineGap;
  return {
    autoEntrance,
    defaultEffect: entranceEffect,
    actorDefaults: (scene.actors ?? []).map((a) => ({
      id: a.id,
      x: a.x,
      y: a.y,
      effect: a.entranceEffect,
    })),
    defaultDisplayMode,
    readingPace,
    lineGap,
  };
}

function injectSceneDialogueTheme(
  event: TimelineEvent,
  scene?: Partial<Scene>,
  projectMeta?: ProjectMeta,
): TimelineEvent {
  if (!scene) return event;

  const fullScene = scene as Scene;
  const dialogueProps =
    projectMeta && fullScene.dialoguePropsLinked !== false
      ? resolveDialogueProps(fullScene, projectMeta)
      : null;
  const dialogueThemeId =
    dialogueProps?.dialogueThemeId ?? scene.dialogueThemeId;
  const dialogueThemeOverrides =
    fullScene.dialoguePropsLinked === false
      ? scene.dialogueThemeOverrides
      : dialogueProps &&
          (dialogueProps.dialogueX !== undefined ||
            dialogueProps.dialogueY !== undefined)
        ? {
            ...(dialogueProps.dialogueX !== undefined
              ? { dialogueX: dialogueProps.dialogueX }
              : {}),
            ...(dialogueProps.dialogueY !== undefined
              ? { dialogueY: dialogueProps.dialogueY }
              : {}),
          }
        : undefined;

  if (event.type === "say") {
    const sayParams = { ...event.params };
    if (dialogueThemeId && !sayParams.theme) {
      sayParams.theme = dialogueThemeId;
    }
    if (dialogueThemeOverrides) {
      sayParams.themeOverrides = dialogueThemeOverrides as Record<
        string,
        unknown
      >;
    }
    return { ...event, params: sayParams };
  }

  if (event.type === "narrate") {
    const narrateParams = { ...event.params };
    if (dialogueThemeId && !narrateParams.theme) {
      narrateParams.theme = dialogueThemeId;
    }
    if (dialogueThemeOverrides && !narrateParams.themeOverrides) {
      narrateParams.themeOverrides = dialogueThemeOverrides as Record<
        string,
        unknown
      >;
    }
    return { ...event, params: narrateParams };
  }

  return event;
}

export class TimelineService {
  compileAct(act: Act, projectMeta?: ProjectMeta) {
    return this.compileScenes(act.scenes, projectMeta);
  }
  compileProject(project: Project) {
    return this.compileScenes(
      project.acts.flatMap((a) => a.scenes),
      project.meta,
      project.assets,
    );
  }

  compile(
    sceneId: string,
    script: ScriptDoc,
    scene?: Scene,
    projectMeta?: ProjectMeta,
  ): TimelineCompileResult {
    const result = this.compileScenes(
      [{ ...scene, id: sceneId, script, actors: scene?.actors ?? [] }],
      projectMeta,
    );
    return { ...result, animations: result.sceneAnimations.get(sceneId) ?? [] };
  }
  compileScenes(
    scenes: Array<Pick<Scene, "id" | "script"> & Partial<Scene>>,
    projectMeta?: ProjectMeta,
    assets?: Project["assets"],
    sceneOrder: readonly string[] = scenes.map((s) => s.id),
  ): MultiSceneCompileResult {
    const master = createTimeline();
    master.addLabel("flow", 0);
    const diagnostics: Diagnostic[] = [],
      eventSourceMap: number[] = [],
      events: TimelineEvent[] = [],
      cues: DialogueCue[] = [],
      sceneTimeRanges: SceneTimeRange[] = [],
      sceneTimelines: SceneTimeline[] = [];
    const sceneAnimations = new Map<string, CompiledAnimation[]>();
    const fingerprint = JSON.stringify({
      version: 2,
      meta: projectMeta,
      scenes,
      assets,
      sceneOrder,
    });
    let hash = 2166136261;
    for (let i = 0; i < fingerprint.length; i++)
      hash = Math.imul(hash ^ fingerprint.charCodeAt(i), 16777619);
    const inputFingerprint = (hash >>> 0).toString(16).padStart(8, "0");
    try {
      for (const [index, scene] of scenes.entries()) {
        const animationDurations = new Map<string, number>();
        const placements = scene.script.nodes.flatMap((node) =>
          getTextNodeContent(node).flatMap((segment) =>
            segment.type === "tag" && segment.name === "animation"
              ? [segment]
              : [],
          ),
        );
        for (const clip of scene.animationClips ?? []) {
          const uses = placements.filter(
            (tag) => tag.params.clipId === clip.id,
          );
          if (!uses.length) {
            diagnostics.push({
              level: "warning",
              code: "ANIMATION_UNREFERENCED",
              message: `程序演出「${clip.name}」（${clip.id}）已定义但没有 animation 标签引用，不会播放。请在剧本中插入引用。`,
              location: { sceneId: scene.id, animationId: clip.id },
            });
            continue;
          }
          try {
            if (
              uses.every(
                (tag) =>
                  (tag.params.enabled ?? clip.overrides?.enabled) === false,
              )
            )
              animationDurations.set(clip.id, clip.duration ?? 0);
            else if (clip.duration !== undefined)
              animationDurations.set(clip.id, clip.duration);
            else {
              const positions = [
                ...clip.timelines.flatMap((t) =>
                  t.operations.map((op) => op.position),
                ),
                ...clip.samples.map((s) => s.position),
              ];
              if (
                positions.some(
                  (p) =>
                    typeof p === "object" ||
                    (typeof p === "string" && /^(line:|scene:)/.test(p)),
                )
              )
                throw new Error(
                  `程序演出「${clip.name}」使用台词或场景锚点，请显式设置片段 duration；播放位置由 InlineTag 决定。`,
                );
              const measured = compileAnimation(
                { ...clip, overrides: { ...clip.overrides, enabled: true } },
                [],
                0,
                projectMeta,
                { start: 0, intrinsic: true },
              );
              animationDurations.set(
                clip.id,
                measured.compiled.resolvedDuration,
              );
              disposeTimeline(measured.tree);
            }
          } catch (error) {
            diagnostics.push(animationDiagnostic(error, scene.id));
          }
        }
        const parsed = parseTimeline(scene.script, {
          ...buildParseOptions(scene, projectMeta),
          animationDurations,
          disabledAnimations: new Set(
            scene.animationClips
              ?.filter((c) => c.overrides?.enabled === false)
              .map((c) => c.id),
          ),
        });
        diagnostics.push(
          ...parsed.diagnostics,
          ...diagnoseActorReferences(scene.script, scene.actors),
        );
        const wrapper = createTimeline();
        for (const node of scene.script.nodes)
          for (const tag of getTextNodeContent(node))
            if (tag.type === "tag") {
              const direction = getSceneTransitionDirection(tag);
              if (
                direction &&
                (scene.script.nodes.at(-1) !== node ||
                  getTextNodeContent(node).length !== 1 ||
                  sceneOrder[sceneOrder.indexOf(scene.id) + 1] !==
                    direction.nextScene)
              )
                diagnostics.push({
                  level: "error",
                  code: "WIPE_PLACEMENT_INVALID",
                  message: "场景转场必须独占本场最后一行，并引用紧邻下一场",
                  location: { sceneId: scene.id, nodeId: node.id },
                });
            }
        const previousLast = index
          ? scenes[index - 1].script.nodes.at(-1)
          : undefined;
        const direction = previousLast
          ? getTextNodeContent(previousLast)
              .flatMap((t) =>
                t.type === "tag" ? [getSceneTransitionDirection(t)] : [],
              )
              .find((d) => d?.enabled)
          : undefined;
        const transition =
          direction?.nextScene === scene.id
            ? { type: direction.effect, duration: direction.dur }
            : index
              ? resolveSceneProps(scene as Scene, projectMeta?.sceneDefaults)
                  .transition
              : undefined;
        const transitionDuration = transition?.type
          ? transition.type === "cut"
            ? Math.max(transition.duration ?? 1 / 30, 1 / 30)
            : (transition.duration ?? 0.8)
          : 0;
        const contentDelay =
          transition?.type !== "cut" ? transitionDuration / 2 : 0;
        attach(wrapper, parsed.tree, contentDelay);
        const localEvents = parsed.events.map((e) =>
          injectSceneDialogueTheme(e, scene, projectMeta),
        );
        try {
          computeRenderState(
            localEvents,
            Infinity,
            undefined,
            new Map(
              (scene.actors ?? []).map((a) => [
                a.id,
                {
                  defaultSprite:
                    a.variantId ??
                    assets?.visual.character.find((g) => g.id === a.characterId)
                      ?.defaultVariantId,
                },
              ]),
            ),
          );
        } catch (error) {
          diagnostics.push({
            level: "error",
            code: "EXPRESSION_BLEND_INVALID",
            message: (error as Error).message,
            location: { sceneId: scene.id },
          });
        }
        const eventSpans = localEvents.map((event) =>
          span(
            wrapper,
            event.dur,
            (event.type === "say" ||
            event.type === "narrate" ||
            event.type === "animation"
              ? contentDelay
              : 0) + event.at,
          ),
        );
        const localCues = collectCues(
          { id: scene.id, script: scene.script },
          localEvents,
          parsed.eventSourceMap,
        );
        for (const cue of localCues) {
          wrapper.addLabel(
            `line:${cue.nodeId}:start`,
            contentDelay + cue.start,
          );
          wrapper.addLabel(`line:${cue.nodeId}:end`, contentDelay + cue.end);
        }
        const storyDuration = Math.max(0, wrapper.duration() - contentDelay);
        const animations: CompiledAnimation[] = [];
        for (const [eventIndex, event] of localEvents.entries()) {
          if (event.type !== "animation" && event.type !== "performance")
            continue;
          if (
            event.type === "performance" &&
            (event.params.name === "wipe" ||
              event.params.name === "transition" ||
              event.dur === 0)
          )
            continue;
          let definition;
          try {
            definition =
              event.type === "performance"
                ? buildPerformance(
                    event,
                    { ...scene, actors: scene.actors ?? [] },
                    projectMeta?.width,
                    projectMeta?.height,
                    assets,
                  )
                : scene.animationClips?.find(
                    (clip) => clip.id === event.params.clipId,
                  );
          } catch (error) {
            diagnostics.push(animationDiagnostic(error, scene.id));
            continue;
          }
          if (!definition) continue;
          const { clipId: _, ...overrides } =
            event.type === "animation" ? event.params : {};
          const clip = {
            ...definition,
            id: `${definition.id}@${eventIndex}`,
            duration:
              animationDurations.get(definition.id) || definition.duration,
            overrides: { ...definition.overrides, ...overrides },
          };
          try {
            if (clip.sceneId !== scene.id)
              throw new Error("Animation belongs to another scene");
            for (const target of clip.targets)
              if (
                target.kind === "actor" &&
                !scene.actors?.some((a) => a.id === target.ref)
              )
                throw new Error(`Animation actor ${target.ref} does not exist`);
            for (const node of clip.nodes)
              for (const member of node.attrs.members ?? [])
                if (
                  member.kind === "actor" &&
                  !scene.actors?.some((a) => a.id === member.actorId)
                )
                  throw new Error(
                    `Unknown composition actor ${member.actorId}`,
                  );
            const built = compileAnimation(
              clip,
              localCues,
              storyDuration,
              projectMeta,
              { start: event.at, intrinsic: true },
            );
            for (const previous of animations.filter(
              (c) => c.overrides?.enabled !== false,
            )) {
              const owners = (c: typeof built.compiled) =>
                c.nodes
                  .flatMap((n) => n.attrs.members ?? [])
                  .filter((m) => m.kind !== "visual")
                  .map((m) => JSON.stringify(m));
              if (
                clip.overrides?.enabled !== false &&
                Math.max(previous.start, built.compiled.start) <
                  Math.min(
                    previous.start + previous.resolvedDuration,
                    built.compiled.start + built.compiled.resolvedDuration,
                  ) &&
                owners(built.compiled).some((m) => owners(previous).includes(m))
              )
                throw new Error("Overlapping scene composition ownership");
              for (const t of built.compiled.targets) {
                if (
                  t.kind === "visual" ||
                  t.kind === "mask" ||
                  clip.overrides?.enabled === false
                )
                  continue;
                const pt = previous.targets.find(
                  (p) => p.kind === t.kind && p.ref === t.ref,
                );
                if (
                  pt &&
                  previous.tracks.some(
                    (a) =>
                      a.targetId === pt.id &&
                      built.compiled.tracks.some(
                        (b) => b.targetId === t.id && a.property === b.property,
                      ),
                  ) &&
                  Math.max(previous.start, built.compiled.start) <
                    Math.min(
                      previous.endBehavior === "hold"
                        ? Infinity
                        : previous.start + previous.resolvedDuration,
                      built.compiled.endBehavior === "hold"
                        ? Infinity
                        : built.compiled.start +
                            built.compiled.resolvedDuration,
                    )
                )
                  throw new Error(
                    "Overlapping animation properties across fragments",
                  );
              }
            }
            animations.push(built.compiled);
            if (clip.overrides?.enabled !== false)
              attach(wrapper, built.tree, contentDelay + built.compiled.start);
            else disposeTimeline(built.tree);
          } catch (error) {
            diagnostics.push(animationDiagnostic(error, scene.id));
          }
        }
        sceneAnimations.set(scene.id, animations);
        master.addLabel(
          `scene:${scene.id}:start`,
          `flow+=${transitionDuration / 2}`,
        );
        attach(master, wrapper, `scene:${scene.id}:start`);
        master.addLabel(
          `scene:${scene.id}:content:start`,
          masterTime(wrapper, contentDelay),
        );
        master.addLabel("flow", wrapper.endTime());
        const startTime = masterTime(wrapper),
          contentStartTime = masterTime(wrapper, contentDelay),
          endTime = masterTime(wrapper, wrapper.duration());
        const sceneEvents = localEvents.map((event, i) => ({
          ...event,
          at: masterTime(eventSpans[i]),
        }));
        events.push(...sceneEvents);
        eventSourceMap.push(...parsed.eventSourceMap);
        cues.push(
          ...localCues.map((c) => ({
            ...c,
            start: masterTime(parsed.tree, c.start),
            end: masterTime(parsed.tree, c.end),
            ...(c.voice
              ? {
                  voice: {
                    ...c.voice,
                    start: masterTime(parsed.tree, c.voice.start),
                    end: masterTime(parsed.tree, c.voice.end),
                  },
                }
              : {}),
          })),
        );
        const range = {
          sceneId: scene.id,
          startTime,
          contentStartTime,
          endTime,
          ...(transitionDuration
            ? {
                transitionIn: {
                  type: transition!.type as SceneTransitionType,
                  duration: transitionDuration,
                },
              }
            : {}),
        };
        sceneTimeRanges.push(range);
        sceneTimelines.push({ ...range, events: sceneEvents });
      }
      const transitions: CompiledTransition[] = [];
      for (let i = 1; i < sceneTimelines.length; i++) {
        const next = sceneTimelines[i],
          previous = sceneTimelines[i - 1],
          spec = next.transitionIn;
        if (!spec) continue;
        const window = span(
          master,
          spec.duration,
          isDissolveTransition(spec.type)
            ? next.startTime
            : next.startTime - spec.duration / 2,
        );
        const startTime = masterTime(window),
          endTime = masterTime(window, window.duration());
        const blockedUntil = Math.max(
          startTime,
          ...transitions
            .filter((t) => t.endTime > startTime)
            .map((t) => t.endTime),
        );
        const effective = span(
          master,
          Math.max(0, endTime - blockedUntil),
          blockedUntil,
        );
        next.renderStartTime = Math.min(next.startTime, startTime);
        next.renderEndTime = Math.max(next.endTime, endTime, blockedUntil);
        previous.renderEndTime = Math.max(
          previous.renderEndTime ?? previous.endTime,
          endTime,
        );
        transitions.push({
          id: `transition:${previous.sceneId}->${next.sceneId}`,
          fromSceneId: previous.sceneId,
          toSceneId: next.sceneId,
          startTime,
          endTime,
          effectiveStartTime: masterTime(effective),
          effectiveEndTime: masterTime(effective, effective.duration()),
          effect: spec.type,
        });
      }
      // Numeric event envelopes come from GSAP; the runtime only interpolates data.
      const animated = new Set([
        "show",
        "hide",
        "move",
        "shake",
        "hop",
        "set",
        "flash",
        "vibrate",
        "tint",
        "rotate",
        "zoom",
        "camera-focus",
        "camera-reset",
      ]);
      for (const event of events) {
        if (!animated.has(event.type) || event.dur <= 0) continue;
        const driver = createTimeline(),
          state = { value: 0 };
        driver.to(
          state,
          { value: 1, duration: event.dur, ease: "power2.inOut", lazy: false },
          0,
        );
        attach(master, driver, event.at);
        const progress: number[] = [],
          eased: number[] = [],
          rate = 60;
        for (let i = 0; i < Math.ceil(event.dur * rate) + 1; i++) {
          const time = Math.min(event.dur, i / rate);
          driver.totalTime(time, true);
          progress.push(driver.progress());
          eased.push(state.value);
        }
        event.envelope = { sampleRate: rate, progress, eased };
        disposeTimeline(driver);
      }
      const duration = master.totalDuration();
      const audioPlan = compileAudioPlan(events, duration);
      // Audio intervals are projections of the same GSAP tree, not a second clock.
      for (const voice of audioPlan.voiceSegments) {
        const marker = span(master, voice.end - voice.start, voice.start);
        voice.start = masterTime(marker);
        voice.end = masterTime(marker, marker.duration());
      }
      for (const bgm of audioPlan.bgmSegments) {
        const marker = span(master, bgm.end - bgm.start, bgm.start);
        bgm.start = masterTime(marker);
        bgm.end = masterTime(marker, marker.duration());
      }
      return {
        timeline: { events, duration },
        diagnostics,
        eventSourceMap,
        sceneTimeRanges,
        sceneTimelines,
        cues,
        sceneAnimations,
        audioPlan,
        inputFingerprint,
        transitions,
      };
    } finally {
      disposeTimeline(master);
    }
  }
  findSceneAtTime(
    sceneTimeRanges: SceneTimeRange[],
    time: number,
  ): string | null {
    return findSceneAtTime(sceneTimeRanges, time);
  }
}
