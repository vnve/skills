import { describe, it, expect } from "vitest";
import type { RichContent } from "@vnve/core";
import { richContentToSlate, slateToRichContent } from "./plate/converters";

describe("richContentToSlate", () => {
  it("returns a paragraph with empty text for empty content", () => {
    const result = richContentToSlate([]);
    expect(result).toEqual([{ type: "p", children: [{ text: "" }] }]);
  });

  it("converts text-only content", () => {
    const content: RichContent[] = [{ type: "text", text: "Hello world" }];
    const result = richContentToSlate(content);
    expect(result).toEqual([
      { type: "p", children: [{ text: "Hello world" }] },
    ]);
  });

  it("converts a single tag", () => {
    const content: RichContent[] = [
      { type: "tag", name: "bgm", params: { asset: "theme.mp3" } },
    ];
    const result = richContentToSlate(content);
    expect(result).toEqual([
      {
        type: "p",
        children: [
          { text: "" },
          {
            type: "inline-tag",
            name: "bgm",
            params: { asset: "theme.mp3" },
            children: [{ text: "" }],
          },
          { text: "" },
        ],
      },
    ]);
  });

  it("converts mixed text and tags", () => {
    const content: RichContent[] = [
      { type: "text", text: "Hello " },
      { type: "tag", name: "show", params: { actor: "Alice" } },
      { type: "text", text: " world" },
    ];
    const result = richContentToSlate(content);
    expect(result).toEqual([
      {
        type: "p",
        children: [
          { text: "Hello " },
          {
            type: "inline-tag",
            name: "show",
            params: { actor: "Alice" },
            children: [{ text: "" }],
          },
          { text: " world" },
        ],
      },
    ]);
  });

  it("converts tag at start", () => {
    const content: RichContent[] = [
      { type: "tag", name: "wait", params: { seconds: 2 } },
      { type: "text", text: "after wait" },
    ];
    const result = richContentToSlate(content);
    expect(result[0].children[1]).toEqual({
      type: "inline-tag",
      name: "wait",
      params: { seconds: 2 },
      children: [{ text: "" }],
    });
    expect(result[0].children[2]).toEqual({ text: "after wait" });
  });

  it("converts tag at end", () => {
    const content: RichContent[] = [
      { type: "text", text: "before sfx" },
      { type: "tag", name: "sfx", params: { asset: "boom.mp3" } },
    ];
    const result = richContentToSlate(content);
    expect(result[0].children[0]).toEqual({ text: "before sfx" });
    expect(result[0].children[1]).toEqual({
      type: "inline-tag",
      name: "sfx",
      params: { asset: "boom.mp3" },
      children: [{ text: "" }],
    });
    expect(result[0].children[2]).toEqual({ text: "" });
  });

  it("converts multiple adjacent tags", () => {
    const content: RichContent[] = [
      { type: "tag", name: "bgm", params: { asset: "a.mp3" } },
      { type: "tag", name: "sfx", params: { asset: "b.mp3" } },
    ];
    const result = richContentToSlate(content);
    expect(result[0].children).toHaveLength(5);
    expect(result[0].children[1]).toMatchObject({
      type: "inline-tag",
      name: "bgm",
    });
    expect(result[0].children[3]).toMatchObject({
      type: "inline-tag",
      name: "sfx",
    });
  });
});

describe("slateToRichContent", () => {
  it("returns empty array for empty paragraph", () => {
    const result = slateToRichContent([
      { type: "p", children: [{ text: "" }] },
    ]);
    expect(result).toEqual([]);
  });

  it("converts text-only slate value", () => {
    const result = slateToRichContent([
      { type: "p", children: [{ text: "Hello" }] },
    ]);
    expect(result).toEqual([{ type: "text", text: "Hello" }]);
  });

  it("converts inline tag elements", () => {
    const result = slateToRichContent([
      {
        type: "p",
        children: [
          { text: "before " },
          {
            type: "inline-tag",
            name: "show",
            params: { actor: "Bob" },
            children: [{ text: "" }],
          },
          { text: " after" },
        ],
      },
    ]);
    expect(result).toEqual([
      { type: "text", text: "before " },
      { type: "tag", name: "show", params: { actor: "Bob" } },
      { type: "text", text: " after" },
    ]);
  });

  it("merges adjacent text segments from multiple paragraphs", () => {
    const result = slateToRichContent([
      { type: "p", children: [{ text: "line one" }] },
      { type: "p", children: [{ text: "line two" }] },
    ]);
    expect(result).toEqual([{ type: "text", text: "line one\nline two" }]);
  });

  it("handles tag-only content", () => {
    const result = slateToRichContent([
      {
        type: "p",
        children: [
          {
            type: "inline-tag",
            name: "bgm",
            params: { asset: "x.mp3" },
            children: [{ text: "" }],
          },
        ],
      },
    ]);
    expect(result).toEqual([
      { type: "tag", name: "bgm", params: { asset: "x.mp3" } },
    ]);
  });
});

describe("roundtrip: richContentToSlate -> slateToRichContent", () => {
  const cases: { name: string; content: RichContent[] }[] = [
    { name: "empty", content: [] },
    { name: "text only", content: [{ type: "text", text: "hello world" }] },
    {
      name: "tag at start",
      content: [
        { type: "tag", name: "bgm", params: { asset: "a.mp3" } },
        { type: "text", text: " after" },
      ],
    },
    {
      name: "tag in middle",
      content: [
        { type: "text", text: "before " },
        { type: "tag", name: "show", params: { actor: "A" } },
        { type: "text", text: " after" },
      ],
    },
    {
      name: "tag at end",
      content: [
        { type: "text", text: "before " },
        { type: "tag", name: "sfx", params: { asset: "x.mp3" } },
      ],
    },
    {
      name: "multiple tags",
      content: [
        { type: "text", text: "start " },
        { type: "tag", name: "bgm", params: { asset: "a.mp3" } },
        { type: "text", text: " mid " },
        { type: "tag", name: "sfx", params: { asset: "b.mp3" } },
        { type: "text", text: " end" },
      ],
    },
    {
      name: "adjacent tags no text between",
      content: [
        { type: "tag", name: "bgm", params: { asset: "a.mp3" } },
        { type: "tag", name: "sfx", params: { asset: "b.mp3" } },
      ],
    },
  ];

  for (const { name, content } of cases) {
    it(`roundtrips: ${name}`, () => {
      const slate = richContentToSlate(content);
      const result = slateToRichContent(slate);
      expect(result).toEqual(content);
    });
  }
});
