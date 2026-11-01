import { updateTagParameter } from "./tag-edits";
// Session/Patch integration for rich-text editing and the command palette.
import React, { useContext, useEffect, useRef, useState } from "react";
import {
  getTextNodeContent,
  type RichContent,
  type Project,
  type Scene,
  type InlineTag,
} from "@vnve/core";
import { PlateRichTextEditor } from "./PlateRichTextEditor";
import { SlashCommandPalette } from "./SlashCommandPalette";
import { buildSceneActorOptions } from "./scene-actor-options";
import { insertTagIntoTextNode } from "../core/script-operations";
import { EditorReadProvider } from "../stores/editor-store";
import { EditBuffers } from "./EditBuffers";
export function RichEditor({
  content,
  nodeId,
  project,
  scene,
  onChange,
  onEnter,
  autoFocus,
  readOnly = false,
  advanced = false,
  tagsReadOnly = false,
  onPreview,
}: {
  content: RichContent[];
  nodeId: string;
  project: Project;
  scene: Scene;
  onChange: (content: RichContent[]) => boolean;
  onEnter: () => void;
  autoFocus?: boolean;
  readOnly?: boolean;
  advanced?: boolean;
  tagsReadOnly?: boolean;
  onPreview?: (tag: InlineTag) => void;
}) {
  const [draft, setDraft] = useState(content);
  const current = useRef(content);
  const saved = useRef(JSON.stringify(content));
  const rejected = useRef<{ draft: string; project: Project }>();
  const buffers = useContext(EditBuffers);
  const commitRef = useRef<() => boolean>(() => true);
  const root = useRef<HTMLDivElement>(null);
  const [slash, setSlash] = useState<{
    position: { top: number; left: number };
    offset: number;
  }>();
  const [autoOpenTag, setAutoOpenTag] = useState<{
    tagIndex: number;
    token: number;
  }>();
  function commit() {
    if (JSON.stringify(current.current) === saved.current) {
      buffers.delete(nodeId);
      return true;
    }
    const serialized = JSON.stringify(current.current);
    if (
      rejected.current?.draft === serialized &&
      rejected.current.project === project
    )
      return false;
    if (!onChange(current.current)) {
      rejected.current = { draft: serialized, project };
      return false;
    }
    rejected.current = undefined;
    saved.current = JSON.stringify(current.current);
    buffers.delete(nodeId);
    return true;
  }
  commitRef.current = commit;
  function change(next: RichContent[]) {
    current.current = next;
    setDraft(next);
    if (JSON.stringify(next) === saved.current) buffers.delete(nodeId);
    else buffers.set(nodeId, () => commitRef.current());
  }
  useEffect(() => {
    if (JSON.stringify(content) !== saved.current) {
      current.current = content;
      saved.current = JSON.stringify(content);
      setDraft(content);
      buffers.delete(nodeId);
    }
  }, [content]);
  useEffect(
    () => () => {
      buffers.delete(nodeId);
    },
    [nodeId, buffers],
  );
  useEffect(() => {
    if (autoFocus)
      root.current
        ?.querySelector<HTMLElement>("[contenteditable=true]")
        ?.focus();
  }, [autoFocus]);
  function updateTag(
    index: number,
    update: (tag: InlineTag) => InlineTag | null,
  ) {
    let n = -1;
    change(
      current.current.flatMap((segment) => {
        if (segment.type !== "tag" || ++n !== index) return [segment];
        const next = update(segment);
        return next ? [next] : [];
      }),
    );
  }
  return (
    <EditorReadProvider value={{ project, currentScene: scene }}>
      <div
        className="vnve-ui relative min-w-0"
        ref={root}
        onBlur={(e) => {
          if (
            !e.currentTarget.contains(e.relatedTarget as Node) &&
            !slash &&
            !document.querySelector("[data-tag-config-popover]")
          )
            commit();
        }}
        onKeyDown={(e) => {
          if (
            e.key === "Enter" &&
            !e.shiftKey &&
            !e.nativeEvent.isComposing &&
            !(e.target as HTMLElement).closest(
              "button, input, textarea, select, [role=button], [cmdk-root], [data-tag-config-popover]",
            )
          ) {
            e.preventDefault();
            if (commit()) onEnter();
          }
        }}
      >
        <PlateRichTextEditor
          content={draft}
          actorOptions={buildSceneActorOptions(
            scene,
            project.visualSubjects,
            project.assets.visual.character,
            project.assets.visual.prop,
          )}
          readOnly={readOnly}
          placeholder={
            advanced ? "输入台词，按 / 插入演出" : "微调台词，保留已有演出"
          }
          tagsReadOnly={tagsReadOnly}
          onChange={change}
          onSlashTrigger={
            advanced
              ? (position, offset) => setSlash({ position, offset })
              : undefined
          }
          onTagParamChange={(index, key, value) =>
            updateTag(index, (tag) =>
              updateTagParameter(
                tag,
                key,
                value,
                project.meta.width,
                project.meta.height,
              ),
            )
          }
          onPreviewTag={
            onPreview
              ? (tag) => {
                  if (commit()) onPreview(tag);
                }
              : undefined
          }
          onTagDelete={(index) => updateTag(index, () => null)}
          autoOpenTag={autoOpenTag}
          onAutoOpenTagHandled={() => setAutoOpenTag(undefined)}
        />
        {slash && (
          <SlashCommandPalette
            open
            recentCommands={[]}
            position={slash.position}
            onClose={() => setSlash(undefined)}
            onSelect={(name, params) => {
              const tag = {
                type: "tag",
                name,
                params:
                  name === "animation" && scene.animationClips?.length
                    ? { ...params, clipId: scene.animationClips[0].id }
                    : params,
              } as InlineTag;
              const doc = insertTagIntoTextNode(
                {
                  nodes: [
                    {
                      id: nodeId,
                      type: "text",
                      content: current.current,
                      text: "",
                    },
                  ],
                },
                0,
                slash.offset,
                tag,
              );
              const next = getTextNodeContent(doc.nodes[0]);
              const tagIndex = next
                .filter((s) => s.type === "tag")
                .indexOf(tag);
              change(next);
              setSlash(undefined);
              setAutoOpenTag({ tagIndex, token: performance.now() });
            }}
          />
        )}
      </div>
    </EditorReadProvider>
  );
}
