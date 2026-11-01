import { describe, it, expect } from "vitest";
import { createDefaultProject } from "../helpers";
import {
  applyProjectPatchPlan,
  prepareProjectPatchPlan,
  type ProjectPatchPlan,
} from "./project-patch";
import {buildAnimation} from "../../../authoring/src";
function plan(
  project: ReturnType<typeof createDefaultProject>,
): ProjectPatchPlan {
  return {
    summary: "Continue the story",
    operations: [
      {
        type: "scene.create",
        actId: project.acts[0].id,
        sceneId: "third",
        name: "Third",
      },
      {
        type: "asset.group.create",
        assetType: "character",
        group: {
          id: "hero",
          name: "Hero",
          defaultVariantId: "neutral",
          variants: [
            {
              id: "neutral",
              name: "Neutral",
              url: "/placeholders/character-female-1.avif",
            },
          ],
        },
      },
      {
        type: "asset.variant.create",
        assetType: "character",
        groupId: "hero",
        variant: {
          id: "happy",
          name: "Happy",
          url: "/placeholders/character-female-2.avif",
        },
      },
      {
        type: "subject.create",
        subjectId: "identity",
        subjectType: "character",
        groupId: "hero",
        name: "Lin",
        stateId: "default-state",
      },
      {
        type: "subject.state.add",
        subjectId: "identity",
        stateId: "happy-state",
        name: "Happy",
        variantId: "happy",
      },
      {
        type: "actor.create",
        sceneId: "third",
        actorId: "lin",
        subjectId: "identity",
        stateId: "happy-state",
        x: 30,
        y: 100,
        scale: 1,
        visible: true,
        zIndex: 0,
      },
      {
        type: "dialogue.insert",
        sceneId: "third",
        id: "line-third",
        index: 0,
        text: "Welcome",
        actorId: "lin",
      },
    ],
  };
}
describe("atomic production edits", () => {
  it("adds a new scene, identity, actor and appearance while keeping original node IDs and recordings", () => {
    const p = createDefaultProject();
    p.acts[0].scenes[0].script.nodes = [
      {
        id: "old-line",
        type: "text",
        text: "Old",
        audioUrl: "assets/audio/old.wav",
      },
    ];
    const result = applyProjectPatchPlan(p, plan(p));
    expect(result.ok).toBe(true);
    expect(result.project.acts[0].scenes[0].script.nodes).toEqual(
      p.acts[0].scenes[0].script.nodes,
    );
    expect(result.project.acts[0].scenes[1].actors[0]).toMatchObject({
      id: "lin",
      visualSubjectId: "identity",
      characterId: "hero",
      variantId: "happy",
    });
    expect(p.acts[0].scenes).toHaveLength(1);
    expect(p.assets.visual.character).toHaveLength(0);
  });
  it("rolls back every earlier structural edit if a later audio reference fails", () => {
    const p = createDefaultProject();
    const next = plan(p);
    next.operations.push({
      type: "direction.insert",
      sceneId: "third",
      nodeId: "line-third",
      contentIndex: 0,
      direction: { name: "bgm", params: { asset: "missing" } },
    });
    const result = applyProjectPatchPlan(p, next);
    expect(result).toMatchObject({
      ok: false,
      errors: [{ code: "AUDIO_NOT_FOUND" }],
    });
    expect(result.project).toBe(p);
    expect(p.assets.visual.character).toHaveLength(0);
  });
  it("opens BGM, SFX and actor effect commands through the same validated editing path", () => {
    const p = createDefaultProject();
    const created = applyProjectPatchPlan(p, plan(p));
    created.project.assets.audio.bgm = [
      { id: "music", name: "Music", url: "assets/audio/music.wav" },
    ];
    created.project.assets.audio.sfx = [
      { id: "bell", name: "Bell", url: "assets/audio/bell.wav" },
    ];
    const result = applyProjectPatchPlan(created.project, {
      summary: "Audio and performance",
      operations: [
        {
          type: "direction.insert",
          sceneId: "third",
          nodeId: "line-third",
          contentIndex: 0,
          direction: {
            name: "bgm",
            params: { asset: "music", fade: 0.3, loop: true, duck: 0.4 },
          },
        },
        {
          type: "direction.insert",
          sceneId: "third",
          nodeId: "line-third",
          contentIndex: 1,
          direction: { name: "sfx", params: { asset: "bell", volume: 0.3 } },
        },
        {
          type: "direction.insert",
          sceneId: "third",
          nodeId: "line-third",
          contentIndex: 2,
          direction: {
            name: "rotate",
            params: { actor: "lin", angle: 5, dur: 0.2 },
          },
        },
      ],
    });
    expect(result.ok).toBe(true);
    expect(
      result.project.acts[0].scenes[1].script.nodes[0].content
        ?.slice(0, 3)
        .map((t) => (t.type === "tag" ? t.name : "text")),
    ).toEqual(["bgm", "sfx", "rotate"]);
  });
  it("preserves stable inserted IDs across preview and apply and rejects duplicates", () => {
    const p = createDefaultProject();
    const prepared = prepareProjectPatchPlan({
      summary: "Stable",
      operations: [
        {
          type: "dialogue.insert",
          sceneId: p.acts[0].scenes[0].id,
          index: 0,
          text: "New",
        },
      ],
    });
    const a = applyProjectPatchPlan(p, prepared),
      b = applyProjectPatchPlan(p, prepared);
    expect(a.project.acts[0].scenes[0].script.nodes[0].id).toBe(
      b.project.acts[0].scenes[0].script.nodes[0].id,
    );
    expect(applyProjectPatchPlan(a.project, prepared)).toMatchObject({
      ok: false,
      errors: [{ code: "ID_EXISTS" }],
    });
  });
  it("does not delete a node still used by an anchored motion", () => {
    const p = createDefaultProject(),
      scene = p.acts[0].scenes[0];
    scene.script.nodes = [{ id: "target", type: "text", text: "Wait" }];
    scene.animationClips = [
      buildAnimation({sdkVersion:2,sceneId:scene.id,
        id: "reaction",
        name: "Reaction",
        duration: 1,
        anchor: { nodeId: "target", edge: "end" },
        build({camera,timeline}){timeline().set(camera(),{x:1},0);},
      },"",{width:1920,height:1080,cues:[]}),
    ];
    expect(
      applyProjectPatchPlan(p, {
        summary: "Delete",
        operations: [
          { type: "dialogue.remove", sceneId: scene.id, nodeId: "target" },
        ],
      }),
    ).toMatchObject({ ok: false, errors: [{ code: "ANIMATION_CUE_INVALID" }] });
    expect(scene.script.nodes).toHaveLength(1);
  });
  it("moves scenes without changing their content and rejects stale indices and duplicate IDs", () => {
    const p = createDefaultProject(),
      scene = p.acts[0].scenes[0];
    const result = applyProjectPatchPlan(p, {
      summary: "Reorder",
      operations: [
        { type: "act.create", actId: "second-act", name: "Second" },
        {
          type: "scene.move",
          sceneId: scene.id,
          actId: "second-act",
          index: 0,
        },
      ],
    });
    expect(result.ok).toBe(true);
    expect(result.project.acts[1].scenes[0].id).toBe(scene.id);
    expect(p.acts[0].scenes[0]).toBe(scene);
    expect(
      applyProjectPatchPlan(p, {
        summary: "Bad index",
        operations: [
          {
            type: "scene.create",
            actId: p.acts[0].id,
            sceneId: "new",
            name: "New",
            index: 10,
          },
        ],
      }).ok,
    ).toBe(false);
  });
});

it("keeps semantic expression states through fallback rebinding and later restores their images", () => {
  const p = createDefaultProject();
  let result = applyProjectPatchPlan(p, plan(p));
  expect(result.ok).toBe(true);
  const base = result.project,
    scene = base.acts[0].scenes[1];
  scene.script.nodes[0].content = [
    {
      type: "tag",
      name: "set",
      params: { target: "lin", variant: "happy", stateId: "happy-state" },
    },
    { type: "text", text: "Welcome" },
  ];
  const voice = { audioUrl: "assets/audio/voice.wav", audioDuration: 1 };
  Object.assign(scene.script.nodes[0], voice);
  result = applyProjectPatchPlan(base, {
    summary: "Fallback",
    operations: [
      {
        type: "asset.group.create",
        assetType: "character",
        group: {
          id: "replacement",
          name: "New",
          defaultVariantId: "fallback",
          variants: [
            {
              id: "fallback",
              name: "Default",
              url: "/placeholders/character-female-3.avif",
            },
          ],
        },
      },
      { type: "subject.bind", subjectId: "identity", groupId: "replacement" },
    ],
  });
  expect(result.ok).toBe(true);
  const fallback = result.project.acts[0].scenes[1];
  expect(fallback.actors[0]).toMatchObject({
    visualStateId: "happy-state",
    variantId: "fallback",
  });
  expect(fallback.script.nodes[0].content?.[0]).toMatchObject({
    params: { stateId: "happy-state", variant: "fallback" },
  });
  expect(fallback.script.nodes[0]).toMatchObject(voice);
  result = applyProjectPatchPlan(result.project, {
    summary: "Restore",
    operations: [
      {
        type: "subject.bind",
        subjectId: "identity",
        groupId: "hero",
        stateMap: { "default-state": "neutral", "happy-state": "happy" },
      },
    ],
  });
  expect(result.ok).toBe(true);
  expect(result.project.acts[0].scenes[1].actors[0].variantId).toBe("happy");
  expect(
    result.project.acts[0].scenes[1].script.nodes[0].content?.[0],
  ).toMatchObject({ params: { variant: "happy" } });
  const locked = structuredClone(base);
  locked.acts[0].scenes[1].actors[0].locked = true;
  expect(
    applyProjectPatchPlan(locked, {
      summary: "Locked",
      operations: [
        { type: "subject.bind", subjectId: "identity", groupId: "hero" },
      ],
    }),
  ).toMatchObject({
    ok: false,
    project: locked,
    errors: [{ code: "ACTOR_LOCKED" }],
  });
});
it("binds scene layers to story identities and updates inline layer appearances when rebinding", () => {
  const p = createDefaultProject(),
    scene = p.acts[0].scenes[0];
  scene.script.nodes = [
    {
      id: "line",
      type: "text",
      text: "Night",
      content: [
        {
          type: "tag",
          name: "set",
          params: { target: "$background", variant: "day" },
        },
        { type: "text", text: "Night" },
      ],
    },
  ];
  const result = applyProjectPatchPlan(p, {
    summary: "Location",
    operations: [
      {
        type: "asset.group.create",
        assetType: "background",
        group: {
          id: "place",
          name: "Park",
          defaultVariantId: "day",
          variants: [
            { id: "day", name: "Day", url: "/placeholders/background-1.avif" },
          ],
        },
      },
      {
        type: "asset.group.create",
        assetType: "background",
        group: {
          id: "new-place",
          name: "New park",
          defaultVariantId: "new-day",
          variants: [
            {
              id: "new-day",
              name: "Day",
              url: "/placeholders/background-2.avif",
            },
          ],
        },
      },
      {
        type: "subject.create",
        subjectId: "park",
        subjectType: "location",
        groupId: "place",
        name: "Park",
        stateId: "park-default",
      },
      { type: "scene.layer.bind", sceneId: scene.id, subjectId: "park" },
      { type: "subject.bind", subjectId: "park", groupId: "new-place" },
    ],
  });
  expect(result.ok).toBe(true);
  expect(result.project.acts[0].scenes[0]).toMatchObject({
    backgroundSubjectId: "park",
    backgroundStateId: "park-default",
    backgroundId: "new-day",
  });
  expect(
    result.project.acts[0].scenes[0].script.nodes[0].content?.[0],
  ).toMatchObject({ params: { variant: "new-day" } });
});

it('rejects a final scene-layer edit that would leave an inline appearance in another image group',()=>{
 const p=createDefaultProject(),scene=p.acts[0].scenes[0];
 p.assets.visual.background=[{id:'old',name:'Old',defaultVariantId:'old-image',variants:[{id:'old-image',name:'Old',url:'/placeholders/background-1.avif'}]},{id:'new',name:'New',defaultVariantId:'new-image',variants:[{id:'new-image',name:'New',url:'/placeholders/background-2.avif'}]}];scene.backgroundId='old-image';scene.script.nodes=[{id:'line',type:'text',text:'Hello',content:[{type:'tag',name:'set',params:{target:'$background',variant:'old-image'}},{type:'text',text:'Hello'}]}];
 expect(applyProjectPatchPlan(p,{summary:'Invalid layer',operations:[{type:'scene.update',sceneId:scene.id,backgroundId:'new-image'}]})).toMatchObject({ok:false,project:p,errors:[{code:'VARIANT_NOT_FOUND'}]});
});
