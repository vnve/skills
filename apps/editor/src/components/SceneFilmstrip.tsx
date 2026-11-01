import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
  type WheelEvent,
} from "react";
import { useDrag, useDrop } from "react-dnd";
import { useTranslation } from "react-i18next";
import {
  Film,
  GripVertical,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "./ui/context-menu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";

const DND_STORYBOARD_SCENE = "SCENE_STORYBOARD";

export interface SceneFilmstripItem {
  id: string;
  sceneName: string;
  thumbnailUrl?: string;
  actorCount: number;
}

export interface SceneFilmstripAct {
  id: string;
  actName: string;
  scenes: SceneFilmstripItem[];
}

interface StoryboardSceneDragItem {
  type: typeof DND_STORYBOARD_SCENE;
  sceneId: string;
  actId: string;
  index: number;
}

interface SceneFilmstripProps {
  acts: SceneFilmstripAct[];
  currentSceneId: string;
  onSelectScene: (sceneId: string) => void;
  onRenameScene: (sceneId: string, name: string) => void;
  onAddScene: (actId: string) => void;
  onMoveScene: (
    srcActId: string,
    srcIdx: number,
    tgtActId: string,
    tgtIdx: number,
  ) => void;
  onDeleteScene: (actId: string, sceneId: string) => void;
  readOnly?: boolean;
}

function StoryboardSceneCard({
  scene,
  actId,
  index,
  displayIndex,
  isCurrent,
  onSelectScene,
  onMoveScene,
  onDeleteScene,
  canDelete,
  readOnly,
  onRenameScene,
}: {
  scene: SceneFilmstripItem;
  actId: string;
  index: number;
  displayIndex: number;
  isCurrent: boolean;
  onSelectScene: (sceneId: string) => void;
  onMoveScene: SceneFilmstripProps["onMoveScene"];
  onDeleteScene: SceneFilmstripProps["onDeleteScene"];
  canDelete: boolean;
  readOnly: boolean;
  onRenameScene: SceneFilmstripProps["onRenameScene"];
}) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);

  const [{ isDragging }, drag] = useDrag({
    type: DND_STORYBOARD_SCENE,
    canDrag: !readOnly,
    item: (): StoryboardSceneDragItem => ({
      type: DND_STORYBOARD_SCENE,
      sceneId: scene.id,
      actId,
      index,
    }),
    collect: (monitor) => ({ isDragging: monitor.isDragging() }),
  });

  const [{ isOver }, drop] = useDrop({
    accept: DND_STORYBOARD_SCENE,
    canDrop: () => !readOnly,
    hover(item: StoryboardSceneDragItem, monitor) {
      if (readOnly) return;
      const node = ref.current;
      const pointer = monitor.getClientOffset();
      if (!node || !pointer || item.sceneId === scene.id) return;

      const bounds = node.getBoundingClientRect();
      const pointerX = pointer.x - bounds.left;
      const midpoint = bounds.width / 2;

      if (item.actId === actId) {
        if (item.index < index && pointerX < midpoint) return;
        if (item.index > index && pointerX > midpoint) return;
      }

      onMoveScene(item.actId, item.index, actId, index);
      item.actId = actId;
      item.index = index;
    },
    collect: (monitor) => ({ isOver: monitor.isOver({ shallow: true }) }),
  });

  drag(drop(ref));

  const nameRef = useRef<HTMLInputElement>(null);
  const [renaming, setRenaming] = useState(false);
  const [draftName, setDraftName] = useState(scene.sceneName);
  const requestRename = () => {
    setDraftName(scene.sceneName);
    setRenaming(true);
  };
  const commitRename = () => {
    const name = draftName.trim();
    if (name && name !== scene.sceneName) onRenameScene(scene.id, name);
    setRenaming(false);
  };
  const requestDelete = () => onDeleteScene(actId, scene.id);

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          ref={ref}
          role="button"
          tabIndex={readOnly ? -1 : 0}
          aria-disabled={readOnly}
          data-testid={`scene-filmstrip-item-${scene.id}`}
          data-vnve-kind="scene"
          data-vnve-id={scene.id}
          aria-pressed={isCurrent}
          onClick={() => {
            if (!readOnly && !renaming) onSelectScene(scene.id);
          }}
          onKeyDown={(event) => {
            if (readOnly) return;
            if (event.target !== event.currentTarget) return;
            if (event.key === "F2") {
              event.preventDefault();
              requestRename();
            }
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              onSelectScene(scene.id);
            }
          }}
          className={`group relative flex w-36 shrink-0 items-center gap-2 rounded-lg border p-1.5 text-left transition-all ${readOnly ? "cursor-default" : "cursor-grab active:cursor-grabbing"} ${
            isCurrent
              ? "border-brand/70 bg-brand/10"
              : "border-white/10 bg-white/[0.025] hover:border-white/20 hover:bg-white/5"
          } ${isDragging ? "opacity-35" : ""} ${isOver ? "translate-x-1 border-l-2 border-l-brand" : ""}`}
        >
          {!readOnly && (
            <GripVertical className="absolute left-0.5 top-1/2 size-3 -translate-y-1/2 text-white/0 transition-colors group-hover:text-white/25" />
          )}
          <div className="relative ml-1 h-12 w-16 shrink-0 overflow-hidden rounded bg-black/40">
            {scene.thumbnailUrl ? (
              <img
                src={scene.thumbnailUrl}
                alt=""
                loading="lazy"
                decoding="async"
                className="h-full w-full object-cover"
                draggable={false}
              />
            ) : (
              <div className="flex h-full items-center justify-center bg-gradient-to-br from-white/10 to-transparent text-xs text-white/30">
                {String(displayIndex + 1).padStart(2, "0")}
              </div>
            )}
          </div>
          <div className="min-w-0 pr-3">
            {renaming && !readOnly ? (
              <input
                ref={nameRef}
                autoFocus
                aria-label="场景名称"
                value={draftName}
                onFocus={(event) => event.currentTarget.select()}
                onChange={(event) => setDraftName(event.target.value)}
                onClick={(event) => event.stopPropagation()}
                onBlur={commitRename}
                onKeyDown={(event) => {
                  event.stopPropagation();
                  if (event.key === "Enter") {
                    event.preventDefault();
                    commitRename();
                  }
                  if (event.key === "Escape") {
                    event.preventDefault();
                    setRenaming(false);
                  }
                }}
                className="w-full rounded border border-brand/50 bg-white/10 px-1 text-xs text-white outline-none"
              />
            ) : (
              <div
                title={scene.sceneName}
                onDoubleClick={(event) => {
                  if (readOnly) return;
                  event.stopPropagation();
                  requestRename();
                }}
                className="truncate text-xs text-white/75"
              >
                {scene.sceneName}
              </div>
            )}
            <div className="mt-1 text-[10px] text-white/25">
              {t("editor.workspace.actorCount", { count: scene.actorCount })}
            </div>
          </div>

          {!readOnly && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  draggable={false}
                  data-testid={`scene-actions-${scene.id}`}
                  aria-label={t("editor.workspace.sceneActions")}
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={(event) => event.stopPropagation()}
                  className="absolute right-1 top-1 flex size-5 items-center justify-center rounded text-white/45 opacity-0 transition-all hover:bg-black/55 hover:text-white focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand group-hover:opacity-100 data-[state=open]:bg-black/55 data-[state=open]:text-white data-[state=open]:opacity-100"
                >
                  <MoreHorizontal className="size-3.5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="min-w-36"
                onCloseAutoFocus={(event) => {
                  if (renaming) {
                    event.preventDefault();
                    nameRef.current?.focus();
                  }
                }}
              >
                <DropdownMenuItem onSelect={requestRename}>
                  <Pencil /> 重命名
                </DropdownMenuItem>
                <DropdownMenuItem
                  data-testid={`scene-delete-menu-${scene.id}-dropdown`}
                  variant="destructive"
                  disabled={!canDelete}
                  onSelect={requestDelete}
                >
                  <Trash2 />
                  {t("common.delete")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </ContextMenuTrigger>
      {!readOnly && (
        <ContextMenuContent
          className="min-w-36"
          onCloseAutoFocus={(event) => {
            if (renaming) {
              event.preventDefault();
              nameRef.current?.focus();
            }
          }}
        >
          <ContextMenuItem onSelect={requestRename}>
            <Pencil /> 重命名
          </ContextMenuItem>
          <ContextMenuItem
            data-testid={`scene-delete-menu-${scene.id}-context`}
            variant="destructive"
            disabled={!canDelete}
            onSelect={requestDelete}
          >
            <Trash2 />
            {t("common.delete")}
          </ContextMenuItem>
        </ContextMenuContent>
      )}
    </ContextMenu>
  );
}

function FinalSceneTarget({
  actId,
  targetIndex,
  onAddScene,
  onMoveScene,
}: {
  actId: string;
  targetIndex: number;
  onAddScene: SceneFilmstripProps["onAddScene"];
  onMoveScene: SceneFilmstripProps["onMoveScene"];
}) {
  const { t } = useTranslation();
  const ref = useRef<HTMLButtonElement>(null);
  const [{ isOver, canDrop }, drop] = useDrop({
    accept: DND_STORYBOARD_SCENE,
    drop(item: StoryboardSceneDragItem) {
      if (item.actId === actId && item.index === targetIndex - 1) return;
      onMoveScene(item.actId, item.index, actId, targetIndex);
      item.actId = actId;
      item.index = targetIndex;
    },
    collect: (monitor) => ({
      isOver: monitor.isOver({ shallow: true }),
      canDrop: monitor.canDrop(),
    }),
  });
  drop(ref);

  return (
    <button
      ref={ref}
      type="button"
      data-testid="storyboard-add-scene"
      onClick={() => onAddScene(actId)}
      className={`ml-2 flex h-[62px] w-36 shrink-0 items-center justify-center gap-2 rounded-lg border border-dashed text-xs transition-colors ${
        isOver && canDrop
          ? "border-brand bg-brand/10 text-brand"
          : "border-white/15 bg-white/[0.015] text-white/35 hover:border-brand/50 hover:bg-brand/5 hover:text-brand"
      }`}
    >
      <Plus className="size-4" />
      {isOver && canDrop
        ? t("editor.workspace.moveSceneHere")
        : t("editor.workspace.addScene")}
    </button>
  );
}

export function SceneFilmstrip({
  acts,
  currentSceneId,
  onSelectScene,
  onRenameScene,
  onAddScene,
  onMoveScene,
  onDeleteScene,
  readOnly = false,
}: SceneFilmstripProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastAct = acts[acts.length - 1];
  const totalSceneCount = acts.reduce(
    (count, act) => count + act.scenes.length,
    0,
  );
  let displayIndex = 0;

  const scrollByWheel = useCallback((event: WheelEvent<HTMLDivElement>) => {
    const node = event.currentTarget;
    if (node.scrollWidth <= node.clientWidth) return;
    const delta =
      Math.abs(event.deltaX) > Math.abs(event.deltaY)
        ? event.deltaX
        : event.deltaY;
    if (delta === 0) return;
    const next = Math.max(
      0,
      Math.min(node.scrollWidth - node.clientWidth, node.scrollLeft + delta),
    );
    if (next === node.scrollLeft) return;
    event.preventDefault();
    node.scrollLeft = next;
  }, []);

  useEffect(() => {
    if (!readOnly) return;
    scrollRef.current
      ?.querySelector<HTMLElement>(
        `[data-testid="scene-filmstrip-item-${currentSceneId}"]`,
      )
      ?.scrollIntoView?.({ block: "nearest", inline: "center" });
  }, [currentSceneId, readOnly]);

  return (
    <section
      data-testid="scene-filmstrip"
      data-readonly={readOnly || undefined}
      className="vnve-ui flex h-full min-w-0 flex-col px-3 py-2"
    >
      <div className="mb-1 flex shrink-0 items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-[10px] font-medium uppercase tracking-[0.16em] text-white/35">
          <Film className="size-3.5" />
          场景
        </div>
      </div>

      <div
        ref={scrollRef}
        data-testid="scene-filmstrip-scroll"
        onWheel={scrollByWheel}
        className="flex min-h-0 min-w-0 flex-1 items-end gap-2 overflow-x-auto overflow-y-hidden overscroll-x-contain [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
      >
        {acts.flatMap((act) =>
          act.scenes.map((scene, index) => (
            <StoryboardSceneCard
              key={scene.id}
              scene={scene}
              actId={act.id}
              index={index}
              displayIndex={displayIndex++}
              isCurrent={scene.id === currentSceneId}
              onSelectScene={onSelectScene}
              onMoveScene={onMoveScene}
              onDeleteScene={onDeleteScene}
              canDelete={totalSceneCount > 1}
              readOnly={readOnly}
              onRenameScene={onRenameScene}
            />
          )),
        )}

        {!readOnly && lastAct && (
          <FinalSceneTarget
            actId={lastAct.id}
            targetIndex={lastAct.scenes.length}
            onAddScene={onAddScene}
            onMoveScene={onMoveScene}
          />
        )}
      </div>
    </section>
  );
}
