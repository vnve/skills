// Presentation from vnve EditorHeader; vnve provides local workspace actions.
import React from "react";
export function EditorHeader({ children }: { children: React.ReactNode }) {
  return (
    <header className="vnve-ui h-14 border-b border-white/10 flex items-center justify-between gap-4 px-4 shrink-0 overflow-x-auto whitespace-nowrap bg-surface">
      <div className="flex shrink-0 items-center gap-2">
        <img
          src="/brand/vnve-wordmark.png"
          alt="VNVE"
          width={84}
          height={20}
          className="h-5 w-[84px] object-contain"
        />
      </div>
      {children}
    </header>
  );
}
