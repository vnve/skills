import { createHash } from "node:crypto";
import { WorkspaceFileError } from "./workspace-files.mjs";

const journalPath = ".vnve/.transaction.json";
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
function documentPath(name) {
  if (
    typeof name !== "string" ||
    name.split("/").some((part) => part === "." || part === "..")
  )
    return false;
  return (
    name === ".vnve/workspace.json" ||
    name === ".vnve/assets.json" ||
    /^projects\/[^/\\]+\/project\.json$/.test(name)
  );
}
function validEntry(entry) {
  if (
    !entry ||
    !documentPath(entry.path) ||
    typeof entry.after !== "string" ||
    (entry.before !== null && typeof entry.before !== "string")
  )
    return false;
  if (Buffer.from(entry.after, "base64").toString("base64") !== entry.after)
    return false;
  if (entry.before === null) return entry.expected === null;
  const before = Buffer.from(entry.before, "base64");
  return (
    before.toString("base64") === entry.before &&
    hash(before) === entry.expected
  );
}
async function restore(files, entry) {
  const current = await files.read(entry.path);
  const before =
    entry.before === null ? null : Buffer.from(entry.before, "base64");
  const after = Buffer.from(entry.after, "base64");
  if ((current?.revision ?? null) === (before === null ? null : hash(before)))
    return;
  if (current?.revision !== hash(after))
    throw new WorkspaceFileError(
      "RECOVERY_REQUIRED",
      "A document changed outside vnve during recovery; original data and journal were preserved",
    );
  if (before === null) await files.removeDocument(entry.path, current.revision);
  else await files.write(entry.path, before, current.revision);
}

/** Must run while holding the workspace lock, before returning any document to a caller. */
export async function recoverWorkspaceTransaction(files) {
  const file = await files.read(journalPath);
  if (!file) return;
  let journal;
  try {
    journal = JSON.parse(file.bytes.toString());
  } catch {
    /* rejected below */
  }
  if (
    journal?.version !== 1 ||
    !["prepared", "committed"].includes(journal.state) ||
    !Array.isArray(journal.entries) ||
    journal.entries.some((entry) => !validEntry(entry)) ||
    new Set(journal.entries.map((entry) => entry.path)).size !==
      journal.entries.length
  ) {
    throw new WorkspaceFileError(
      "RECOVERY_REQUIRED",
      "Invalid transaction journal; files were preserved",
    );
  }
  if (journal.state === "prepared") {
    for (const entry of [...journal.entries].reverse())
      await restore(files, entry);
  }
  await files.removeDocument(journalPath, file.revision);
}

/** Expected revisions are checked for every document before any visible file changes. */
export async function commitWorkspaceDocuments(files, changes) {
  const entries = [];
  const revisions = new Map();
  for (const change of changes) {
    if (!documentPath(change.path) || revisions.has(change.path))
      throw new WorkspaceFileError(
        "INVALID_PATH",
        "Invalid transaction document",
      );
    const current = await files.read(change.path);
    if ((current?.revision ?? null) !== change.expected)
      throw new WorkspaceFileError(
        "CONFLICT",
        "Workspace changed before saving",
      );
    const nextRevision = hash(change.bytes);
    revisions.set(change.path, nextRevision);
    if (current?.revision !== nextRevision)
      entries.push({
        path: change.path,
        before: current ? current.bytes.toString("base64") : null,
        after: change.bytes.toString("base64"),
        expected: change.expected,
      });
  }
  if (!entries.length) return revisions;
  const journal = { version: 1, state: "prepared", entries };
  let journalRevision = (
    await files.write(journalPath, Buffer.from(JSON.stringify(journal)), null)
  ).revision;
  const applied = [];
  let attempting;
  try {
    for (const entry of entries) {
      attempting = entry;
      await files.write(
        entry.path,
        Buffer.from(entry.after, "base64"),
        entry.expected,
      );
      applied.push(entry);
    }
    // Recheck the complete read/write set, including unchanged documents, before
    // recording the commit point. Non-cooperating filesystem writers can bypass the lock.
    for (const change of changes) {
      if (
        (await files.read(change.path))?.revision !== revisions.get(change.path)
      )
        throw new WorkspaceFileError(
          "CONFLICT",
          "Workspace changed while saving",
        );
    }
    journal.state = "committed";
    journalRevision = (
      await files.write(
        journalPath,
        Buffer.from(JSON.stringify(journal)),
        journalRevision,
      )
    ).revision;
  } catch (error) {
    try {
      if (
        attempting &&
        !applied.includes(attempting) &&
        error.code !== "CONFLICT"
      )
        await restore(files, attempting);
      for (const entry of applied.reverse()) await restore(files, entry);
      // Re-read in case a journal marker was replaced before an injected IO failure.
      const currentJournal = await files.read(journalPath);
      if (currentJournal)
        await files.removeDocument(journalPath, currentJournal.revision);
    } catch {
      throw new WorkspaceFileError(
        "RECOVERY_REQUIRED",
        "Save could not be rolled back; the next workspace operation will recover it from its journal",
      );
    }
    throw error;
  }
  // The commit point has already been recorded. A leftover committed journal
  // is safe to clean up on the next operation; do not report a successful save as failed.
  await files.removeDocument(journalPath, journalRevision).catch(() => {});
  return revisions;
}
