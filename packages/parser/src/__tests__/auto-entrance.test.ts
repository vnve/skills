import { describe, it, expect } from 'vitest';
import type { ScriptDoc } from '@vnve/core';
import { parse } from '../index';
import type { ParseOptions } from '../index';
import { DEFAULT_DURATIONS } from '../defaults';

const defaultOptions: ParseOptions = {
  autoEntrance: true,
  actorDefaults: [
    { id: 'alice', x: 25, y: 50, effect: 'fade' },
    { id: 'bob', x: 75, y: 50, effect: 'slide-left' },
  ],
};

describe('parse - auto-entrance injection', () => {
  it('injects ShowEvent before SayEvent when actor speaks without prior show', () => {
    const doc: ScriptDoc = {
      nodes: [{ type: 'text', text: 'Hello!', actorId: 'alice' }],
    };
    const result = parse(doc, defaultOptions);
    expect(result.events).toHaveLength(2);
    expect(result.events[0].type).toBe('show');
    expect(result.events[0].targetId).toBe('alice');
    expect(result.events[0].dur).toBe(DEFAULT_DURATIONS.show);
    expect(result.events[0].params.x).toBe(25);
    expect(result.events[0].params.y).toBe(50);
    expect(result.events[0].params.with).toBe('fade');
    expect(result.events[1].type).toBe('say');
    expect(result.events[1].targetId).toBe('alice');
  });

  it('starts ShowEvent and SayEvent at the same time (parallel)', () => {
    const doc: ScriptDoc = {
      nodes: [{ type: 'text', text: 'Hello!', actorId: 'alice' }],
    };
    const result = parse(doc, defaultOptions);
    expect(result.events[0].at).toBe(0);
    expect(result.events[1].at).toBe(0);
  });

  it('uses actorDefaults for position and effect', () => {
    const doc: ScriptDoc = {
      nodes: [{ type: 'text', text: 'Hi!', actorId: 'bob' }],
    };
    const result = parse(doc, defaultOptions);
    expect(result.events[0].type).toBe('show');
    expect(result.events[0].params.x).toBe(75);
    expect(result.events[0].params.y).toBe(50);
    expect(result.events[0].params.with).toBe('slide-left');
  });

  it('falls back to defaultEffect when actor has no effect override', () => {
    const doc: ScriptDoc = {
      nodes: [{ type: 'text', text: 'Hi!', actorId: 'charlie' }],
    };
    const opts: ParseOptions = {
      autoEntrance: true,
      defaultEffect: 'slide-right',
      actorDefaults: [{ id: 'charlie', x: 50, y: 50 }],
    };
    const result = parse(doc, opts);
    expect(result.events[0].params.with).toBe('slide-right');
  });

  it('actor effect takes precedence over defaultEffect', () => {
    const doc: ScriptDoc = {
      nodes: [{ type: 'text', text: 'Hi!', actorId: 'alice' }],
    };
    const opts: ParseOptions = {
      autoEntrance: true,
      defaultEffect: 'slide-right',
      actorDefaults: [{ id: 'alice', x: 25, y: 50, effect: 'slide-left' }],
    };
    const result = parse(doc, opts);
    expect(result.events[0].params.with).toBe('slide-left');
  });

  it('uses undefined when neither actor nor scene default effect is set', () => {
    const doc: ScriptDoc = {
      nodes: [{ type: 'text', text: 'Hi!', actorId: 'charlie' }],
    };
    const opts: ParseOptions = {
      autoEntrance: true,
      actorDefaults: [{ id: 'charlie', x: 50, y: 50 }],
    };
    const result = parse(doc, opts);
    expect(result.events[0].params.with).toBeUndefined();
  });

  it('does not inject for actors without defaults (still injects with undefined positions)', () => {
    const doc: ScriptDoc = {
      nodes: [{ type: 'text', text: 'Hi!', actorId: 'charlie' }],
    };
    const result = parse(doc, defaultOptions);
    expect(result.events).toHaveLength(2);
    expect(result.events[0].type).toBe('show');
    expect(result.events[0].targetId).toBe('charlie');
    expect(result.events[0].params.x).toBeUndefined();
    expect(result.events[0].params.y).toBeUndefined();
  });

  it('does not inject when autoEntrance is false', () => {
    const doc: ScriptDoc = {
      nodes: [{ type: 'text', text: 'Hello!', actorId: 'alice' }],
    };
    const result = parse(doc, { autoEntrance: false });
    expect(result.events).toHaveLength(1);
    expect(result.events[0].type).toBe('say');
  });

  it('does not inject when no options provided', () => {
    const doc: ScriptDoc = {
      nodes: [{ type: 'text', text: 'Hello!', actorId: 'alice' }],
    };
    const result = parse(doc);
    expect(result.events).toHaveLength(1);
    expect(result.events[0].type).toBe('say');
  });
});

describe('parse - auto-entrance with leading set', () => {
  it('still injects show when the line starts with set rather than show', () => {
    const doc: ScriptDoc = {
      nodes: [{
        type: 'text',
        text: 'Hello!',
        actorId: 'alice',
        content: [
          { type: 'tag', name: 'set', params: { target: 'alice', variant: 'happy' } },
          { type: 'text', text: 'Hello!' },
        ],
      }],
    };

    const result = parse(doc, defaultOptions);
    expect(result.events.map((event) => event.type)).toEqual(['show', 'say', 'set']);
    expect(result.events[0]).toMatchObject({ type: 'show', targetId: 'alice' });
  });

  it('skips first-speak inject when the actor is already on stage', () => {
    const doc: ScriptDoc = {
      nodes: [{ type: 'text', text: 'Hello!', actorId: 'alice' }],
    };

    const result = parse(doc, { ...defaultOptions, alreadyShownActorIds: ['alice'] });
    expect(result.events.map((event) => event.type)).toEqual(['say']);
  });
});

describe('parse - auto-entrance explicit /show precedence', () => {
  it('does not inject when explicit /show precedes dialogue', () => {
    const doc: ScriptDoc = {
      nodes: [
        { type: 'text', text: '', content: [{ type: 'tag', name: 'show', params: { actor: 'alice', x: 10, y: 20 } }] },
        { type: 'text', text: 'Hello!', actorId: 'alice' },
      ],
    };
    const result = parse(doc, defaultOptions);
    // Only the explicit show + say, no auto-injected show
    expect(result.events).toHaveLength(2);
    expect(result.events[0].type).toBe('show');
    expect(result.events[0].params.x).toBe(10); // explicit value, not default
    expect(result.events[1].type).toBe('say');
  });

  it('does not inject when the dialogue line starts with an explicit show for its speaker', () => {
    const doc: ScriptDoc = {
      nodes: [{
        type: 'text',
        text: 'Hello!',
        actorId: 'alice',
        content: [
          { type: 'tag', name: 'show', params: { actor: 'alice', with: 'slide-right', dur: 0.8 } },
          { type: 'text', text: 'Hello!' },
        ],
      }],
    };

    const result = parse(doc, defaultOptions);
    const showEvents = result.events.filter((event) => event.type === 'show');
    expect(showEvents).toHaveLength(1);
    expect(showEvents[0]).toMatchObject({
      targetId: 'alice',
      dur: 0.8,
      params: { with: 'slide-right' },
    });
  });

  it('only auto-injects once for multiple dialogue lines from same actor', () => {
    const doc: ScriptDoc = {
      nodes: [
        { type: 'text', text: 'Line 1', actorId: 'alice' },
        { type: 'text', text: 'Line 2', actorId: 'alice' },
      ],
    };
    const result = parse(doc, defaultOptions);
    const showEvents = result.events.filter((e) => e.type === 'show');
    expect(showEvents).toHaveLength(1);
    expect(result.events).toHaveLength(3); // 1 show + 2 say
  });
});

describe('parse - auto-entrance /hide re-entrance', () => {
  it('re-injects ShowEvent after /hide when actor speaks again', () => {
    const doc: ScriptDoc = {
      nodes: [
        { type: 'text', text: 'Line 1', actorId: 'alice' },
        { type: 'text', text: '', content: [{ type: 'tag', name: 'hide', params: { actor: 'alice' } }] },
        { type: 'text', text: 'Line 2', actorId: 'alice' },
      ],
    };
    const result = parse(doc, defaultOptions);
    const showEvents = result.events.filter((e) => e.type === 'show');
    expect(showEvents).toHaveLength(2); // auto-inject before first and after hide
  });
});

describe('parse - auto-entrance narration', () => {
  it('does not inject ShowEvent for narration (no actorId)', () => {
    const doc: ScriptDoc = {
      nodes: [{ type: 'text', text: 'The narrator speaks.' }],
    };
    const result = parse(doc, defaultOptions);
    expect(result.events).toHaveLength(1);
    expect(result.events[0].type).toBe('narrate');
  });
});

describe('parse - auto-entrance action-only lines', () => {
  it('does not inject ShowEvent for a tag-only line that retains an actorId', () => {
    const doc: ScriptDoc = {
      nodes: [{
        type: 'text',
        text: '',
        actorId: 'alice',
        content: [{ type: 'tag', name: 'wait', params: { seconds: 1 } }],
      }],
    };

    const result = parse(doc, defaultOptions);

    expect(result.events).toEqual([{
      type: 'wait',
      at: 0,
      dur: 1,
      params: { seconds: 1 },
    }]);
  });
});

describe('parse - auto-entrance eventSourceMap', () => {
  it('auto-injected ShowEvent maps to the same node index as the SayEvent', () => {
    const doc: ScriptDoc = {
      nodes: [{ type: 'text', text: 'Hello!', actorId: 'alice' }],
    };
    const result = parse(doc, defaultOptions);
    // Both events should map to node index 0
    expect(result.eventSourceMap[0]).toBe(0);
    expect(result.eventSourceMap[1]).toBe(0);
  });
});
