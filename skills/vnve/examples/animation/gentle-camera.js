({
  sdkVersion: 2,
  id: "gentle-camera",
  name: "缓慢推进",
  sceneId: "SCENE_ID",
  duration: 3,
  seed: 17,
  build({ camera, timeline, sample }) {
    const shot = camera();
    timeline().to(shot, { scale: 1.024, duration: 3, ease: "sine.inOut" });
    sample(shot, {
      start: 0,
      duration: 3,
      sample: ({ localTime, random }) => ({
        x: Math.sin(localTime * 2) * random(1) * 0.2,
      }),
    });
  },
});
