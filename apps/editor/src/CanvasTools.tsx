import { CanvasInspector } from "./components/CanvasInspector";
import { createPortal } from "react-dom";
import { ContextToolbar } from "./components/ContextToolbar";
import React, { useEffect, useState, useRef } from "react";
import { type Project, type Scene, type ProjectPatchPlan } from "@vnve/core";
import type { CanvasElement } from "./components/ContextToolbar";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "./components/ui/dialog";
import { Button } from "./components/ui/button";
import { ImportAssetDialog } from "./components/ImportAssetDialog";
import { SceneSettings } from "./components/SceneSettings";
import { actorInfo, mediaUrl } from "./panels/shared";
import { canvasAssetPlan, type CanvasAssetKind } from "./canvas-assets";
import { prepareCanvasImages } from "./media-upload";
import type { ActorTransform, CanvasFrame } from "./CanvasControls";
export interface CanvasToolsProps {
  toolbarTarget?: HTMLElement | null;
  revealInspector: () => void;
  inspectorOpen: boolean;
  closeInspector: () => void;
  project: Project;
  scene: Scene;
  frame?: CanvasFrame;
  selectedActorId?: string;
  selectedElement?: CanvasElement;
  selectActor: (id?: string) => void;
  selectElement: (kind?: CanvasElement) => void;
  lockedElements: Partial<Record<CanvasElement, boolean>>;
  toggleLockedElement: (kind: CanvasElement) => void;
  patch: (operations: ProjectPatchPlan["operations"]) => boolean;
  change: (id: string, t: ActorTransform) => boolean;
  selectTheme: (id: string) => void;
  disabled: boolean;
  onError: (message: string) => void;
}
export function CanvasTools(p: CanvasToolsProps) {
  const {
    project,
    scene,
    frame,
    selectedActorId,
    selectedElement,
    lockedElements,
  } = p;
  const patch = p.patch;
  const currentTarget = useRef("");
  currentTarget.current = project.meta.id + "/" + scene.id;
  useEffect(
    () => () => {
      currentTarget.current = "";
    },
    [],
  );
  const [picker, setPicker] = useState<CanvasAssetKind>();
  const [importing, setImporting] = useState(false),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    setPicker(undefined);
    setImporting(false);
  }, [scene.id]);
  const source = scene.actors.find((a) => a.id === selectedActorId);
  function choose(operations: ProjectPatchPlan["operations"]) {
    if (!patch(operations)) return false;
    if (picker === "background" || picker === "cg") p.selectElement(picker);
    setPicker(undefined);
    return true;
  }
  return (
    <div className="unified-inspector" data-testid="unified-inspector">
      <CanvasInspector
        docked
        title="场景设置"
        canvasInspector="scene"
        close={p.closeInspector}
      >
        {p.toolbarTarget &&
          !p.disabled &&
          !busy &&
          createPortal(
            <ContextToolbar
              selectionOnly
              project={project}
              currentScene={scene}
              frame={frame}
              selectedActorId={selectedActorId}
              selectedElement={selectedElement}
              change={(id, change) => {
                if (!scene.actors.find((a) => a.id === id)?.locked)
                  p.change(id, change);
              }}
              patch={patch}
              lockedElements={lockedElements}
              toggleLockedElement={p.toggleLockedElement}
              canvasInspector={p.inspectorOpen ? "scene" : null}
              toggleCanvasInspector={p.revealInspector}
              isMaximized={false}
              onToggleMaximize={() => {}}
              canUndo={false}
              canRedo={false}
              handleUndo={() => {}}
              handleRedo={() => {}}
              onRequestStageAdd={() => {}}
              onRequestLook={(kind) => {
                if (kind === "actor" ? !source?.locked : !lockedElements[kind])
                  setPicker(kind);
              }}
              onSelectTheme={p.selectTheme}
            />,
            p.toolbarTarget,
          )}
        <fieldset className="inspector-fields" disabled={p.disabled || busy}>
          <SceneSettings project={project} currentScene={scene} patch={patch} />
        </fieldset>
        <Dialog
          open={!!picker && !importing}
          onOpenChange={(open) => {
            if (!open) setPicker(undefined);
          }}
        >
          <DialogContent className="bg-[#151515] text-white sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>
                {picker === "character"
                  ? "添加角色"
                  : picker === "actor"
                    ? "添加人物外观"
                    : picker === "background"
                      ? "选择背景"
                      : "选择 CG"}
              </DialogTitle>
              <DialogDescription>
                使用共享素材，或从本地导入图片。
              </DialogDescription>
            </DialogHeader>
            <div className="grid max-h-[55vh] grid-cols-3 gap-2 overflow-auto">
              {picker &&
                project.assets.visual[
                  picker === "actor"
                    ? source?.assetType === "prop"
                      ? "prop"
                      : "character"
                    : picker
                ].flatMap((group) =>
                  group.variants.map((variant) => (
                    <button
                      key={variant.id}
                      className="rounded-md border border-white/10 p-2 hover:border-brand"
                      onClick={() => {
                        try {
                          choose(
                            canvasAssetPlan(
                              project,
                              scene,
                              picker,
                              group,
                              variant.id,
                              selectedActorId,
                            ),
                          );
                        } catch (e) {
                          p.onError(String(e));
                        }
                      }}
                    >
                      <img
                        className="h-20 w-full object-contain"
                        src={mediaUrl(variant.thumbnailUrl ?? variant.url)}
                        alt=""
                      />
                      <span className="mt-1 block truncate text-xs">
                        {group.name} · {variant.name}
                      </span>
                    </button>
                  )),
                )}
            </div>
            <DialogFooter>
              <Button variant="ghost-dark" onClick={() => setImporting(true)}>
                从本地导入
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <ImportAssetDialog
          open={importing}
          assetType={
            picker === "actor"
              ? source?.assetType === "prop"
                ? "prop"
                : "character"
              : picker === "background"
                ? "background"
                : picker === "cg"
                  ? "cg"
                  : "character"
          }
          lookForName={
            picker === "actor" && source
              ? actorInfo(project, source).name
              : undefined
          }
          onCancel={() => setImporting(false)}
          onImport={(name, files) => {
            void (async () => {
              setBusy(true);
              let prepared:
                | Awaited<ReturnType<typeof prepareCanvasImages>>
                | undefined;
              try {
                const expectedTarget = project.meta.id + "/" + scene.id;
                prepared = await prepareCanvasImages(files, name);
                if (currentTarget.current !== expectedTarget)
                  throw new Error("目标作品或场景已改变，请重新导入");
                if (
                  !picker ||
                  !choose(
                    canvasAssetPlan(
                      project,
                      scene,
                      picker,
                      prepared.group,
                      prepared.group.defaultVariantId!,
                      selectedActorId,
                      true,
                    ),
                  )
                )
                  await prepared.rollback();
                else setImporting(false);
              } catch (e) {
                await prepared?.rollback();
                p.onError(String(e));
              } finally {
                setBusy(false);
              }
            })();
          }}
        />
      </CanvasInspector>
    </div>
  );
}
