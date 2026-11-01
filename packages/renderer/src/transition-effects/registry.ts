import type { TransitionEffect } from './types';
import { FadeEffect } from './fade-effect';
import { DissolveEffect } from './dissolve-effect';

export const transitionRegistry = new Map<string, () => TransitionEffect>([
  ['dissolve', () => new DissolveEffect()],
  ['fade-black', () => new FadeEffect('#000000')],
  ['fade-white', () => new FadeEffect('#ffffff')],
]);
