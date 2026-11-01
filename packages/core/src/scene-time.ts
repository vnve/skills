import { isDissolveTransition } from "./scene-transitions";
export interface SceneTimeRangeLike {
  sceneId: string;
  startTime: number;
  endTime: number;
}

export interface TransitionRangeLike {
  startTime: number;
  endTime: number;
  transitionIn?: { type: string; duration: number };
}

export function findSceneAtTime<T extends SceneTimeRangeLike>(
  ranges: ReadonlyArray<T>,
  time: number,
): string | null {
  for (let i = 0; i < ranges.length; i++) {
    const range = ranges[i];
    if (time >= range.startTime && time < range.endTime) {
      return range.sceneId;
    }
    const next = ranges[i + 1];
    if (next && time >= range.endTime && time < next.startTime) {
      return range.sceneId;
    }
  }

  if (ranges.length > 0) {
    if (time < ranges[0].startTime) {
      return ranges[0].sceneId;
    }
    return ranges[ranges.length - 1].sceneId;
  }

  return null;
}

export function computeTransitionOverlay<T extends TransitionRangeLike>(
  ranges: ReadonlyArray<T>,
  time: number,
): { effect: string; progress: number } | null {
  for (const range of ranges) {
    if (!range.transitionIn) continue;
    const duration = range.transitionIn.duration;
    if (duration <= 0) continue;

    const isDissolve = isDissolveTransition(range.transitionIn.type);
    const transStart = isDissolve
      ? range.startTime
      : range.startTime - duration / 2;
    const transEnd = isDissolve
      ? range.startTime + duration
      : range.startTime + duration / 2;
    if (time >= transStart && time < transEnd) {
      return {
        effect: range.transitionIn.type,
        progress: (time - transStart) / duration,
      };
    }
  }

  return null;
}
