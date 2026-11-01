import { expect, it } from "vitest";
import { stepDialogueCue } from "./dialogue-navigation";
const cue = (nodeId: string, text: string, start: number, end: number) => ({
  sceneId: "s",
  nodeId,
  text,
  start,
  end,
  index: 0,
  revealDuration: 1,
});
it("steps past dialogue even while a parallel tag-only opening cue overlaps it", () => {
  const cues = [
    cue("opening", "", 0, 6),
    cue("first", "第一句", 0, 1),
    cue("second", "第二句", 1.15, 2.15),
    cue("third", "第三句", 2.3, 3.3),
  ];
  expect(stepDialogueCue(cues, 0.05, 1)?.nodeId).toBe("second");
  expect(stepDialogueCue(cues, 1.2, 1)?.nodeId).toBe("third");
  expect(stepDialogueCue(cues, 1.1, 1)?.nodeId).toBe("second");
  expect(stepDialogueCue(cues, 1.1, -1)?.nodeId).toBe("first");
});
