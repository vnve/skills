import { createDefaultProject } from "../../packages/core/src";
import { buildAnimation } from "../../packages/authoring/src";

export function visualFixtures() {
  const make = (build: (sdk: any) => void) =>
    buildAnimation(
      {
        sdkVersion: 2,
        id: "effects",
        name: "Effects",
        sceneId: "scene",
        duration: 2,
        build,
      },
      "",
      { width: 320, height: 180, cues: [] },
    );
  const bounds = { x: 0, y: 0, width: 320, height: 180 };
  return {
    mask: make(({ scene }: any) => {
      scene.group({
        id: "g",
        bounds,
        mask: { type: "rect", width: 80, height: 180 },
      });
      scene.rect({
        id: "r",
        parentId: "g",
        width: 320,
        height: 180,
        fill: "#ff0000",
      });
    }),
    inverse: make(({ scene }: any) => {
      scene.group({
        id: "g",
        bounds,
        mask: {
          type: "ellipse",
          x: 80,
          y: 90,
          radiusX: 30,
          radiusY: 30,
          invert: true,
        },
      });
      scene.rect({
        id: "r",
        parentId: "g",
        width: 320,
        height: 180,
        fill: "#ff0000",
      });
    }),
    blend: make(({ scene }: any) => {
      scene.rect({ id: "base", width: 320, height: 180, fill: "#808080" });
      scene.group({ id: "g", bounds, blendMode: "multiply" });
      scene.rect({
        id: "r",
        parentId: "g",
        width: 320,
        height: 180,
        fill: "#808080",
      });
    }),
    opacity: make(({ scene }: any) => {
      scene.group({ id: "g", bounds, opacity: 0.5 });
      scene.rect({
        id: "a",
        parentId: "g",
        width: 120,
        height: 180,
        fill: "#ff0000",
      });
      scene.rect({
        id: "b",
        parentId: "g",
        x: 60,
        width: 120,
        height: 180,
        fill: "#ff0000",
      });
    }),
    actor: make(({ scene }: any) => {
      scene.group({
        id: "g",
        bounds,
        members: [{ kind: "actor", actorId: "hero" }],
        mask: { type: "rect", width: 160, height: 180 },
      });
    }),
    background: make(({ scene }: any) => {
      scene.group({
        id: "g",
        bounds,
        members: [{ kind: "background" }],
        mask: { type: "rect", width: 160, height: 180 },
      });
    }),
    cg: make(({ scene }: any) => {
      scene.group({
        id: "g",
        bounds,
        members: [{ kind: "cg" }],
        mask: { type: "rect", width: 160, height: 180 },
      });
    }),
    dialogue: make(({ scene }: any) => {
      scene.group({
        id: "g",
        bounds,
        members: [{ kind: "dialogue" }],
        mask: { type: "rect", width: 160, height: 180 },
      });
    }),
    actorLocal: make(({ scene }: any) => {
      scene.group({
        id: "g",
        bounds: { x: 0, y: 0, width: 144, height: 144 },
        memberSpace: "local",
        members: [{ kind: "actor", actorId: "hero" }],
        mask: { type: "rect", width: 72, height: 144 },
      });
    }),
    parallax: make(({ scene }: any) => {
      for (const [i, factor] of [0, 0.5, 1].entries()) {
        scene.group({ id: `g${i}`, cameraFactor: factor });
        scene.rect({
          id: `r${i}`,
          parentId: `g${i}`,
          x: 30,
          y: 20 + i * 50,
          width: 10,
          height: 10,
          fill: "#ff0000",
        });
      }
    }),
    particles: make(({ scene }: any) => {
      scene.group({
        id: "g",
        bounds,
        mask: { type: "rect", width: 160, height: 180 },
      });
      scene.particles({
        id: "p",
        parentId: "g",
        blendMode: "add",
        particles: [
          {
            id: "spark",
            birth: 0.5,
            lifetime: 1,
            radius: 10,
            sampleRate: 10,
            sample: ({ localTime }: any) => ({
              x: 80 + localTime * 160,
              y: 90,
            }),
          },
        ],
      });
    }),
    nested: make(({ scene }: any) => {
      scene.group({
        id: "outer",
        bounds,
        mask: { type: "rect", width: 160, height: 180 },
      });
      scene.group({
        id: "inner",
        parentId: "outer",
        bounds,
        mask: { type: "ellipse", x: 80, y: 90, radiusX: 30, radiusY: 30 },
      });
      scene.rect({
        id: "r",
        parentId: "inner",
        width: 320,
        height: 180,
        fill: "#ff0000",
      });
    }),
    imageMask: make(({ scene }: any) => {
      scene.group({
        id: "g",
        bounds,
        mask: { type: "image", assetId: "mask", width: 320, height: 180 },
      });
      scene.rect({
        id: "r",
        parentId: "g",
        width: 320,
        height: 180,
        fill: "#ff0000",
      });
    }),
    subjectBlend: make(({ scene }: any) => {
      scene.group({
        id: "g",
        bounds,
        members: [
          { kind: "background" },
          { kind: "actor", actorId: "hero" },
          { kind: "dialogue" },
        ],
        mask: { type: "rect", width: 160, height: 180 },
      });
    }),
    stress: buildAnimation(
      {
        sdkVersion: 2,
        id: "stress",
        name: "Stress",
        sceneId: "scene",
        duration: 30,
        build({ scene }: any) {
          scene.group({
            id: "outer",
            bounds: { x: 0, y: 0, width: 1920, height: 1080 },
          });
          scene.group({
            id: "inner",
            parentId: "outer",
            bounds: { x: 0, y: 0, width: 1920, height: 1080 },
          });
          scene.particles({
            id: "dust",
            parentId: "inner",
            particles: Array.from({ length: 1000 }, (_, i) => ({
              id: `p${i}`,
              birth: 0,
              lifetime: 30,
              radius: 3,
              sampleRate: 1,
              sample: ({ localTime, random }: any) => ({
                x: random(1) * 1800 + localTime,
                y: random(2) * 1000,
              }),
            })),
          });
        },
      },
      "",
      { width: 1920, height: 1080, cues: [] },
    ),
  };
}

export function scenarioProjects() {
  return ["daily", "impact", "dream"].map((name) => {
    const project = createDefaultProject(),
      scene = project.acts[0].scenes[0];
    project.meta.title = `Visual primitives ${name}`;
    project.assets.visual.character = [
      {
        id: "hero-media",
        name: "Hero",
        defaultVariantId: "neutral",
        variants: [
          { id: "neutral", name: "默认", url: "/art/neutral.webp" },
          { id: "happy", name: "开心", url: "/art/happy.webp" },
          { id: "surprised", name: "惊讶", url: "/art/surprised.webp" },
        ],
      },
    ];
    project.assets.visual.background = [
      {
        id: "background-media",
        name: "教室",
        defaultVariantId: "classroom",
        variants: [
          { id: "classroom", name: "默认", url: "/art/classroom.webp" },
        ],
      },
    ];
    scene.backgroundId = "classroom";
    scene.actors = [
      {
        id: "hero",
        characterId: "hero-media",
        variantId: "neutral",
        x: 50,
        y: 100,
        scale: 1,
        visible: true,
        zIndex: 0,
      },
    ];
    const bounds = { x: 0, y: 0, width: 1920, height: 1080 };
    const clip = buildAnimation(
      {
        sdkVersion: 2,
        id: name,
        name,
        sceneId: scene.id,
        duration: 3,
        seed: 31,
        build({ scene: s, mask, timeline, target, camera, sample }: any) {
          if (name === "daily") {
            s.group({ id: "far", cameraFactor: 0.2 });
            s.image({
              id: "far-image",
              parentId: "far",
              assetId: "classroom",
              width: 1920,
              height: 1080,
              opacity: 0.12,
            });
            s.group({
              id: "light",
              bounds,
              blendMode: "screen",
              mask: {
                type: "ellipse",
                x: 500,
                y: 180,
                radiusX: 600,
                radiusY: 450,
              },
            });
            s.circle({
              id: "sun",
              parentId: "light",
              x: 500,
              y: 180,
              radius: 600,
              fill: "#574827",
              opacity: 0.3,
            });
            s.particles({
              id: "dust",
              parentId: "light",
              blendMode: "add",
              particles: Array.from({ length: 80 }, (_, i) => ({
                id: `p${i}`,
                birth: 0,
                lifetime: 3,
                radius: 3,
                sampleRate: 10,
                sample: ({ localTime: t, random }: any) => ({
                  x: random(1) * 1920 + t * 20,
                  y: random(2) * 1080 - t * 10,
                  opacity: 0.4,
                }),
              })),
            });
            timeline().to(camera(), {
              scale: 1.05,
              duration: 3,
              ease: "sine.inOut",
            });
          } else if (name === "impact") {
            const actor = s.group({
              id: "actor-reveal",
              bounds,
              members: [{ kind: "actor", actorId: "hero" }],
              mask: { type: "rect", width: 0, height: 1080 },
            });
            timeline().to(mask(actor), {
              width: 1920,
              duration: 0.25,
              ease: "power2.out",
            });
            s.group({ id: "sparks", bounds, blendMode: "add" });
            s.particles({
              id: "burst",
              parentId: "sparks",
              particles: Array.from({ length: 100 }, (_, i) => ({
                id: `p${i}`,
                birth: 0,
                lifetime: 3,
                radius: 4,
                fill: "#ffd59a",
                sampleRate: 15,
                sample: ({ localTime: t, random }: any) => ({
                  x: 960 + Math.cos(random(1) * 6.283) * random(2) * 600 * t,
                  y:
                    540 +
                    Math.sin(random(1) * 6.283) * random(2) * 600 * t +
                    80 * t * t,
                  opacity: Math.max(0, 1 - t / 3),
                }),
              })),
            });
            sample(camera(), {
              duration: 3,
              sampleRate: 30,
              sample: ({ localTime: t }: any) => ({
                x: Math.sin(t * 40) * Math.exp(-t * 5),
                scale: 1 + 0.08 * Math.exp(-t * 3),
              }),
            });
          } else {
            s.group({
              id: "whole-scene",
              bounds,
              members: [
                { kind: "background" },
                { kind: "actor", actorId: "hero" },
              ],
              mask: {
                type: "image",
                assetId: "happy",
                x: 200,
                y: 0,
                width: 1520,
                height: 1080,
              },
            });
            s.group({
              id: "shade",
              bounds,
              blendMode: "multiply",
              mask: {
                type: "ellipse",
                x: 960,
                y: 500,
                radiusX: 450,
                radiusY: 450,
                invert: true,
              },
            });
            s.group({
              id: "nested",
              parentId: "shade",
              bounds,
              mask: { type: "rect", width: 1920, height: 1080 },
            });
            s.rect({
              id: "dark",
              parentId: "nested",
              width: 1920,
              height: 1080,
              fill: "#606080",
            });
            timeline().to(
              mask(
                s.group({
                  id: "iris",
                  bounds,
                  mask: {
                    type: "ellipse",
                    x: 960,
                    y: 540,
                    radiusX: 100,
                    radiusY: 100,
                  },
                  members: [{ kind: "visual", nodeId: "whole-scene" }],
                }),
              ),
              { radiusX: 1200, radiusY: 900, duration: 3, ease: "sine.inOut" },
            );
          }
        },
      },
      "",
      { width: 1920, height: 1080, cues: [] },
    );
    scene.animationClips = [clip];
    scene.script.nodes = [
      {
        id: "line",
        type: "text",
        actorId: "hero",
        text: "光影流转，表情也随着故事变化。",
        timing: { revealDuration: 2 },
        content: [
          {
            type: "tag",
            name: "animation",
            params: { clipId: name, await: false },
          },
          {
            type: "tag",
            name: "set",
            params: {
              target: "hero",
              variant: "happy",
              with: "fade",
              dur: 0.4,
              await: false,
            },
          },
          { type: "text", text: "光影流转，" },
          {
            type: "tag",
            name: "set",
            params: {
              target: "hero",
              variant: "surprised",
              with: "fade",
              dur: 0.25,
              await: false,
            },
          },
          { type: "text", text: "表情也随着故事变化。" },
        ],
      },
    ];
    return { name, project };
  });
}
