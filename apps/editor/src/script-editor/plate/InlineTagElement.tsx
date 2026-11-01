import React, { useCallback } from "react";
import { isInlineTagBlocking } from "@vnve/parser";
import type { InlineTag } from "@vnve/core";
import { inlineTagSchema } from "@vnve/core";
import { PlateElement, useEditorRef } from "platejs/react";
import { InlineTagPill } from "../InlineTagPill";
import { hasValidationErrors } from "../TagConfigPopover";
import { useInlineTagCallbacks } from "./InlineTagContext";
import type {
  InlineTagElement as InlineTagElementType,
  ScriptValue,
} from "./types";

const IS_MAC =
  typeof navigator !== "undefined" &&
  /(Mac OS X|Macintosh)/.test(navigator.userAgent);

interface FlatTagEntry {
  tagIndex: number;
  paraIndex: number;
  childIndex: number;
  element: InlineTagElementType;
  tag: InlineTag;
  isParallel: boolean;
}

interface TagRunInfo {
  run: FlatTagEntry[];
  isRunTail: boolean;
}

function toInlineTag(el: InlineTagElementType): InlineTag {
  const parsed = inlineTagSchema.safeParse({
    type: "tag",
    name: el.name,
    params: el.params,
  });
  if (parsed.success) {
    return parsed.data;
  }
  return { type: "tag", name: el.name, params: el.params } as InlineTag;
}

function isParallelTag(el: InlineTagElementType): boolean {
  return !isInlineTagBlocking(toInlineTag(el));
}

function isInlineTagChild(child: unknown): child is InlineTagElementType {
  return (
    typeof child === "object" &&
    child !== null &&
    "type" in child &&
    (child as { type?: string }).type === "inline-tag"
  );
}

function isIgnorableTextChild(child: unknown): boolean {
  if (isInlineTagChild(child)) return false;
  if (typeof child === "object" && child !== null && "text" in child) {
    return ((child as { text?: unknown }).text ?? "") === "";
  }
  return false;
}

function flattenInlineTags(value: ScriptValue): FlatTagEntry[] {
  const entries: FlatTagEntry[] = [];
  let idx = 0;

  for (let paraIndex = 0; paraIndex < value.length; paraIndex += 1) {
    const para = value[paraIndex];
    for (
      let childIndex = 0;
      childIndex < para.children.length;
      childIndex += 1
    ) {
      const child = para.children[childIndex];
      if (!("type" in child) || child.type !== "inline-tag") continue;
      const element = child as InlineTagElementType;
      entries.push({
        tagIndex: idx,
        paraIndex,
        childIndex,
        element,
        tag: toInlineTag(element),
        isParallel: isParallelTag(element),
      });
      idx += 1;
    }
  }

  return entries;
}

function getTagRunInfoFromFrozen(
  value: ScriptValue,
  target: InlineTagElementType,
  frozenParallelRuns: number[][],
): TagRunInfo | null {
  const entries = flattenInlineTags(value);
  const targetEntry = entries.find((entry) => entry.element === target);
  if (!targetEntry) return null;

  const entryByTagIndex = new Map<number, FlatTagEntry>();
  for (const entry of entries) {
    entryByTagIndex.set(entry.tagIndex, entry);
  }

  const frozenRun = frozenParallelRuns.find((run) =>
    run.includes(targetEntry.tagIndex),
  );
  if (!frozenRun) {
    return { run: [targetEntry], isRunTail: true };
  }

  const run: FlatTagEntry[] = frozenRun
    .map((idx) => entryByTagIndex.get(idx))
    .filter((entry): entry is FlatTagEntry => !!entry);
  if (run.length === 0) {
    return { run: [targetEntry], isRunTail: true };
  }

  return {
    run,
    isRunTail: run[run.length - 1].tagIndex === targetEntry.tagIndex,
  };
}

/**
 * Find this tag's parallel run (contiguous inline-tag nodes in same paragraph,
 * each with await !== true).
 */
function getTagRunInfo(
  value: ScriptValue,
  target: InlineTagElementType,
): TagRunInfo | null {
  const entries = flattenInlineTags(value);
  const targetEntry = entries.find((entry) => entry.element === target);
  if (!targetEntry) return null;

  if (!targetEntry.isParallel) {
    return { run: [targetEntry], isRunTail: true };
  }

  const map = new Map<string, FlatTagEntry>();
  for (const entry of entries) {
    map.set(`${entry.paraIndex}:${entry.childIndex}`, entry);
  }

  const paraIndex = targetEntry.paraIndex;
  const para = value[paraIndex];
  if (!para) return null;
  const children = para.children;

  let start = targetEntry.childIndex;
  while (true) {
    const prevIndex = start - 1;
    if (prevIndex < 0) break;
    const prevChild = children[prevIndex];

    if (isIgnorableTextChild(prevChild)) {
      start = prevIndex;
      continue;
    }

    if (!isInlineTagChild(prevChild)) break;
    const prev = map.get(`${paraIndex}:${prevIndex}`);
    if (!prev || !prev.isParallel) break;
    start = prevIndex;
  }

  let end = targetEntry.childIndex;
  while (true) {
    const nextIndex = end + 1;
    if (nextIndex >= children.length) break;
    const nextChild = children[nextIndex];

    if (isIgnorableTextChild(nextChild)) {
      end = nextIndex;
      continue;
    }

    if (!isInlineTagChild(nextChild)) break;
    const next = map.get(`${paraIndex}:${nextIndex}`);
    if (!next || !next.isParallel) break;
    end = nextIndex;
  }

  const run: FlatTagEntry[] = [];
  for (let childIndex = start; childIndex <= end; childIndex += 1) {
    const entry = map.get(`${paraIndex}:${childIndex}`);
    if (entry?.isParallel) run.push(entry);
  }

  if (run.length === 0) {
    return { run: [targetEntry], isRunTail: true };
  }

  return {
    run,
    isRunTail: run[run.length - 1].element === target,
  };
}

function HiddenRunMember(props: any) {
  const { children } = props;
  return (
    <PlateElement
      {...props}
      as="span"
      contentEditable={false}
      style={{
        userSelect: "none",
        display: "inline-block",
        width: 0,
        height: 0,
        overflow: "hidden",
      }}
    >
      {children}
    </PlateElement>
  );
}

function TagStack({
  props,
  run,
  readOnly,
  onTagClick,
  onTagDelete,
}: {
  props: any;
  run: FlatTagEntry[];
  readOnly?: boolean;
  onTagClick?: (tagIndex: number, tag: InlineTag, rect: DOMRect) => void;
  onTagDelete?: (tagIndex: number) => void;
}) {
  const { children } = props;

  const handleClick = useCallback(
    (tagIndex: number, tag: InlineTag) => (e: React.MouseEvent) => {
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      onTagClick?.(tagIndex, tag, rect);
    },
    [onTagClick],
  );

  const handleDelete = useCallback(
    (tagIndex: number) => () => {
      onTagDelete?.(tagIndex);
    },
    [onTagDelete],
  );
  const isStacked = run.length > 1;

  return (
    <PlateElement
      {...props}
      as="span"
      contentEditable={false}
      style={{
        display: "inline",
        verticalAlign: "baseline",
        lineHeight: "inherit",
      }}
    >
      <span
        contentEditable={false}
        style={{ lineHeight: "inherit" }}
        className="inline align-baseline"
      >
        {IS_MAC ? children : null}
        <span
          className={
            isStacked
              ? "inline-flex flex-col gap-0.5 mx-0.5 align-middle select-none"
              : "inline-flex mx-0.5 align-baseline select-none"
          }
        >
          {run.map((entry) => (
            <InlineTagPill
              key={entry.tagIndex}
              tag={entry.tag}
              tagIndex={entry.tagIndex}
              readOnly={readOnly}
              hasError={hasValidationErrors(entry.tag)}
              onClick={handleClick(entry.tagIndex, entry.tag)}
              onDelete={handleDelete(entry.tagIndex)}
            />
          ))}
        </span>
        {IS_MAC ? null : children}
      </span>
    </PlateElement>
  );
}

/**
 * Plate element renderer for inline tag void elements.
 * Consecutive parallel tags retain vnve’s visible vertical stack.
 */
export function InlineTagElement(props: any) {
  const { element } = props;
  const el = element as InlineTagElementType;
  const editor = useEditorRef();
  const { onTagClick, onTagDelete, readOnly, frozenParallelRuns } =
    useInlineTagCallbacks();
  const value = editor.children as ScriptValue;
  const runInfo = frozenParallelRuns
    ? getTagRunInfoFromFrozen(value, el, frozenParallelRuns)
    : getTagRunInfo(value, el);

  if (!runInfo) return <HiddenRunMember {...props} />;
  if (runInfo.run.length > 1 && !runInfo.isRunTail)
    return <HiddenRunMember {...props} />;

  return (
    <TagStack
      props={props}
      run={runInfo.run}
      readOnly={readOnly}
      onTagClick={onTagClick}
      onTagDelete={onTagDelete}
    />
  );
}
