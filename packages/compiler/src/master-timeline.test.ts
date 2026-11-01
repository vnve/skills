import { it, expect } from "vitest";
import { createDefaultProject, createDefaultScene } from "@vnve/core";
import { buildAnimation } from "../../authoring/src";
import { TimelineService } from "./timeline-service";
import { sampleAnimationTrack } from "@vnve/runtime";
it("derives dialogue, voice, effects, following scenes and transitions from the same master after a voice change", () => {
  const project = createDefaultProject(),
    first = project.acts[0].scenes[0],
    second = createDefaultScene();
  first.script.nodes = [
    {
      id: "voice",
      type: "text",
      text: "First line",
      audioUrl: "voice.wav",
      audioDuration: 2,
    },
    {
      id: "response",
      type: "text",
      text: "Response",
      timing: { revealDuration: 2 },
    },
  ];
  second.script.nodes = [
    {
      id: "next",
      type: "text",
      text: "Next scene",
      timing: { revealDuration: 1 },
    },
  ];
  second.sceneSettingsLinked = false;
  second.transition = { type: "fade-black", duration: 0.8 };
  project.acts[0].scenes.push(second);
  first.animationClips = [
    buildAnimation(
      {
        sdkVersion: 2,
        id: "reaction",
        name: "Reaction",
        sceneId: first.id,
        duration: 0.5,
        build({ timeline, camera, at }) {
          timeline().to(
            camera(),
            { x: 10, duration: 0.5, ease: "none" },
            at.line("response", "start"),
          );
        },
      },
      "",
      { width: 1920, height: 1080, cues: [] },
    ),
  ];
  first.script.nodes[1].content = [
    {
      type: "tag",
      name: "animation",
      params: { clipId: "reaction", await: false },
    },
    { type: "text", text: "Response" },
  ];
  const compiler = new TimelineService(),
    before = compiler.compileProject(project);
  expect(before.diagnostics).toEqual([]);
  first.script.nodes[0].audioDuration = 4;
  const after = compiler.compileProject(project);
  expect(after.diagnostics).toEqual([]);
  expect(after.cues[1].start - before.cues[1].start).toBeCloseTo(2);
  expect(
    after.audioPlan.voiceSegments[0].end -
      before.audioPlan.voiceSegments[0].end,
  ).toBeCloseTo(2);
  const track = after.sceneAnimations
    .get(first.id)![0]
    .tracks.find((t) => t.property === "x")!;
  expect(after.sceneAnimations.get(first.id)![0].start).toBe(
    after.cues[1].start,
  );
  expect(sampleAnimationTrack(track, 0.25)).toBeCloseTo(5);
  expect(
    after.sceneTimeRanges[1].contentStartTime -
      before.sceneTimeRanges[1].contentStartTime,
  ).toBeCloseTo(2);
  expect(before.inputFingerprint).not.toBe(after.inputFingerprint);
  expect(after.transitions[0].startTime).toBe(after.sceneTimeRanges[0].endTime);
  expect(after.timeline.duration).toBeGreaterThanOrEqual(
    after.transitions[0].endTime,
  );
});
it("contains inline animation tails and rejects ambiguous overlapping effect channels", () => {
  const p = createDefaultProject(),
    s = p.acts[0].scenes[0];
  s.script.nodes = [
    { id: "line", type: "text", text: "A", timing: { revealDuration: 1 } },
  ];
  const clip = buildAnimation(
    {
      sdkVersion: 2,
      id: "a",
      name: "A",
      sceneId: s.id,
      duration: 3,
      build({ timeline, camera }) {
        timeline().to(camera(), { x: 10, duration: 3 });
      },
    },
    "",
    { width: 1920, height: 1080, cues: [] },
  );
  s.animationClips = [clip];
  s.script.nodes[0].content = [
    { type: "tag", name: "animation", params: { clipId: "a", await: false } },
    { type: "text", text: "A" },
  ];
  expect(new TimelineService().compileProject(p).diagnostics).toEqual([]);
  expect(new TimelineService().compileProject(p).timeline.duration).toBe(3);
  s.animationClips.push({ ...clip, id: "b" });
  s.script.nodes[0].content.unshift({
    type: "tag",
    name: "animation",
    params: { clipId: "b", await: false },
  });
  expect(
    new TimelineService()
      .compileProject(p)
      .diagnostics.some((d) => d.message.includes("Overlapping")),
  ).toBe(true);
});
it("keeps an invalid compile invalid instead of substituting an earlier successful timeline", () => {
  const p = createDefaultProject(),
    s = p.acts[0].scenes[0],
    compiler = new TimelineService();
  s.script.nodes = [{ id: "line", type: "text", text: "Valid" }];
  compiler.compileProject(p);
  s.script.nodes = [
    {
      id: "bad",
      type: "text",
      text: "",
      content: [{ type: "tag", name: "wait", params: { seconds: -1 } }],
    },
  ] as never;
  expect(
    compiler.compileProject(p).diagnostics.some((d) => d.level === "error"),
  ).toBe(true);
});

it("allows a disabled recipe to remain stored while its timing is stale without owning active properties", () => {
  const p = createDefaultProject(),
    scene = p.acts[0].scenes[0];
  scene.script.nodes = [
    { id: "line", type: "text", text: "A", timing: { revealDuration: 1 } },
  ];
  const clip = buildAnimation(
    {
      sdkVersion: 2,
      id: "off",
      name: "Off",
      sceneId: scene.id,
      duration: 3,
      overrides: { enabled: false },
      build({ camera, timeline }) {
        timeline().to(camera(), { x: 10, duration: 3 });
      },
    },
    "",
    { width: 1920, height: 1080, cues: [] },
  );
  scene.animationClips = [clip];
  scene.script.nodes[0].content = [
    { type: "tag", name: "animation", params: { clipId: "off", await: false } },
    { type: "text", text: "A" },
  ];
  const result = new TimelineService().compileProject(p);
  expect(result.diagnostics).toEqual([]);
  expect(result.timeline.duration).toBe(1);
});
