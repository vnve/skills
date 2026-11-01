import type { ExportFile } from "./export-file";
import { validateExportFileName } from "./export-file";
import { mediaRevision, putLocalMedia } from "./local-workspace";

/** Stage random-access muxer writes in OPFS; only upload the completed file on commit. */
export async function openLocalExportFile(
  name: string,
  confirmOverwrite: () => boolean,
): Promise<ExportFile> {
  validateExportFileName(name);
  const relative = `exports/${name}`;
  const expected = await mediaRevision(relative);
  if (expected && !confirmOverwrite())
    throw new DOMException("Overwrite cancelled", "AbortError");
  const root = await navigator.storage.getDirectory();
  const temporaryName = `vnve-export-${crypto.randomUUID()}.tmp`;
  const file = await root.getFileHandle(temporaryName, { create: true });
  let writable: FileSystemWritableFileStream;
  try {
    writable = await file.createWritable();
  } catch (error) {
    await root.removeEntry(temporaryName);
    throw error;
  }
  let writeFailed = false;
  let closed = false;
  let finished = false;
  let rolledBack = false;
  async function cleanup() {
    await root.removeEntry(temporaryName);
  }
  return {
    get writeFailed() {
      return writeFailed;
    },
    stream: new WritableStream({
      async write(chunk) {
        try {
          await writable.write(chunk);
        } catch (error) {
          writeFailed = true;
          throw error;
        }
      },
    }),
    async commit() {
      if (rolledBack) throw new Error("Export was cancelled");
      await writable.close();
      closed = true;
      try {
        await putLocalMedia(relative, await file.getFile(), expected);
        finished = true;
      } catch (error) {
        writeFailed = true;
        throw error;
      }
      await cleanup();
    },
    async rollback() {
      if (finished || rolledBack) return;
      if (!closed) await writable.abort();
      await cleanup();
      rolledBack = true;
    },
  };
}
