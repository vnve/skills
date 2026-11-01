({
  sdkVersion: 2,
  id: "memory",
  name: "柔和回忆",
  sceneId: "SCENE_ID",
  duration: 2,
  build({ scene, target, timeline }) {
    const curve = scene.path({
      id: "curve",
      data: "M 0 540 Q 480 200 960 540 T 1920 540",
      stroke: "#9ab9e8",
      strokeWidth: 5,
    });
    const state = target(curve, { opacity: 0 });
    timeline()
      .to(state, { opacity: 0.6, duration: 1, ease: "power2.out" })
      .to(state, { opacity: 0, duration: 1 });
  },
});
