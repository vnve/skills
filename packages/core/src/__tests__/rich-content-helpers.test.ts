import { describe, it, expect } from 'vitest';
import type { TextNode, RichContent } from '../types/script';
import { getTextNodePlainText, getTtsText, getTextNodeContent, buildTextNodeFromContent } from '../helpers';

describe('getTextNodePlainText', () => {
  it('returns text field when node has no content array', () => {
    const node: TextNode = { type: 'text', text: 'Hello world' };
    expect(getTextNodePlainText(node)).toBe('Hello world');
  });

  it('returns text field when content array is empty', () => {
    const node: TextNode = { type: 'text', text: 'Fallback text', content: [] };
    expect(getTextNodePlainText(node)).toBe('Fallback text');
  });

  it('extracts plain text from content array with only text segments', () => {
    const node: TextNode = {
      type: 'text',
      text: 'Hello world',
      content: [
        { type: 'text', text: 'Hello' },
        { type: 'text', text: ' ' },
        { type: 'text', text: 'world' },
      ],
    };
    expect(getTextNodePlainText(node)).toBe('Hello world');
  });

  it('extracts plain text from content array with mixed text and tags', () => {
    const node: TextNode = {
      type: 'text',
      text: 'Hello world',
      content: [
        { type: 'text', text: 'Hello ' },
        { type: 'tag', name: 'bgm', params: { asset: 'music.mp3' } },
        { type: 'text', text: 'world' },
      ],
    };
    expect(getTextNodePlainText(node)).toBe('Hello world');
  });

  it('returns empty string when content has only tags', () => {
    const node: TextNode = {
      type: 'text',
      text: '',
      content: [
        { type: 'tag', name: 'bgm', params: { asset: 'music.mp3' } },
        { type: 'tag', name: 'sfx', params: { asset: 'sound.wav' } },
      ],
    };
    expect(getTextNodePlainText(node)).toBe('');
  });

  it('handles node with empty text field and no content', () => {
    const node: TextNode = { type: 'text', text: '' };
    expect(getTextNodePlainText(node)).toBe('');
  });

  it('returns empty string for malformed nodes missing the text field', () => {
    const node = { type: 'text' } as TextNode;
    expect(getTextNodePlainText(node)).toBe('');
  });

  it('handles multiple consecutive text segments', () => {
    const node: TextNode = {
      type: 'text',
      text: 'abc',
      content: [
        { type: 'text', text: 'a' },
        { type: 'text', text: 'b' },
        { type: 'text', text: 'c' },
      ],
    };
    expect(getTextNodePlainText(node)).toBe('abc');
  });
});

describe('getTtsText', () => {
  it('does not synthesize silent action lines containing waits', () => {
    const node: TextNode = {
      type: 'text', text: '', content: [
        { type: 'text', text: '  ' },
        { type: 'tag', name: 'wait', params: { seconds: 2 } },
        { type: 'tag', name: 'hide', params: { actor: 'actor-1' } },
      ],
    };
    expect(getTtsText(node)).toBe('');
  });

  it('keeps standalone voiced interjections and their pauses', () => {
    const node: TextNode = {
      type: 'text', text: '', content: [
        { type: 'tag', name: 'interjection', params: { kind: 'laughs' } },
        { type: 'tag', name: 'wait', params: { seconds: 1 } },
      ],
    };
    expect(getTtsText(node)).toBe('(laughs)<#1#>');
  });
  it('returns plain text when node has no content array', () => {
    const node: TextNode = { type: 'text', text: 'Hello world' };
    expect(getTtsText(node)).toBe('Hello world');
  });

  it('converts interjection tags to (kind) format', () => {
    const node: TextNode = {
      type: 'text',
      text: '',
      content: [
        { type: 'text', text: 'Ha ' },
        { type: 'tag', name: 'interjection', params: { kind: 'laughs' } },
        { type: 'text', text: ' indeed' },
      ],
    };
    expect(getTtsText(node)).toBe('Ha (laughs) indeed');
  });

  it('converts wait tags to <#seconds#> format', () => {
    const node: TextNode = {
      type: 'text',
      text: '',
      content: [
        { type: 'text', text: 'Pause' },
        { type: 'tag', name: 'wait', params: { seconds: 1.5 } },
        { type: 'text', text: 'resume' },
      ],
    };
    expect(getTtsText(node)).toBe('Pause<#1.5#>resume');
  });

  it('ignores other tags like bgm', () => {
    const node: TextNode = {
      type: 'text',
      text: '',
      content: [
        { type: 'text', text: 'Hello ' },
        { type: 'tag', name: 'bgm', params: { asset: 'music.mp3' } },
        { type: 'text', text: 'world' },
      ],
    };
    expect(getTtsText(node)).toBe('Hello world');
  });

  it('handles mixed content with text, interjection, and wait', () => {
    const node: TextNode = {
      type: 'text',
      text: '',
      content: [
        { type: 'text', text: 'Well ' },
        { type: 'tag', name: 'interjection', params: { kind: 'sighs' } },
        { type: 'text', text: ' let me think' },
        { type: 'tag', name: 'wait', params: { seconds: 2 } },
        { type: 'text', text: ' okay' },
      ],
    };
    expect(getTtsText(node)).toBe('Well (sighs) let me think<#2#> okay');
  });
});

describe('getTextNodeContent', () => {
  it('returns content array when present and non-empty', () => {
    const content: RichContent[] = [
      { type: 'text', text: 'Hello' },
      { type: 'tag', name: 'bgm', params: { asset: 'music.mp3' } },
    ];
    const node: TextNode = { type: 'text', text: 'Hello', content };
    const result = getTextNodeContent(node);
    expect(result).toEqual(content);
    expect(result).toHaveLength(2);
  });

  it('synthesizes content array from text field when content is absent', () => {
    const node: TextNode = { type: 'text', text: 'Plain text' };
    const result = getTextNodeContent(node);
    expect(result).toEqual([{ type: 'text', text: 'Plain text' }]);
  });

  it('synthesizes content array from text field when content is empty', () => {
    const node: TextNode = { type: 'text', text: 'Plain text', content: [] };
    const result = getTextNodeContent(node);
    expect(result).toEqual([{ type: 'text', text: 'Plain text' }]);
  });

  it('returns empty array when both text and content are empty', () => {
    const node: TextNode = { type: 'text', text: '', content: [] };
    expect(getTextNodeContent(node)).toEqual([]);
  });

  it('returns empty array when text is empty and no content field', () => {
    const node: TextNode = { type: 'text', text: '' };
    expect(getTextNodeContent(node)).toEqual([]);
  });

  it('prefers content array over text field when both are present', () => {
    const content: RichContent[] = [{ type: 'text', text: 'From content' }];
    const node: TextNode = { type: 'text', text: 'From text field', content };
    const result = getTextNodeContent(node);
    expect(result).toEqual(content);
  });

  it('handles whitespace-only text', () => {
    const node: TextNode = { type: 'text', text: '   ' };
    const result = getTextNodeContent(node);
    expect(result).toEqual([{ type: 'text', text: '   ' }]);
  });
});

describe('buildTextNodeFromContent', () => {
  it('builds node with only text segments', () => {
    const content: RichContent[] = [
      { type: 'text', text: 'Hello ' },
      { type: 'text', text: 'world' },
    ];
    const node = buildTextNodeFromContent(content);
    expect(node.type).toBe('text');
    expect(node.text).toBe('Hello world');
    expect(node.content).toBeUndefined(); // No tags, so content field is omitted
  });

  it('builds node with text and tags, preserving content array', () => {
    const content: RichContent[] = [
      { type: 'text', text: 'Hello ' },
      { type: 'tag', name: 'bgm', params: { asset: 'music.mp3' } },
      { type: 'text', text: 'world' },
    ];
    const node = buildTextNodeFromContent(content);
    expect(node.type).toBe('text');
    expect(node.text).toBe('Hello world');
    expect(node.content).toEqual(content);
  });

  it('builds node with only tags (no text)', () => {
    const content: RichContent[] = [
      { type: 'tag', name: 'bgm', params: { asset: 'music.mp3' } },
      { type: 'tag', name: 'sfx', params: { asset: 'sound.wav' } },
    ];
    const node = buildTextNodeFromContent(content);
    expect(node.type).toBe('text');
    expect(node.text).toBe('');
    expect(node.content).toEqual(content);
  });

  it('builds node with empty content array', () => {
    const node = buildTextNodeFromContent([]);
    expect(node.type).toBe('text');
    expect(node.text).toBe('');
    expect(node.content).toBeUndefined();
  });

  it('includes actorId when provided', () => {
    const content: RichContent[] = [{ type: 'text', text: 'Hello' }];
    const node = buildTextNodeFromContent(content, 'alice');
    expect(node.actorId).toBe('alice');
    expect(node.text).toBe('Hello');
  });

  it('builds node without actorId when not provided', () => {
    const content: RichContent[] = [{ type: 'text', text: 'Narration' }];
    const node = buildTextNodeFromContent(content);
    expect(node.actorId).toBeUndefined();
    expect(node.text).toBe('Narration');
  });

  it('concatenates multiple text segments correctly', () => {
    const content: RichContent[] = [
      { type: 'text', text: 'One' },
      { type: 'text', text: ' ' },
      { type: 'text', text: 'Two' },
      { type: 'text', text: ' ' },
      { type: 'text', text: 'Three' },
    ];
    const node = buildTextNodeFromContent(content);
    expect(node.text).toBe('One Two Three');
  });

  it('builds node with tag at start of content', () => {
    const content: RichContent[] = [
      { type: 'tag', name: 'sfx', params: { asset: 'beep.wav' } },
      { type: 'text', text: 'Message' },
    ];
    const node = buildTextNodeFromContent(content);
    expect(node.text).toBe('Message');
    expect(node.content).toEqual(content);
  });

  it('builds node with tag at end of content', () => {
    const content: RichContent[] = [
      { type: 'text', text: 'Message' },
      { type: 'tag', name: 'sfx', params: { asset: 'beep.wav' } },
    ];
    const node = buildTextNodeFromContent(content);
    expect(node.text).toBe('Message');
    expect(node.content).toEqual(content);
  });

  it('builds node with complex mixed content', () => {
    const content: RichContent[] = [
      { type: 'text', text: 'Start ' },
      { type: 'tag', name: 'bgm', params: { asset: 'intro.mp3' } },
      { type: 'text', text: 'middle ' },
      { type: 'tag', name: 'sfx', params: { asset: 'click.wav' } },
      { type: 'text', text: 'end' },
    ];
    const node = buildTextNodeFromContent(content, 'narrator');
    expect(node.type).toBe('text');
    expect(node.text).toBe('Start middle end');
    expect(node.actorId).toBe('narrator');
    expect(node.content).toEqual(content);
  });
});
