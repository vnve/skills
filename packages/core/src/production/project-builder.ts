import type {
  Project,
  Act,
  Scene,
  ActorState,
  AssetGroup,
  AssetVariant,
  VisualSubject,
  ScriptGenerationResult,
  GeneratedAct,
  GeneratedScene,
  GeneratedLine,
  GeneratedStageDirection,
  InlineTag,
  RichContent,
  TextNode,
} from "../index";
import type { CreateProjectOptions } from "../index";
import {
  createId,
  createDefaultProject,
  DEFAULT_VARIANT_KEY,
  inferVariantKey,
  isDefaultVariantToken,
} from "../index";
import {
  generatePlaceholderCharacter,
  generatePlaceholderBackground,
  isPlaceholderUrl,
} from "./placeholders";
import { getSlotPositions, type SlotName } from "./stage";

/** Locale-specific labels are supplied by the host; project construction is browser independent. */
export function createProjectBuilder(
  defaultVariantName: () => string = () => "Default",
  placeholders = {
    generatePlaceholderCharacter,
    generatePlaceholderBackground,
    isPlaceholderUrl,
  },
) {
  const {
    generatePlaceholderCharacter,
    generatePlaceholderBackground,
    isPlaceholderUrl,
  } = placeholders;
  // ---------------------------------------------------------------------------
  // Public interface
  // ---------------------------------------------------------------------------

  interface CharacterPlaceholderVariant {
    name: string;
    url: string;
  }

  function createBoundVisualSubject(
    type: VisualSubject["type"],
    name: string,
    group: AssetGroup,
    options: { description?: string; gender?: "male" | "female" } = {},
  ): VisualSubject {
    const states = group.variants.map((variant) => ({
      id: createId(),
      name: variant.name,
    }));
    const defaultIndex = Math.max(
      0,
      group.variants.findIndex(
        (variant) => variant.id === group.defaultVariantId,
      ),
    );
    const defaultStateId =
      states[defaultIndex]?.id ?? states[0]?.id ?? createId();
    const base = {
      id: createId(),
      name,
      ...(options.description?.trim()
        ? { description: options.description.trim() }
        : {}),
      states,
      defaultStateId,
      binding: {
        assetGroupId: group.id,
        stateMap: Object.fromEntries(
          states.map((state, index) => [
            state.id,
            group.variants[index]?.id ?? group.defaultVariantId,
          ]),
        ),
      },
    };
    if (type === "character") {
      return {
        ...base,
        type,
        ...(options.gender ? { gender: options.gender } : {}),
      };
    }
    return { ...base, type };
  }

  // ---------------------------------------------------------------------------
  // Actor positioning — count-aware slot placement
  // ---------------------------------------------------------------------------

  const ACTOR_SLOT_LAYOUTS: Record<number, SlotName[]> = {
    1: ["center"],
    2: ["left", "right"],
    3: ["left", "center", "right"],
    4: ["support-left", "left", "right", "support-right"],
    5: ["support-left", "left", "center", "right", "support-right"],
  };

  function normalizeAssetName(name: string): string {
    return name.normalize("NFKC").trim().toLowerCase().replace(/\s+/g, " ");
  }

  function normalizeNameToken(name: string): string {
    return name.normalize("NFKC").trim().toLowerCase().replace(/\s+/g, "");
  }

  function isNarratorLikeName(name: string): boolean {
    const normalized = normalizeNameToken(name);
    return (
      normalized === "narrator" ||
      normalized === "narration" ||
      normalized === "ナレーター" ||
      normalized === "ナレーション" ||
      normalized === "旁白" ||
      normalized === "叙述者" ||
      normalized === "narrateur" ||
      normalized === "narrador" ||
      normalized === "erzähler"
    );
  }

  function normalizeAiVariant(value?: string): string | undefined {
    if (!value) return undefined;
    if (isDefaultVariantToken(value)) return "default";
    return value.trim();
  }

  function normalizeVariantName(name: string): string {
    return name.normalize("NFKC").trim().toLowerCase().replace(/\s+/g, " ");
  }

  function hasRealVariant(group: AssetGroup): boolean {
    return group.variants.some((variant) => !isPlaceholderUrl(variant.url));
  }

  function getActorSlotPosition(
    index: number,
    actorCount: number,
    canvasWidth = 1920,
    canvasHeight = 1080,
  ): Pick<ActorState, "x" | "y"> {
    const layout =
      ACTOR_SLOT_LAYOUTS[Math.min(Math.max(actorCount, 1), 5)] ??
      ACTOR_SLOT_LAYOUTS[5];
    const slotName = layout[index] ?? layout[layout.length - 1] ?? "center";
    return getSlotPositions(canvasWidth, canvasHeight)[slotName];
  }

  function findReusableGroup(
    groups: AssetGroup[] | undefined,
    name: string,
  ): AssetGroup | undefined {
    if (!groups?.length) return undefined;
    const normalizedName = normalizeAssetName(name);
    const matches = groups.filter(
      (group) => normalizeAssetName(group.name) === normalizedName,
    );
    if (matches.length === 0) return undefined;
    return matches.find(hasRealVariant) ?? matches[0];
  }

  function collectRequestedCharacterVariantsByName(
    result: ScriptGenerationResult,
  ): Map<string, string[]> {
    const variantsByName = new Map<string, Set<string>>();

    for (const character of result.characters) {
      if (!isNarratorLikeName(character.name)) {
        variantsByName.set(character.name, new Set<string>());
      }
    }

    const characterNameByNormalized = new Map(
      Array.from(variantsByName.keys()).map(
        (name) => [normalizeNameToken(name), name] as const,
      ),
    );

    const addVariant = (
      characterName: string | undefined,
      variantName: string | undefined,
    ) => {
      if (!characterName || isNarratorLikeName(characterName)) return;
      const normalizedVariant = normalizeAiVariant(variantName);
      if (!normalizedVariant || normalizedVariant === "default") return;
      const key =
        characterNameByNormalized.get(normalizeNameToken(characterName)) ??
        characterName;
      if (!variantsByName.has(key)) variantsByName.set(key, new Set<string>());
      variantsByName.get(key)?.add(normalizedVariant);
    };

    for (const act of result.acts) {
      for (const scene of act.scenes) {
        for (const line of scene.lines) {
          addVariant(line.speaker, line.variant);
          for (const direction of line.directions ?? []) {
            if (direction.name !== "set") continue;
            addVariant(direction.params.target, direction.params.variant);
          }
        }
      }
    }

    return new Map(
      Array.from(variantsByName.entries()).map(([name, variants]) => [
        name,
        Array.from(variants),
      ]),
    );
  }

  function collectRequestedBackgroundVariantsByName(
    result: ScriptGenerationResult,
  ): Map<string, string[]> {
    const variantsByName = new Map<string, Map<string, string>>();

    for (const background of result.backgrounds) {
      variantsByName.set(background.name, new Map<string, string>());
    }

    for (const act of result.acts) {
      for (const scene of act.scenes) {
        const rawVariant = scene.backgroundVariant?.trim();
        if (!rawVariant) continue;
        const backgroundVariants = variantsByName.get(scene.background);
        if (!backgroundVariants) continue;
        backgroundVariants.set(normalizeVariantName(rawVariant), rawVariant);
      }
    }

    return new Map(
      Array.from(variantsByName.entries()).map(([name, variants]) => [
        name,
        Array.from(variants.values()),
      ]),
    );
  }

  function buildPlaceholderCharacterVariants(
    characterName: string,
    characterIndex: number,
    requestedVariants: string[],
    gender?: "male" | "female",
  ): CharacterPlaceholderVariant[] {
    return requestedVariants.map((variantName, variantIndex) => ({
      name: variantName,
      url: generatePlaceholderCharacter(
        characterName,
        characterIndex + variantIndex + 1,
        gender,
      ),
    }));
  }

  function ensureCharacterGroupVariants(
    group: AssetGroup,
    characterName: string,
    characterIndex: number,
    requestedVariants: string[],
    gender?: "male" | "female",
  ): AssetGroup {
    if (requestedVariants.length === 0) return group;

    const existingVariantNames = new Set(
      group.variants.map((variant) => normalizeVariantName(variant.name)),
    );
    const missingVariants = buildPlaceholderCharacterVariants(
      characterName,
      characterIndex,
      requestedVariants.filter(
        (variantName) =>
          !existingVariantNames.has(normalizeVariantName(variantName)),
      ),
      gender,
    );
    if (missingVariants.length === 0) return group;

    return {
      ...group,
      variants: [
        ...group.variants,
        ...missingVariants.map((variant) => ({
          id: createId(),
          key: inferVariantKey(variant.name),
          name: variant.name,
          url: variant.url,
        })),
      ],
    };
  }

  function buildPlaceholderBackgroundVariants(
    backgroundName: string,
    backgroundIndex: number,
    requestedVariants: string[],
  ): AssetVariant[] {
    return requestedVariants.map((variantName, variantIndex) => ({
      id: createId(),
      key: inferVariantKey(variantName),
      name: variantName,
      url: generatePlaceholderBackground(
        backgroundName,
        backgroundIndex * 100 + variantIndex + 1,
      ),
    }));
  }

  function ensureBackgroundGroupVariants(
    group: AssetGroup,
    backgroundName: string,
    backgroundIndex: number,
    requestedVariants: string[],
  ): AssetGroup {
    if (requestedVariants.length === 0) return group;

    const existingVariantNames = new Set(
      group.variants.map((variant) => normalizeVariantName(variant.name)),
    );
    const missingVariants = requestedVariants.filter(
      (variantName) =>
        !existingVariantNames.has(normalizeVariantName(variantName)),
    );
    if (missingVariants.length === 0) return group;

    return {
      ...group,
      variants: [
        ...group.variants,
        ...buildPlaceholderBackgroundVariants(
          backgroundName,
          backgroundIndex,
          missingVariants,
        ),
      ],
    };
  }

  function createSceneActorResolver(
    sceneActorIdByCharacterId: Map<string, string>,
    characterIdsByName: Map<string, string>,
  ): (value: string) => string {
    const sceneActorIdByNormalizedName = new Map<string, string>();

    for (const [name, characterId] of characterIdsByName) {
      const sceneActorId = sceneActorIdByCharacterId.get(characterId);
      if (!sceneActorId) continue;
      sceneActorIdByNormalizedName.set(normalizeNameToken(name), sceneActorId);
    }

    return (value: string) =>
      sceneActorIdByCharacterId.get(value) ??
      sceneActorIdByNormalizedName.get(normalizeNameToken(value)) ??
      value;
  }

  function sanitizeGeneratedScript(
    result: ScriptGenerationResult,
  ): ScriptGenerationResult {
    return {
      ...result,
      characters: result.characters.filter(
        (character) => !isNarratorLikeName(character.name),
      ),
      acts: result.acts.map((act) => ({
        ...act,
        scenes: act.scenes.map((scene) => ({
          ...scene,
          lines: scene.lines.map((line) =>
            line.speaker && isNarratorLikeName(line.speaker)
              ? {
                  text: line.text,
                  ...(line.directions ? { directions: line.directions } : {}),
                }
              : line,
          ),
        })),
      })),
    };
  }

  function buildCharacterVariantIdLookup(
    groups: AssetGroup[],
  ): Map<string, Map<string, string>> {
    return new Map(
      groups.map(
        (group) =>
          [
            group.id,
            new Map([
              ...group.variants.map(
                (variant) =>
                  [normalizeVariantName(variant.name), variant.id] as const,
              ),
              [
                normalizeVariantName("default"),
                group.defaultVariantId,
              ] as const,
            ]),
          ] as const,
      ),
    );
  }

  function buildSceneScript(
    lines: GeneratedLine[],
    resolveSceneActorId: (value: string) => string,
    actorVariantIdsByActorId: Map<string, Map<string, string>>,
  ): { nodes: TextNode[] } {
    const currentVariantByActorId = new Map<string, string>();

    return {
      nodes: lines.map((line) => {
        const actorId =
          line.speaker && !isNarratorLikeName(line.speaker)
            ? resolveSceneActorId(line.speaker)
            : undefined;
        const nextVariant = actorId
          ? normalizeAiVariant(line.variant)
          : undefined;
        const previousVariant = actorId
          ? (currentVariantByActorId.get(actorId) ?? "default")
          : "default";
        const orderedDirections = (line.directions ?? [])
          .filter(
            (direction) => (direction.textOffset ?? 0) <= line.text.length,
          )
          .slice()
          .sort((a, b) => (a.textOffset ?? 0) - (b.textOffset ?? 0));
        const directionTags = orderedDirections.map((direction) => {
          const tag = resolveGeneratedStageDirection(
            direction,
            resolveSceneActorId,
            actorVariantIdsByActorId,
          );
          if (direction.name === "set") {
            const targetId = resolveSceneActorId(direction.params.target);
            const setVariant = normalizeAiVariant(direction.params.variant);
            if (setVariant) {
              currentVariantByActorId.set(targetId, setVariant);
            }
          }
          return tag;
        });
        const hasSetForSpeaker = Boolean(
          actorId &&
          directionTags.some(
            (tag) => tag.name === "set" && tag.params.target === actorId,
          ),
        );
        let variantTag: InlineTag | undefined;

        if (
          actorId &&
          !hasSetForSpeaker &&
          nextVariant &&
          nextVariant !== previousVariant
        ) {
          const variantId =
            actorVariantIdsByActorId
              .get(actorId)
              ?.get(normalizeVariantName(nextVariant)) ?? nextVariant;
          variantTag = {
            type: "tag",
            name: "set",
            params: {
              target: actorId,
              variant: variantId,
            },
          };
          currentVariantByActorId.set(actorId, nextVariant);
        }

        let content: RichContent[] | undefined;
        if (directionTags.length > 0 || variantTag) {
          const segments: RichContent[] = variantTag ? [variantTag] : [];
          let cursor = 0;
          directionTags.forEach((tag, index) => {
            const offset = orderedDirections[index].textOffset ?? 0;
            if (offset > cursor)
              segments.push({
                type: "text",
                text: line.text.slice(cursor, offset),
              });
            segments.push(tag);
            cursor = offset;
          });
          if (cursor < line.text.length)
            segments.push({ type: "text", text: line.text.slice(cursor) });
          content = segments;
        }

        return {
          id: createId(),
          type: "text" as const,
          text: line.text,
          ...(actorId ? { actorId } : {}),
          ...(content ? { content } : {}),
        };
      }),
    };
  }

  function resolveGeneratedStageDirection(
    direction: GeneratedStageDirection,
    resolveSceneActorId: (value: string) => string,
    actorVariantIdsByActorId: Map<string, Map<string, string>>,
  ): InlineTag {
    if (direction.name === "set") {
      const targetId = resolveSceneActorId(direction.params.target);
      const nextVariant = normalizeAiVariant(direction.params.variant);
      const variantId =
        nextVariant && nextVariant !== "default"
          ? (actorVariantIdsByActorId
              .get(targetId)
              ?.get(normalizeVariantName(nextVariant)) ?? nextVariant)
          : (actorVariantIdsByActorId
              .get(targetId)
              ?.get(normalizeVariantName("default")) ??
            direction.params.variant);
      return {
        type: "tag",
        name: "set",
        params: {
          ...direction.params,
          target: targetId,
          variant: variantId,
        },
      };
    }

    if (direction.name === "camera") {
      const params = { ...direction.params };
      for (const field of [
        "actor",
        "other",
        "fromTarget",
        "toTarget",
      ] as const) {
        const value = params[field];
        if (typeof value === "string" && !value.startsWith("$"))
          params[field] = resolveSceneActorId(value);
      }
      return { type: "tag", name: "camera", params };
    }

    if (
      "actor" in direction.params &&
      typeof direction.params.actor === "string"
    ) {
      return {
        type: "tag",
        name: direction.name,
        params: {
          ...direction.params,
          actor: resolveSceneActorId(direction.params.actor),
        },
      } as InlineTag;
    }

    return {
      type: "tag",
      name: direction.name,
      params: direction.params,
    } as InlineTag;
  }

  function collectGeneratedSceneCharacterNames(
    lines: GeneratedLine[],
  ): string[] {
    const names: string[] = [];
    for (const line of lines) {
      if (line.speaker && !isNarratorLikeName(line.speaker))
        names.push(line.speaker);
      for (const direction of line.directions ?? []) {
        const actor =
          "actor" in direction.params ? direction.params.actor : undefined;
        if (typeof actor === "string" && !isNarratorLikeName(actor))
          names.push(actor);
        if (direction.name === "camera")
          for (const field of ["other", "fromTarget", "toTarget"] as const) {
            const value = direction.params[field];
            if (
              typeof value === "string" &&
              !value.startsWith("$") &&
              !isNarratorLikeName(value)
            )
              names.push(value);
          }
        if (
          direction.name === "set" &&
          !isNarratorLikeName(direction.params.target)
        ) {
          names.push(direction.params.target);
        }
      }
    }
    return names;
  }

  function resolveBackgroundVariantId(
    scene: GeneratedScene,
    backgroundVariantIdsByName: Map<string, Map<string, string>>,
  ): string | undefined {
    const variantIds = backgroundVariantIdsByName.get(
      normalizeAssetName(scene.background),
    );
    if (!variantIds) return undefined;
    const defaultKey = normalizeVariantName(defaultVariantName());
    if (scene.backgroundVariant?.trim()) {
      return (
        variantIds.get(normalizeVariantName(scene.backgroundVariant)) ??
        variantIds.get(defaultKey)
      );
    }
    return variantIds.get(defaultKey);
  }

  // ---------------------------------------------------------------------------
  // Core function
  // ---------------------------------------------------------------------------

  /**
   * Build a Project with placeholder assets from a ScriptGenerationResult.
   *
   * Uses bundled placeholder URLs without browser APIs or network requests.
   * Shared assets can be reused; real media is imported separately.
   */
  function buildProjectFromScript(
    result: ScriptGenerationResult,
    title: string,
    existingAssets?: { characters: AssetGroup[]; backgrounds: AssetGroup[] },
    projectOptions?: Omit<CreateProjectOptions, "title">,
  ): Project {
    const sanitizedResult = sanitizeGeneratedScript(result);
    const requestedCharacterVariantsByName =
      collectRequestedCharacterVariantsByName(sanitizedResult);
    const projectTitle = sanitizedResult.title.trim() || title;
    // 1. Create base project
    const project = createDefaultProject({
      title: projectTitle,
      ...projectOptions,
    });

    // 2. Clear default acts
    project.acts = [];

    // 3. Build character asset groups
    const characterIdMap = new Map<string, string>();
    const characterIdsByNormalizedName = new Map<string, string>();

    for (let i = 0; i < sanitizedResult.characters.length; i++) {
      const character = sanitizedResult.characters[i];
      const requestedVariants =
        requestedCharacterVariantsByName.get(character.name) ?? [];

      // Check for existing asset with matching name
      const existing = findReusableGroup(
        existingAssets?.characters,
        character.name,
      );
      if (existing) {
        const ensuredGroup = ensureCharacterGroupVariants(
          existing,
          character.name,
          i,
          requestedVariants,
          character.gender,
        );
        project.assets.visual.character.push(ensuredGroup);
        characterIdMap.set(character.name, ensuredGroup.id);
        characterIdsByNormalizedName.set(
          normalizeNameToken(character.name),
          ensuredGroup.id,
        );
        continue;
      }

      const groupId = createId();
      const variantId = createId();

      const group: AssetGroup = {
        id: groupId,
        name: character.name,
        source: "project-placeholder",
        variants: [
          {
            id: variantId,
            key: DEFAULT_VARIANT_KEY,
            name: defaultVariantName(),
            url: generatePlaceholderCharacter(
              character.name,
              i,
              character.gender,
            ),
          },
          ...buildPlaceholderCharacterVariants(
            character.name,
            i,
            requestedVariants,
            character.gender,
          ).map((variant) => ({
            id: createId(),
            key: inferVariantKey(variant.name),
            name: variant.name,
            url: variant.url,
          })),
        ],
        defaultVariantId: variantId,
      };

      project.assets.visual.character.push(group);
      characterIdMap.set(character.name, groupId);
      characterIdsByNormalizedName.set(
        normalizeNameToken(character.name),
        groupId,
      );
    }

    // 4. Build background asset groups
    const backgroundIdMap = new Map<string, string>();
    const backgroundVariantIdsByName = new Map<string, Map<string, string>>();
    const requestedBackgroundVariantsByName =
      collectRequestedBackgroundVariantsByName(sanitizedResult);

    for (let i = 0; i < sanitizedResult.backgrounds.length; i++) {
      const background = sanitizedResult.backgrounds[i];
      const requestedVariants =
        requestedBackgroundVariantsByName.get(background.name) ?? [];

      // Check for existing asset with matching name
      const existing = findReusableGroup(
        existingAssets?.backgrounds,
        background.name,
      );
      if (existing) {
        const ensuredGroup = ensureBackgroundGroupVariants(
          existing,
          background.name,
          i,
          requestedVariants,
        );
        project.assets.visual.background.push(ensuredGroup);
        backgroundIdMap.set(background.name, ensuredGroup.id);
        backgroundVariantIdsByName.set(
          normalizeAssetName(background.name),
          new Map(
            ensuredGroup.variants.map(
              (variant) =>
                [normalizeVariantName(variant.name), variant.id] as const,
            ),
          ),
        );
        continue;
      }

      const groupId = createId();
      const variantId = createId();

      const variant: AssetVariant = {
        id: variantId,
        key: DEFAULT_VARIANT_KEY,
        name: defaultVariantName(),
        url: generatePlaceholderBackground(background.name, i),
      };

      const group: AssetGroup = {
        id: groupId,
        name: background.name,
        source: "project-placeholder",
        variants: [
          variant,
          ...buildPlaceholderBackgroundVariants(
            background.name,
            i,
            requestedVariants,
          ),
        ],
        defaultVariantId: variantId,
      };

      project.assets.visual.background.push(group);
      backgroundIdMap.set(background.name, groupId);
      backgroundVariantIdsByName.set(
        normalizeAssetName(background.name),
        new Map(
          group.variants.map(
            (groupVariant) =>
              [
                normalizeVariantName(groupVariant.name),
                groupVariant.id,
              ] as const,
          ),
        ),
      );
    }

    const characterVariantIdsByCharacterId = buildCharacterVariantIdLookup(
      project.assets.visual.character,
    );
    const characterSubjectIdsByNormalizedName = new Map<string, string>();
    for (const character of sanitizedResult.characters) {
      const groupId = characterIdMap.get(character.name);
      const group = project.assets.visual.character.find(
        (candidate) => candidate.id === groupId,
      );
      if (!group) continue;
      const subject = createBoundVisualSubject(
        "character",
        character.name,
        group,
        {
          description: character.description,
          gender: character.gender,
        },
      );
      project.visualSubjects.push(subject);
      characterSubjectIdsByNormalizedName.set(
        normalizeNameToken(character.name),
        subject.id,
      );
    }
    const backgroundSubjectIdsByNormalizedName = new Map<string, string>();
    for (const background of sanitizedResult.backgrounds) {
      const groupId = backgroundIdMap.get(background.name);
      const group = project.assets.visual.background.find(
        (candidate) => candidate.id === groupId,
      );
      if (!group) continue;
      const subject = createBoundVisualSubject(
        "location",
        background.name,
        group,
        {
          description: background.description,
        },
      );
      project.visualSubjects.push(subject);
      backgroundSubjectIdsByNormalizedName.set(
        normalizeNameToken(background.name),
        subject.id,
      );
    }

    // 5. Build acts and scenes
    for (let actIndex = 0; actIndex < sanitizedResult.acts.length; actIndex++) {
      const genAct = sanitizedResult.acts[actIndex]!;
      const act = buildAct(
        genAct,
        actIndex,
        characterIdsByNormalizedName,
        characterSubjectIdsByNormalizedName,
        backgroundVariantIdsByName,
        backgroundSubjectIdsByNormalizedName,
        characterVariantIdsByCharacterId,
        project.meta.width,
        project.meta.height,
      );
      project.acts.push(act);
    }

    return project;
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  function buildAct(
    genAct: GeneratedAct,
    actIndex: number,
    characterIdsByNormalizedName: Map<string, string>,
    characterSubjectIdsByNormalizedName: Map<string, string>,
    backgroundVariantIdsByName: Map<string, Map<string, string>>,
    backgroundSubjectIdsByNormalizedName: Map<string, string>,
    characterVariantIdsByCharacterId: Map<string, Map<string, string>>,
    canvasWidth = 1920,
    canvasHeight = 1080,
  ): Act {
    const scenes: Scene[] = genAct.scenes.map((genScene, sceneIndex) => {
      const sceneCharacterIds = Array.from(
        new Set(
          collectGeneratedSceneCharacterNames(genScene.lines)
            .map((speaker) =>
              characterIdsByNormalizedName.get(normalizeNameToken(speaker)),
            )
            .filter((characterId): characterId is string =>
              Boolean(characterId),
            ),
        ),
      );

      const actors: ActorState[] = sceneCharacterIds.map((characterId, idx) => {
        const position = getActorSlotPosition(
          idx,
          sceneCharacterIds.length,
          canvasWidth,
          canvasHeight,
        );
        const groupName = Array.from(
          characterIdsByNormalizedName.entries(),
        ).find(([, id]) => id === characterId)?.[0];
        return {
          id: createId(),
          ...(groupName
            ? {
                visualSubjectId:
                  characterSubjectIdsByNormalizedName.get(groupName),
              }
            : {}),
          characterId,
          x: position.x,
          y: position.y,
          scale: 1,
          visible: false,
          zIndex: idx,
          variantId: "", // will be resolved at render time from the group's defaultVariantId
        };
      });
      const sceneActorIdByCharacterId = new Map(
        actors.map((actor) => [actor.characterId, actor.id] as const),
      );
      const resolveSceneActorId = createSceneActorResolver(
        sceneActorIdByCharacterId,
        characterIdsByNormalizedName,
      );
      const actorVariantIdsByActorId = new Map(
        actors.map(
          (actor) =>
            [
              actor.id,
              characterVariantIdsByCharacterId.get(actor.characterId) ??
                new Map<string, string>(),
            ] as const,
        ),
      );

      return {
        id: createId(),
        name: genScene.name.trim() || `Scene ${sceneIndex + 1}`,
        backgroundSubjectId: genScene.background
          ? backgroundSubjectIdsByNormalizedName.get(
              normalizeNameToken(genScene.background),
            )
          : undefined,
        backgroundId: resolveBackgroundVariantId(
          genScene,
          backgroundVariantIdsByName,
        ),
        actors,
        script: buildSceneScript(
          genScene.lines,
          resolveSceneActorId,
          actorVariantIdsByActorId,
        ),
      };
    });

    return {
      id: createId(),
      name: genAct.name.trim() || `Act ${actIndex + 1}`,
      scenes,
    };
  }

  return { buildProjectFromScript };
}
