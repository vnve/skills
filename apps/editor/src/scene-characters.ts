import {
  createId,
  type Project,
  type ProjectPatchOperation,
  type Scene,
} from "@vnve/core";

export function sceneCharacters(project: Project, scene: Scene) {
  return project.visualSubjects
    .filter((subject) => subject.type === "character")
    .map((subject) => {
      const group = project.assets.visual.character.find(
        (group) => group.id === subject.binding?.assetGroupId,
      );
      const variantId = subject.binding?.stateMap[subject.defaultStateId];
      const variant = group?.variants.find(
        (variant) => variant.id === variantId,
      );
      return {
        id: subject.id,
        name: subject.name,
        variant,
        added: scene.actors.some(
          (actor) => actor.visualSubjectId === subject.id,
        ),
        usable:
          !!variant &&
          subject.states.some((state) => state.id === subject.defaultStateId),
      };
    });
}

export function addSceneCharacter(
  project: Project,
  scene: Scene,
  subjectId: string,
  actorId = createId(),
): ProjectPatchOperation[] {
  const character = sceneCharacters(project, scene).find(
    (character) => character.id === subjectId,
  );
  if (!character?.usable || character.added) return [];
  return [
    {
      type: "actor.create",
      sceneId: scene.id,
      subjectId,
      actorId,
      x: 50,
      y: 100,
      scale: 1,
      visible: true,
      zIndex: Math.min(
        1000,
        Math.max(-1, ...scene.actors.map((actor) => actor.zIndex)) + 1,
      ),
    },
  ];
}
