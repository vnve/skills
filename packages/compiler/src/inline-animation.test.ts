import { expect, it } from "vitest";
import { createDefaultProject, createDefaultScene } from "@vnve/core";
import { buildAnimation } from "../../authoring/src";
import { TimelineService } from "./timeline-service";
import { computeAudioState, computeRenderState } from "@vnve/runtime";
function fixture(sequential: boolean) {
  const project = createDefaultProject(),
    scene = project.acts[0].scenes[0];
  scene.animationClips = [
    buildAnimation(
      {
        sdkVersion: 2,
        id: "effect",
        name: "Effect",
        sceneId: scene.id,
        duration: 3,
        build({ camera, timeline }) {
          timeline().to(camera(), { x: 10, duration: 3, ease: "none" });
        },
      },
      "",
      { width: 1920, height: 1080, cues: [] },
    ),
  ];
  scene.script.nodes = [
    {
      id: "line",
      type: "text",
      text: "A",
      timing: { revealDuration: 1 },
      content: [
        {
          type: "tag",
          name: "animation",
          params: { clipId: "effect", await: sequential },
        },
        { type: "text", text: "A" },
      ],
    },
  ];
  project.acts[0].scenes.push(createDefaultScene());
  return { project, scene };
}
it("places a recipe at its inline tag and lets serial playback advance dialogue", () => {
  const { project, scene } = fixture(true);
  const result = new TimelineService().compileProject(project);
  expect(result.diagnostics).toEqual([]);
  expect(result.sceneAnimations.get(scene.id)?.[0].start).toBe(0);
  expect(result.cues[0].end).toBe(4);
  expect(result.sceneTimeRanges[0].endTime).toBe(4);
});
it("lets parallel dialogue continue while the scene naturally contains the animation tail", () => {
  const { project, scene } = fixture(false);
  const result = new TimelineService().compileProject(project);
  expect(result.diagnostics).toEqual([]);
  expect(result.cues[0].end).toBe(1);
  expect(result.sceneTimeRanges[0].endTime).toBe(3);
  expect(result.sceneAnimations.get(scene.id)?.[0].resolvedDuration).toBe(3);
});
it("stores unreferenced recipes without playing them and rejects missing tag references", () => {
  const { project, scene } = fixture(false);
  scene.script.nodes[0].content = [{ type: "text", text: "A" }];
  expect(
    new TimelineService().compileProject(project).sceneAnimations.get(scene.id),
  ).toEqual([]);
  scene.script.nodes[0].content = [
    { type: "tag", name: "animation", params: { clipId: "missing" } },
  ];
  expect(
    new TimelineService()
      .compileProject(project)
      .diagnostics.some((d) => d.code === "ANIMATION_UNKNOWN_CLIP"),
  ).toBe(true);
});
it("supports independent repeated placements and removes waits when a tag is disabled", () => {
  const { project, scene } = fixture(true);
  scene.script.nodes[0].content = [
    {
      type: "tag",
      name: "animation",
      params: { clipId: "effect", await: true, weight: 0.5 },
    },
    {
      type: "tag",
      name: "animation",
      params: { clipId: "effect", await: true, enabled: false },
    },
    {
      type: "tag",
      name: "animation",
      params: { clipId: "effect", await: true },
    },
    { type: "text", text: "A" },
  ];
  const result = new TimelineService().compileProject(project);
  expect(result.diagnostics).toEqual([]);
  const clips = result.sceneAnimations.get(scene.id)!;
  expect(new Set(clips.map((c) => c.id)).size).toBe(3);
  expect(clips.map((c) => c.start)).toEqual([0, 3, 3]);
  expect(clips[0].overrides?.weight).toBe(0.5);
  expect(result.cues[0].end).toBe(7);
});
it("keeps an inline text position stable when the recording grows", () => {
  const { project, scene } = fixture(false);
  scene.script.nodes[0] = {
    id: "line",
    type: "text",
    text: "AB",
    audioUrl: "voice.wav",
    audioDuration: 2,
    timing: { revealDuration: 2 },
    content: [
      { type: "text", text: "A" },
      {
        type: "tag",
        name: "animation",
        params: { clipId: "effect", await: false },
      },
      { type: "text", text: "B" },
    ],
  };
  const compiler = new TimelineService();
  expect(
    compiler.compileProject(project).sceneAnimations.get(scene.id)![0].start,
  ).toBe(1);
  scene.script.nodes[0].audioDuration = 4;
  const result = compiler.compileProject(project);
  expect(result.sceneAnimations.get(scene.id)![0].start).toBe(1);
  expect(
    result.audioPlan.voiceSegments[0].end -
      result.audioPlan.voiceSegments[0].start,
  ).toBe(4);
  expect(result.sceneTimeRanges[0].endTime).toBe(4);
});
it("infers finite local tween duration when no explicit fragment duration is given", () => {
  const { project, scene } = fixture(false);
  delete scene.animationClips![0].duration;
  const result = new TimelineService().compileProject(project);
  expect(result.diagnostics).toEqual([]);
  expect(result.sceneAnimations.get(scene.id)![0].resolvedDuration).toBe(3);
});
it("waits for a serial performance before voiced text and pauses/resumes mid-line without stretching the recording", () => {
  const { project, scene } = fixture(true);
  scene.script.nodes[0].audioUrl = "voice.wav";
  scene.script.nodes[0].audioDuration = 2;
  let result = new TimelineService().compileProject(project);
  expect(result.audioPlan.voiceSegments.map((v) => [v.start, v.end])).toEqual([
    [3, 5],
  ]);
  expect(result.cues[0].voice).toMatchObject({ start: 3, end: 5 });
  scene.script.nodes[0].text = "AB";
  scene.script.nodes[0].content = [
    { type: "text", text: "A" },
    {
      type: "tag",
      name: "animation",
      params: { clipId: "effect", await: true },
    },
    { type: "text", text: "B" },
  ];
  result = new TimelineService().compileProject(project);
  expect(
    result.audioPlan.voiceSegments.map((v) => [v.start, v.end, v.offset ?? 0]),
  ).toEqual([
    [0, 0.5, 0],
    [3.5, 5, 0.5],
  ]);
  expect(computeAudioState(result.audioPlan, 2).voices).toEqual([]);
  expect(computeAudioState(result.audioPlan, 4.25).voices[0]).toMatchObject({
    offset: 1.25,
    duration: 2,
  });
  expect(
    computeRenderState(result.timeline.events, 2).narration?.progress,
  ).toBe(0.5);
});
it("keeps compilation read-only and lets disabled tags retain stale symbolic recipes", () => {
  const { project, scene } = fixture(true);
  scene.script.nodes[0].content = [
    { type: "tag", name: "animation", params: { clipId: "effect" } },
    { type: "text", text: "A" },
  ];
  const before = JSON.stringify(project);
  new TimelineService().compileProject(project);
  expect(JSON.stringify(project)).toBe(before);
  scene.script.nodes[0].content[0] = {
    type: "tag",
    name: "animation",
    params: { clipId: "effect", enabled: false },
  };
  const clip = scene.animationClips![0];
  delete clip.duration;
  clip.bindings.push({ query: "width", value: 2 });
  const result = new TimelineService().compileProject(project);
  expect(result.diagnostics).toEqual([]);
  expect(result.sceneTimeRanges[0].endTime).toBe(1);
});
it("keeps typewriter speed independent of a long recording while serial performance pauses share its text clock", () => {
  const { project, scene } = fixture(true);
  scene.script.nodes[0] = {
    id: "line",
    type: "text",
    text: "AB",
    audioUrl: "voice.wav",
    audioDuration: 8,
    timing: { revealDuration: 1 },
    content: [
      { type: "text", text: "A" },
      {
        type: "tag",
        name: "animation",
        params: { clipId: "effect", await: true },
      },
      { type: "text", text: "B" },
    ],
  };
  const result = new TimelineService().compileProject(project);
  expect(result.diagnostics).toEqual([]);
  expect(result.sceneAnimations.get(scene.id)![0].start).toBe(0.5);
  expect(
    computeRenderState(result.timeline.events, 0.25).narration?.progress,
  ).toBe(0.25);
  expect(
    computeRenderState(result.timeline.events, 3.75).narration?.progress,
  ).toBe(0.75);
  expect(
    result.audioPlan.voiceSegments.map((v) => [v.start, v.end, v.offset ?? 0]),
  ).toEqual([
    [0, 0.5, 0],
    [3.5, 11, 0.5],
  ]);
  expect(result.cues[0].end).toBe(11);
});
it('warns by clip ID when a defined animation has no script placement',()=>{
 const {project,scene}=fixture(true);scene.script.nodes[0].content=[{type:'text',text:'A'}];
 expect(new TimelineService().compileProject(project).diagnostics).toContainEqual(expect.objectContaining({level:'warning',code:'ANIMATION_UNREFERENCED',location:expect.objectContaining({sceneId:scene.id,animationId:'effect'})}));
});
