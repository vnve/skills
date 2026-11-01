import {describe,it,expect} from 'vitest';
import {generatedScriptLineSchema} from './authoring';
describe('positioned generated directions', () => {
  it('accepts unanchored directions and sentence-end anchors, and rejects invalid offsets', () => {
    const line = { text: 'Hello', directions: [{ name: 'wait', params: { seconds: 0.2 } }] };
    expect(generatedScriptLineSchema.safeParse(line).success).toBe(true);
    for (const textOffset of [0, 3, 5]) {
      expect(generatedScriptLineSchema.safeParse({ ...line, directions: [{ ...line.directions[0], textOffset }] }).success).toBe(true);
    }
    for (const textOffset of [-1, 1.5, 6]) {
      expect(generatedScriptLineSchema.safeParse({ ...line, directions: [{ ...line.directions[0], textOffset }] }).success).toBe(false);
    }
  });
});
