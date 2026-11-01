// Extracted from vnve ScriptEditor.
import React, { useRef } from "react";
import { useDrag, useDrop } from "react-dnd";
import { GripVertical } from "lucide-react";
const DND_SCRIPT_NODE = "SCRIPT_NODE";
interface DragNodeItem {
  type: typeof DND_SCRIPT_NODE;
  index: number;
}
export function DraggableNodeRow({
  index,
  onMoveNode,
  isActiveNode,
  setNodeRowRef,
  children,
}: {
  index: number;
  onMoveNode: (from: number, to: number) => void;
  isActiveNode: boolean;
  setNodeRowRef: (index: number, el: HTMLDivElement | null) => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement | null>(null);

  const [{ isDragging }, drag, preview] = useDrag({
    type: DND_SCRIPT_NODE,
    item: (): DragNodeItem => ({ type: DND_SCRIPT_NODE, index }),
    collect: (monitor) => ({ isDragging: !!monitor.isDragging() }),
  });

  const [{ isOver }, drop] = useDrop({
    accept: DND_SCRIPT_NODE,
    hover(item: DragNodeItem) {
      if (item.index === index) return;
      onMoveNode(item.index, index);
      item.index = index; // mutate to track current position
    },
    collect: (monitor) => ({ isOver: !!monitor.isOver() }),
  });

  preview(drop(ref));

  return (
    <div
      ref={(el) => {
        ref.current = el;
        setNodeRowRef(index, el);
      }}
      className={`relative flex items-center ${isDragging ? "opacity-30" : ""} ${isOver ? "border-t-2 border-brand/50" : ""} ${isActiveNode ? "ring-1 ring-emerald-400/80 rounded-md" : ""}`}
    >
      {/* Drag handle */}
      <div
        ref={drag as unknown as React.Ref<HTMLDivElement>}
        className="flex items-center pl-1 pr-0 cursor-grab active:cursor-grabbing text-white/20 hover:text-white/50 transition-colors shrink-0"
      >
        <GripVertical className="w-3 h-3" />
      </div>
      {/* Node content */}
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}
