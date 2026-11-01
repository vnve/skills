// vnve PlaybackBar presentation; clock and audio remain shared with export.
import React from "react";
export function PlaybackBar({ children }: { children: React.ReactNode }) {
  return (
    <div className="transport vnve-ui flex shrink-0 items-center gap-1 bg-black/70 backdrop-blur-md border border-white/10 px-2 py-1 rounded-lg shadow-2xl">
      {children}
    </div>
  );
}
