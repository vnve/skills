import { expect, it } from "vitest";
import { createDefaultProject, applyProjectPatchPlan } from "@vnve/core";
import { TimelineService } from "./timeline-service";
it("compiles the unified timing link independently of dialogue appearance and keeps recorded audio duration", () => {
  let project = createDefaultProject();
  project.meta.defaultDialogueThemeId = "daily";
  const scene = project.acts[0].scenes[0];
  scene.script.nodes = [
    {
      id: "line",
      type: "text",
      text: "A sentence long enough to measure its reading time.",
    },
  ];
  const compiler = new TimelineService();
  const baseline = compiler.compileProject(project);
  const result = applyProjectPatchPlan(project, {
    summary: "Independent timing",
    operations: [
      { type: "scene.settings.link", sceneId: scene.id, linked: false },
      {
        type: "scene.settings.update",
        sceneId: scene.id,
        settings: { readingPace: 2 },
      },
    ],
  });
  if (!result.ok) throw Error(JSON.stringify(result.errors));
  project = result.project;
  const fast = compiler.compileProject(project);
  expect(fast.timeline.duration).toBeLessThan(baseline.timeline.duration);
  const text = fast.timeline.events.find((event) => event.type === "narrate");
  expect(text).toBeDefined();
  expect(JSON.stringify(text)).toContain("daily");
  project.acts[0].scenes[0].script.nodes[0].audioUrl = "assets/voice.wav";
  project.acts[0].scenes[0].script.nodes[0].audioDuration = 9;
  expect(
    compiler.compileProject(project).timeline.duration,
  ).toBeGreaterThanOrEqual(9);
});
