({
  sdkVersion: 2,
  id: "gsap-chapter",
  sceneId: "SCENE_ID",
  name: "GSAP · 章节开场",
  width: 1920,
  height: 1080,
  duration: 6,
  space: "screen",
  build({ scene, timeline, target }) {
    scene.rect({ id: "backdrop", width: 1920, height: 1080, fill: "#0b1422" });
    scene.circle({
      id: "orbit",
      x: 1510,
      y: 430,
      radius: 290,
      stroke: "#233849",
      strokeWidth: 2,
    });
    const ring = scene.circle({
      id: "ring",
      x: 1510,
      y: 430,
      radius: 210,
      stroke: "#75ead4",
      strokeWidth: 3,
    });
    const ringState = target(ring, { scaleX: 0.5, scaleY: 0.5, opacity: 0 });
    const bars = Array.from({ length: 7 }, (_, i) => {
      const bar = scene.rect({
        id: `bar-${i}`,
        x: 1320 + i * 58,
        y: 580,
        width: 24,
        height: 180 - Math.abs(i - 3) * 35,
        fill: i === 3 ? "#ff9c7b" : "#75ead4",
      });
      return target(bar, { scaleY: 0, opacity: 0 });
    });
    const eyebrow = scene.text({
      id: "eyebrow",
      text: "VNVE  /  MOTION STUDY 01",
      x: 180,
      y: 252,
      fontSize: 25,
      fill: "#75ead4",
    });
    const title = scene.text({
      id: "title",
      text: "BEYOND\nTHE FRAME.",
      x: 180,
      y: 338,
      fontSize: 112,
      fill: "#f5f1e8",
    });
    const subtitle = scene.text({
      id: "subtitle",
      text: "A new chapter starts with a little motion.",
      x: 188,
      y: 640,
      fontSize: 29,
      fill: "#9caeba",
    });
    const rule = scene.rect({
      id: "rule",
      x: 180,
      y: 736,
      width: 580,
      height: 3,
      fill: "#ff9c7b",
    });
    const eyebrowState = target(eyebrow, { y: 280, opacity: 0 });
    const titleState = target(title, { x: 120, opacity: 0 });
    const subtitleState = target(subtitle, { y: 666, opacity: 0 });
    const ruleState = target(rule, { scaleX: 0 });
    const tl = timeline();
    tl.addLabel("enter", 0.2)
      .to(
        eyebrowState,
        { y: 252, opacity: 1, duration: 0.7, ease: "power2.out" },
        "enter",
      )
      .to(
        titleState,
        { x: 180, opacity: 1, duration: 1.1, ease: "power3.out" },
        "enter+=0.2",
      )
      .to(
        ringState,
        { scaleX: 1, scaleY: 1, opacity: 1, duration: 1.4, ease: "power2.out" },
        "enter",
      )
      .to(
        bars,
        {
          scaleY: 1,
          duration: 0.9,
          stagger: 0.08,
          ease: "back.out(1.5)",
        },
        "enter+=0.5",
      )
      .to(
        bars,
        { opacity: 1, duration: 0.3, stagger: 0.08, ease: "none" },
        "enter+=0.5",
      )
      .to(
        subtitleState,
        { y: 640, opacity: 1, duration: 0.7, ease: "power2.out" },
        "enter+=0.8",
      )
      .to(
        ruleState,
        { scaleX: 1, duration: 1, ease: "power3.inOut" },
        "enter+=0.8",
      )
      .addLabel("breathe", 2.4)
      .to(
        ringState,
        {
          scaleX: 1.05,
          scaleY: 1.05,
          duration: 0.65,
          repeat: 1,
          yoyo: true,
          ease: "sine.inOut",
        },
        "breathe",
      )
      .addLabel("leave", 4.7)
      .to(
        [eyebrowState, titleState, subtitleState, ringState, ...bars],
        { opacity: 0, duration: 0.6, stagger: 0.035, ease: "power2.in" },
        "leave",
      )
      .to(ruleState, { scaleX: 0, duration: 0.6, ease: "power2.in" }, "leave");
  },
});
