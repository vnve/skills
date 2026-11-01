import { expect, it } from 'vitest';
import { createDefaultProject, createDefaultScene } from './helpers';
import { applyProjectPatchPlan } from './contracts/project-patch';
import { dialogueThemeSchema } from './dialogue-theme';

const theme = { id: 'custom-frame', name: 'Custom', baseThemeId: 'classic' as const, data: { fontSize: 40, defaultDisplayMode: 'instant' as const } };
it('validates theme geometry and rejects non-finite properties and unknown fields', () => {
  for (const data of [{ bodyX: 80, bodyWidth: 30 }, { fontSize: Infinity }, { typo: 3 }, { boxImageUrl: 'https://example.com/frame.png' }]) expect(dialogueThemeSchema.safeParse({ ...theme, data }).success).toBe(false);
});
it('creates and applies a theme atomically without changing existing shared themes or recordings', () => {
  const project = createDefaultProject();
  const scene = project.acts[0]!.scenes[0]!;
  project.assets.themes = [{ id: 'old', name: 'Existing', data: { fontSize: 30 } }];
  project.meta.readingPace = 1.3;
  scene.script.nodes = [{ id: 'line', type: 'text', text: 'Hello', audioUrl: 'recording.wav' }];
  scene.dialogueThemeOverrides = { fontSize: 99 };
  const result = applyProjectPatchPlan(project, { summary: 'Theme', operations: [
    { type: 'dialogue.theme.create', sceneId: scene.id, theme },
    { type: 'dialogue.theme.apply', sceneId: scene.id, themeId: theme.id },
  ] });
  expect(result.ok).toBe(true);
  const changed = result.project.acts[0]!.scenes[0]!;
  expect(changed).toMatchObject({ dialogueThemeId: theme.id, dialoguePropsLinked: false, defaultDisplayMode: 'instant', readingPace: 1.3 });
  expect(changed.dialogueThemeOverrides).toBeUndefined();
  expect(changed.script.nodes[0]!.audioUrl).toBe('recording.wav');
  expect(result.project.assets.themes[0]).toBe(project.assets.themes[0]);
  expect(project.assets.themes).toHaveLength(1);
  const rejected = applyProjectPatchPlan(project, { summary: 'Invalid', operations: [
    { type: 'dialogue.theme.create', sceneId: scene.id, theme },
    { type: 'dialogue.theme.apply', sceneId: scene.id, themeId: 'missing' },
  ] });
  expect(rejected.ok).toBe(false); expect(rejected.project).toBe(project);
});
it('protects existing theme IDs and requires imported image references', () => {
  const project = createDefaultProject(); const sceneId = project.acts[0]!.scenes[0]!.id;
  for (const candidate of [{ ...theme, id: 'classic' }, { ...theme, data: { boxImageUrl: 'assets/visual/missing.png' } }]) {
    expect(applyProjectPatchPlan(project, { summary: 'reject', operations: [{ type: 'dialogue.theme.create', sceneId, theme: candidate }] }).ok).toBe(false);
  }
});
it('applies an explicit project scope to every scene while preserving their individual reading pace', () => {
  const project = createDefaultProject(); const first = project.acts[0]!.scenes[0]!;
  const second = createDefaultScene('Second'); second.dialoguePropsLinked = false; second.readingPace = 1.8;
  project.acts[0]!.scenes.push(second);
  const result = applyProjectPatchPlan(project, { summary: 'All scenes', operations: [{ type: 'dialogue.theme.apply', sceneId: first.id, themeId: 'elegant', scope: 'project', displayMode: 'line' }] });
  expect(result.ok).toBe(true);
  expect(result.project.meta.defaultDialogueThemeId).toBe('elegant');
  expect(result.project.acts[0]!.scenes.every(scene => scene.dialogueThemeId === 'elegant' && scene.defaultDisplayMode === 'line')).toBe(true);
  expect(result.project.acts[0]!.scenes[1]!.readingPace).toBe(1.8);
});


it('round trips gradient paint and explicit solid mode through the atomic theme contract', () => {
  for (const boxGradient of [{ top: 'rgba(0,0,0,0)', middle: '#111111', bottom: '#000000' }, null]) {
    const project = createDefaultProject();
    const sceneId = project.acts[0]!.scenes[0]!.id;
    const data = { boxGradient, boxBottomGap: 0, boxDecoration: 'corners' as const, boxAccent: '#aabbcc' };
    const result = applyProjectPatchPlan(project, { summary: 'Surface', operations: [
      { type: 'dialogue.theme.create', sceneId, theme: { ...theme, data } },
      { type: 'dialogue.theme.apply', sceneId, themeId: theme.id },
    ] });
    expect(result.ok).toBe(true);
    expect(result.project.assets.themes[0]!.data).toEqual(data);
  }
  for (const data of [{ boxGradient: { top: '#fff', bottom: '#000' } }, { boxBottomGap: -1 }, { boxDecoration: 'unknown' }]) {
    expect(dialogueThemeSchema.safeParse({ ...theme, data }).success).toBe(false);
  }
});
