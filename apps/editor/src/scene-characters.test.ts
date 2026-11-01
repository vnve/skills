import { expect, it } from "vitest";
import {
  createDefaultProject,
  createDefaultScene,
  applyProjectPatchPlan,
} from "@vnve/core";
import { addSceneCharacter, sceneCharacters } from "./scene-characters";

it("adds an existing identity without changing other scenes, dialogue or shared assets; refuses duplicates", () => {
  const project = createDefaultProject();
  project.assets.visual.character = [
    {
      id: "group",
      name: "Art",
      defaultVariantId: "look",
      variants: [{ id: "look", name: "Default", url: "assets/hero.webp" }],
    },
  ];
  project.visualSubjects = [
    {
      id: "hero",
      name: "Hero",
      type: "character",
      defaultStateId: "normal",
      states: [{ id: "normal", name: "Normal" }],
      binding: { assetGroupId: "group", stateMap: { normal: "look" } },
    },
  ];
  const scene = project.acts[0].scenes[0];
  scene.script.nodes = [{ id: "line", type: "text", text: "Keep this" }];
  const other = createDefaultScene();
  project.acts[0].scenes.push(other);
  const original = structuredClone(project);
  const result = applyProjectPatchPlan(project, {
    summary: "Add",
    operations: addSceneCharacter(project, scene, "hero", "actor"),
  });
  if (!result.ok) throw Error(JSON.stringify(result.errors));
  const updated = result.project.acts[0].scenes[0];
  expect(updated.actors[0]).toMatchObject({
    id: "actor",
    visualSubjectId: "hero",
    visualStateId: "normal",
    variantId: "look",
    x: 50,
    y: 100,
    visible: true,
  });
  expect(updated.script).toEqual(original.acts[0].scenes[0].script);
  expect(result.project.visualSubjects).toEqual(original.visualSubjects);
  expect(result.project.assets).toEqual(original.assets);
  expect(result.project.acts[0].scenes[1]).toEqual(other);
  expect(addSceneCharacter(result.project, updated, "hero")).toEqual([]);
  expect(addSceneCharacter(project, scene, "missing")).toEqual([]);
  project.visualSubjects[0].binding = undefined;
  expect(sceneCharacters(project, scene)[0].usable).toBe(false);
  expect(addSceneCharacter(project, scene, "hero")).toEqual([]);
});
