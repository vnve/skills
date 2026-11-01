import { describe, expect, it } from 'vitest';
import * as renderer from './index';

describe('renderer index exports', () => {
  it('re-exports the public renderer surface', () => {
    expect(renderer.DEFAULT_DIALOGUE_THEME_ID).toBe('classic');
    expect(typeof renderer.resolveDialogueTheme).toBe('function');
    expect(typeof renderer.KonvaFrameRenderer).toBe('function');
    expect(typeof renderer.scaleDialogueThemeForRender).toBe('function');
    expect(typeof renderer.renderStyledText).toBe('function');
    expect(typeof renderer.buildRenderContext).toBe('function');
    expect(typeof renderer.prepareFrameInput).toBe('function');
    expect(typeof renderer.findSceneAtTime).toBe('function');
    expect(typeof renderer.computeTransitionOverlay).toBe('function');
    expect(typeof renderer.createEmptyRenderContext).toBe('function');
    expect(typeof renderer.drawDialogueBoxImage).toBe('function');
    expect(typeof renderer.layoutDialogueBoxImage).toBe('function');
  });
});
