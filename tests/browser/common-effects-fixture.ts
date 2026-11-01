import { performanceProjects } from "./performance-commands-fixture";
import {
  SCENE_TRANSITION_TYPES,
  type InlineTag,
} from "../../packages/core/src";
export function commonProjects() {
  const base = () => structuredClone(performanceProjects()[0].project);
  const projects = SCENE_TRANSITION_TYPES.map((effect) => {
    const project = base(),
      scene = project.acts[0].scenes[0],
      next = structuredClone(scene);
    next.id = "next";
    next.backgroundId = "corridor";
    next.actors = [{ ...scene.actors[0], id: "next-hero", x: 70 }];
    scene.script.nodes = [
      {
        id: "before",
        type: "text",
        text: "",
        content: [{ type: "tag", name: "wait", params: { seconds: 1.2 } }],
      },
      {
        id: "exit",
        type: "text",
        text: "",
        content: [
          {
            type: "tag",
            name: "transition",
            params: { effect, nextScene: "next", dur: 1 },
          },
        ],
      },
    ];
    next.script.nodes = [
      {
        id: "after",
        type: "text",
        text: "",
        content: [{ type: "tag", name: "wait", params: { seconds: 1.6 } }],
      },
    ];
    project.acts[0].scenes.push(next);
    return { name: "transition-" + effect, project };
  });
  for (const action of [
    "push",
    "pull",
    "duo",
    "rackfocus",
    "parallax",
  ] as const) {
    const project = base(),
      scene = project.acts[0].scenes[0];
    if (action === "duo") {
      scene.actors[0].x = 30;
      scene.actors.push({
        ...scene.actors[0],
        id: "other",
        characterId: "boy",
        variantId: "serious",
        x: 70,
        zIndex: 1,
      });
    }
    const params = {
      action,
      dur: 2,
      ...(action === "duo" ? { actor: "hero", other: "other" } : {}),
      ...(action === "rackfocus" ? { toTarget: "hero" } : {}),
    };
    scene.script.nodes = [
      {
        id: "shot",
        type: "text",
        text: "",
        content: [
          ...(action === "pull"
            ? [
                {
                  type: "tag" as const,
                  name: "camera" as const,
                  params: { action: "push" as const, zoom: 1.15, dur: 0.3 },
                },
              ]
            : []),
          { type: "tag", name: "camera", params } as InlineTag,
          { type: "tag", name: "wait", params: { seconds: 1 } },
        ],
      },
    ];
    projects.push({ name: "camera-" + action, project });
  }
  const portrait = structuredClone(
    projects.find((p) => p.name === "transition-soft-dissolve")!,
  );
  portrait.name = "portrait-soft";
  portrait.project.meta.width = 1080;
  portrait.project.meta.height = 1920;
  projects.push(portrait);
  return projects;
}
