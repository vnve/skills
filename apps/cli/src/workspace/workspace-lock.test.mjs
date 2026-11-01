import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { withWorkspaceLock } from "./workspace-lock.mjs";

async function holder(directory) {
  const moduleUrl = new URL("./workspace-lock.mjs", import.meta.url).href;
  const child = spawn(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `
    import { withWorkspaceLock } from ${JSON.stringify(moduleUrl)};
    let release; const gate = new Promise(resolve => release = resolve);
    process.on('message', () => release());
    await withWorkspaceLock(process.argv[1], async () => { process.send('locked'); await gate; });
    process.disconnect();
  `,
      directory,
    ],
    { stdio: ["ignore", "ignore", "pipe", "ipc"] },
  );
  await Promise.race([
    once(child, "message"),
    once(child, "exit").then(() => {
      throw new Error("Lock holder exited early");
    }),
  ]);
  return child;
}

test("a different process cannot enter a held workspace lock", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "vnve-lock-"));
  const child = await holder(root);
  t.after(async () => {
    child.kill();
    await rm(root, { recursive: true, force: true });
  });
  let entered = false;
  const waiting = withWorkspaceLock(root, async () => {
    entered = true;
  });
  await delay(50);
  assert.equal(entered, false);
  const exited = once(child, "exit");
  child.send("release");
  await exited;
  await waiting;
  assert.equal(entered, true);
});

test("a dead process lock can be recovered without a time-based lease", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "vnve-dead-lock-"));
  const child = await holder(root);
  t.after(async () => {
    child.kill();
    await rm(root, { recursive: true, force: true });
  });
  const exited = once(child, "exit");
  child.kill("SIGKILL");
  await exited;
  assert.equal(
    await withWorkspaceLock(root, async () => "recovered"),
    "recovered",
  );
});
