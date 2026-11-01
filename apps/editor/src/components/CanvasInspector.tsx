import React from "react";
import { useTranslation } from "react-i18next";
import { X } from "lucide-react";
export function CanvasInspector({
  title,
  canvasInspector,
  children,
  close,
  docked = false,
}: {
  title: string;
  canvasInspector: "scene" | "selection";
  children: React.ReactNode;
  close: () => void;
  docked?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <section
      data-testid="canvas-inspector"
      data-mode={canvasInspector}
      className={
        docked
          ? "vnve-ui flex h-full min-h-0 w-full flex-col overflow-hidden bg-[#141414]/95"
          : "absolute top-14 right-3 z-30 flex w-[min(300px,calc(100%-1.5rem))] max-h-[min(28rem,calc(100%-4.5rem))] flex-col overflow-hidden rounded-xl border border-white/10 bg-[#141414]/95 shadow-2xl backdrop-blur-md"
      }
    >
      <header className="flex h-9 shrink-0 items-center gap-2 border-b border-white/10 px-3">
        <div className="min-w-0 flex-1 truncate text-xs font-semibold text-white/90">
          {title}
        </div>
        <button
          type="button"
          data-testid="canvas-inspector-close"
          onClick={() => close()}
          className="rounded-md p-1 text-white/35 transition-colors hover:bg-white/10 hover:text-white/75"
          aria-label={t("common.close")}
          title={t("common.close")}
        >
          <X className="size-3.5" />
        </button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
    </section>
  );
}
