({
  sdkVersion: 2, id: "masked-reveal", name: "真实人物光圈揭示", sceneId: "SCENE_ID",
  duration: 2,
  build({ scene, mask, timeline }) {
    const subject = scene.group({
      id: "subject", memberSpace: "stage",
      bounds: { x: 0, y: 0, width: 1920, height: 1080 },
      members: [{ kind: "actor", actorId: "ACTOR_ID" }],
      mask: { type: "ellipse", x: 960, y: 540, radiusX: 0, radiusY: 900 },
    });
    timeline().to(mask(subject), { radiusX: 1200, duration: 1.2, ease: "power2.out" });
  },
})
