import { getExtendedSlotPositions } from "@vnve/core/production/stage";
import {
  getTextNodeContent,
  type ProjectPatchPlan,
  type Scene,
} from "@vnve/core";
/** Update an explicit current placement cue when it owns the visible position. */
export function actorPlacementEdits(
  scene: Scene,
  actorId: string,
  change: {
    x?: number;
    y?: number;
    scale?: number;
    flipX?: boolean;
    visible?: boolean;
    zIndex?: number;
    variantId?: string;
  },
  time: number,
  cues: Array<{ nodeId: string; start: number }>,
  canvas = { width: 1920, height: 1080 },
): ProjectPatchPlan["operations"] {
  const operations: ProjectPatchPlan["operations"] = [
    { type: "actor.update", sceneId: scene.id, actorId, ...change },
  ];
  if (change.variantId)
    operations.push(
      ...currentLookEdits(scene, actorId, change.variantId, time, cues),
    );
  if (change.visible !== undefined) {
    const cue = [...cues]
      .filter((c) => c.start <= time)
      .sort((a, b) => b.start - a.start)[0];
    if (cue) {
      const node = scene.script.nodes.find((n) => n.id === cue.nodeId);
      const content = node ? getTextNodeContent(node) : [];
      const firstText = content.findIndex(
        (part) => part.type === "text" && part.text.length > 0,
      );
      // Opening show tags must run before the explicit visibility override.
      const contentIndex = firstText < 0 ? content.length : firstText;
      operations.push({
        type: "direction.insert",
        sceneId: scene.id,
        nodeId: cue.nodeId,
        contentIndex,
        direction: {
          name: change.visible ? "show" : "hide",
          params: { actor: actorId, dur: 0, with: "none" },
        },
      });
    }
  }
  if (change.x === undefined && change.y === undefined) return operations;
  let owner:
    | {
        nodeId: string;
        contentIndex: number;
        tag: ReturnType<typeof getTextNodeContent>[number];
      }
    | undefined;
  for (const node of scene.script.nodes) {
    const cue = cues.find((c) => c.nodeId === node.id);
    if (!cue || cue.start > time) continue;
    getTextNodeContent(node).forEach((tag, contentIndex) => {
      if (
        tag.type === "tag" &&
        ((tag.name === "show" && tag.params.actor === actorId) ||
          (tag.name === "move" && tag.params.actor === actorId))
      )
        owner = { nodeId: node.id!, contentIndex, tag };
    });
  }
  if (owner) {
    const { tag } = owner;
    if (tag.type === "tag" && (tag.name === "show" || tag.name === "move")) {
      const params: Record<string, unknown> = { ...tag.params };
      if (tag.name === "move") {
        const slots = getExtendedSlotPositions(canvas.width, canvas.height);
        const slot = tag.params.to ? slots[tag.params.to] : undefined;
        const actor = scene.actors.find((a) => a.id === actorId)!;
        delete params.to;
        params.toX = change.x ?? slot?.x ?? tag.params.toX ?? actor.x;
        params.toY = change.y ?? slot?.y ?? tag.params.toY ?? actor.y;
      } else {
        if (change.x !== undefined) params.x = change.x;
        if (change.y !== undefined) params.y = change.y;
      }
      operations.push({
        type: "direction.update",
        sceneId: scene.id,
        nodeId: owner.nodeId,
        contentIndex: owner.contentIndex,
        direction: { name: tag.name, params } as never,
      });
    }
  }
  return operations;
}

/** Retarget the last active set cue without changing later scripted looks. */
export function currentLookEdits(
  scene: Scene,
  target: string,
  variantId: string,
  time: number,
  cues: Array<{ nodeId: string; start: number }>,
): ProjectPatchPlan["operations"] {
  let owner:
    | { nodeId: string; contentIndex: number; params: Record<string, unknown> }
    | undefined;
  for (const node of scene.script.nodes) {
    const cue = cues.find((c) => c.nodeId === node.id);
    if (!cue || cue.start > time) continue;
    getTextNodeContent(node).forEach((seg, contentIndex) => {
      if (
        seg.type === "tag" &&
        seg.name === "set" &&
        seg.params.target === target
      )
        owner = { nodeId: node.id!, contentIndex, params: { ...seg.params } };
    });
  }
  if (!owner) return [];
  const { stateId: _stateId, ...params } = owner.params;
  return [
    {
      type: "direction.update",
      sceneId: scene.id,
      nodeId: owner.nodeId,
      contentIndex: owner.contentIndex,
      direction: {
        name: "set",
        params: { ...params, target, variant: variantId },
      },
    },
  ];
}
