import { describe, expect, it } from 'vitest';

describe('shared zod contracts', () => {
  function character(name: string) {
    return {
      name,
      description: `${name} visual description`,
    };
  }

  function background(name: string) {
    return {
      name,
      description: `${name} background description`,
    };
  }

  function dialogue(speaker: string, text = 'Hello', variant?: string) {
    return {
      speaker,
      text,
      ...(variant ? { variant } : {}),
    };
  }

  function makeScriptPayload(overrides: Record<string, unknown> = {}) {
    return {
      title: 'My Story',
      acts: [{
        name: 'Opening',
        scenes: [{
          name: 'Classroom Morning',
          background: 'classroom',
          lines: [dialogue('Alice')],
        }],
      }],
      characters: [character('Alice')],
      backgrounds: [background('classroom')],
      ...overrides,
    };
  }

  it('accepts a valid script document', async () => {
    const core = await import('./index');
    const result = (core as Record<string, unknown>).scriptDocSchema as
      | { safeParse: (value: unknown) => { success: boolean } }
      | undefined;

    expect(result?.safeParse({
      nodes: [
        { type: 'text', actorId: 'alice', text: 'Hello', variant: 'happy' },
        {
          type: 'text',
          text: '',
          content: [{ type: 'tag', name: 'wait', params: { seconds: 1 } }],
        },
      ],
    }).success).toBe(true);
  });

  it('accepts a tag-only text node for inline command flow', async () => {
    const core = await import('./index');
    const result = (core as Record<string, unknown>).scriptDocSchema as
      | { safeParse: (value: unknown) => { success: boolean } }
      | undefined;

    expect(result?.safeParse({
      nodes: [
        {
          type: 'text',
          text: '',
          content: [{ type: 'tag', name: 'wait', params: { seconds: 1 } }],
        },
      ],
    }).success).toBe(true);
  });

  it('rejects invalid inline command params', async () => {
    const core = await import('./index');
    const result = (core as Record<string, unknown>).inlineTagSchema as
      | { safeParse: (value: unknown) => { success: boolean } }
      | undefined;

    expect(result?.safeParse({
      type: 'tag',
      name: 'wait',
      params: { seconds: '1' },
    }).success).toBe(false);
  });

  it('rejects invalid inline tag params', async () => {
    const core = await import('./index');
    const result = (core as Record<string, unknown>).inlineTagSchema as
      | { safeParse: (value: unknown) => { success: boolean } }
      | undefined;

    expect(result?.safeParse({
      type: 'tag',
      name: 'bgm',
      params: { action: 'play' },
    }).success).toBe(false);
  });

  it('accepts bgm stop command without asset', async () => {
    const core = await import('./index');
    const result = (core as Record<string, unknown>).inlineTagSchema as
      | { safeParse: (value: unknown) => { success: boolean } }
      | undefined;

    expect(result?.safeParse({
      type: 'tag',
      name: 'bgm',
      params: { action: 'stop', fade: 0.2 },
    }).success).toBe(true);
  });

  it('accepts camera focus command with coordinates only', async () => {
    const core = await import('./index');
    const result = (core as Record<string, unknown>).inlineTagSchema as
      | { safeParse: (value: unknown) => { success: boolean } }
      | undefined;

    expect(result?.safeParse({
      type: 'tag',
      name: 'camera',
      params: { action: 'focus', x: 100, dur: 0.5 },
    }).success).toBe(true);
  });

  it('accepts move command when both coordinates are provided', async () => {
    const core = await import('./index');
    const result = (core as Record<string, unknown>).inlineTagSchema as
      | { safeParse: (value: unknown) => { success: boolean } }
      | undefined;

    expect(result?.safeParse({
      type: 'tag',
      name: 'move',
      params: { actor: 'Alice', toX: 0.25, toY: 0.8 },
    }).success).toBe(true);
  });

  it('accepts move command when slot target is provided', async () => {
    const core = await import('./index');
    const result = (core as Record<string, unknown>).inlineTagSchema as
      | { safeParse: (value: unknown) => { success: boolean } }
      | undefined;

    expect(result?.safeParse({
      type: 'tag',
      name: 'move',
      params: { actor: 'Alice', to: 'left', dur: 0.3 },
    }).success).toBe(true);
  });

  it('accepts bgm play command when asset is provided', async () => {
    const core = await import('./index');
    const result = (core as Record<string, unknown>).inlineTagSchema as
      | { safeParse: (value: unknown) => { success: boolean } }
      | undefined;

    expect(result?.safeParse({
      type: 'tag',
      name: 'bgm',
      params: { asset: 'opening-theme', volume: 0.5 },
    }).success).toBe(true);
  });

  it('accepts camera reset command without focus target', async () => {
    const core = await import('./index');
    const result = (core as Record<string, unknown>).inlineTagSchema as
      | { safeParse: (value: unknown) => { success: boolean } }
      | undefined;

    expect(result?.safeParse({
      type: 'tag',
      name: 'camera',
      params: { action: 'reset', dur: 0.4 },
    }).success).toBe(true);
  });

  it('accepts camera focus command when actor is provided', async () => {
    const core = await import('./index');
    const result = (core as Record<string, unknown>).inlineTagSchema as
      | { safeParse: (value: unknown) => { success: boolean } }
      | undefined;

    expect(result?.safeParse({
      type: 'tag',
      name: 'camera',
      params: { action: 'focus', actor: 'Alice', zoom: 1.2 },
    }).success).toBe(true);
  });

  it('accepts text node when visible text comes from content segments', async () => {
    const core = await import('./index');
    const result = (core as Record<string, unknown>).textNodeSchema as
      | { safeParse: (value: unknown) => { success: boolean } }
      | undefined;

    expect(result?.safeParse({
      type: 'text',
      text: '   ',
      content: [{ type: 'text', text: 'Rendered from content' }],
    }).success).toBe(true);
  });

  it('exports schema-derived command prompt line builder', async () => {
    const core = await import('./index');
    const build = (core as Record<string, unknown>).buildCommandPromptLines as
      | (() => readonly string[])
      | undefined;
    const lines = (core as Record<string, unknown>).COMMAND_PROMPT_LINES as
      | readonly string[]
      | undefined;

    expect(typeof build).toBe('function');
    expect(build?.()).toEqual(lines);
  });

  it('derives command name list from command params schema', async () => {
    const core = await import('./index');
    const schemas = (core as Record<string, unknown>).commandParamsSchemas as
      | Record<string, unknown>
      | undefined;
    const commandNames = (core as Record<string, unknown>).COMMAND_NAMES as
      | readonly string[]
      | undefined;
    const lines = (core as Record<string, unknown>).COMMAND_PROMPT_LINES as
      | readonly string[]
      | undefined;

    const schemaNames = Object.keys(schemas ?? {});
    expect(commandNames).toEqual(schemaNames);
    expect(lines).toHaveLength(schemaNames.length);
  });

  it('rejects script generation payload with missing background reference', async () => {
    const core = await import('./index');
    const result = (core as Record<string, unknown>).scriptGenerationPayloadSchema as
      | { safeParse: (value: unknown) => { success: boolean } }
      | undefined;

    expect(result?.safeParse(makeScriptPayload({
      acts: [{
        name: 'Opening',
        scenes: [{
          name: 'Classroom Morning',
          background: 'unknown-bg',
          lines: [dialogue('Alice')],
        }],
      }],
    })).success).toBe(false);
  });

  it('rejects script generation payload with speaker outside manifest', async () => {
    const core = await import('./index');
    const result = (core as Record<string, unknown>).scriptGenerationPayloadSchema as
      | { safeParse: (value: unknown) => { success: boolean } }
      | undefined;

    expect(result?.safeParse(makeScriptPayload({
      acts: [{
        name: 'Opening',
        scenes: [{
          name: 'Classroom Morning',
          background: 'classroom',
          lines: [dialogue('Bob')],
        }],
      }],
    })).success).toBe(false);
  });

  it('rejects script generation payload with legacy text node type field', async () => {
    const core = await import('./index');
    const result = (core as Record<string, unknown>).scriptGenerationPayloadSchema as
      | { safeParse: (value: unknown) => { success: boolean } }
      | undefined;

    expect(result?.safeParse(makeScriptPayload({
      acts: [{
        name: 'Opening',
        scenes: [{
          name: 'Classroom Morning',
          background: 'classroom',
          lines: [
            { type: 'text', speaker: 'Alice', text: 'Hello' },
          ],
        }],
      }],
    })).success).toBe(false);
  });

  it('rejects script generation payload with legacy script wrapper', async () => {
    const core = await import('./index');
    const result = (core as Record<string, unknown>).scriptGenerationPayloadSchema as
      | { safeParse: (value: unknown) => { success: boolean } }
      | undefined;

    expect(result?.safeParse(makeScriptPayload({
      acts: [{
        name: 'Opening',
        scenes: [{
          name: 'Classroom Morning',
          background: 'classroom',
          script: {
            nodes: [
              { speaker: 'Alice', text: 'Hello' },
            ],
          },
        }],
      }],
    })).success).toBe(false);
  });

  it('rejects script generation payload with legacy actorRefs', async () => {
    const core = await import('./index');
    const result = (core as Record<string, unknown>).scriptGenerationPayloadSchema as
      | { safeParse: (value: unknown) => { success: boolean } }
      | undefined;

    expect(result?.safeParse(makeScriptPayload({
      acts: [{
        name: 'Opening',
        scenes: [{
          name: 'Classroom Morning',
          background: 'classroom',
          actorRefs: ['Alice'],
          lines: [dialogue('Alice')],
        }],
      }],
    })).success).toBe(false);
  });

  it('accepts text-only script generation payload without type or ttsPrompt', async () => {
    const core = await import('./index');
    const result = (core as Record<string, unknown>).scriptGenerationPayloadSchema as
      | { safeParse: (value: unknown) => { success: boolean } }
      | undefined;

    expect(result?.safeParse(makeScriptPayload({
      acts: [{
        name: 'Opening',
        scenes: [{
          name: 'Classroom Morning',
          background: 'classroom',
          lines: [
            dialogue('Alice', 'Hello', 'happy'),
            { text: 'Narration' },
          ],
        }],
      }],
    })).success).toBe(true);
  });

  it('accepts script generation payload with free-form localized variants', async () => {
    const core = await import('./index');
    const result = (core as Record<string, unknown>).scriptGenerationPayloadSchema as
      | { safeParse: (value: unknown) => { success: boolean } }
      | undefined;

    expect(result?.safeParse(makeScriptPayload({
      acts: [{
        name: 'Opening',
        scenes: [{
          name: 'Classroom Morning',
          background: 'classroom',
          lines: [
            dialogue('Alice', '我其实有点紧张。', '紧张'),
            dialogue('Alice', '但还是想试试看。', '释然'),
          ],
        }],
      }],
    })).success).toBe(true);
  });

  it('accepts provider-safe generated stage directions', async () => {
    const core = await import('./index');
    const result = (core as Record<string, unknown>).scriptGenerationPayloadSchema as
      | { safeParse: (value: unknown) => { success: boolean } }
      | undefined;

    expect(result?.safeParse(makeScriptPayload({
      acts: [{
        name: 'Opening',
        scenes: [{
          name: 'Classroom Morning',
          background: 'classroom',
          lines: [{
            speaker: 'Alice',
            text: 'Hello',
            directions: [
              { name: 'move', params: { actor: 'Alice', to: 'center', dur: 0.4 } },
              { name: 'camera', params: { action: 'focus', actor: 'Alice', zoom: 1.1 } },
            ],
          }],
        }],
      }],
    })).success).toBe(true);
  });

  it('accepts more than three valid directions when a story beat needs them', async () => {
    const core = await import('./index');
    const result = (core as Record<string, unknown>).scriptGenerationPayloadSchema as
      | { safeParse: (value: unknown) => { success: boolean } }
      | undefined;

    expect(result?.safeParse(makeScriptPayload({
      acts: [{
        name: 'Opening',
        scenes: [{
          name: 'Classroom Morning',
          background: 'classroom',
          lines: [{
            speaker: 'Alice',
            text: 'Hello',
            directions: [
              { name: 'show', params: { actor: 'Alice' } },
              { name: 'move', params: { actor: 'Alice', to: 'center' } },
              { name: 'camera', params: { action: 'focus', actor: 'Alice' } },
              { name: 'flash', params: {} },
            ],
          }],
        }],
      }],
    })).success).toBe(true);
  });

  it.each(['hop', 'vibrate', 'rain', 'snow'])('rejects non-core generated direction %s', async (name) => {
    const core = await import('./index');
    const result = (core as Record<string, unknown>).scriptGenerationPayloadSchema as
      | { safeParse: (value: unknown) => { success: boolean } }
      | undefined;

    expect(result?.safeParse(makeScriptPayload({
      acts: [{
        name: 'Opening',
        scenes: [{
          name: 'Classroom Morning',
          background: 'classroom',
          lines: [{ text: 'Narration', directions: [{ name, params: {} }] }],
        }],
      }],
    })).success).toBe(false);
  });

  it('rejects a narration line with a sprite variant', async () => {
    const core = await import('./index');
    const result = (core as Record<string, unknown>).scriptGenerationPayloadSchema as
      | { safeParse: (value: unknown) => { success: boolean } }
      | undefined;

    expect(result?.safeParse(makeScriptPayload({
      acts: [{
        name: 'Opening',
        scenes: [{
          name: 'Classroom Morning',
          background: 'classroom',
          lines: [{ text: 'Narration', variant: 'happy' }],
        }],
      }],
    })).success).toBe(false);
  });

  it('rejects generated directions that require asset ids or unknown actors', async () => {
    const core = await import('./index');
    const result = (core as Record<string, unknown>).scriptGenerationPayloadSchema as
      | { safeParse: (value: unknown) => { success: boolean } }
      | undefined;

    const withDirection = (direction: unknown) => makeScriptPayload({
      acts: [{
        name: 'Opening',
        scenes: [{
          name: 'Classroom Morning',
          background: 'classroom',
          lines: [{ speaker: 'Alice', text: 'Hello', directions: [direction] }],
        }],
      }],
    });

    expect(result?.safeParse(withDirection({
      name: 'bgm',
      params: { action: 'play', asset: 'invented-track' },
    })).success).toBe(false);
    expect(result?.safeParse(withDirection({
      name: 'shake',
      params: { actor: 'Bob', amp: 8 },
    })).success).toBe(false);
    expect(result?.safeParse(withDirection({
      name: 'set',
      params: { target: 'Alice', variant: '愤怒' },
    })).success).toBe(true);
    expect(result?.safeParse(withDirection({
      name: 'set',
      params: { target: 'Bob', variant: '愤怒' },
    })).success).toBe(false);
  });

  it('rejects leftover line variants on the script-writer payload', async () => {
    const core = await import('./index');
    const result = (core as Record<string, unknown>).scriptWriterPayloadSchema as
      | { safeParse: (value: unknown) => { success: boolean } }
      | undefined;

    expect(result?.safeParse(makeScriptPayload({
      acts: [{
        name: 'Opening',
        scenes: [{
          name: 'Classroom Morning',
          background: 'classroom',
          lines: [{ speaker: 'Alice', text: 'Hello', variant: '开心' }],
        }],
      }],
    })).success).toBe(false);
  });

  it('rejects leftover stage directions on the script-writer payload', async () => {
    const core = await import('./index');
    const result = (core as Record<string, unknown>).scriptWriterPayloadSchema as
      | { safeParse: (value: unknown) => { success: boolean } }
      | undefined;

    expect(result?.safeParse(makeScriptPayload({
      acts: [{
        name: 'Opening',
        scenes: [{
          name: 'Classroom Morning',
          background: 'classroom',
          lines: [{
            speaker: 'Alice',
            text: 'Hello',
            directions: [{ name: 'show', params: { actor: 'Alice' } }],
          }],
        }],
      }],
    })).success).toBe(false);
  });

  it('accepts more than six sprite variants when the story needs them', async () => {
    const core = await import('./index');
    const result = (core as Record<string, unknown>).scriptGenerationPayloadSchema as
      | { safeParse: (value: unknown) => { success: boolean } }
      | undefined;

    expect(result?.safeParse(makeScriptPayload({
      acts: [{
        name: 'Opening',
        scenes: [{
          name: 'Classroom Morning',
          background: 'classroom',
          lines: Array.from({ length: 7 }, (_, index) => (
            dialogue('Alice', `Line ${index + 1}`, `state-${index + 1}`)
          )),
        }],
      }],
    })).success).toBe(true);
  });

  it('rejects script generation payload when act name is missing', async () => {
    const core = await import('./index');
    const result = (core as Record<string, unknown>).scriptGenerationPayloadSchema as
      | { safeParse: (value: unknown) => { success: boolean } }
      | undefined;

    expect(result?.safeParse(makeScriptPayload({
      acts: [{
        scenes: [{
          name: 'Classroom Morning',
          background: 'classroom',
          lines: [dialogue('Alice')],
        }],
      }],
    })).success).toBe(false);
  });

  it('rejects script generation payload when scene name is missing', async () => {
    const core = await import('./index');
    const result = (core as Record<string, unknown>).scriptGenerationPayloadSchema as
      | { safeParse: (value: unknown) => { success: boolean } }
      | undefined;

    expect(result?.safeParse(makeScriptPayload({
      acts: [{
        name: 'Opening',
        scenes: [{
          background: 'classroom',
          lines: [dialogue('Alice')],
        }],
      }],
    })).success).toBe(false);
  });

  it('rejects script generation payload when title is missing', async () => {
    const core = await import('./index');
    const result = (core as Record<string, unknown>).scriptGenerationPayloadSchema as
      | { safeParse: (value: unknown) => { success: boolean } }
      | undefined;

    expect(result?.safeParse({
      acts: [{
        name: 'Opening',
        scenes: [{
          name: 'Classroom Morning',
          background: 'classroom',
          lines: [dialogue('Alice')],
        }],
      }],
      characters: [character('Alice')],
      backgrounds: [background('classroom')],
    }).success).toBe(false);
  });

  it('rejects script generation payload when legacy assetManifest wrapper is still present', async () => {
    const core = await import('./index');
    const result = (core as Record<string, unknown>).scriptGenerationPayloadSchema as
      | { safeParse: (value: unknown) => { success: boolean } }
      | undefined;

    expect(result?.safeParse(makeScriptPayload({
      assetManifest: {
        characters: [character('Alice')],
        backgrounds: [background('classroom')],
      },
    })).success).toBe(false);
  });

  it('rejects script generation payload when character description is missing', async () => {
    const core = await import('./index');
    const result = (core as Record<string, unknown>).scriptGenerationPayloadSchema as
      | { safeParse: (value: unknown) => { success: boolean } }
      | undefined;

    expect(result?.safeParse(makeScriptPayload({
      characters: [{ name: 'Alice' }],
    })).success).toBe(false);
  });

  it('rejects script generation payload when background description is missing', async () => {
    const core = await import('./index');
    const result = (core as Record<string, unknown>).scriptGenerationPayloadSchema as
      | { safeParse: (value: unknown) => { success: boolean } }
      | undefined;

    expect(result?.safeParse(makeScriptPayload({
      backgrounds: [{ name: 'classroom' }],
    })).success).toBe(false);
  });

  it('rejects script generation payload when characters include narrator', async () => {
    const core = await import('./index');
    const result = (core as Record<string, unknown>).scriptGenerationPayloadSchema as
      | { safeParse: (value: unknown) => { success: boolean } }
      | undefined;

    expect(result?.safeParse(makeScriptPayload({
      characters: [
        character('Alice'),
        { name: '旁白', description: 'voice-over narrator' },
      ],
    })).success).toBe(false);
  });

  it('accepts character manifest entry with gender field', async () => {
    const core = await import('./index');
    const result = (core as Record<string, unknown>).scriptGenerationPayloadSchema as
      | { safeParse: (value: unknown) => { success: boolean } }
      | undefined;

    expect(result?.safeParse(makeScriptPayload({
      characters: [{ name: 'Alice', description: 'cheerful girl', gender: 'female' }],
    })).success).toBe(true);
  });

  it('rejects character manifest entry with invalid gender', async () => {
    const core = await import('./index');
    const result = (core as Record<string, unknown>).scriptGenerationPayloadSchema as
      | { safeParse: (value: unknown) => { success: boolean } }
      | undefined;

    expect(result?.safeParse(makeScriptPayload({
      characters: [{ name: 'Alice', description: 'cheerful girl', gender: 'unknown' }],
    })).success).toBe(false);
  });

  it('accepts character manifest entry without gender', async () => {
    const core = await import('./index');
    const result = (core as Record<string, unknown>).scriptGenerationPayloadSchema as
      | { safeParse: (value: unknown) => { success: boolean } }
      | undefined;

    expect(result?.safeParse(makeScriptPayload({
      characters: [{ name: 'Alice', description: 'cheerful girl' }],
    })).success).toBe(true);
  });
});
