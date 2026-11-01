({
  sdkVersion: 2,
  id: "comic-impact",
  name: "漫画冲击",
  sceneId: "SCENE_ID",
  start: 0.3,
  duration: 1.2,
  seed: 42,
  space: "stage",
  sampleRate: 60,
  parameters: { strength: 1 },
  parameterDefinitions: { strength: { type: "number", min: 0.1, max: 2 } },
  build({ scene, target, timeline, math, parameters }) {
    const tl = timeline();
    for (let i = 0; i < 48; i++) {
      const angle = (i / 48) * Math.PI * 2,
        near = 240 + math.random(i) * 100;
      const node = scene.line({
        id: `speed-${i}`,
        points: [
          960 + Math.cos(angle) * near,
          540 + Math.sin(angle) * near,
          960 + Math.cos(angle) * 1400,
          540 + Math.sin(angle) * 1400,
        ],
        stroke: i % 2 ? "#79aaff" : "#ffffff",
        strokeWidth: 2 + math.random(i + 48) * 5,
      });
      const state = target(node, { x: 0, y: 0, opacity: 0 });
      tl.to(
        state,
        {
          x: Math.cos(angle) * 108 * parameters.strength,
          y: Math.sin(angle) * 108 * parameters.strength,
          duration: 1.2,
          ease: "none",
        },
        0,
      )
        .to(state, { opacity: 0.8, duration: 0.08 }, 0)
        .to(state, { opacity: 0.3, duration: 0.42 }, 0.08)
        .to(state, { opacity: 0, duration: 0.7 }, 0.5);
    }
    const ring = scene.circle({
      id: "ring",
      x: 960,
      y: 540,
      radius: 140,
      stroke: "#79aaff",
      strokeWidth: 12,
    });
    const state = target(ring, { scaleX: 0.3, scaleY: 0.3, opacity: 0 });
    tl.to(state, { scaleX: 2, scaleY: 2, duration: 0.6, ease: "power2.out" }, 0)
      .to(state, { opacity: 1, duration: 0.08 }, 0)
      .to(state, { opacity: 0, duration: 0.52 }, 0.08);
  },
});
