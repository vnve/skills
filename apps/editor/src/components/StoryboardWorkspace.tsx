// Main-column layout extracted from vnve UnifiedWorkspace; the local inspector stays on demand.
import type { ReactNode } from "react";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
export function StoryboardWorkspace({
  canvas,
  filmstrip,
  script,
  isMaximized,
}: {
  canvas: ReactNode;
  filmstrip?: ReactNode;
  script?: ReactNode;
  isMaximized: boolean;
}) {
  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-[#090909]">
      {isMaximized || !script ? (
        <div
          data-testid="workspace-canvas"
          className="relative flex min-h-0 flex-1 flex-col overflow-hidden"
        >
          {canvas}
        </div>
      ) : (
        <PanelGroup
          direction="vertical"
          autoSaveId="editor-unified-vertical-v2"
          className="min-h-0 flex-1"
        >
          <Panel
            data-testid="workspace-canvas"
            defaultSize={72}
            minSize={30}
            className="relative flex min-h-0 flex-col overflow-hidden"
          >
            {canvas}
          </Panel>
          <PanelResizeHandle
            aria-label="调整画布与台词区高度"
            className="h-1.5 shrink-0 bg-transparent transition-colors hover:bg-blue-500/30"
          />
          <Panel
            defaultSize={28}
            minSize={20}
            className="flex min-h-0 min-w-0 flex-col overflow-hidden bg-[#0d0d0d]"
          >
            <div className="min-w-0 shrink-0">{filmstrip}</div>
            <div
              data-testid="workspace-script"
              className="flex min-h-0 flex-1 flex-col border-t border-white/10"
            >
              {script}
            </div>
          </Panel>
        </PanelGroup>
      )}
    </section>
  );
}
