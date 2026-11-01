import { gsap } from "gsap";

/** A detached, finite GSAP tree. It never runs on a wall-clock ticker. */
export function createTimeline() {
  const timeline = gsap.timeline({
    paused: true,
    defaults: { ease: "none", lazy: false },
  });
  gsap.globalTimeline.remove(timeline);
  gsap.ticker.sleep();
  return timeline;
}
export function span(
  timeline: gsap.core.Timeline,
  duration: number,
  position: gsap.Position,
  ease = "none",
) {
  if (!Number.isFinite(duration) || duration < 0)
    throw new Error("Invalid timeline duration");
  timeline.to(
    { value: 0 },
    { value: 1, duration, ease, lazy: false },
    position,
  );
  return timeline.recent() as gsap.core.Tween;
}
export function attach(
  parent: gsap.core.Timeline,
  child: gsap.core.Timeline,
  position: gsap.Position,
) {
  parent.add(child, position);
  child.paused(false);
  gsap.ticker.sleep();
}
/** Project a GSAP-owned local position to its detached master, never to wall time. */
export function masterTime(
  timeline: gsap.core.Animation,
  localTime = 0,
): number {
  let value = localTime;
  let current: gsap.core.Animation | null = timeline;
  while (current?.parent) {
    value = current.startTime() + value / current.timeScale();
    current = current.parent;
  }
  return value;
}
export function disposeTimeline(timeline: gsap.core.Timeline) {
  timeline.kill();
  gsap.ticker.sleep();
}
