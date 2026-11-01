({
  sdkVersion: 2, id: "layered-light", name: "分层光影与尘埃", sceneId: "SCENE_ID",
  duration: 4, seed: 19,
  build({ scene, target, timeline }) {
    const light = scene.group({
      id: "light", cameraFactor: 0.3, blendMode: "screen",
      bounds: { x: 0, y: 0, width: 1920, height: 1080 },
      mask: { type: "ellipse", x: 700, y: 350, radiusX: 700, radiusY: 450 },
    });
    scene.circle({ id: "glow", parentId: light.id, x: 600, y: 200, radius: 450, fill: "#705630", opacity: 0.25 });
    timeline().to(target(light, { x: 0 }), { x: 80, duration: 4, ease: "sine.inOut" });
    scene.particles({
      id: "dust", parentId: light.id, blendMode: "add",
      particles: Array.from({ length: 80 }, (_, i) => ({
        id: `dust-${i}`, birth: 0, lifetime: 4, radius: 2, sampleRate: 15,
        sample: ({ localTime, random }) => ({
          x: random(1) * 1920 + Math.sin(localTime + random(3) * 6) * 20,
          y: random(2) * 1080 - localTime * 12, opacity: 0.35,
        }),
      })),
    });
  },
})
