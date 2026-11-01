import {
  type CompiledAnimation,
  collectProjectReferences,
  isDissolveTransition,
  computeTransitionOverlay,
  detectMediaTypeFromExtension,
  extOf,
  findSceneAtTime,
  resolveSceneProps,
  type SceneTransitionType,
  type MediaType,
  type Project,
  type Scene,
  type TimelineEvent,
} from "@vnve/core";
import {
  applyAnimations,
  createDefaultActor,
  computeRenderState,
  type RenderState,
} from "@vnve/runtime";
import type { FrameRendererOptions, ImageMap } from "./konva-renderer";
import { buildSceneTransitionPlan } from "./scene-transition-compositor";
import { buildDefaultTransitionChannels } from "./default-transition-channels";
import { sampleSequenceTransitionChannel } from "./sequence-envelope";
import type {
  SceneShotSurface,
  SceneTransitionPlan,
} from "./scene-transition-channels";
import { DIALOGUE_THEMES, type CustomThemeEntry } from "./themes";

export interface SceneTimeRange {
  sceneId: string;
  startTime: number;
  contentStartTime?: number;
  endTime: number;
  transitionIn?: { type: string; duration: number };
}

export interface ActorDefault {
  id: string;
  zIndex?: number;
  assetType?: "character" | "prop";
  x: number;
  y: number;
  scale: number;
  flipX: boolean;
  visible: boolean;
  defaultSprite: string | null;
}

export interface RenderContext {
  variantUrlsById: Map<string, string>;
  variantMediaTypesById: Map<string, MediaType>;
  variantMediaTypesByUrl: Map<string, MediaType>;
  actorSpriteUrls: Map<string, Map<string, string>>;
  sceneAnimations?: Map<string, CompiledAnimation[]>;
  visualFonts?: Map<string, string>;
  sceneActorDefaults: Map<string, Map<string, ActorDefault>>;
  sceneBackgrounds: Map<string, string | undefined>;
  sceneBackgroundVisibility: Map<string, boolean>;
  sceneBackgroundUrls: Map<string, string>;
  sceneCgs: Map<string, string | undefined>;
  sceneCgVisibility: Map<string, boolean>;
  sceneCgUrls: Map<string, string>;
  sceneBackgroundColors: Map<string, string>;
  sceneDimBrightness: Map<string, number>;
  sceneSpeakerScale: Map<string, boolean>;
  speakerNames: Map<string, string>;
  customThemes: CustomThemeEntry[];
  themeBoxImageUrls: Map<string, string>;
  sceneIds: string[];
  imageUrls: string[];
}

export interface PrepareFrameInputParams {
  sceneTime?: number;
  renderState: RenderState;
  time: number;
  sceneTimeRanges: ReadonlyArray<SceneTimeRange>;
  fallbackSceneId: string | null;
  renderContext: RenderContext;
  imageResolver?: (url: string) => CanvasImageSource | null;
  renderScale?: number;
}

export interface PreparedFrameInput {
  nextRenderState: RenderState;
  imageMap: ImageMap;
  frameOptions: FrameRendererOptions;
  currentSceneId: string | null;
}

export interface SceneTimelineInput {
  sceneId: string;
  events: TimelineEvent[];
  startTime: number;
  contentStartTime: number;
  endTime: number;
  transitionIn?: { type: string; duration: number };
}

export interface TransitionFrameInput {
  outgoing: PreparedFrameInput;
  incoming: PreparedFrameInput;
  compositorPlan: SceneTransitionPlan;
  progress: number;
}

export interface PreparedFrame {
  single?: PreparedFrameInput;
  transition?: TransitionFrameInput;
  currentSceneId: string | null;
}

export { findSceneAtTime, computeTransitionOverlay };

export function createEmptyRenderContext(): RenderContext {
  return {
    variantUrlsById: new Map(),
    variantMediaTypesById: new Map(),
    variantMediaTypesByUrl: new Map(),
    actorSpriteUrls: new Map(),
    sceneAnimations: new Map(),
    sceneActorDefaults: new Map(),
    sceneBackgrounds: new Map(),
    sceneBackgroundVisibility: new Map(),
    sceneBackgroundUrls: new Map(),
    sceneCgs: new Map(),
    sceneCgVisibility: new Map(),
    sceneCgUrls: new Map(),
    sceneBackgroundColors: new Map(),
    sceneDimBrightness: new Map(),
    sceneSpeakerScale: new Map(),
    speakerNames: new Map(),
    customThemes: [],
    themeBoxImageUrls: new Map(),
    sceneIds: [],
    imageUrls: [],
  };
}

function getDefaultVariantId(
  project: Project,
  characterId: string,
): string | null {
  const character = project.assets.visual.character.find(
    (item) => item.id === characterId,
  );
  if (!character) return null;
  if (character.defaultVariantId) {
    const variant = character.variants.find(
      (v) => v.id === character.defaultVariantId,
    );
    if (variant) return variant.id;
  }
  return character.variants[0]?.id ?? null;
}

function resolveVariantMediaType(variant: {
  url: string;
  mediaType?: Project["assets"]["visual"]["character"][number]["variants"][number]["mediaType"];
}) {
  return variant.mediaType ?? detectMediaTypeFromExtension(extOf(variant.url));
}

function buildSceneShotSurface(
  sceneId: string,
  renderContext: RenderContext,
): SceneShotSurface {
  return {
    sceneId,
    backgroundColor: renderContext.sceneBackgroundColors.get(sceneId),
    backgroundAssetId: renderContext.sceneBackgrounds.get(sceneId),
    backgroundVisible:
      renderContext.sceneBackgroundVisibility.get(sceneId) ?? true,
    cgAssetId: renderContext.sceneCgs.get(sceneId),
    cgVisible: renderContext.sceneCgVisibility.get(sceneId) ?? true,
  };
}

function findActiveTransition(
  ranges: ReadonlyArray<SceneTimeRange>,
  time: number,
): {
  effect: string;
  progress: number;
  outgoingSceneId: string | null;
  incomingSceneId: string;
} | null {
  for (let index = 0; index < ranges.length; index += 1) {
    const range = ranges[index];
    if (!range?.transitionIn) continue;
    const duration = range.transitionIn.duration;
    if (duration <= 0) continue;

    const isDissolve = isDissolveTransition(range.transitionIn.type);
    const transStart = isDissolve
      ? range.startTime
      : range.startTime - duration / 2;
    const transEnd = isDissolve
      ? range.startTime + duration
      : range.startTime + duration / 2;
    if (time < transStart || time >= transEnd) continue;

    return {
      effect: range.transitionIn.type,
      progress: (time - transStart) / duration,
      outgoingSceneId: ranges[index - 1]?.sceneId ?? null,
      incomingSceneId: range.sceneId,
    };
  }

  return null;
}

function buildTimelineTransitionPlan(params: {
  effect: string;
  progress: number;
  outgoingSceneId: string;
  incomingSceneId: string;
  renderContext: RenderContext;
}): SceneTransitionPlan {
  const { effect, progress, outgoingSceneId, incomingSceneId, renderContext } =
    params;
  const channels = buildDefaultTransitionChannels(
    effect as SceneTransitionType,
  );
  return buildSceneTransitionPlan({
    effect: effect as SceneTransitionType,
    progress,
    outgoing: buildSceneShotSurface(outgoingSceneId, renderContext),
    incoming: buildSceneShotSurface(incomingSceneId, renderContext),
    sampled: {
      shot: sampleSequenceTransitionChannel(channels.shot, progress),
      dialogue: sampleSequenceTransitionChannel(channels.dialogue, progress),
    },
  });
}

export function buildRenderContext(
  project: Project,
  scenes: Scene[],
  resolvedUrlMap: Map<string, string>,
  compiledAnimations?: Map<string, CompiledAnimation[]>,
): RenderContext {
  const references = collectProjectReferences(project, scenes);
  const imageUrlSet = new Set<string>(
    scenes.flatMap((scene) =>
      scene.dialogueThemeOverrides?.boxImageUrl
        ? [scene.dialogueThemeOverrides.boxImageUrl]
        : [],
    ),
  );
  const variantUrlById = new Map<string, string>();
  const variantMediaTypesById = new Map<string, MediaType>();
  const variantMediaTypesByUrl = new Map<string, MediaType>();
  for (const group of [
    ...project.assets.visual.character,
    ...project.assets.visual.background,
    ...project.assets.visual.prop,
    ...project.assets.visual.cg,
  ]) {
    for (const variant of group.variants) {
      const url = resolvedUrlMap.get(variant.id) ?? variant.url;
      if (url) {
        variantUrlById.set(variant.id, url);
        const mediaType = resolveVariantMediaType(variant);
        variantMediaTypesById.set(variant.id, mediaType);
        if (references.variants.has(variant.id)) {
          variantMediaTypesByUrl.set(url, mediaType);
          imageUrlSet.add(url);
        }
      }
    }
  }

  const characterById = new Map(
    [...project.assets.visual.character, ...project.assets.visual.prop].map(
      (c) => [c.id, c],
    ),
  );

  const actorSpriteUrls = new Map<string, Map<string, string>>();
  const sceneActorDefaults = new Map<string, Map<string, ActorDefault>>();
  const sceneBackgrounds = new Map<string, string | undefined>();
  const sceneBackgroundVisibility = new Map<string, boolean>();
  const sceneBackgroundUrls = new Map<string, string>();
  const sceneCgs = new Map<string, string | undefined>();
  const sceneCgVisibility = new Map<string, boolean>();
  const sceneCgUrls = new Map<string, string>();
  const sceneBackgroundColors = new Map<string, string>();
  const sceneDimBrightness = new Map<string, number>();
  const sceneSpeakerScale = new Map<string, boolean>();
  const speakerNames = new Map<string, string>();
  const characterSubjectsById = new Map(
    project.visualSubjects
      .filter((subject) => subject.type === "character")
      .map((subject) => [subject.id, subject]),
  );
  const customThemes: CustomThemeEntry[] = project.assets.themes.map(
    (theme) => ({
      id: theme.id,
      name: theme.name,
      baseThemeId: theme.baseThemeId,
      data: theme.data as Record<string, unknown>,
    }),
  );
  const themeBoxImageUrls = new Map<string, string>();
  const sceneIds: string[] = [];

  for (const scene of scenes) {
    sceneIds.push(scene.id);
    const resolvedSceneProps = resolveSceneProps(
      scene,
      project.meta.sceneDefaults,
    );

    const actorDefaults = new Map<string, ActorDefault>();
    for (const actor of scene.actors) {
      const character = characterById.get(actor.characterId);
      if (character) {
        const variantUrls = new Map<string, string>();
        for (const variant of character.variants) {
          const url = resolvedUrlMap.get(variant.id) ?? variant.url;
          if (!url) continue;
          variantUrls.set(variant.id, url);
          if (references.variants.has(variant.id)) imageUrlSet.add(url);
        }
        if (variantUrls.size > 0) {
          actorSpriteUrls.set(actor.id, variantUrls);
        }
      }

      const subject = actor.visualSubjectId
        ? characterSubjectsById.get(actor.visualSubjectId)
        : undefined;
      const speakerName = subject?.name ?? character?.name;
      if (speakerName) speakerNames.set(actor.id, speakerName);

      const defaultSprite =
        actor.variantId || getDefaultVariantId(project, actor.characterId);
      actorDefaults.set(actor.id, {
        id: actor.id,
        zIndex: actor.zIndex,
        assetType: actor.assetType ?? "character",
        x: actor.x,
        y: actor.y,
        scale: actor.scale,
        flipX: actor.flipX ?? false,
        visible: actor.visible ?? true,
        defaultSprite,
      });
    }
    sceneActorDefaults.set(scene.id, actorDefaults);

    sceneBackgrounds.set(scene.id, scene.backgroundId);
    sceneBackgroundVisibility.set(scene.id, scene.backgroundVisible ?? true);
    if (scene.backgroundId) {
      const bgUrl = variantUrlById.get(scene.backgroundId);
      if (bgUrl) {
        sceneBackgroundUrls.set(scene.id, bgUrl);
        imageUrlSet.add(bgUrl);
      }
    }
    sceneCgs.set(scene.id, scene.cgId);
    sceneCgVisibility.set(scene.id, scene.cgVisible ?? true);
    if (scene.cgId) {
      const cgUrl = variantUrlById.get(scene.cgId);
      if (cgUrl) {
        sceneCgUrls.set(scene.id, cgUrl);
        imageUrlSet.add(cgUrl);
      }
    }

    if (resolvedSceneProps.backgroundColor) {
      sceneBackgroundColors.set(scene.id, resolvedSceneProps.backgroundColor);
    }
    sceneDimBrightness.set(scene.id, resolvedSceneProps.dimBrightness);
    sceneSpeakerScale.set(scene.id, resolvedSceneProps.speakerScale);
  }

  for (const theme of DIALOGUE_THEMES) {
    if (theme.boxImageUrl) {
      themeBoxImageUrls.set(theme.id, theme.boxImageUrl);
      if (references.themes.has(theme.id)) imageUrlSet.add(theme.boxImageUrl);
    }
  }

  for (const theme of project.assets.themes) {
    if (theme.data.boxImageUrl) {
      const url =
        resolvedUrlMap.get(theme.data.boxImageAssetId ?? "") ??
        theme.data.boxImageUrl;
      themeBoxImageUrls.set(theme.id, url);
      if (references.themes.has(theme.id)) imageUrlSet.add(url);
    }
  }

  return {
    variantUrlsById: variantUrlById,
    variantMediaTypesById,
    variantMediaTypesByUrl,
    actorSpriteUrls,
    sceneAnimations: compiledAnimations ?? new Map(),
    sceneActorDefaults,
    sceneBackgrounds,
    sceneBackgroundVisibility,
    sceneBackgroundUrls,
    sceneCgs,
    sceneCgVisibility,
    sceneCgUrls,
    sceneBackgroundColors,
    sceneDimBrightness,
    sceneSpeakerScale,
    speakerNames,
    customThemes,
    themeBoxImageUrls,
    sceneIds,
    imageUrls: [...imageUrlSet],
  };
}

export function prepareFrameInput(
  params: PrepareFrameInputParams,
): PreparedFrameInput {
  const {
    renderState,
    time,
    sceneTimeRanges,
    fallbackSceneId,
    renderContext,
    imageResolver,
    renderScale,
  } = params;

  let nextRenderState: RenderState = {
    ...renderState,
    actors: renderState.actors.map((actor) => ({ ...actor })),
    dialogue: renderState.dialogue ? { ...renderState.dialogue } : null,
    narration: renderState.narration ? { ...renderState.narration } : null,
  };

  const transitionOverlay =
    sceneTimeRanges.length > 0
      ? findActiveTransition(sceneTimeRanges, time)
      : null;

  const timelineSceneId =
    sceneTimeRanges.length > 0
      ? findSceneAtTime(sceneTimeRanges, time)
      : fallbackSceneId;
  const currentSceneId = timelineSceneId;

  if (currentSceneId) {
    const defaults = renderContext.sceneActorDefaults.get(currentSceneId);
    if (defaults) {
      nextRenderState.actors = nextRenderState.actors.filter((actor) =>
        defaults.has(actor.id),
      );
      {
        for (const def of defaults.values()) {
          if (
            def.visible &&
            !nextRenderState.actors.some((actor) => actor.id === def.id)
          ) {
            nextRenderState.actors.push({
              ...createDefaultActor(def.id),
              x: def.x,
              y: def.y,
              visible: true,
              opacity: 1,
            });
          }
        }
      }
      nextRenderState.actors.sort(
        (left, right) =>
          (defaults.get(left.id)?.zIndex ?? 0) -
          (defaults.get(right.id)?.zIndex ?? 0),
      );
      for (const actor of nextRenderState.actors) {
        const def = defaults.get(actor.id);
        if (!def) continue;
        actor.scale *= def.scale;
        actor.flipX = def.flipX;
        if (!actor.sprite && def.defaultSprite) {
          actor.sprite = def.defaultSprite;
        }
      }
    }
  }
  if (currentSceneId) {
    const range = sceneTimeRanges.find(
      (range) => range.sceneId === currentSceneId,
    );
    nextRenderState = applyAnimations(
      nextRenderState,
      renderContext.sceneAnimations?.get(currentSceneId ?? "") ?? [],
      params.sceneTime ??
        time - (range?.contentStartTime ?? range?.startTime ?? 0),
    );
  }

  // RenderState already reflects compiled event timing for this frame, so we only
  // normalize speaker names here and do not infer any transition-window speech.
  if (nextRenderState.dialogue) {
    const mappedName = renderContext.speakerNames.get(
      nextRenderState.dialogue.speaker,
    );
    if (mappedName) {
      nextRenderState.dialogue.speaker = mappedName;
    }
  }

  const backgroundVisible = currentSceneId
    ? (renderContext.sceneBackgroundVisibility.get(currentSceneId) ?? true)
    : true;
  const cgVisible = currentSceneId
    ? (renderContext.sceneCgVisibility.get(currentSceneId) ?? true)
    : true;

  if (!backgroundVisible) {
    nextRenderState.background = null;
  }
  if (!cgVisible) {
    nextRenderState.cg = null;
  }

  const actors = new Map<string, CanvasImageSource>();
  const actorPrevious = new Map<string, CanvasImageSource>();
  if (imageResolver) {
    for (const actor of nextRenderState.actors) {
      if (!actor.sprite) continue;
      const spriteUrl =
        renderContext.actorSpriteUrls.get(actor.id)?.get(actor.sprite) ??
        renderContext.variantUrlsById.get(actor.sprite);
      if (!spriteUrl) continue;
      const image = imageResolver(spriteUrl);
      if (image) actors.set(actor.id, image);
      if (actor.previousSprite) {
        const previousUrl =
          renderContext.actorSpriteUrls
            .get(actor.id)
            ?.get(actor.previousSprite) ??
          renderContext.variantUrlsById.get(actor.previousSprite);
        if (!previousUrl) continue;
        const previousImage = imageResolver(previousUrl);
        if (previousImage) actorPrevious.set(actor.id, previousImage);
      }
    }
  }

  const variantImages = new Map<string, CanvasImageSource>();
  const resolveVariantImage = (
    variantId: string | undefined,
  ): CanvasImageSource | null => {
    if (!variantId || !imageResolver) return null;
    const cached = variantImages.get(variantId);
    if (cached) return cached;
    const url = renderContext.variantUrlsById.get(variantId);
    if (!url) return null;
    const image = imageResolver(url);
    if (!image) return null;
    variantImages.set(variantId, image);
    return image;
  };

  for (const actor of nextRenderState.actors)
    for (const mix of actor.spriteMix ?? []) resolveVariantImage(mix.variant);
  for (const visual of nextRenderState.visuals ?? [])
    for (const node of visual.nodes) {
      resolveVariantImage(node.attrs.assetId);
      resolveVariantImage(node.attrs.mask?.assetId);
      for (const p of node.attrs.particles ?? [])
        resolveVariantImage(p.assetId);
    }
  const outgoingShotSurface = transitionOverlay
    ? buildSceneShotSurface(
        transitionOverlay.outgoingSceneId ??
          currentSceneId ??
          transitionOverlay.incomingSceneId,
        renderContext,
      )
    : null;
  const incomingShotSurface = transitionOverlay
    ? buildSceneShotSurface(transitionOverlay.incomingSceneId, renderContext)
    : null;

  for (const surface of [outgoingShotSurface, incomingShotSurface]) {
    if (!surface) continue;
    if (surface.backgroundVisible !== false) {
      resolveVariantImage(surface.backgroundAssetId);
    }
    if (surface.cgVisible !== false) {
      resolveVariantImage(surface.cgAssetId);
    }
  }

  let background: CanvasImageSource | null = null;
  let cg: CanvasImageSource | null = null;

  if (backgroundVisible && nextRenderState.background?.asset) {
    background = resolveVariantImage(nextRenderState.background.asset);
    if (nextRenderState.background.previousAsset) {
      resolveVariantImage(nextRenderState.background.previousAsset);
    }
  }
  if (backgroundVisible && !background && currentSceneId && imageResolver) {
    const backgroundUrl = renderContext.sceneBackgroundUrls.get(currentSceneId);
    if (backgroundUrl) {
      background = imageResolver(backgroundUrl);
    }
  }

  if (cgVisible && nextRenderState.cg?.asset) {
    cg = resolveVariantImage(nextRenderState.cg.asset);
    if (nextRenderState.cg.previousAsset) {
      resolveVariantImage(nextRenderState.cg.previousAsset);
    }
  }
  if (cgVisible && !cg && currentSceneId && imageResolver) {
    const cgUrl = renderContext.sceneCgUrls.get(currentSceneId);
    if (cgUrl) {
      cg = imageResolver(cgUrl);
    }
  }

  let dialogueBoxImage: CanvasImageSource | null = null;
  if (imageResolver) {
    const dialogueThemeId =
      nextRenderState.dialogue?.theme ?? nextRenderState.narration?.theme;
    if (dialogueThemeId) {
      const boxUrl = renderContext.themeBoxImageUrls.get(dialogueThemeId);
      if (boxUrl) {
        dialogueBoxImage = imageResolver(boxUrl);
      }
    }
  }

  const frameOptions: FrameRendererOptions = {
    customThemes: renderContext.customThemes,
    visualFonts: renderContext.visualFonts,
    ...(dialogueBoxImage ? { dialogueBoxImage } : {}),
    ...(currentSceneId &&
    renderContext.sceneBackgroundColors.get(currentSceneId)
      ? {
          backgroundColor:
            renderContext.sceneBackgroundColors.get(currentSceneId)!,
        }
      : {}),
    ...(currentSceneId && renderContext.sceneDimBrightness.has(currentSceneId)
      ? { dimBrightness: renderContext.sceneDimBrightness.get(currentSceneId)! }
      : {}),
    ...(currentSceneId && renderContext.sceneSpeakerScale.has(currentSceneId)
      ? { speakerScale: renderContext.sceneSpeakerScale.get(currentSceneId)! }
      : {}),
    ...(transitionOverlay
      ? {
          transition: {
            effect: transitionOverlay.effect,
            progress: transitionOverlay.progress,
            outgoingSceneId: transitionOverlay.outgoingSceneId,
            incomingSceneId: transitionOverlay.incomingSceneId,
            compositorPlan: buildTimelineTransitionPlan({
              effect: transitionOverlay.effect,
              progress: transitionOverlay.progress,
              outgoingSceneId: outgoingShotSurface!.sceneId,
              incomingSceneId: incomingShotSurface!.sceneId,
              renderContext,
            }),
          },
        }
      : {}),
    ...(renderScale !== undefined ? { renderScale } : {}),
  };

  return {
    nextRenderState,
    imageMap: {
      actors,
      ...(actorPrevious.size > 0 ? { actorPrevious } : {}),
      background,
      cg,
      ...(variantImages.size > 0 ? { layerVariants: variantImages } : {}),
    },
    frameOptions,
    currentSceneId,
  };
}

export function prepareFrame(params: {
  time: number;
  sceneTimelines: ReadonlyArray<SceneTimelineInput>;
  renderContext: RenderContext;
  imageResolver?: (url: string) => CanvasImageSource | null;
  renderScale?: number;
}): PreparedFrame {
  const { time, sceneTimelines, renderContext, imageResolver, renderScale } =
    params;

  // Build SceneTimeRange-compatible array from sceneTimelines
  const ranges: SceneTimeRange[] = sceneTimelines.map((st) => ({
    sceneId: st.sceneId,
    startTime: st.startTime,
    endTime: st.endTime,
    transitionIn: st.transitionIn as any,
  }));

  // Check for active transition
  const transitionOverlay = findActiveTransition(ranges, time);

  if (transitionOverlay) {
    const incomingIdx = sceneTimelines.findIndex(
      (st) => st.sceneId === transitionOverlay.incomingSceneId,
    );
    const outgoingIdx = transitionOverlay.outgoingSceneId
      ? sceneTimelines.findIndex(
          (st) => st.sceneId === transitionOverlay.outgoingSceneId,
        )
      : incomingIdx - 1;

    const incomingST = sceneTimelines[incomingIdx];
    const outgoingST = outgoingIdx >= 0 ? sceneTimelines[outgoingIdx] : null;

    if (incomingST) {
      // Compute render states independently
      const incomingRenderState = computeRenderState(
        incomingST.events,
        time,
        undefined,
        renderContext.sceneActorDefaults.get(incomingST.sceneId),
      );
      const outgoingRenderState = outgoingST
        ? computeRenderState(
            outgoingST.events,
            time,
            undefined,
            renderContext.sceneActorDefaults.get(outgoingST.sceneId),
          )
        : incomingRenderState;

      const outgoingSceneId = outgoingST?.sceneId ?? incomingST.sceneId;
      const incomingSceneId = incomingST.sceneId;

      // Build compositor plan
      const compositorPlan = buildTimelineTransitionPlan({
        effect: transitionOverlay.effect,
        progress: transitionOverlay.progress,
        outgoingSceneId,
        incomingSceneId,
        renderContext,
      });

      // Prepare frame inputs for each scene — pass empty sceneTimeRanges so
      // prepareFrameInput uses fallbackSceneId instead of the global timeline lookup.
      const outgoing = prepareFrameInput({
        renderState: outgoingRenderState,
        time,
        sceneTime:
          time - (outgoingST?.contentStartTime ?? incomingST.contentStartTime),
        sceneTimeRanges: [],
        fallbackSceneId: outgoingSceneId,
        renderContext,
        imageResolver,
        renderScale,
      });

      const incoming = prepareFrameInput({
        renderState: incomingRenderState,
        time,
        sceneTime: time - incomingST.contentStartTime,
        sceneTimeRanges: [],
        fallbackSceneId: incomingSceneId,
        renderContext,
        imageResolver,
        renderScale,
      });

      return {
        transition: {
          outgoing,
          incoming,
          compositorPlan,
          progress: transitionOverlay.progress,
        },
        currentSceneId: incomingSceneId,
      };
    }
  }

  // No transition — single scene
  const currentSceneId = findSceneAtTime(ranges, time);
  const currentST = sceneTimelines.find((st) => st.sceneId === currentSceneId);
  const events = currentST?.events ?? [];
  const renderState = computeRenderState(
    events,
    time,
    undefined,
    currentSceneId
      ? renderContext.sceneActorDefaults.get(currentSceneId)
      : undefined,
  );

  const single = prepareFrameInput({
    renderState,
    time,
    sceneTimeRanges: ranges,
    fallbackSceneId: currentSceneId,
    renderContext,
    imageResolver,
    renderScale,
  });

  return {
    single,
    currentSceneId,
  };
}
