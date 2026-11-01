import type { TElement, TText } from "platejs";
import type { CommandName } from "@vnve/core";

/** Text leaf with optional style marks (bold, italic, color). */
export interface ScriptText extends TText {
  bold?: boolean;
  italic?: boolean;
  color?: string;
}

/** Inline void element representing an embedded command tag. */
export interface InlineTagElement extends TElement {
  type: "inline-tag";
  name: CommandName;
  params: Record<string, unknown>;
  children: [{ text: "" }];
}

/** Block-level paragraph wrapping text and inline elements. */
export interface ParagraphElement extends TElement {
  type: "p";
  children: (ScriptText | InlineTagElement)[];
}

/** The editor's top-level value type. */
export type ScriptValue = ParagraphElement[];
