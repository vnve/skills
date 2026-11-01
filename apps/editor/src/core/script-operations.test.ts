import { describe, it, expect } from "vitest";
import { getTextNodeContent, type InlineTag } from "@vnve/core";
import { insertTagIntoTextNode } from "./script-operations";
describe("vnve script operation adapter", () => {
  it("inserts at the caret while preserving surrounding text marks and existing directions", () => {
    const wait: InlineTag = {
      type: "tag",
      name: "wait",
      params: { seconds: 0.5 },
    };
    const existing: InlineTag = {
      type: "tag",
      name: "flash",
      params: { color: "#fff", dur: 0.2 },
    };
    const doc = {
      nodes: [
        {
          id: "line",
          type: "text" as const,
          text: "你好世界",
          content: [
            existing,
            {
              type: "text" as const,
              text: "你好世界",
              marks: { bold: true, color: "#ff0000" },
            },
          ],
        },
      ],
    };
    const result = insertTagIntoTextNode(doc, 0, 2, wait);
    expect(getTextNodeContent(result.nodes[0])).toEqual([
      existing,
      { type: "text", text: "你好", marks: { bold: true, color: "#ff0000" } },
      wait,
      { type: "text", text: "世界", marks: { bold: true, color: "#ff0000" } },
    ]);
    expect(getTextNodeContent(doc.nodes[0])).toEqual(doc.nodes[0].content);
  });
});
