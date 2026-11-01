import { expect, it } from "vitest";
import { createDefaultProject, type InlineTag } from "@vnve/core";
import { compilePlaybackScope } from "@vnve/renderer/playback";
import { createTagPreviewProject } from "./tag-preview";

it("previews only the selected effect without dialogue, voice, other tags or source edits", () => {
  const project = createDefaultProject();
  const scene = project.acts[0].scenes[0];
  scene.autoEntrance = true;
  scene.transition = { type: "fade-black", duration: 2 };
  scene.script.nodes = [
    {
      id: "line",
      type: "text",
      text: "beforeafter",
      audioUrl: "voice.wav",
      audioDuration: 8,
      content: [
        { type: "tag", name: "wait", params: { seconds: 3 } },
        { type: "text", text: "before" },
        {
          type: "tag",
          name: "camera",
          params: {
            action: "focus",
            target: "point",
            x: 100,
            y: 100,
            zoom: 1.2,
            dur: 0.7,
          },
        },
        { type: "text", text: "after" },
      ],
    },
  ];
  const original = structuredClone(project);
  const tag: InlineTag = {
    type: "tag",
    name: "camera",
    params: {
      action: "focus",
      target: "point",
      x: 100,
      y: 100,
      zoom: 1.2,
      dur: 0.7,
    },
  };
  const isolated = createTagPreviewProject(project, scene.id, tag);
  const compiled = compilePlaybackScope({
    project: isolated,
    scope: { type: "scene", sceneId: scene.id },
    resolvedUrlMap: new Map(),
  });
  expect(compiled.events.filter((e) => e.type === "camera-focus")).toHaveLength(
    1,
  );
  expect(compiled.events.filter((e) => e.type === "wait")).toHaveLength(0);
  expect(compiled.cues.every((c) => !c.text)).toBe(true);
  expect(JSON.stringify(compiled.audioPlan)).not.toContain("voice.wav");
  expect(compiled.sequence.duration).toBeLessThan(3);
  expect(project).toEqual(original);
});
it("previews the full duration of a parallel animation in isolation", async () => {
  const { buildAnimation } = await import("../../../packages/authoring/src");
  const project = createDefaultProject(),
    scene = project.acts[0].scenes[0];
  scene.animationClips = [
    buildAnimation(
      {
        sdkVersion: 2,
        id: "selected",
        sceneId: scene.id,
        name: "Selected",
        duration: 2,
        build({ camera, timeline }) {
          timeline().to(camera(), { x: 100, duration: 2 });
        },
      },
      "",
      { width: 1920, height: 1080, cues: [] },
    ),
  ];
  const isolated = createTagPreviewProject(project, scene.id, {
    type: "tag",
    name: "animation",
    params: { clipId: "selected", await: false },
  });
  const compiled = compilePlaybackScope({
    project: isolated,
    scope: { type: "scene", sceneId: scene.id },
    resolvedUrlMap: new Map(),
  });
  expect(compiled.sequence.duration).toBe(2);
});
it("previews wipe using the actual adjacent scene without its dialogue or audio", () => {
  const project = createDefaultProject(),
    source = project.acts[0].scenes[0],
    next = structuredClone(source);
  next.id = "next";
  next.script.nodes = [
    {
      id: "spoken",
      type: "text",
      text: "Long dialogue",
      audioUrl: "voice.wav",
      audioDuration: 8,
    },
  ];
  project.acts[0].scenes.push(next);
  const before = JSON.stringify(project);
  const isolated = createTagPreviewProject(project, source.id, {
    type: "tag",
    name: "wipe",
    params: { nextScene: "next", dur: 1 },
  });
  const result = compilePlaybackScope({
    project: isolated,
    scope: { type: "project" },
    resolvedUrlMap: new Map(),
  });
  expect(result.sequence.transitions[0].effect).toBe("wipe-left");
  expect(JSON.stringify(result.audioPlan)).not.toContain("voice.wav");
  expect(result.cues.every((c) => !c.text)).toBe(true);
  expect(JSON.stringify(project)).toBe(before);
});
