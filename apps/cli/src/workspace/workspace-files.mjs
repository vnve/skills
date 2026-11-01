import { createReadStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import { createWriteStream } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import {
  lstat,
  mkdir,
  readFile,
  realpath,
  rename,
  unlink,
  writeFile,
} from "node:fs/promises";
import path from "node:path";

export class WorkspaceFileError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}
const revision = (bytes) => createHash("sha256").update(bytes).digest("hex");

/** File transport only: project semantics belong to the production module. */
export async function openWorkspaceFiles(directory) {
  const root = await realpath(directory);
  if (!(await lstat(root)).isDirectory())
    throw new WorkspaceFileError(
      "INVALID_ROOT",
      "Workspace must be a directory",
    );
  let queue = Promise.resolve();

  async function resolve(relative, createParents = false) {
    if (
      typeof relative !== "string" ||
      relative.includes("\\") ||
      relative.includes("\0") ||
      path.isAbsolute(relative)
    ) {
      throw new WorkspaceFileError(
        "INVALID_PATH",
        "Expected a workspace-relative path",
      );
    }
    const parts = relative.split("/");
    if (parts.some((part) => !part || part === "." || part === ".."))
      throw new WorkspaceFileError("INVALID_PATH", "Invalid path segment");
    const allowed =
      (parts[0] === ".vnve" &&
        parts.length === 2 &&
        ["workspace.json", "assets.json", ".transaction.json"].includes(
          parts[1],
        )) ||
      (parts[0] === ".vnve" &&
        parts.length === 3 &&
        parts[1] === "recovery" &&
        parts[2].endsWith(".json")) ||
      (parts[0] === "projects" &&
        parts.length === 3 &&
        parts[2] === "project.json") ||
      (parts[0] === "assets" && parts.length >= 3) ||
      (parts[0] === "exports" && parts.length === 2);
    if (!allowed)
      throw new WorkspaceFileError(
        "INVALID_PATH",
        "Unsupported workspace file",
      );
    let current = root;
    for (let i = 0; i < parts.length; i++) {
      current = path.join(current, parts[i]);
      let stat;
      try {
        stat = await lstat(current);
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
        if (i < parts.length - 1 && createParents) {
          await mkdir(current);
          stat = await lstat(current);
        } else if (i < parts.length - 1) throw error;
      }
      if (stat?.isSymbolicLink())
        throw new WorkspaceFileError(
          "INVALID_PATH",
          "Symbolic links are not supported",
        );
      if (i < parts.length - 1 && stat && !stat.isDirectory())
        throw new WorkspaceFileError(
          "INVALID_PATH",
          "Parent must be a directory",
        );
    }
    return current;
  }

  async function read(relative) {
    try {
      const bytes = await readFile(await resolve(relative));
      return { bytes, revision: revision(bytes) };
    } catch (error) {
      if (error.code === "ENOENT") return null;
      throw error;
    }
  }

  function write(relative, bytes, expectedRevision) {
    const operation = queue.then(async () => {
      if (expectedRevision !== null && typeof expectedRevision !== "string")
        throw new WorkspaceFileError(
          "REVISION_REQUIRED",
          "Supply the revision read earlier, or null to create",
        );
      const target = await resolve(relative, true);
      const current = await read(relative);
      if ((current?.revision ?? null) !== expectedRevision)
        throw new WorkspaceFileError(
          "CONFLICT",
          "File changed; reload before saving",
        );
      const temporary = path.join(
        path.dirname(target),
        `.vnve-write-${randomUUID()}`,
      );
      try {
        await writeFile(temporary, bytes, { flag: "wx", mode: 0o600 });
        // Detect ordinary external edits during preparation. This is not an OS-level CAS.
        if (((await read(relative))?.revision ?? null) !== expectedRevision)
          throw new WorkspaceFileError(
            "CONFLICT",
            "File changed; reload before saving",
          );
        await resolve(relative);
        await rename(temporary, target);
      } finally {
        await unlink(temporary).catch((error) => {
          if (error.code !== "ENOENT") throw error;
        });
      }
      return { revision: revision(bytes) };
    });
    queue = operation.catch(() => {});
    return operation;
  }
  async function media(relative) {
    if (!relative?.startsWith("assets/") && !relative?.startsWith("exports/"))
      throw new WorkspaceFileError("INVALID_PATH", "Expected a media file");
    try {
      const file = await resolve(relative);
      const stat = await lstat(file);
      if (!stat.isFile())
        throw new WorkspaceFileError("INVALID_PATH", "Expected a file");
      const hash = createHash("sha256");
      for await (const chunk of createReadStream(file)) hash.update(chunk);
      return {
        size: stat.size,
        revision: hash.digest("hex"),
        stream: (start, end) => createReadStream(file, { start, end }),
      };
    } catch (error) {
      if (error.code === "ENOENT") return null;
      throw error;
    }
  }
  function remove(relative, expectedRevision) {
    const operation = queue.then(async () => {
      if (!relative?.startsWith("assets/"))
        throw new WorkspaceFileError(
          "INVALID_PATH",
          "Only media assets can be removed",
        );
      const target = await resolve(relative);
      const current = await media(relative);
      if (!current || current.revision !== expectedRevision)
        throw new WorkspaceFileError(
          "CONFLICT",
          "File changed; reload before deleting",
        );
      await unlink(target);
    });
    queue = operation.catch(() => {});
    return operation;
  }
  function writeStream(relative, source, expectedRevision, maxBytes) {
    const operation = queue.then(async () => {
      if (!relative?.startsWith("assets/") && !relative?.startsWith("exports/"))
        throw new WorkspaceFileError(
          "INVALID_PATH",
          "Only media can be uploaded",
        );
      const target = await resolve(relative, true);
      const current = await media(relative);
      if ((current?.revision ?? null) !== expectedRevision)
        throw new WorkspaceFileError(
          "CONFLICT",
          "File changed; reload before saving",
        );
      const temporary = path.join(
        path.dirname(target),
        `.vnve-write-${randomUUID()}`,
      );
      const hash = createHash("sha256");
      let size = 0;
      async function* limited() {
        for await (const chunk of source) {
          size += chunk.length;
          if (size > maxBytes)
            throw new WorkspaceFileError(
              "TOO_LARGE",
              "Upload exceeds size limit",
            );
          hash.update(chunk);
          yield chunk;
        }
      }
      try {
        await pipeline(
          limited(),
          createWriteStream(temporary, { flags: "wx", mode: 0o600 }),
        );
        if (((await media(relative))?.revision ?? null) !== expectedRevision)
          throw new WorkspaceFileError(
            "CONFLICT",
            "File changed; reload before saving",
          );
        await resolve(relative);
        await rename(temporary, target);
        return { revision: hash.digest("hex") };
      } finally {
        await unlink(temporary).catch((error) => {
          if (error.code !== "ENOENT") throw error;
        });
      }
    });
    queue = operation.catch(() => {});
    return operation;
  }
  function removeDocument(relative, expectedRevision) {
    const operation = queue.then(async () => {
      if (
        !relative?.endsWith(".json") ||
        (!relative.startsWith(".vnve/") && !relative.startsWith("projects/"))
      )
        throw new WorkspaceFileError(
          "INVALID_PATH",
          "Expected a workspace document",
        );
      const target = await resolve(relative);
      const current = await read(relative);
      if ((current?.revision ?? null) !== expectedRevision)
        throw new WorkspaceFileError(
          "CONFLICT",
          "Document changed before removal",
        );
      if (current) await unlink(target);
    });
    queue = operation.catch(() => {});
    return operation;
  }
  return { read, write, media, writeStream, remove, removeDocument };
}
