import {buildAnimation} from '../../../authoring/src';
import { describe, expect, it } from 'vitest';
import { createDefaultProject } from '../helpers';
import { applyProjectPatchPlan, projectPatchPlanSchema } from './project-patch';

function makeProject() {
  const project = createDefaultProject();
  const scene = project.acts[0]!.scenes[0]!;
  project.assets.visual.character = [{
    id: 'character-1',
    name: 'Lin',
    defaultVariantId: 'variant-default',
    variants: [
      { id: 'variant-default', name: 'Default', url: 'default.png' },
      { id: 'variant-happy', name: 'Happy', url: 'happy.png' },
    ],
  }];
  scene.actors = [{
    id: 'actor-1', characterId: 'character-1', x: 50, y: 100, scale: 1,
    visible: true, zIndex: 1, variantId: 'variant-default',
  }];
  scene.script.nodes = [{ id: 'line-1', type: 'text', actorId: 'actor-1', text: 'Old', audioUrl: 'old.wav' }];
  return project;
}

describe('Project Patch contract', () => {
  it('still rejects an empty variant id when explicitly switching portraits', () => {
    expect(projectPatchPlanSchema.safeParse({
      summary: 'Switch portrait',
      operations: [{ type: 'actor.update', sceneId: 'scene-1', actorId: 'actor-1', variantId: '' }],
    }).success).toBe(false);
  });

  it('applies actor, scene and dialogue operations atomically', () => {
    const project = makeProject();
    const sceneId = project.acts[0]!.scenes[0]!.id;
    const result = applyProjectPatchPlan(project, {
      summary: 'Move Lin and update the line',
      operations: [
        { type: 'actor.update', sceneId, actorId: 'actor-1', x: 25, scale: 1.2, flipX: true, variantId: 'variant-happy' },
        { type: 'scene.update', sceneId, dimBrightness: 0.25 },
        { type: 'dialogue.update', sceneId, nodeId: 'line-1', text: 'New line' },
      ],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const scene = result.project.acts[0]!.scenes[0]!;
    expect(scene.actors[0]).toMatchObject({ x: 25, y: 100, scale: 1.2, flipX: true, variantId: 'variant-happy' });
    expect(scene.dimBrightness).toBe(0.25);
    expect(scene.script.nodes[0]).toMatchObject({ text: 'New line', audioUrl: undefined });
    expect(project.acts[0]!.scenes[0]!.actors[0]!.x).toBe(50);
  });

  it('rejects the whole plan when any target is invalid', () => {
    const project = makeProject();
    const sceneId = project.acts[0]!.scenes[0]!.id;
    const result = applyProjectPatchPlan(project, {
      summary: 'Invalid mixed update',
      operations: [
        { type: 'actor.update', sceneId, actorId: 'actor-1', x: 20 },
        { type: 'dialogue.update', sceneId, nodeId: 'missing', text: 'Never applied' },
      ],
    });

    expect(result).toMatchObject({ ok: false, project, errors: [{ operationIndex: 1, code: 'DIALOGUE_NOT_FOUND' }] });
    expect(project.acts[0]!.scenes[0]!.actors[0]!.x).toBe(50);
  });

  it('rejects dialogue replacement when the line contains inline commands', () => {
    const project = makeProject();
    const scene = project.acts[0]!.scenes[0]!;
    scene.script.nodes[0] = {
      ...scene.script.nodes[0]!,
      content: [
        { type: 'tag', name: 'show', params: { actor: 'actor-1' } },
        { type: 'text', text: 'Old' },
      ],
    };

    const result = applyProjectPatchPlan(project, {
      summary: 'Replace tagged line',
      operations: [{ type: 'dialogue.update', sceneId: scene.id, nodeId: 'line-1', text: 'New line' }],
    });

    expect(result).toMatchObject({
      ok: false,
      errors: [{ operationIndex: 0, code: 'DIALOGUE_HAS_INLINE_COMMANDS' }],
    });
    expect(project.acts[0]!.scenes[0]!.script.nodes[0]!.content).toHaveLength(2);
  });

  it('refuses to modify locked actors and unknown variants', () => {
    const project = makeProject();
    const scene = project.acts[0]!.scenes[0]!;
    scene.actors[0]!.locked = true;
    expect(applyProjectPatchPlan(project, {
      summary: 'Move locked actor',
      operations: [{ type: 'actor.update', sceneId: scene.id, actorId: 'actor-1', x: 10 }],
    })).toMatchObject({ ok: false, errors: [{ code: 'ACTOR_LOCKED' }] });

    scene.actors[0]!.locked = false;
    expect(applyProjectPatchPlan(project, {
      summary: 'Use unknown variant',
      operations: [{ type: 'actor.update', sceneId: scene.id, actorId: 'actor-1', variantId: 'missing' }],
    })).toMatchObject({ ok: false, errors: [{ code: 'VARIANT_NOT_FOUND' }] });
  });

  it('rejects operations without a change and unsafe coordinate ranges', () => {
    expect(projectPatchPlanSchema.safeParse({
      summary: 'No-op',
      operations: [{ type: 'actor.update', sceneId: 'scene-1', actorId: 'actor-1' }],
    }).success).toBe(false);
    expect(projectPatchPlanSchema.safeParse({
      summary: 'Off canvas',
      operations: [{ type: 'actor.update', sceneId: 'scene-1', actorId: 'actor-1', x: 301 }],
    }).success).toBe(false);
  });
  it('rewrites a text segment without moving tags or losing styles, and invalidates audio', () => {
    const project = makeProject();
    const scene = project.acts[0]!.scenes[0]!;
    const tag = { type: 'tag' as const, name: 'wait' as const, params: { seconds: 1 } };
    scene.script.nodes[0]!.content = [{ type: 'text', text: 'Old', bold: true }, tag, { type: 'text', text: 'ending' }];
    const result = applyProjectPatchPlan(project, { summary: 'Rewrite', operations: [{ type: 'dialogue.segment.update', sceneId: scene.id, nodeId: 'line-1', contentIndex: 0, text: 'New' }] });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.project.acts[0]!.scenes[0]!.script.nodes[0]).toMatchObject({ text: 'Newending', audioUrl: undefined, ttsSnapshot: undefined, content: [{ type: 'text', text: 'New', bold: true }, tag, { type: 'text', text: 'ending' }] });
  });

  it('inserts visual directions sequentially, preserving audio until speech timing changes', () => {
    const project = makeProject();
    const sceneId = project.acts[0]!.scenes[0]!.id;
    const visual = applyProjectPatchPlan(project, { summary: 'Stage', operations: [
      { type: 'direction.insert', sceneId, nodeId: 'line-1', contentIndex: 0, direction: { name: 'set', params: { target: 'actor-1', variant: 'variant-happy' } } },
      { type: 'direction.insert', sceneId, nodeId: 'line-1', contentIndex: 2, direction: { name: 'hide', params: { actor: 'actor-1' } } },
    ] });
    expect(visual.ok).toBe(true);
    if (!visual.ok) return;
    expect(visual.project.acts[0]!.scenes[0]!.script.nodes[0]!.audioUrl).toBe('old.wav');
    const pause = applyProjectPatchPlan(visual.project, { summary: 'Pause', operations: [{ type: 'direction.insert', sceneId, nodeId: 'line-1', contentIndex: 3, direction: { name: 'wait', params: { seconds: 2 } } }] });
    expect(pause.ok).toBe(true);
    if (pause.ok) expect(pause.project.acts[0]!.scenes[0]!.script.nodes[0]!.audioUrl).toBeUndefined();
  });

  it('rejects an entire staging plan for unknown targets, sprites or locked actors', () => {
    const project = makeProject();
    const scene = project.acts[0]!.scenes[0]!;
    const patch = { type: 'direction.insert' as const, sceneId: scene.id, nodeId: 'line-1', contentIndex: 0 };
    for (const direction of [
      { name: 'hide' as const, params: { actor: 'unknown' } },
      { name: 'set' as const, params: { target: 'actor-1', variant: 'unknown' } },
      { name: 'show' as const, params: { actor: '$background' } },
    ]) {
      expect(applyProjectPatchPlan(project, { summary: 'Invalid', operations: [{ type: 'actor.update', sceneId: scene.id, actorId: 'actor-1', x: 10 }, { ...patch, direction }] }).ok).toBe(false);
      expect(scene.actors[0]!.x).toBe(50);
    }
    scene.actors[0]!.locked = true;
    expect(applyProjectPatchPlan(project, { summary: 'Locked', operations: [{ ...patch, direction: { name: 'hide', params: { actor: 'actor-1' } } }] })).toMatchObject({ ok: false, errors: [{ code: 'ACTOR_LOCKED' }] });
  });

  it('prevents overwriting or deleting a locked actor direction and replacing text with a tag', () => {
    const project = makeProject();
    const scene = project.acts[0]!.scenes[0]!;
    scene.actors[0]!.locked = true;
    scene.script.nodes[0]!.content = [{ type: 'tag', name: 'hide', params: { actor: 'actor-1' } }, { type: 'text', text: 'Old' }];
    for (const operation of [
      { type: 'direction.update' as const, sceneId: scene.id, nodeId: 'line-1', contentIndex: 0, direction: { name: 'wait' as const, params: { seconds: 1 } } },
      { type: 'direction.remove' as const, sceneId: scene.id, nodeId: 'line-1', contentIndex: 0 },
      { type: 'dialogue.remove' as const, sceneId: scene.id, nodeId: 'line-1' },
      { type: 'dialogue.segment.update' as const, sceneId: scene.id, nodeId: 'line-1', contentIndex: 0, text: 'Wrong' },
    ]) expect(applyProjectPatchPlan(project, { summary: 'Invalid', operations: [operation] }).ok).toBe(false);
  });

  it('adds, reorders and removes lines while keeping existing identities', () => {
    const project = makeProject();
    const sceneId = project.acts[0]!.scenes[0]!.id;
    const result = applyProjectPatchPlan(project, { summary: 'Reorder', operations: [
      { type: 'dialogue.insert', sceneId, index: 1, text: 'New narration' },
      { type: 'dialogue.move', sceneId, nodeId: 'line-1', index: 1 },
    ] });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.project.acts[0]!.scenes[0]!.script.nodes.map(node => node.text)).toEqual(['New narration', 'Old']);
    const removed = applyProjectPatchPlan(result.project, { summary: 'Remove', operations: [{ type: 'dialogue.remove', sceneId, nodeId: 'line-1' }] });
    expect(removed.ok).toBe(true);
    if (removed.ok) expect(removed.project.acts[0]!.scenes[0]!.script.nodes).toHaveLength(1);
  });

  it('makes current-scene appearance changes effective without changing other inherited defaults', () => {
    const project = makeProject();
    project.meta.sceneDefaults = { dimBrightness: 0.75, entranceEffect: 'fade', speakerScale: true, backgroundColor: '#000000' };
    const scene = project.acts[0]!.scenes[0]!;
    const result = applyProjectPatchPlan(project, { summary: 'Change appearance', operations: [{ type: 'scene.update', sceneId: scene.id, dimBrightness: 0.3 }] });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.project.acts[0]!.scenes[0]).toMatchObject({ scenePropsLinked: false, dimBrightness: 0.3, entranceEffect: 'fade', speakerScale: true, backgroundColor: '#000000' });
    expect(project.meta.sceneDefaults.dimBrightness).toBe(0.75);
  });

  it('invalidates synthesis on speaker or emotion changes but keeps it for playback volume', () => {
    const project = makeProject();
    const sceneId = project.acts[0]!.scenes[0]!.id;
    const base = { type: 'dialogue.settings' as const, sceneId, nodeId: 'line-1' };
    const volume = applyProjectPatchPlan(project, { summary: 'Quieter', operations: [{ ...base, voiceVolume: 0.5 }] });
    expect(volume.ok).toBe(true);
    if (volume.ok) expect(volume.project.acts[0]!.scenes[0]!.script.nodes[0]).toMatchObject({ audioUrl: 'old.wav', voiceVolume: 0.5 });
    const emotion = applyProjectPatchPlan(project, { summary: 'Angrier', operations: [{ ...base, emotion: 'angry' }] });
    expect(emotion.ok).toBe(true);
    if (emotion.ok) expect(emotion.project.acts[0]!.scenes[0]!.script.nodes[0]!.audioUrl).toBeUndefined();
    expect(applyProjectPatchPlan(project, { summary: 'Unknown speaker', operations: [{ ...base, actorId: 'missing' }] }).ok).toBe(false);
  });

});

it('applies motion atomically and protects previous locked targets during replacement and removal', () => {
  const project = makeProject();
  const scene = project.acts[0]!.scenes[0]!;
  const clip = buildAnimation({sdkVersion:2,sceneId:scene.id,id:'m',name:'m',duration:1,build({actor,timeline}){timeline().set(actor('actor-1'),{x:2},0);}},'',{width:1920,height:1080,cues:[]});
  const result = applyProjectPatchPlan(project, { summary: 'motion', operations: [{ type: 'animation.set', sceneId: scene.id, clip }] });
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  const next = result.project;
  next.acts[0]!.scenes[0]!.actors[0]!.locked = true;
  const replacement = buildAnimation({sdkVersion:2,sceneId:scene.id,id:'m',name:'camera',duration:1,build({camera,timeline}){timeline().set(camera(),{x:1},0);}},'',{width:1920,height:1080,cues:[]});
  for (const operation of [{ type: 'animation.set' as const, sceneId: scene.id, clip: replacement }, { type: 'animation.remove' as const, sceneId: scene.id, animationId: 'm' }]) {
    const rejected = applyProjectPatchPlan(next, { summary: 'reject', operations: [{ type: 'scene.update', sceneId: scene.id, backgroundColor: '#fff' }, operation] });
    expect(rejected.ok).toBe(false);
    expect(rejected.project).toBe(next);
  }
});

it('changes the project theme default without overwriting independent scenes and can relink a scene', () => {
  const project = makeProject();
  const first = project.acts[0].scenes[0];
  first.dialoguePropsLinked = true;
  const second = { ...first, id: 'independent', dialoguePropsLinked: false, dialogueThemeId: 'mystery', dialogueThemeOverrides: { fontSize: 48 } };
  project.acts[0].scenes.push(second);
  const result = applyProjectPatchPlan(project, { summary: 'Default theme', operations: [{ type: 'dialogue.theme.apply', sceneId: first.id, themeId: 'daily', scope: 'default', displayMode: 'instant' }] });
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  expect(result.project.meta.defaultDialogueThemeId).toBe('daily');
  expect(result.project.acts[0].scenes[0].dialoguePropsLinked).toBe(true);
  expect(result.project.acts[0].scenes[1]).toEqual(second);
  const linked = applyProjectPatchPlan(result.project, { summary: 'Follow default', operations: [{ type: 'dialogue.theme.link', sceneId: second.id }] });
  expect(linked.ok).toBe(true);
  if (!linked.ok) return;
  expect(linked.project.acts[0].scenes[1]).toMatchObject({ dialoguePropsLinked: true, dialogueThemeId: undefined, dialogueThemeOverrides: undefined });
  expect(project.acts[0].scenes[1]).toEqual(second);
});

it('accepts rich dialogue edits with inline tags atomically and rejects invalid or locked directions', () => {
  const project = makeProject(); const scene = project.acts[0].scenes[0];
  const result = applyProjectPatchPlan(project, { summary:'Rich edit',operations:[{type:'dialogue.content.update',sceneId:scene.id,nodeId:'line-1',content:[{type:'text',text:'New ',bold:true},{type:'tag',name:'wait',params:{seconds:.5}},{type:'text',text:'dialogue',italic:true}]}] });
  expect(result.ok).toBe(true);if(!result.ok)return;
  expect(result.project.acts[0].scenes[0].script.nodes[0]).toMatchObject({text:'New dialogue',audioUrl:undefined});
  expect(project.acts[0].scenes[0].script.nodes[0].text).toBe('Old');
  const invalid=applyProjectPatchPlan(project,{summary:'Invalid reference',operations:[{type:'dialogue.content.update',sceneId:scene.id,nodeId:'line-1',content:[{type:'tag',name:'show',params:{actor:'missing'}}]}]});
  expect(invalid.ok).toBe(false);expect(invalid.project).toBe(project);
  scene.actors[0].locked=true;
  const locked=applyProjectPatchPlan(project,{summary:'Locked direction',operations:[{type:'dialogue.content.update',sceneId:scene.id,nodeId:'line-1',content:[{type:'tag',name:'move',params:{actor:'actor-1',to:'left'}}]}]});
  expect(locked.ok).toBe(false);
});

it('adjusts dialogue style in one scene without replacing its theme or layout', () => {
  const project = makeProject();
  const first = project.acts[0]!.scenes[0]!;
  const other = { ...structuredClone(first), id: 'other-scene' };
  project.acts[0]!.scenes.push(other);
  first.dialoguePropsLinked = false;
  first.dialogueThemeId = 'mystery';
  first.dialogueThemeOverrides = { dialogueX: 40, dialogueY: 85, textColor: '#fafafa', fontSize: 30 };
  const result = applyProjectPatchPlan(project, { summary: 'Local type size', operations: [
    { type: 'dialogue.style.update', sceneId: first.id, fontSize: 42, boxWidthPercent: 80 },
  ] });
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  expect(result.project.acts[0]!.scenes[0]!.dialogueThemeOverrides).toEqual({ dialogueX: 40, dialogueY: 85, textColor: '#fafafa', fontSize: 42, boxWidthPercent: 80 });
  expect(result.project.acts[0]!.scenes[0]!.dialogueThemeId).toBe('mystery');
  expect(result.project.acts[0]!.scenes[1]).toEqual(other);
  expect(result.project.assets.themes).toEqual(project.assets.themes);
  expect(first.dialogueThemeOverrides.fontSize).toBe(30);
});

it('rejects invalid or locked dialogue style edits atomically', () => {
  const project = makeProject();
  const scene = project.acts[0]!.scenes[0]!;
  scene.lockedElements = { dialogue: true };
  const original = structuredClone(project);
  const result = applyProjectPatchPlan(project, { summary: 'Atomic style edit', operations: [
    { type: 'scene.update', sceneId: scene.id, name: 'Must not apply' },
    { type: 'dialogue.style.update', sceneId: scene.id, fontSize: 42 },
  ] });
  expect(result.ok).toBe(false);
  expect(project).toEqual(original);
  for (const fields of [{}, { fontSize: 0 }, { boxWidthPercent: 101 }, { fontSize: Infinity }]) {
    expect(projectPatchPlanSchema.safeParse({ summary: 'Reject style', operations: [{ type: 'dialogue.style.update', sceneId: scene.id, ...fields }] }).success).toBe(false);
  }
});

it('preserves inherited dialogue position and pace when overriding type size', () => {
  const project = makeProject();
  project.meta.defaultDialogueThemeId = 'daily';
  project.meta.defaultDialogueX = 45;
  project.meta.defaultDialogueY = 80;
  project.meta.sceneDefaults = { readingPace: 1.3, lineGap: .2 };
  const scene = project.acts[0]!.scenes[0]!;
  scene.dialoguePropsLinked = true;
  const result = applyProjectPatchPlan(project, { summary: 'Local size', operations: [
    { type: 'dialogue.style.update', sceneId: scene.id, fontSize: 36 },
  ] });
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  expect(result.project.acts[0]!.scenes[0]).toMatchObject({
    dialoguePropsLinked: false, dialogueThemeId: 'daily', readingPace: 1.3, lineGap: .2,
    dialogueThemeOverrides: { dialogueX: 45, dialogueY: 80, fontSize: 36 },
  });
});

it('updates body and name typography together without changing dialogue text', () => {
  const project = makeProject();
  const scene = project.acts[0].scenes[0];
  const result = applyProjectPatchPlan(project, { summary: 'Adjust typography', operations: [{ type: 'dialogue.style.update', sceneId: scene.id, fontSize: 28, nameFontSize: 24 }] });
  expect(result.ok).toBe(true);
  if (result.ok) {
    expect(result.project.acts[0].scenes[0].dialogueThemeOverrides).toMatchObject({ fontSize: 28, nameFontSize: 24 });
    expect(result.project.acts[0].scenes[0].script).toEqual(scene.script);
  }
});

it('creates a tag-only script node through dialogue.insert content', () => {
  const project = makeProject(),
    scene = project.acts[0].scenes[0];
  const plan = {
    summary: 'Pure direction',
    operations: [
      {
        type: 'dialogue.insert',
        sceneId: scene.id,
        id: 'opening',
        index: 0,
        content: [{ type: 'tag', name: 'wait', params: { seconds: 1 } }],
      },
    ],
  };
  expect(projectPatchPlanSchema.safeParse(plan).success).toBe(true);
  const result = applyProjectPatchPlan(
    project,
    projectPatchPlanSchema.parse(plan),
  );
  expect(result.ok).toBe(true);
  if (result.ok)
    expect(result.project.acts[0].scenes[0].script.nodes[0]).toMatchObject({
      id: 'opening',
      text: '',
      content: plan.operations[0].content,
    });
});
