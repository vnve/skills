import type { RichContent, InlineTag, TextSegment } from "@vnve/core";
import type {
  InlineTagElement,
  ParagraphElement,
  ScriptValue,
  ScriptText,
} from "./types";

/**
 * Convert a RichContent[] array into a Slate-compatible value.
 * All content is wrapped in a single paragraph element.
 */
export function richContentToSlate(content: RichContent[]): ScriptValue {
  if (content.length === 0) {
    return [{ type: "p", children: [{ text: "" }] }];
  }

  const children: ParagraphElement["children"] = [];
  const pushAnchor = () => {
    const last = children.length > 0 ? children[children.length - 1] : null;
    if (last && !("type" in last) && last.text === "") return;
    children.push({ text: "" });
  };

  for (let i = 0; i < content.length; i += 1) {
    const seg = content[i];
    const prev = i > 0 ? content[i - 1] : null;
    const next = i < content.length - 1 ? content[i + 1] : null;

    if (seg.type === "text") {
      const leaf: ScriptText = { text: seg.text };
      if (seg.bold) leaf.bold = true;
      if (seg.italic) leaf.italic = true;
      if (seg.color) leaf.color = seg.color;
      children.push(leaf);
    } else {
      // Ensure stable editable anchors around inline void tags.
      // This improves caret behavior and IME composition near tag boundaries.
      if (prev === null || prev.type === "tag") {
        pushAnchor();
      }
      children.push({
        type: "inline-tag",
        name: seg.name,
        params: { ...seg.params },
        children: [{ text: "" }],
      });
      if (next === null || next.type === "tag") {
        pushAnchor();
      }
    }
  }

  // Slate requires at least one text node; if content was all tags, add empty text
  if (children.length === 0) {
    children.push({ text: "" });
  }

  return [{ type: "p", children }];
}

/**
 * Convert a Slate value back into a RichContent[] array.
 * Walks all paragraphs and flattens into a single content array,
 * joining paragraphs with newline characters.
 */
export function slateToRichContent(value: ScriptValue): RichContent[] {
  const result: RichContent[] = [];

  for (let pIdx = 0; pIdx < value.length; pIdx++) {
    const para = value[pIdx];

    // Insert newline between paragraphs
    if (pIdx > 0) {
      appendText(result, "\n", false, false, undefined);
    }

    for (const child of para.children) {
      if ("type" in child && child.type === "inline-tag") {
        const tagEl = child as InlineTagElement;
        const tag = {
          type: "tag",
          name: tagEl.name,
          params: { ...tagEl.params },
        } as InlineTag;
        result.push(tag);
      } else {
        const text = ("text" in child ? child.text : "") as string;
        if (text.length > 0) {
          const bold = !!(child as ScriptText).bold;
          const italic = !!(child as ScriptText).italic;
          const color = (child as ScriptText).color;
          appendText(result, text, bold, italic, color);
        }
      }
    }
  }

  return result;
}

/** Append text to the result, merging with the last segment only if styles match. */
function appendText(
  result: RichContent[],
  text: string,
  bold: boolean,
  italic: boolean,
  color: string | undefined,
) {
  const last = result.length > 0 ? result[result.length - 1] : null;
  if (last && last.type === "text") {
    const lastSeg = last as TextSegment;
    // Only merge if styles match
    if (
      !!lastSeg.bold === bold &&
      !!lastSeg.italic === italic &&
      (lastSeg.color ?? undefined) === color
    ) {
      result[result.length - 1] = {
        type: "text",
        text: lastSeg.text + text,
        ...(bold ? { bold: true } : {}),
        ...(italic ? { italic: true } : {}),
        ...(color ? { color } : {}),
      };
      return;
    }
  }

  const seg: TextSegment = { type: "text", text };
  if (bold) seg.bold = true;
  if (italic) seg.italic = true;
  if (color) seg.color = color;
  result.push(seg);
}
