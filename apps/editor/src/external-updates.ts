import { useEffect, useRef, type MutableRefObject } from "react";
import { stripTimelineFromProject } from "@vnve/core";
import { workspaceRequest } from "./core/local-workspace";
import { type Loaded, type Session } from "./session";
import { flushEdits } from "./script-editor/EditBuffers";

export const AUTO_SAVE_DELAY_MS = 2000;
export const MAX_UNSAVED_MS = 10000;
export const SYNC_INTERVAL_MS = 1000;

/** Disk changes win; checkpoint unsaved edits before replacing the page. */
export function useExternalUpdates({
  current,
  buffers,
  disabled,
  lastEditAt,
  onLoaded,
  onSaved,
  onBusy,
  onError,
}: {
  current: MutableRefObject<Session | undefined>;
  buffers: MutableRefObject<Map<string, () => boolean>>;
  disabled: boolean;
  lastEditAt: MutableRefObject<number>;
  onLoaded: (session: Session, loaded: Loaded, recoveryPath?: string) => void;
  onSaved: () => void;
  onBusy: (value: boolean) => void;
  onError: (message: string) => void;
}) {
  const handlers = useRef({ onLoaded, onSaved, onBusy, onError });
  handlers.current = { onLoaded, onSaved, onBusy, onError };
  const reported = useRef("");
  useEffect(() => {
    if (disabled) return;
    let disposed = false,
      busy = false,
      composing = false;
    let unsavedSince: number | undefined;
    const composingStart = () => {
      composing = true;
    };
    const composingEnd = () => {
      composing = false;
    };
    function report(message: string) {
      if (!disposed && reported.current !== message) {
        reported.current = message;
        handlers.current.onError(message);
      }
    }
    async function refresh() {
      const session = current.current;
      if (!session || busy || composing) return;
      busy = true;
      try {
        const loaded = await workspaceRequest<Loaded>({
          op: "load",
          projectId: session.id,
        });
        if (disposed || current.current !== session || composing) return;
        const external =
          loaded.projectRevision !== session.revision.projectRevision ||
          loaded.assetsRevision !== session.revision.assetsRevision;
        if (external) {
          const active = document.activeElement;
          if (
            active instanceof HTMLInputElement ||
            active instanceof HTMLTextAreaElement
          )
            active.blur();
          if (!flushEdits(buffers.current)) {
            report("参数尚未有效，暂未载入外部更新；请完成当前编辑。");
            return;
          }
          let recoveryPath: string | undefined;
          if (session.dirty) {
            const snapshot = session.project;
            const { assets, ...project } = stripTimelineFromProject(snapshot);
            handlers.current.onBusy(true);
            const recovery = await workspaceRequest<{ path: string }>({
              op: "checkpoint",
              projectId: session.id,
              project,
              assets,
              expected: session.revision,
            });
            if (
              disposed ||
              current.current !== session ||
              session.project !== snapshot ||
              buffers.current.size ||
              composing
            )
              return;
            recoveryPath = recovery.path;
          }
          reported.current = "";
          unsavedSince = undefined;
          handlers.current.onLoaded(session, loaded, recoveryPath);
          return;
        }
        if (!session.dirty && !buffers.current.size) {
          unsavedSince = undefined;
          return;
        }
        unsavedSince ??= Date.now();
        if (
          Date.now() - lastEditAt.current < AUTO_SAVE_DELAY_MS &&
          Date.now() - unsavedSince < MAX_UNSAVED_MS
        )
          return;
        // Numeric/text field drafts commit on blur; do not interrupt a focused field.
        if (
          document.activeElement instanceof HTMLInputElement ||
          document.activeElement instanceof HTMLTextAreaElement
        )
          return;
        if (!flushEdits(buffers.current) || !session.dirty) return;
        handlers.current.onBusy(true);
        await session.save();
        if (disposed || current.current !== session) return;
        unsavedSince = undefined;
        reported.current = "";
        handlers.current.onSaved();
      } catch (error) {
        // A save race is resolved by loading and checkpointing on the next tick.
        if ((error as { code?: string }).code !== "CONFLICT")
          report(`自动同步失败，页面修改已保留：${String(error)}`);
      } finally {
        busy = false;
        handlers.current.onBusy(false);
      }
    }
    const timer = window.setInterval(() => void refresh(), SYNC_INTERVAL_MS);
    window.addEventListener("focus", refresh);
    document.addEventListener("compositionstart", composingStart, true);
    document.addEventListener("compositionend", composingEnd, true);
    return () => {
      disposed = true;
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("compositionstart", composingStart, true);
      document.removeEventListener("compositionend", composingEnd, true);
    };
  }, [disabled, current, buffers, lastEditAt]);
}
