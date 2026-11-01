// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from "vitest";
import { saveExportCopy } from "./save-copy";
afterEach(() => {
  vi.unstubAllGlobals();
  delete (window as any).showSaveFilePicker;
});
it("opens Save As before network IO and streams a copy of the existing export", async () => {
  const order: string[] = [],
    chunks: Uint8Array[] = [];
  (window as any).showSaveFilePicker = vi.fn(async (options) => {
    order.push("picker");
    expect(options.suggestedName).toBe("clip.mp4");
    return {
      createWritable: async () =>
        new WritableStream({
          write: (chunk) => {
            chunks.push(chunk);
          },
        }),
    };
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      order.push("fetch");
      return new Response(new Uint8Array([1, 2, 3]));
    }),
  );
  expect(await saveExportCopy("clip.mp4")).toBe("saved");
  expect(order).toEqual(["picker", "fetch"]);
  expect([...chunks[0]]).toEqual([1, 2, 3]);
});
it("canceling Save As never reads or rewrites the existing export", async () => {
  (window as any).showSaveFilePicker = vi.fn(async () => {
    throw new DOMException("cancelled", "AbortError");
  });
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  expect(await saveExportCopy("clip.mp4")).toBe("cancelled");
  expect(fetch).not.toHaveBeenCalled();
});
