import { describe, expect, it } from 'vitest';
import { commandParamsSchemas } from '../contracts/script';

describe('rain command schema', () => {
  it('accepts valid rain params with defaults', () => {
    const result = commandParamsSchemas.rain.safeParse({});
    expect(result.success).toBe(true);
  });

  it('accepts intensity and dur', () => {
    const result = commandParamsSchemas.rain.safeParse({ intensity: 'heavy', dur: 2 });
    expect(result.success).toBe(true);
  });

  it('accepts stop flag', () => {
    const result = commandParamsSchemas.rain.safeParse({ stop: true, dur: 3 });
    expect(result.success).toBe(true);
  });

  it('rejects invalid intensity', () => {
    const result = commandParamsSchemas.rain.safeParse({ intensity: 'extreme' });
    expect(result.success).toBe(false);
  });

  it('rejects negative dur', () => {
    const result = commandParamsSchemas.rain.safeParse({ dur: -1 });
    expect(result.success).toBe(false);
  });
});

describe('snow command schema', () => {
  it('accepts valid snow params with defaults', () => {
    const result = commandParamsSchemas.snow.safeParse({});
    expect(result.success).toBe(true);
  });

  it('accepts intensity and stop', () => {
    const result = commandParamsSchemas.snow.safeParse({ intensity: 'light', stop: true });
    expect(result.success).toBe(true);
  });
});
