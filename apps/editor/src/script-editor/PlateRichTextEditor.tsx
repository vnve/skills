import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { isInlineTagBlocking } from "@vnve/parser";
import { Plate, PlateContent, usePlateEditor } from "platejs/react";
import type { InlineTag, RichContent, TextSegment } from "@vnve/core";
import { InlineTagPlugin } from "./plate/inline-tag-plugin";
import { BoldPlugin, ItalicPlugin, ColorPlugin } from "./plate/mark-plugins";
import { InlineTagElement } from "./plate/InlineTagElement";
import { InlineTagProvider } from "./plate/InlineTagContext";
import { richContentToSlate, slateToRichContent } from "./plate/converters";
import { TagConfigPopover } from "./TagConfigPopover";
import { FloatingTextToolbar } from "./FloatingTextToolbar";
import { getInlineTagByIndex } from "./tag-utils";
import type { ScriptValue } from "./plate/types";
import type { SceneActorOption } from "./scene-actor-options";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PlateRichTextEditorProps {
  content: RichContent[];
  actorOptions: SceneActorOption[];
  readOnly?: boolean;
  tagsReadOnly?: boolean;
  placeholder?: string;
  onChange: (content: RichContent[]) => void;
  onSlashTrigger?: (
    position: { top: number; left: number },
    charOffset: number,
  ) => void;
  onKeyDown?: (e: React.KeyboardEvent) => void;
  onBackspaceWhenEmpty?: () => void;
  onTagParamChange?: (
    tagIndex: number,
    paramKey: string,
    value: unknown,
  ) => void;
  onTagDelete?: (tagIndex: number) => void;
  onPreviewTag?: (tag: InlineTag) => void;
  autoOpenTag?: { tagIndex: number; token: number };
  onAutoOpenTagHandled?: () => void;
}

function computeParallelRuns(
  content: RichContent[],
  excludedTagIndices?: Set<number>,
): number[][] {
  const runs: number[][] = [];
  let currentRun: number[] = [];
  let tagIndex = 0;

  for (const seg of content) {
    if (seg.type === "tag") {
      if (excludedTagIndices?.has(tagIndex)) {
        if (currentRun.length > 1) runs.push(currentRun);
        currentRun = [];
        tagIndex += 1;
        continue;
      }

      const isParallel = !isInlineTagBlocking(seg);
      if (isParallel) {
        currentRun.push(tagIndex);
      } else if (currentRun.length > 0) {
        if (currentRun.length > 1) runs.push(currentRun);
        currentRun = [];
      }
      tagIndex += 1;
      continue;
    }

    if (currentRun.length > 0) {
      if (currentRun.length > 1) runs.push(currentRun);
      currentRun = [];
    }
  }

  if (currentRun.length > 1) runs.push(currentRun);
  return runs;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PlateRichTextEditor({
  content,
  actorOptions,
  readOnly = false,
  tagsReadOnly = false,
  placeholder,
  onChange,
  onSlashTrigger,
  onKeyDown,
  onBackspaceWhenEmpty,
  onTagParamChange,
  onTagDelete,
  onPreviewTag,
  autoOpenTag,
  onAutoOpenTagHandled,
}: PlateRichTextEditorProps) {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const initialValue = useMemo(() => richContentToSlate(content), []);

  const editor = usePlateEditor(
    {
      value: initialValue,
      plugins: [
        InlineTagPlugin.withComponent(InlineTagElement),
        BoldPlugin,
        ItalicPlugin,
        ColorPlugin,
      ],
    },
    [], // stable deps: create editor once, never recreate
  );

  // Popover state
  const [popover, setPopover] = useState<{
    tagIndex: number;
    position: { top: number; left: number };
  } | null>(null);
  const [frozenParallelRuns, setFrozenParallelRuns] = useState<
    number[][] | null
  >(null);

  // Track content we last pushed to parent via onChange, so we can
  // distinguish external changes from our own echoed-back changes.
  // Initialized with the initial content to skip the mount cycle.
  const lastPushedRef = useRef(JSON.stringify(content));
  const isSyncingRef = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const isComposingRef = useRef(false);

  // Sync external content changes (tag insert/delete/param) into editor
  useEffect(() => {
    const json = JSON.stringify(content);
    if (json === lastPushedRef.current) return;

    // Update ref BEFORE replaceNodes so the echoed onValueChange can
    // detect that this change originated from an external sync and
    // skip the redundant onChange → store update cycle.
    lastPushedRef.current = json;
    isSyncingRef.current = true;
    const newValue = richContentToSlate(content);
    editor.tf.replaceNodes(newValue, { at: [], children: true });
    isSyncingRef.current = false;
  }, [content, editor]);

  // Handle editor value changes
  const handleValueChange = useCallback(
    ({ value }: { value: ScriptValue }) => {
      // Skip echoed changes from the external sync effect above.
      // The content is already in the store — pushing it back would
      // trigger a redundant compile + setState during the passive
      // effect phase, causing "Maximum update depth exceeded".
      if (isSyncingRef.current) return;

      const newContent = slateToRichContent(value);
      const json = JSON.stringify(newContent);
      // Plate may publish the external replacement after the sync effect ends.
      if (json === lastPushedRef.current) return;
      lastPushedRef.current = json;
      onChange(newContent);
    },
    [onChange],
  );

  // Compute character offset (counting only text, skipping tags) from Slate selection
  const getCharOffset = useCallback((): number => {
    const { selection } = editor;
    if (!selection) return 0;

    const anchor = selection.anchor;
    let charOffset = 0;
    const value = editor.children as ScriptValue;

    for (const para of value) {
      for (let i = 0; i < para.children.length; i++) {
        const child = para.children[i];
        if ("type" in child && child.type === "inline-tag") {
          // Tags don't count toward char offset
          continue;
        }
        const text =
          typeof (child as { text?: unknown }).text === "string"
            ? (child as { text: string }).text
            : "";
        // Check if anchor is in this text node
        if (anchor.path.length >= 2 && anchor.path[1] === i) {
          charOffset += anchor.offset;
          return charOffset;
        }
        charOffset += text.length;
      }
    }
    return charOffset;
  }, [editor]);

  // Handle keydown for slash commands, backspace, and arrow navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const native = e.nativeEvent as KeyboardEvent;
      if (
        native.isComposing ||
        isComposingRef.current ||
        native.keyCode === 229
      ) {
        return;
      }

      // Slash command trigger
      if (e.key === "/" && onSlashTrigger) {
        const { selection } = editor;
        if (selection) {
          e.preventDefault();
          const charOff = getCharOffset();
          const domRange = window.getSelection()?.getRangeAt(0);
          if (domRange) {
            const rect = domRange.getBoundingClientRect();
            onSlashTrigger?.(
              {
                top: rect.bottom + 4,
                left: rect.left,
              },
              charOff,
            );
          }
          return;
        }
      }

      // Backspace when empty
      if (e.key === "Backspace") {
        const plainText = content
          .filter((seg): seg is TextSegment => seg.type === "text")
          .map((seg) => seg.text)
          .join("");
        const hasTags = content.some((seg) => seg.type === "tag");

        if (plainText === "" && !hasTags) {
          e.preventDefault();
          onBackspaceWhenEmpty?.();
          return;
        }
      }

      // Arrow navigation bubbles to parent
      if (e.key === "ArrowUp" || e.key === "ArrowDown") {
        onKeyDown?.(e);
      }
    },
    [
      editor,
      content,
      getCharOffset,
      onSlashTrigger,
      onBackspaceWhenEmpty,
      onKeyDown,
    ],
  );

  // Inline tag callbacks passed via context
  const tagCallbacks = useMemo(
    () => ({
      onTagClick: (tagIndex: number, _tag: InlineTag, rect: DOMRect) => {
        if (!frozenParallelRuns) {
          setFrozenParallelRuns(computeParallelRuns(content));
        }
        setPopover({
          tagIndex,
          position: { top: rect.bottom + 4, left: rect.left },
        });
      },
      onTagDelete,
      readOnly: tagsReadOnly,
      frozenParallelRuns: popover ? (frozenParallelRuns ?? []) : undefined,
    }),
    [onTagDelete, readOnly, tagsReadOnly, popover, frozenParallelRuns, content],
  );

  const isEmpty =
    content.length === 0 ||
    (content.length === 1 &&
      content[0].type === "text" &&
      content[0].text === "");
  const activePopoverTag = useMemo(() => {
    if (!popover) return null;
    return getInlineTagByIndex(content, popover.tagIndex);
  }, [content, popover]);

  useEffect(() => {
    if (popover && !activePopoverTag) {
      setPopover(null);
      setFrozenParallelRuns(null);
    }
  }, [popover, activePopoverTag]);

  useEffect(() => {
    if (!autoOpenTag || readOnly) return;

    let rafId: number | null = null;
    let attempts = 0;

    const openFromTagPill = () => {
      attempts += 1;
      const el = containerRef.current?.querySelector(
        `[data-tag-index="${autoOpenTag.tagIndex}"]`,
      ) as HTMLElement | null;
      if (el) {
        const rect = el.getBoundingClientRect();
        // Newly inserted tag should stay visually unmerged during config.
        const excluded = new Set<number>([autoOpenTag.tagIndex]);
        setFrozenParallelRuns(computeParallelRuns(content, excluded));
        setPopover({
          tagIndex: autoOpenTag.tagIndex,
          position: { top: rect.bottom + 4, left: rect.left },
        });
        onAutoOpenTagHandled?.();
        return;
      }
      if (attempts < 4) {
        rafId = window.requestAnimationFrame(openFromTagPill);
      } else {
        onAutoOpenTagHandled?.();
      }
    };

    rafId = window.requestAnimationFrame(openFromTagPill);

    return () => {
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId);
      }
    };
  }, [autoOpenTag, readOnly, onAutoOpenTagHandled, content]);

  return (
    <div ref={containerRef} className="relative flex-1 min-w-0">
      <InlineTagProvider value={tagCallbacks}>
        <Plate
          editor={editor}
          readOnly={readOnly}
          onValueChange={handleValueChange}
        >
          <PlateContent
            className={`
              text-sm text-white/80 focus:outline-none min-w-0 pt-0.5
              whitespace-pre-wrap break-words
              ${readOnly ? "cursor-default" : ""}
            `}
            placeholder={isEmpty && !readOnly ? placeholder : undefined}
            onKeyDown={handleKeyDown}
            onCompositionStart={() => {
              isComposingRef.current = true;
            }}
            onCompositionEnd={() => {
              isComposingRef.current = false;
            }}
          />
          {!readOnly && <FloatingTextToolbar />}
        </Plate>
      </InlineTagProvider>

      {/* Tag config popover */}
      {popover && activePopoverTag && (
        <TagConfigPopover
          readOnly={tagsReadOnly}
          tag={activePopoverTag}
          tagIndex={popover.tagIndex}
          position={popover.position}
          actorOptions={actorOptions}
          onParamChange={(tagIndex, paramKey, value) => {
            if (!tagsReadOnly) onTagParamChange?.(tagIndex, paramKey, value);
          }}
          onDelete={(tagIndex) => {
            setPopover(null);
            setFrozenParallelRuns(null);
            if (!tagsReadOnly) onTagDelete?.(tagIndex);
          }}
          onClose={() => {
            setPopover(null);
            setFrozenParallelRuns(null);
          }}
          onPreview={
            onPreviewTag
              ? () => {
                  setPopover(null);
                  setFrozenParallelRuns(null);
                  onPreviewTag(activePopoverTag);
                }
              : undefined
          }
        />
      )}
    </div>
  );
}
