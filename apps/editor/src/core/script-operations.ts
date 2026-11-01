// Script operations preserve rich-text marks when splitting nodes.
import {
  getTextNodeContent,
  applyTextNodeMetadata,
  buildTextNodeFromContent,
  type ScriptDoc,
  type ScriptNode,
  type RichContent,
  type InlineTag,
} from "@vnve/core";
function updateNode(
  doc: ScriptDoc,
  index: number,
  node: ScriptNode,
): ScriptDoc {
  return { nodes: doc.nodes.map((n, i) => (i === index ? node : n)) };
}
export function insertTagIntoTextNode(
  doc: ScriptDoc,
  nodeIndex: number,
  charOffset: number,
  tag: InlineTag,
): ScriptDoc {
  const node = doc.nodes[nodeIndex];
  if (!node || node.type !== "text") return doc;

  const content = getTextNodeContent(node);
  const newContent: RichContent[] = [];
  let charsTraversed = 0;
  let inserted = false;

  for (const seg of content) {
    if (inserted) {
      newContent.push(seg);
      continue;
    }

    if (seg.type === "tag") {
      newContent.push(seg);
      continue;
    }

    // seg.type === 'text'
    const segLen = seg.text.length;
    // Use strict `>` so boundary insertions are placed after any existing
    // inline tags at the same text offset (more intuitive caret behavior).
    if (charsTraversed + segLen > charOffset && !inserted) {
      const splitAt = charOffset - charsTraversed;
      const before = seg.text.slice(0, splitAt);
      const after = seg.text.slice(splitAt);

      if (before.length > 0) {
        newContent.push({ ...seg, text: before });
      }
      newContent.push(tag);
      if (after.length > 0) {
        newContent.push({ ...seg, text: after });
      }
      inserted = true;
    } else {
      newContent.push(seg);
      charsTraversed += segLen;
    }
  }

  // If we haven't inserted yet (offset is at or past the end), append the tag
  if (!inserted) {
    newContent.push(tag);
  }

  return updateNode(
    doc,
    nodeIndex,
    applyTextNodeMetadata(
      buildTextNodeFromContent(newContent, node.actorId),
      node,
    ),
  );
}
