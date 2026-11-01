import { performanceProjects } from "./performance-commands-fixture";
import { buildAnimation } from "../../packages/authoring/src";
import type { InlineTag } from "../../packages/core/src";
export function cinematicProjects() {
  const cases: [string, InlineTag][] = [
    [
      "rackfocus",
      {
        type: "tag",
        name: "rackfocus",
        params: {
          fromTarget: "$background",
          toTarget: "hero",
          blur: 18,
          dur: 4,
        },
      },
    ],
    [
      "focus-reveal",
      {
        type: "tag",
        name: "rackfocus",
        params: { toTarget: "hero", blur: 16, moveX: 4, zoom: 1.06, dur: 6 },
      },
    ],
    ["parallax", { type: "tag", name: "parallax", params: { dur: 6 } }],
    [
      "reverse",
      {
        type: "tag",
        name: "parallax",
        params: { moveX: -4, moveY: 1, zoom: 1.04, dur: 6 },
      },
    ],
    [
      "portrait",
      {
        type: "tag",
        name: "rackfocus",
        params: { toTarget: "hero", moveX: -3, zoom: 1.04, dur: 6 },
      },
    ],
    [
      "cg-focus",
      {
        type: "tag",
        name: "rackfocus",
        params: { fromTarget: "$cg", toTarget: "hero", blur: 18, dur: 4 },
      },
    ],
    [
      "cg-parallax",
      { type: "tag", name: "parallax", params: { moveX: 8, dur: 4 } },
    ],
    [
      "sdk-offset",
      { type: "tag", name: "animation", params: { clipId: "offset" } },
    ],
  ];
  return cases.map(([name, tag]) => {
    const project = structuredClone(performanceProjects()[0].project),
      scene = project.acts[0].scenes[0];
    scene.script.nodes = [
      { id: "effect", type: "text", text: "", content: [tag] },
    ];
    if (name.startsWith("cg-")) {
      project.assets.visual.cg = [
        {
          id: "cg-media",
          name: "CG",
          defaultVariantId: "cover-cg",
          variants: [
            { id: "cover-cg", name: "Opaque", url: "/art/corridor.webp" },
          ],
        },
      ];
      scene.cgId = "cover-cg";
    }
    if (name === "portrait") {
      project.meta.width = 1080;
      project.meta.height = 1920;
    }
    if (name === "sdk-offset")
      scene.animationClips = [
        buildAnimation(
          {
            sdkVersion: 2,
            id: "offset",
            name: "Original offset",
            sceneId: scene.id,
            duration: 4,
            build({ scene }: any) {
              scene.group({
                id: "original",
                x: 100,
                offsetX: 20,
                bounds: { x: 0, y: 0, width: 1920, height: 1080 },
                memberPlacement: "original",
                members: [{ kind: "actor", actorId: "hero" }],
              });
            },
          },
          "",
          { width: 1920, height: 1080, cues: [] },
        ),
      ];
    return { name, project };
  });
}
