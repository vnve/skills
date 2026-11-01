({
  sdkVersion: 2,
  id: "chapter-title",
  name: "章节标题",
  sceneId: "SCENE_ID",
  duration: 2,
  space: "screen",
  build({ scene, target, timeline }) {
    const title = scene.text({
      id: "title",
      text: "CHAPTER ONE",
      x: 700,
      y: 300,
      fontSize: 48,
      fill: "#ffffff",
    });
    const state = target(title, { y: 340, opacity: 0 });
    timeline()
      .to(state, { y: 300, opacity: 1, duration: 0.4, ease: "power2.out" }, 0)
      .to(state, { y: 280, opacity: 0, duration: 0.4, ease: "power2.in" }, 1.6);
  },
});
