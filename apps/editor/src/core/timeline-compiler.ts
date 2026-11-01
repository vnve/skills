import type {
  compilePlaybackScope,
  CompiledPlaybackScope,
} from "@vnve/renderer/playback";
/** Only trusted code and validated data enter the compiler worker. Never authoring source. */
export async function compilePlaybackInWorker(
  input: Parameters<typeof compilePlaybackScope>[0],
  signal?: AbortSignal,
): Promise<CompiledPlaybackScope> {
  if (typeof Worker === "undefined")
    return (await import("@vnve/renderer/playback")).compilePlaybackScope(
      input,
    );
  return new Promise((resolve, reject) => {
    const worker = new Worker(
      new URL("./timeline-worker.ts", import.meta.url),
      { type: "module" },
    );
    const finish = (error?: Error, value?: CompiledPlaybackScope) => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      worker.terminate();
      error ? reject(error) : resolve(value!);
    };
    const abort = () => finish(new Error("Compilation cancelled"));
    const timer = setTimeout(
      () => finish(new Error("Timeline compilation timed out")),
      5000,
    );
    if (signal?.aborted) {
      abort();
      return;
    }
    signal?.addEventListener("abort", abort, { once: true });
    worker.onerror = (e) => finish(new Error(e.message));
    worker.onmessage = (e) =>
      e.data.ok
        ? finish(undefined, e.data.value)
        : finish(new Error(e.data.error));
    worker.postMessage(input);
  });
}
