import { ScrollArea } from "../components/ui/scroll-area";
import { DraggableNodeRow } from "../script-editor/DraggableNodeRow";
import { TextNodeRow } from "../script-editor/TextNodeRow";
import { buildSceneActorOptions } from "../script-editor/scene-actor-options";
import React, { useEffect, useRef } from "react";
import { MessageSquareText, Plus } from "lucide-react";
import { type Project, type Scene } from "@vnve/core";
import { VoicePreview } from "../VoicePreview";
import { mediaUrl } from "./shared";
export function ScriptPanel({
  project,
  scene,
  activeNodeId,
  selectedNodeId,
  select,
  disabled,
  renderEditor,
  previewPlaying,
  changeSpeaker,
  moveNode,
  insertNode,
  deleteNode,
}: {
  moveNode: (from: number, to: number) => void;
  insertNode: (index: number) => void;
  deleteNode: (nodeId: string) => void;
  disabled?: boolean;
  renderEditor: (nodeId: string, readOnly: boolean) => React.ReactNode;
  project: Project;
  scene: Scene;
  activeNodeId?: string;
  selectedNodeId?: string;
  select: (nodeId: string) => void;
  previewPlaying: boolean;
  changeSpeaker: (nodeId: string, actorId: string) => void;
}) {
  const panelRef = useRef<HTMLElement>(null);
  function scrollLine(id: string | undefined) {
    if (!id) return;
    panelRef.current
      ?.querySelector<HTMLElement>(`[id="script-line-${id}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }
  useEffect(() => {
    scrollLine(selectedNodeId);
  }, [selectedNodeId]);
  useEffect(() => {
    if (previewPlaying) scrollLine(activeNodeId);
  }, [activeNodeId, previewPlaying, scene.id]);
  const actorOptions = buildSceneActorOptions(
    scene,
    project.visualSubjects,
    project.assets.visual.character,
    project.assets.visual.prop,
  );
  return (
    <section
      ref={panelRef}
      className="script-panel vnve-ui border-t bg-surface flex flex-col h-full min-h-0"
      aria-label="台词"
    >
      <div className="flex items-center justify-between px-4 py-1.5 border-b border-white/5 shrink-0">
        <span className="flex items-center gap-2 text-[11px] font-bold text-white/35 uppercase tracking-wider">
          <MessageSquareText className="size-3.5" aria-hidden="true" />
          台词
        </span>
        <button
          disabled={disabled || previewPlaying}
          onClick={() => insertNode(scene.script.nodes.length)}
          className="flex items-center gap-1 rounded px-1 py-0.5 text-[11px] font-medium text-white/45 cursor-pointer hover:bg-white/10 hover:text-white/80 transition-colors"
        >
          <Plus className="w-3 h-3" />
          <span>添加</span>
        </button>
      </div>
      <ScrollArea
        className="flex-1 min-h-0"
        viewportClassName="px-1 py-1 space-y-0.5"
      >
        {scene.script.nodes.map((node, index) => (
          <DraggableNodeRow
            key={node.id}
            index={index}
            onMoveNode={disabled || previewPlaying ? () => {} : moveNode}
            isActiveNode={previewPlaying && activeNodeId === node.id}
            setNodeRowRef={() => {}}
          >
            <TextNodeRow
              node={node}
              index={index}
              isSelected={selectedNodeId === node.id}
              actorOptions={actorOptions}
              diagnostics={[]}
              disabled={disabled || previewPlaying}
              showVoiceStatus={false}
              onDelete={() => deleteNode(node.id!)}
              onInsertBelow={() => insertNode(index + 1)}
              onSelect={() => select(node.id!)}
              onSpeakerChange={(id) => changeSpeaker(node.id!, id ?? "")}
              editor={renderEditor(
                node.id!,
                !!disabled || previewPlaying || selectedNodeId !== node.id,
              )}
              voiceControls={
                <VoicePreview
                  key={node.audioUrl ?? node.id}
                  src={node.audioUrl ? mediaUrl(node.audioUrl) : undefined}
                  label="本句"
                />
              }
            />
          </DraggableNodeRow>
        ))}
      </ScrollArea>
    </section>
  );
}
