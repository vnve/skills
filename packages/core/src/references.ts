import { getSceneTransitionDirection } from "./scene-transitions";
import { depthCameraMode } from "./common-effects";
import { isPerformanceCommand } from "./performance-commands";
import { getTextNodeContent } from "./helpers";
import { resolveDialogueProps } from "./helpers/resolve-scene-property";
import type { Project, Scene } from "./types/project";
import { BUILTIN_DIALOGUE_THEME_IDS } from "./dialogue-theme";
export interface ReferenceIssue {
  code: string;
  message: string;
  sceneId: string;
  nodeId?: string;
  actorId?: string;
  assetId?: string;
  animationId?: string;
}
/** Reachable resources include all future inline switches, not just the first frame. */
export function collectProjectReferences(
  project: Project,
  scenes: readonly Scene[],
) {
  const fonts = new Set<string>();
  const variants = new Set<string>(),
    themes = new Set<string>(),
    audio = new Map<string, "voice" | "bgm" | "sfx">(),
    issues: ReferenceIssue[] = [];
  const allVariants = Object.values(project.assets.visual).flatMap((groups) =>
    groups.flatMap((g: import("./types/project").AssetGroup) => g.variants),
  );
  const addVariant = (
    id: string | undefined,
    scene: Scene,
    nodeId?: string,
    actorId?: string,
    animationId?: string,
  ) => {
    if (!id) return;
    variants.add(id);
    if (!allVariants.some((v) => v.id === id))
      issues.push({
        code: "VARIANT_NOT_FOUND",
        message: `Unknown image '${id}'`,
        sceneId: scene.id,
        nodeId,
        actorId,
        assetId: id,
        animationId,
      });
  };
  const addTheme = (id: string | undefined, scene: Scene, nodeId?: string) => {
    const theme = id ?? "classic";
    themes.add(theme);
    if (
      !(BUILTIN_DIALOGUE_THEME_IDS as readonly string[]).includes(theme) &&
      !project.assets.themes.some((t) => t.id === theme)
    )
      issues.push({
        code: "THEME_NOT_FOUND",
        message: `Unknown theme '${theme}'`,
        sceneId: scene.id,
        nodeId,
        assetId: theme,
      });
  };
  for (const scene of scenes) {
    addVariant(scene.backgroundId, scene);
    addVariant(scene.cgId, scene);
    addTheme(resolveDialogueProps(scene, project.meta).dialogueThemeId, scene);
    for (const clip of scene.animationClips ?? []) {
      for (const binding of clip.bindings)
        if (
          binding.query === "cueDuration" &&
          !scene.script.nodes.some((n) => n.id === binding.nodeId)
        )
          issues.push({
            code: "ANIMATION_CUE_INVALID",
            message: "Algorithm references missing dialogue",
            sceneId: scene.id,
            nodeId: binding.nodeId,
            animationId: clip.id,
          });

      for (const target of clip.targets)
        if (
          target.kind === "actor" &&
          !scene.actors.some((a) => a.id === target.ref)
        )
          issues.push({
            code: "ACTOR_NOT_FOUND",
            message: `Unknown animation actor '${target.ref}'`,
            sceneId: scene.id,
            actorId: target.ref,
            animationId: clip.id,
          });
      for (const op of clip.timelines.flatMap((t) => t.operations))
        if (
          typeof op.position === "object" &&
          "nodeId" in op.position &&
          !scene.script.nodes.some(
            (n) => n.id === (op.position as { nodeId: string }).nodeId,
          )
        )
          issues.push({
            code: "ANIMATION_CUE_INVALID",
            message: "Animation references missing dialogue",
            sceneId: scene.id,
            animationId: clip.id,
          });

      if (
        clip.anchor &&
        !scene.script.nodes.some((n) => n.id === clip.anchor!.nodeId)
      )
        issues.push({
          animationId: clip.id,
          code: "ANIMATION_CUE_INVALID",
          message: `Unknown visual anchor '${clip.anchor.nodeId}'`,
          sceneId: scene.id,
          nodeId: clip.anchor.nodeId,
        });
      if (
        clip.follow &&
        !scene.actors.some((a) => a.id === clip.follow!.actorId)
      )
        issues.push({
          code: "ACTOR_NOT_FOUND",
          animationId: clip.id,
          message: `Unknown visual follow actor '${clip.follow.actorId}'`,
          sceneId: scene.id,
          actorId: clip.follow.actorId,
        });
      for (const node of clip.nodes) {
        addVariant(node.attrs.assetId, scene, node.id, undefined, clip.id);
        addVariant(
          node.attrs.mask?.assetId,
          scene,
          node.id,
          undefined,
          clip.id,
        );
        for (const p of node.attrs.particles ?? [])
          addVariant(p.assetId, scene, node.id, undefined, clip.id);
        for (const member of node.attrs.members ?? [])
          if (
            member.kind === "actor" &&
            !scene.actors.some((a) => a.id === member.actorId)
          )
            issues.push({
              code: "ACTOR_NOT_FOUND",
              message: `Unknown composition actor '${member.actorId}'`,
              sceneId: scene.id,
              actorId: member.actorId,
              animationId: clip.id,
            });
        if (node.attrs.fontId) {
          fonts.add(node.attrs.fontId);
          if (!project.assets.fonts.some((f) => f.id === node.attrs.fontId))
            issues.push({
              animationId: clip.id,
              code: "INVALID_REFERENCE",
              message: `Unknown visual font '${node.attrs.fontId}'`,
              sceneId: scene.id,
              nodeId: node.id,
              assetId: node.attrs.fontId,
            });
        }
      }
    }
    for (const actor of scene.actors) {
      const groups =
        project.assets.visual[
          actor.assetType === "prop" ? "prop" : "character"
        ];
      const group = groups.find((g) => g.id === actor.characterId);
      if (!group)
        issues.push({
          code: "ASSET_GROUP_NOT_FOUND",
          message: `Actor '${actor.id}' has no image group`,
          sceneId: scene.id,
          actorId: actor.id,
          assetId: actor.characterId,
        });
      if (
        group &&
        actor.variantId &&
        !group.variants.some((v) => v.id === actor.variantId)
      )
        issues.push({
          code: "VARIANT_NOT_FOUND",
          message: "Actor image must belong to its image group",
          sceneId: scene.id,
          actorId: actor.id,
          assetId: actor.variantId,
        });
      addVariant(
        actor.variantId || group?.defaultVariantId,
        scene,
        undefined,
        actor.id,
      );
    }
    for (const node of scene.script.nodes) {
      if (node.audioUrl) audio.set(node.audioUrl, "voice");
      if (node.actorId && !scene.actors.some((a) => a.id === node.actorId))
        issues.push({
          code: "ACTOR_NOT_FOUND",
          message: `Unknown speaker '${node.actorId}'`,
          sceneId: scene.id,
          nodeId: node.id,
          actorId: node.actorId,
        });
      for (const tag of getTextNodeContent(node)) {
        if (tag.type !== "tag") continue;
        if (
          tag.name === "animation" &&
          !scene.animationClips?.some((clip) => clip.id === tag.params.clipId)
        )
          issues.push({
            code: "ANIMATION_UNKNOWN_CLIP",
            message: `Unknown animation '${tag.params.clipId}'`,
            sceneId: scene.id,
            nodeId: node.id,
            animationId: tag.params.clipId,
          });
        if (
          isPerformanceCommand(tag.name) ||
          ["camera", "presence", "reaction"].includes(tag.name)
        ) {
          const p = tag.params as Record<string, unknown>;
          for (const field of ["actor", "other"])
            if (
              typeof p[field] === "string" &&
              !scene.actors.some((a) => a.id === p[field])
            )
              issues.push({
                code: "ACTOR_NOT_FOUND",
                message: `Unknown ${tag.name} ${field} '${p[field]}'`,
                sceneId: scene.id,
                nodeId: node.id,
                actorId: String(p[field]),
              });
          if (depthCameraMode(tag) === "rackfocus")
            for (const target of [
              String(p.fromTarget ?? "$background"),
              String(p.toTarget),
            ]) {
              const exists =
                target === "$background"
                  ? !!scene.backgroundId
                  : target === "$cg"
                    ? !!scene.cgId
                    : scene.actors.some((a) => a.id === target);
              if (!exists)
                issues.push({
                  code: "FOCUS_TARGET_NOT_FOUND",
                  message: `Focus target '${target}' is not present in this scene`,
                  sceneId: scene.id,
                  nodeId: node.id,
                });
            }
          if (
            depthCameraMode(tag) === "parallax" &&
            typeof p.foreground === "string"
          )
            addVariant(p.foreground, scene, node.id);
          if (tag.name === "memory")
            for (const id of tag.params.images) addVariant(id, scene, node.id);
          const direction = getSceneTransitionDirection(tag);
          if (direction) {
            const all = project.acts.flatMap((a) => a.scenes),
              next = all[all.findIndex((s) => s.id === scene.id) + 1];
            const segments = getTextNodeContent(node);
            if (
              !next ||
              next.id !== direction.nextScene ||
              scene.script.nodes.at(-1) !== node ||
              segments.length !== 1
            )
              issues.push({
                code: "WIPE_PLACEMENT_INVALID",
                message: "擦镜换场必须独占本场最后一行，并引用紧邻下一场",
                sceneId: scene.id,
                nodeId: node.id,
              });
          }
        }
        if (tag.name === "set") {
          addVariant(tag.params.variant, scene, node.id);
          const actor = scene.actors.find((a) => a.id === tag.params.target);
          const kind =
            tag.params.target === "$background"
              ? "background"
              : tag.params.target === "$cg"
                ? "cg"
                : actor?.assetType === "prop"
                  ? "prop"
                  : "character";
          const groupId =
            actor?.characterId ??
            (kind === "background"
              ? scene.backgroundId
              : kind === "cg"
                ? scene.cgId
                : undefined);
          const group = project.assets.visual[kind].find(
            (g) => g.id === groupId || g.variants.some((v) => v.id === groupId),
          );
          if (!group?.variants.some((v) => v.id === tag.params.variant))
            issues.push({
              code: "VARIANT_NOT_FOUND",
              message: "Inline image must belong to its target image group",
              sceneId: scene.id,
              nodeId: node.id,
              assetId: tag.params.variant,
            });
        }
        if (tag.name === "say") addTheme(tag.params.theme, scene, node.id);
        if (tag.name === "bgm" && tag.params.asset)
          audio.set(tag.params.asset, "bgm");
        if (tag.name === "sfx") audio.set(tag.params.asset, "sfx");
      }
    }
  }
  for (const [id, kind] of audio) {
    if (kind === "voice") continue;
    const bank = project.assets.audio[kind];
    if (!bank.some((a) => a.id === id || a.name === id || a.url === id))
      issues.push({
        code: "AUDIO_NOT_FOUND",
        message: `Unknown ${kind} '${id}'`,
        sceneId:
          scenes.find((s) =>
            s.script.nodes.some((n) =>
              getTextNodeContent(n).some(
                (t) =>
                  t.type === "tag" &&
                  "asset" in t.params &&
                  t.params.asset === id,
              ),
            ),
          )?.id ?? "",
        assetId: id,
      });
  }
  const families = [...themes]
    .flatMap((id) => {
      const data = project.assets.themes.find((t) => t.id === id)?.data;
      return [data?.fontFamily, data?.nameFontFamily];
    })
    .concat(
      scenes.flatMap((s) => [
        s.dialogueThemeOverrides?.fontFamily,
        s.dialogueThemeOverrides?.nameFontFamily,
      ]),
    );
  for (const font of project.assets.fonts)
    if (
      families.some((f) =>
        f
          ?.split(",")
          .some(
            (name) => name.trim().replace(/^['"]|['"]$/g, "") === font.name,
          ),
      )
    )
      fonts.add(font.id);
  return { variants, themes, audio, fonts, issues };
}
