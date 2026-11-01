import { afterEach, describe, expect, it } from 'vitest';
import { COMMAND_SCHEMAS, validateParams } from '../validate';

describe('validateParams', () => {
  const originalUnknown = (COMMAND_SCHEMAS as Record<string, unknown>)['__test_unknown__'];
  const originalFallback = (COMMAND_SCHEMAS as Record<string, unknown>)['__test_fallback__'];

  afterEach(() => {
    if (originalUnknown === undefined) {
      delete (COMMAND_SCHEMAS as Record<string, unknown>)['__test_unknown__'];
    } else {
      (COMMAND_SCHEMAS as Record<string, unknown>)['__test_unknown__'] = originalUnknown;
    }

    if (originalFallback === undefined) {
      delete (COMMAND_SCHEMAS as Record<string, unknown>)['__test_fallback__'];
    } else {
      (COMMAND_SCHEMAS as Record<string, unknown>)['__test_fallback__'] = originalFallback;
    }
  });

  it('returns no diagnostics for unknown commands', () => {
    expect(validateParams('__test_unknown__', { any: true }, 3)).toEqual([]);
  });

  it('uses the generic fallback message when a schema issue has no expected or explicit message', () => {
    (COMMAND_SCHEMAS as Record<string, unknown>)['__test_fallback__'] = {
      safeParse: () => ({
        success: false,
        error: {
          issues: [
            {
              code: 'custom',
              path: [],
              message: '',
            },
          ],
        },
      }),
    };

    expect(validateParams('__test_fallback__', {}, 7)).toEqual([
      expect.objectContaining({
        code: 'INVALID_PARAM_TYPE',
        message: "Params of '__test_fallback__' are invalid",
        location: {
          index: 7,
        },
      }),
    ]);
  });
});
