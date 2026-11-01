// Contextual canvas actions dispatch explicit Session commands.
import React, { useEffect, useState } from "react";
import {
  Maximize2,
  Minimize2,
  FlipHorizontal2,
  Layers,
  ArrowUp,
  ArrowDown,
  ChevronsUp,
  ChevronsDown,
  Lock,
  Unlock,
  MapPin,
  Clapperboard,
  UserPlus,
  Undo2,
  Redo2,
} from "lucide-react";
import {
  resolveDialogueProps,
  type Project,
  type Scene,
  type ProjectPatchPlan,
} from "@vnve/core";
import { useTranslation } from "react-i18next";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "./ui/dropdown-menu";
import { CanvasLookMenu } from "./CanvasLookMenu";
import { DialogueThemePicker } from "./DialogueThemePicker";
import {
  getSlotPositions,
  moveActorToTop,
  moveActorToBottom,
  moveActorUp,
  moveActorDown,
  type SlotName,
} from "../core/stage-utils";
import type { ActorTransform, CanvasFrame } from "../CanvasControls";
import { actorInfo, mediaUrl } from "../panels/shared";
export type CanvasElement = "background" | "cg" | "dialogue";
export interface ContextToolbarProps {
  selectionOnly?: boolean;
  project: Project;
  currentScene: Scene;
  frame?: CanvasFrame;
  selectedActorId?: string;
  selectedElement?: CanvasElement;
  change: (id: string, transform: ActorTransform) => void;
  patch: (operations: ProjectPatchPlan["operations"]) => boolean;
  lockedElements: Partial<Record<CanvasElement, boolean>>;
  toggleLockedElement: (element: CanvasElement) => void;
  canvasInspector: "scene" | "selection" | null;
  toggleCanvasInspector: (mode: "scene" | "selection") => void;
  isMaximized: boolean;
  onToggleMaximize: () => void;
  canUndo: boolean;
  canRedo: boolean;
  handleUndo: () => void;
  handleRedo: () => void;
  onRequestStageAdd: (kind: "character" | "background") => void;
  onRequestLook: (kind: "actor" | "background" | "cg") => void;
  onSelectTheme: (themeId: string) => void;
}
export function ContextToolbar({
  selectionOnly = false,
  project,
  currentScene,
  frame,
  selectedActorId,
  selectedElement,
  change,
  patch,
  lockedElements,
  toggleLockedElement,
  canvasInspector,
  toggleCanvasInspector,
  isMaximized,
  onToggleMaximize,
  canUndo,
  canRedo,
  handleUndo,
  handleRedo,
  onRequestStageAdd,
  onRequestLook,
  onSelectTheme,
}: ContextToolbarProps) {
  const { t } = useTranslation();
  const [showLookDropdown, setShowLookDropdown] = useState(false);
  useEffect(
    () => setShowLookDropdown(false),
    [selectedActorId, selectedElement],
  );
  const sourceActor = currentScene.actors.find((a) => a.id === selectedActorId);
  const rendered = frame?.actors.find((a) => a.id === selectedActorId);
  const selectedActor = sourceActor
    ? {
        ...sourceActor,
        variantId:
          actorInfo(project, sourceActor).group?.variants.find(
            (v) =>
              v.id === rendered?.sprite || mediaUrl(v.url) === rendered?.sprite,
          )?.id ?? sourceActor.variantId,
        flipX: rendered?.flipX ?? sourceActor.flipX,
        visible: rendered?.visible ?? sourceActor.visible,
      }
    : undefined;
  const selectedActorVariants = sourceActor
    ? (actorInfo(project, sourceActor).group?.variants ?? [])
    : [];
  const selectedActorLook = selectedActorVariants.find(
    (v) => v.id === selectedActor?.variantId,
  );
  const findGroup = (kind: "background" | "cg") =>
    project.assets.visual[kind].find(
      (g) =>
        g.id ===
          (kind === "background"
            ? currentScene.backgroundId
            : currentScene.cgId) ||
        g.variants.some(
          (v) =>
            v.id ===
            (kind === "background"
              ? currentScene.backgroundId
              : currentScene.cgId),
        ),
    );
  const selectedBackgroundGroup = findGroup("background"),
    selectedCgGroup = findGroup("cg");
  const selectedBackgroundLook = selectedBackgroundGroup?.variants.find(
      (v) => v.id === currentScene.backgroundId,
    ),
    selectedCgLook = selectedCgGroup?.variants.find(
      (v) => v.id === currentScene.cgId,
    );
  const resolvedUrlMap = new Map(
    project.assets.themes.flatMap((theme) =>
      theme.data.boxImageAssetId && theme.data.boxImageUrl
        ? [[theme.data.boxImageAssetId, mediaUrl(theme.data.boxImageUrl)]]
        : [],
    ),
  );
  const editDialogueThemeId = resolveDialogueProps(
    currentScene,
    project.meta,
  ).dialogueThemeId;
  const activeLookKind = sourceActor
    ? "actor"
    : selectedElement === "background" || selectedElement === "cg"
      ? selectedElement
      : null;
  const handleSwitchVariant = (id: string, variantId: string) =>
    !selectedActor?.locked && change(id, { variantId });
  const handleSnapToSlot = (id: string, slot: SlotName) =>
    change(id, getSlotPositions(project.meta.width, project.meta.height)[slot]);
  const handleFlipActor = (id: string) =>
    change(id, { flipX: !selectedActor?.flipX });
  const handleToggleActorLock = (id: string) =>
    patch([
      {
        type: "actor.lock",
        sceneId: currentScene.id,
        actorId: id,
        locked: !selectedActor?.locked,
      },
    ]);
  const reorder = (fn: typeof moveActorUp, id: string) => {
    const next = fn(currentScene.actors, id);
    patch(
      next
        .filter(
          (a) =>
            a.zIndex !==
            currentScene.actors.find((old) => old.id === a.id)?.zIndex,
        )
        .map((a) => ({
          type: "actor.update",
          sceneId: currentScene.id,
          actorId: a.id,
          zIndex: a.zIndex,
        })),
    );
  };
  const handleMoveActorToTop = (id: string) => reorder(moveActorToTop, id),
    handleMoveActorToBottom = (id: string) => reorder(moveActorToBottom, id),
    handleMoveActorUp = (id: string) => reorder(moveActorUp, id),
    handleMoveActorDown = (id: string) => reorder(moveActorDown, id);
  const handleSwitchBackgroundVariant = (variantId: string) =>
    !lockedElements.background &&
    patch([
      {
        type: "scene.update",
        sceneId: currentScene.id,
        backgroundId: variantId,
      },
    ]);
  const handleSwitchCgVariant = (variantId: string) =>
    !lockedElements.cg &&
    patch([
      { type: "scene.update", sceneId: currentScene.id, cgId: variantId },
    ]);
  const chromeButtonClass =
    "flex h-8 items-center justify-center rounded-md px-2 text-white/60 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/70 disabled:pointer-events-none disabled:opacity-30";
  const selectionButtonClass =
    "object-action flex h-8 items-center gap-1.5 rounded-md px-2 text-xs text-white/65 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/70";

  return (
    <>
      {!selectionOnly && (
        <div
          data-testid="canvas-chrome"
          className="pointer-events-none absolute left-3 right-3 top-2 z-40 flex items-start justify-end"
        >
          <div className="pointer-events-auto flex h-9 items-center gap-0.5 rounded-xl border border-white/10 bg-black/60 p-0.5 shadow-2xl backdrop-blur-md">
            <button
              type="button"
              data-testid="canvas-toolbar-add-character"
              onClick={() => onRequestStageAdd?.("character")}
              className={chromeButtonClass}
              title={t("editor.canvas.addCharacter")}
              aria-label={t("editor.canvas.addCharacter")}
            >
              <UserPlus className="size-4" />
            </button>
            <button
              type="button"
              data-testid="canvas-toolbar-scene-inspector"
              onClick={() => toggleCanvasInspector("scene")}
              className={`${chromeButtonClass} ${
                canvasInspector === "scene" ? "bg-brand-muted text-brand" : ""
              }`}
              title={t("editor.canvas.sceneInspector")}
              aria-label={t("editor.canvas.sceneInspector")}
              aria-pressed={canvasInspector === "scene"}
            >
              <Clapperboard className="size-4" />
            </button>
            {isMaximized && (
              <>
                <div className="mx-1 h-4 w-px bg-white/10" />
                <button
                  type="button"
                  data-testid="canvas-toolbar-undo"
                  onClick={handleUndo}
                  disabled={!canUndo}
                  className={chromeButtonClass}
                  title={t("editor.header.undo")}
                  aria-label={t("editor.header.undo")}
                >
                  <Undo2 className="size-4" />
                </button>
                <button
                  type="button"
                  data-testid="canvas-toolbar-redo"
                  onClick={handleRedo}
                  disabled={!canRedo}
                  className={chromeButtonClass}
                  title={t("editor.header.redo")}
                  aria-label={t("editor.header.redo")}
                >
                  <Redo2 className="size-4" />
                </button>
                <div className="mx-1 h-4 w-px bg-white/10" />
              </>
            )}
            <button
              type="button"
              data-testid="canvas-toolbar-maximize"
              onClick={onToggleMaximize}
              className={chromeButtonClass}
              title={
                isMaximized
                  ? t("editor.canvas.restorePanels")
                  : t("editor.canvas.maximizeCanvas")
              }
              aria-label={
                isMaximized
                  ? t("editor.canvas.restorePanels")
                  : t("editor.canvas.maximizeCanvas")
              }
            >
              {isMaximized ? (
                <Minimize2 className="size-4" />
              ) : (
                <Maximize2 className="size-4" />
              )}
            </button>
          </div>
        </div>
      )}

      {(selectedActor || selectedElement) && (
        <div
          role="toolbar"
          aria-label="对象操作"
          data-testid="canvas-selection-hud"
          className="absolute left-1/2 top-2 z-40 flex max-w-[calc(100%-1.5rem)] -translate-x-1/2 items-center gap-0.5 rounded-xl border border-white/10 bg-black/65 p-0.5 shadow-2xl backdrop-blur-md"
        >
          {selectedActor && selectedActorId && (
            <>
              <CanvasLookMenu
                disabled={
                  !!(sourceActor
                    ? sourceActor.locked
                    : activeLookKind && activeLookKind !== "actor"
                      ? lockedElements[activeLookKind]
                      : false)
                }
                open={showLookDropdown}
                onOpenChange={setShowLookDropdown}
                variants={selectedActorVariants}
                currentId={selectedActor.variantId}
                currentLabel={selectedActorLook?.name || selectedActorLook?.id}
                onSelect={(variantId) => {
                  handleSwitchVariant(selectedActorId, variantId);
                  setShowLookDropdown(false);
                }}
                onAdd={() => onRequestLook(activeLookKind ?? "actor")}
                switchTitle={t("editor.canvas.switchVariant")}
                addLabel={t("editor.canvas.addVariant")}
                emptyLabel={t("editor.properties.noVariants")}
                pendingLabel={t("editor.canvas.completeLook")}
              />
              <div className="mx-0.5 h-4 w-px bg-white/10" />
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    data-testid="canvas-toolbar-position"
                    disabled={Boolean(selectedActor.locked)}
                    className={selectionButtonClass}
                    title={t("editor.canvas.snapToSlot")}
                    aria-label={t("editor.canvas.snapToSlot")}
                  >
                    <MapPin className="size-4" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="center" className="w-36">
                  {(
                    [
                      "center",
                      "left",
                      "right",
                      "support-left",
                      "support-right",
                    ] as SlotName[]
                  ).map((slot) => (
                    <DropdownMenuItem
                      key={slot}
                      data-testid={`canvas-toolbar-position-${slot}`}
                      onSelect={() => handleSnapToSlot(selectedActorId, slot)}
                      className="text-xs"
                    >
                      <MapPin className="size-3.5" />
                      {slot === "support-left"
                        ? t("editor.canvas.farLeft")
                        : slot === "support-right"
                          ? t("editor.canvas.farRight")
                          : t(`editor.canvas.${slot}`)}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              <button
                type="button"
                data-testid="canvas-toolbar-flip"
                disabled={Boolean(selectedActor.locked)}
                onClick={() => handleFlipActor(selectedActorId)}
                className={`${selectionButtonClass} ${selectedActor.flipX ? "bg-brand-muted text-brand" : ""}`}
                title={t("editor.canvas.flipHorizontal")}
                aria-label={t("editor.canvas.flipHorizontal")}
                aria-pressed={Boolean(selectedActor.flipX)}
              >
                <FlipHorizontal2 className="size-4" />
              </button>
              {currentScene.actors.length > 1 && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      data-testid="canvas-toolbar-layer"
                      disabled={Boolean(selectedActor.locked)}
                      className={selectionButtonClass}
                      title={t("editor.canvas.layerOrder")}
                      aria-label={t("editor.canvas.layerOrder")}
                    >
                      <Layers className="size-4" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="center" className="w-40">
                    <DropdownMenuItem
                      data-testid="canvas-toolbar-layer-front"
                      onSelect={() => handleMoveActorToTop(selectedActorId)}
                      className="text-xs"
                    >
                      <ChevronsUp />
                      {t("editor.canvas.bringToFront")}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      data-testid="canvas-toolbar-layer-forward"
                      onSelect={() => handleMoveActorUp(selectedActorId)}
                      className="text-xs"
                    >
                      <ArrowUp />
                      {t("editor.canvas.moveForward")}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      data-testid="canvas-toolbar-layer-backward"
                      onSelect={() => handleMoveActorDown(selectedActorId)}
                      className="text-xs"
                    >
                      <ArrowDown />
                      {t("editor.canvas.moveBackward")}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      data-testid="canvas-toolbar-layer-back"
                      onSelect={() => handleMoveActorToBottom(selectedActorId)}
                      className="text-xs"
                    >
                      <ChevronsDown />
                      {t("editor.canvas.sendToBack")}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
              <div className="mx-0.5 h-4 w-px bg-white/10" />
              <button
                type="button"
                data-testid="canvas-toolbar-lock"
                className={selectionButtonClass}
                title={selectedActor.locked ? "解锁角色" : "锁定角色"}
                aria-label={selectedActor.locked ? "解锁角色" : "锁定角色"}
                aria-pressed={Boolean(selectedActor.locked)}
                onClick={() => handleToggleActorLock(selectedActorId)}
              >
                {selectedActor.locked ? (
                  <Lock className="size-4" />
                ) : (
                  <Unlock className="size-4" />
                )}
              </button>
            </>
          )}

          {!selectedActor && selectedElement === "background" && (
            <>
              <CanvasLookMenu
                disabled={
                  !!(sourceActor
                    ? sourceActor.locked
                    : activeLookKind && activeLookKind !== "actor"
                      ? lockedElements[activeLookKind]
                      : false)
                }
                open={showLookDropdown}
                onOpenChange={setShowLookDropdown}
                variants={selectedBackgroundGroup?.variants ?? []}
                currentId={currentScene.backgroundId}
                currentLabel={
                  selectedBackgroundLook?.name || selectedBackgroundLook?.id
                }
                onSelect={(variantId) => {
                  handleSwitchBackgroundVariant(variantId);
                  setShowLookDropdown(false);
                }}
                onAdd={() => onRequestLook(activeLookKind ?? "actor")}
                switchTitle={t("editor.canvas.switchBackground")}
                addLabel={t("editor.canvas.addBackground")}
                emptyLabel={t("editor.properties.noVariants")}
                testId="canvas-toolbar-background-variant"
                addTestId="canvas-toolbar-add-background"
                pendingLabel={t("editor.canvas.completeBackground")}
              />
            </>
          )}

          {!selectedActor && selectedElement === "cg" && (
            <>
              <CanvasLookMenu
                disabled={
                  !!(sourceActor
                    ? sourceActor.locked
                    : activeLookKind && activeLookKind !== "actor"
                      ? lockedElements[activeLookKind]
                      : false)
                }
                open={showLookDropdown}
                onOpenChange={setShowLookDropdown}
                variants={selectedCgGroup?.variants ?? []}
                currentId={currentScene.cgId}
                currentLabel={selectedCgLook?.name || selectedCgLook?.id}
                onSelect={(variantId) => {
                  handleSwitchCgVariant(variantId);
                  setShowLookDropdown(false);
                }}
                onAdd={() => onRequestLook(activeLookKind ?? "actor")}
                switchTitle={t("editor.canvas.switchCg")}
                addLabel={t("editor.canvas.addCg")}
                emptyLabel={t("editor.properties.noVariants")}
                testId="canvas-toolbar-cg-variant"
                addTestId="canvas-toolbar-add-cg"
                pendingLabel={t("editor.canvas.completeCg")}
              />
            </>
          )}

          {!selectedActor &&
            (selectedElement === "background" || selectedElement === "cg") &&
            lockedElements[selectedElement] && (
              <button
                type="button"
                className={selectionButtonClass}
                title="解锁图片"
                aria-label="解锁图片"
                onClick={() => toggleLockedElement(selectedElement)}
              >
                <Lock className="size-4 text-orange-400" />
              </button>
            )}

          {!selectedActor && selectedElement === "dialogue" && (
            <>
              <DialogueThemePicker
                disabled={!!lockedElements.dialogue}
                currentThemeId={editDialogueThemeId}
                customThemes={project.assets.themes}
                resolvedBoxImageUrls={resolvedUrlMap}
                onSelectTheme={onSelectTheme}
              />
              <button
                type="button"
                data-testid="canvas-toolbar-lock-dialogue"
                onClick={() => toggleLockedElement("dialogue")}
                className={`flex h-8 items-center justify-center rounded-md px-2 transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/70 ${
                  lockedElements.dialogue
                    ? "text-orange-400 hover:text-orange-300"
                    : "text-white/65 hover:text-white"
                }`}
                title={
                  lockedElements.dialogue
                    ? t("editor.canvas.unlockDialogue")
                    : t("editor.canvas.lockDialogue")
                }
                aria-label={
                  lockedElements.dialogue
                    ? t("editor.canvas.unlockDialogue")
                    : t("editor.canvas.lockDialogue")
                }
                aria-pressed={Boolean(lockedElements.dialogue)}
              >
                {lockedElements.dialogue ? (
                  <Lock className="size-4 text-orange-400" />
                ) : (
                  <Unlock className="size-4" />
                )}
              </button>
            </>
          )}
        </div>
      )}
    </>
  );
}
