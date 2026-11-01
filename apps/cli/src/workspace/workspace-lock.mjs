import {
  mkdir,
  lstat,
  realpath,
  readdir,
  rename,
  rmdir,
  unlink,
  writeFile,
  rm,
} from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { WorkspaceFileError } from "./workspace-files.mjs";

function processAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error.code === "ESRCH") return false;
    return true;
  }
}
async function removeEmpty(directory) {
  try {
    await rmdir(directory);
  } catch (error) {
    if (!["ENOENT", "ENOTEMPTY", "EEXIST"].includes(error.code)) throw error;
  }
}

/** Publish a fully initialized, nonempty lock directory atomically. No time-based lock stealing. */
export async function withWorkspaceLock(
  directory,
  operation,
  { timeoutMs = 15000 } = {},
) {
  const root = await realpath(directory);
  const metadata = path.join(root, ".vnve");
  await mkdir(metadata).catch((error) => {
    if (error.code !== "EEXIST") throw error;
  });
  const stat = await lstat(metadata);
  if (stat.isSymbolicLink() || !stat.isDirectory())
    throw new WorkspaceFileError(
      "INVALID_PATH",
      "Workspace metadata must be a real directory",
    );
  const owner = `${process.pid}-${randomUUID()}`;
  const candidate = path.join(metadata, `.lock-candidate-${owner}`);
  const lock = path.join(metadata, ".workspace-lock");
  await mkdir(candidate, { mode: 0o700 });
  let acquired = false;
  try {
    await writeFile(path.join(candidate, owner), "", {
      flag: "wx",
      mode: 0o600,
    });
    const deadline = Date.now() + timeoutMs;
    while (!acquired) {
      try {
        await rename(candidate, lock);
        acquired = true;
      } catch (error) {
        // Windows reports EPERM when the nonempty lock directory already exists.
        // Inspect the destination before treating that error as lock contention.
        if (!["EEXIST", "ENOTEMPTY", "EPERM"].includes(error.code)) throw error;
        const renameError = error;
        let entries;
        try {
          const lockStat = await lstat(lock);
          if (lockStat.isSymbolicLink() || !lockStat.isDirectory())
            throw new WorkspaceFileError(
              "INVALID_PATH",
              "Invalid workspace lock",
            );
          entries = await readdir(lock);
        } catch (error) {
          if (error.code === "ENOENT") {
            if (renameError.code === "EPERM") {
              // The holder may have released between rename and lstat. Retry, but
              // preserve a real permission failure if no lock ever appears.
              if (Date.now() >= deadline) throw renameError;
              await delay(20);
            }
            continue;
          }
          throw error;
        }
        if (
          entries.length === 1 &&
          /^\d+-[a-f0-9-]{36}$/.test(entries[0]) &&
          !processAlive(Number(entries[0].split("-")[0]))
        ) {
          // Remove only the observed owner's unique entry. A competing reaper cannot
          // delete a replacement owner's lock, even if it runs after this removal.
          try {
            await unlink(path.join(lock, entries[0]));
            await removeEmpty(lock);
          } catch (error) {
            if (error.code !== "ENOENT") throw error;
          }
          continue;
        }
        if (Date.now() >= deadline)
          throw new WorkspaceFileError(
            "WORKSPACE_BUSY",
            "Workspace is busy; retry after the current operation finishes",
          );
        await delay(20);
      }
    }
    return await operation();
  } finally {
    if (acquired) {
      await unlink(path.join(lock, owner));
      await removeEmpty(lock);
    } else await rm(candidate, { recursive: true, force: true });
  }
}
