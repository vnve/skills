import React, { useEffect, useState } from "react";
/** Keep fast edits quiet and preserve the canvas geometry while a worker runs. */
export function CompilationStatus({ pending }: { pending: boolean }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    setVisible(false);
    if (!pending) return;
    const timer = setTimeout(() => setVisible(true), 200);
    return () => clearTimeout(timer);
  }, [pending]);
  return pending && visible ? (
    <div
      role="status"
      className="pointer-events-none absolute left-3 top-3 z-30 rounded bg-black/80 px-3 py-2 text-xs text-white/70"
    >
      正在更新预览…
    </div>
  ) : null;
}
