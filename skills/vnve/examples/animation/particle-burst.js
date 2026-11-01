({
  sdkVersion: 2, id: "particle-burst", name: "确定性碎片冲击", sceneId: "SCENE_ID",
  duration: 1.2, seed: 37, space: "screen",
  build({ scene }) {
    scene.group({ id: "burst", blendMode: "add", bounds: { x: 0, y: 0, width: 1920, height: 1080 } });
    scene.particles({
      id: "fragments", parentId: "burst",
      particles: Array.from({ length: 120 }, (_, i) => ({
        id: `fragment-${i}`, birth: 0, lifetime: 1.2, radius: 3, fill: "#ffd89a", sampleRate: 30,
        sample: ({ localTime: t, random }) => {
          const angle = random(1) * Math.PI * 2, speed = 200 + random(2) * 700;
          return { x: 960 + Math.cos(angle) * speed * t, y: 540 + Math.sin(angle) * speed * t + 180 * t * t, opacity: Math.max(0, 1 - t / 1.2), scaleX: 1 + t * 2, scaleY: 1 };
        },
      })),
    });
  },
})
