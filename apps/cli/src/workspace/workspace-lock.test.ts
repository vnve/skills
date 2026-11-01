import { afterEach, expect, it, vi } from "vitest";
import { mkdtemp, rename, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { withWorkspaceLock } from "./workspace-lock.mjs";

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return { ...actual, rename: vi.fn(actual.rename) };
});

const roots: string[] = [];
afterEach(async () => {
  vi.mocked(rename).mockReset();
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

it("waits for an existing workspace lock when Windows rename reports EPERM", async () => {
  const actual =
    await vi.importActual<typeof import("node:fs/promises")>(
      "node:fs/promises",
    );
  let collided!: () => void;
  const collision = new Promise<void>((resolve) => {
    collided = resolve;
  });
  vi.mocked(rename).mockImplementation(async (from, to) => {
    try {
      await actual.rename(from, to);
    } catch (error) {
      if (
        ["EEXIST", "ENOTEMPTY", "EPERM"].includes(
          (error as NodeJS.ErrnoException).code ?? "",
        )
      ) {
        collided();
        throw Object.assign(new Error("Windows directory rename collision"), {
          code: "EPERM",
        });
      }
      throw error;
    }
  });
  const root = await mkdtemp(path.join(tmpdir(), "vnve-win-lock-"));
  roots.push(root);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let entered!: () => void;
  const held = new Promise<void>((resolve) => {
    entered = resolve;
  });
  let revision = "original";
  const first = withWorkspaceLock(root, async () => {
    entered();
    await gate;
    revision = "saved";
  });
  await held;
  let secondEntered = false;
  const second = withWorkspaceLock(root, async () => {
    secondEntered = true;
    if (revision !== "original")
      throw Object.assign(new Error("Stale writer"), { code: "CONFLICT" });
  }).then(
    () => null,
    (error: NodeJS.ErrnoException) => error,
  );
  try {
    await collision;
    expect(secondEntered).toBe(false);
  } finally {
    release();
    await first;
  }
  expect(await second).toMatchObject({ code: "CONFLICT" });
  expect(revision).toBe("saved");
});

it("preserves a persistent permission error when no competing lock exists", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "vnve-permission-lock-"));
  roots.push(root);
  const error = Object.assign(new Error("Permission denied"), {
    code: "EPERM",
  });
  vi.mocked(rename).mockRejectedValue(error);
  const operation = vi.fn();
  await expect(
    withWorkspaceLock(root, operation, { timeoutMs: 0 }),
  ).rejects.toBe(error);
  expect(operation).not.toHaveBeenCalled();
  const { readdir } = await import("node:fs/promises");
  expect(await readdir(path.join(root, ".vnve"))).toEqual([]);
});

it("reports a busy workspace without removing a live owner's lock on Windows", async () => {
  const actual =
    await vi.importActual<typeof import("node:fs/promises")>(
      "node:fs/promises",
    );
  const root = await mkdtemp(path.join(tmpdir(), "vnve-busy-lock-"));
  roots.push(root);
  const lock = path.join(root, ".vnve", ".workspace-lock");
  await actual.mkdir(lock, { recursive: true });
  const owner = `${process.pid}-00000000-0000-0000-0000-000000000000`;
  await actual.writeFile(path.join(lock, owner), "");
  vi.mocked(rename).mockRejectedValue(
    Object.assign(new Error("Lock exists"), { code: "EPERM" }),
  );
  const operation = vi.fn();
  await expect(
    withWorkspaceLock(root, operation, { timeoutMs: 0 }),
  ).rejects.toMatchObject({ code: "WORKSPACE_BUSY" });
  expect(operation).not.toHaveBeenCalled();
  expect(await actual.readdir(lock)).toEqual([owner]);
  expect(await actual.readdir(path.dirname(lock))).toEqual([".workspace-lock"]);
});
