import { createDefaultProject, type InlineTag } from "../../packages/core/src";
/** Persisted directions only: no source scripts and no stored animationClips. */
export function performanceProjects() {
  return ["comic", "introduce", "memory", "duel", "awake", "wipe"].map(
    (name) => {
      const project = createDefaultProject(),
        scene = project.acts[0].scenes[0];
      project.meta.title = `Native ${name}`;
      project.assets.visual.character = [
        {
          id: "girl",
          name: "小夏",
          defaultVariantId: "neutral",
          variants: [{ id: "neutral", name: "默认", url: "/art/neutral.webp" }],
        },
        {
          id: "boy",
          name: "阿明",
          defaultVariantId: "serious",
          variants: [{ id: "serious", name: "默认", url: "/art/serious.webp" }],
        },
      ];
      project.assets.visual.background = [
        {
          id: "places",
          name: "地点",
          defaultVariantId: "classroom",
          variants: [
            { id: "classroom", name: "教室", url: "/art/classroom.webp" },
            { id: "corridor", name: "走廊", url: "/art/corridor.webp" },
          ],
        },
      ];
      scene.backgroundId = "classroom";
      scene.actors = [
        {
          id: "hero",
          characterId: "girl",
          variantId: "neutral",
          x: 50,
          y: 100,
          visible: true,
          scale: 1,
          zIndex: 0,
        },
      ];
      const params: Record<string, unknown> = {
        comic: { actor: "hero", text: "不可能。" },
        introduce: {
          actor: "hero",
          title: "小夏",
          subtitle: "有些答案，藏在沉默里。",
        },
        memory: { images: ["classroom", "corridor"], caption: "那一天" },
        duel: {
          actor: "hero",
          other: "other",
          text: "不是我。",
          reply: "那你为什么在场？",
          pressure: -0.18,
        },
        awake: { blur: 18, blinks: 2 },
        wipe: { nextScene: "next", direction: "left" },
      }[name]!;
      if (name === "duel")
        scene.actors.push({
          id: "other",
          characterId: "boy",
          variantId: "serious",
          x: 75,
          y: 100,
          visible: true,
          scale: 1,
          zIndex: 1,
        });
      scene.script.nodes = [
        {
          id: "effect",
          type: "text",
          text: "",
          content: [
            { type: "tag", name, params: { ...params, dur: 3 } } as InlineTag,
          ],
        },
      ];
      if (name === "wipe") {
        const next = structuredClone(scene);
        next.id = "next";
        next.backgroundId = "corridor";
        next.script.nodes = [
          {
            id: "after",
            type: "text",
            text: "已经到走廊了。",
            timing: { revealDuration: 2, holdDuration: 1 },
          },
        ];
        next.actors = [{ ...scene.actors[0], id: "next-hero", x: 65 }];
        scene.script.nodes.unshift({
          id: "before",
          type: "text",
          text: "我们走吧。",
          timing: { revealDuration: 1, holdDuration: 1 },
        });
        project.acts[0].scenes.push(next);
      }
      return { name, project };
    },
  );
}
