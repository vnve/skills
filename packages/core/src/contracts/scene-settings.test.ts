import { expect, it } from "vitest";
import { createDefaultProject, createDefaultScene } from "../helpers";
import {
  applyProjectPatchPlan,
  type ProjectPatchOperation,
} from "./project-patch";
import {
  areSceneSettingsLinked,
  resolveSceneSettings,
} from "../helpers/scene-settings";
import { resolveDialogueProps } from "../helpers/resolve-scene-property";
import type { Project } from "../types/project";

function apply(project: Project, operations: ProjectPatchOperation[]) {
  const result = applyProjectPatchPlan(project, {
    summary: "Settings",
    operations,
  });
  if (!result.ok) throw Error(JSON.stringify(result.errors));
  return result.project;
}

it("links defaults, snapshots all effective settings on unlink, and preserves unrelated dialogue styling", () => {
  let project = createDefaultProject();
  const first = project.acts[0].scenes[0];
  const second = createDefaultScene("Second");
  const independent = createDefaultScene("Independent");
  independent.scenePropsLinked = false;
  independent.dialoguePropsLinked = false;
  independent.readingPace = 1.8;
  independent.dimBrightness = 0.3;
  project.acts[0].scenes.push(second, independent);
  first.dialogueThemeId = "daily";
  first.dialogueThemeOverrides = { fontSize: 48, dialogueX: 22 };
  const snapshot = structuredClone(independent);
  project = apply(project, [
    {
      type: "scene.settings.update",
      sceneId: second.id,
      settings: {
        readingPace: 1.5,
        lineGap: 0.3,
        dimBrightness: 0.5,
        autoEntrance: false,
        defaultDisplayMode: "line",
      },
    },
  ]);
  expect(
    resolveSceneSettings(project.acts[0].scenes[0], project.meta).readingPace,
  ).toBe(1.5);
  expect(project.acts[0].scenes[2]).toEqual(snapshot);
  expect(
    resolveSceneSettings(project.acts[0].scenes[2], project.meta).readingPace,
  ).toBe(1.8);
  const effective = resolveSceneSettings(
    project.acts[0].scenes[0],
    project.meta,
  );
  project = apply(project, [
    { type: "scene.settings.link", sceneId: first.id, linked: false },
  ]);
  expect(resolveSceneSettings(project.acts[0].scenes[0], project.meta)).toEqual(
    effective,
  );
  project = apply(project, [
    {
      type: "scene.settings.update",
      sceneId: second.id,
      settings: { readingPace: 2 },
    },
  ]);
  expect(
    resolveSceneSettings(project.acts[0].scenes[0], project.meta).readingPace,
  ).toBe(1.5);
  project = apply(project, [
    {
      type: "scene.settings.update",
      sceneId: first.id,
      settings: { speakerScale: true, lineGap: 0.6 },
    },
  ]);
  expect(project.meta.sceneDefaults?.speakerScale).not.toBe(true);
  project = apply(project, [
    { type: "scene.settings.link", sceneId: first.id, linked: true },
  ]);
  expect(areSceneSettingsLinked(project.acts[0].scenes[0])).toBe(true);
  expect(
    resolveSceneSettings(project.acts[0].scenes[0], project.meta).readingPace,
  ).toBe(2);
  expect(project.acts[0].scenes[0].dialogueThemeOverrides).toEqual({
    fontSize: 48,
    dialogueX: 22,
  });
  expect(
    resolveDialogueProps(project.acts[0].scenes[0], project.meta)
      .dialogueThemeId,
  ).toBe(project.meta.defaultDialogueThemeId);
  expect(project.acts[0].scenes[2]).toEqual(snapshot);
});

it("recognizes legacy independence and snapshots a mixed-link scene before editing it", () => {
  let project = createDefaultProject();
  const scene = project.acts[0].scenes[0];
  scene.dialoguePropsLinked = false;
  scene.dialogueThemeId = "daily";
  scene.dialogueThemeOverrides = { fontSize: 48, dialogueX: 22 };
  scene.readingPace = 1.4;
  project.meta.sceneDefaults = { dimBrightness: 0.4, autoEntrance: false };
  expect(areSceneSettingsLinked(scene)).toBe(false);
  project = apply(project, [
    {
      type: "scene.settings.update",
      sceneId: scene.id,
      settings: { lineGap: 0.5 },
    },
  ]);
  expect(
    resolveSceneSettings(project.acts[0].scenes[0], project.meta),
  ).toMatchObject({
    readingPace: 1.4,
    dimBrightness: 0.4,
    autoEntrance: false,
    lineGap: 0.5,
  });
  project = apply(project, [
    { type: "scene.settings.link", sceneId: scene.id, linked: true },
  ]);
  expect(
    resolveDialogueProps(project.acts[0].scenes[0], project.meta),
  ).toMatchObject({ dialogueThemeId: "daily", dialogueX: 22 });
});

it("rejects invalid settings before applying any mutation", () => {
  const project = createDefaultProject();
  const sceneId = project.acts[0].scenes[0].id;
  const original = structuredClone(project);
  expect(() =>
    applyProjectPatchPlan(project, {
      summary: "Invalid",
      operations: [
        { type: "scene.settings.link", sceneId, linked: false },
        {
          type: "scene.settings.update",
          sceneId,
          settings: { readingPace: -1 },
        },
      ],
    }),
  ).toThrow();
  expect(project).toEqual(original);
});
