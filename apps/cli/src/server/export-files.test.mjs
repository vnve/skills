import { test } from "node:test";
import assert from "node:assert/strict";
import {
  realpath,
  mkdtemp,
  mkdir,
  writeFile,
  symlink,
  rm,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { exportFilePath, openExportFile } from "./export-files.mjs";
import { startWorkspaceServer } from "./server.mjs";

test("export opener only accepts existing workspace MP4s behind session/origin checks", async (t) => {
  const directory = await realpath(
    await mkdtemp(path.join(tmpdir(), "vnve-export-open-")),
  );
  await mkdir(path.join(directory, "exports"));
  const file = path.join(directory, "exports", "片段 with spaces.mp4");
  await writeFile(file, "fixture");
  await symlink(file, path.join(directory, "exports", "link.mp4"));
  const opened = [];
  const server = await startWorkspaceServer({
    directory,
    launchExport: async (p) => opened.push(p),
  });
  t.after(async () => {
    await server.close();
    await rm(directory, { recursive: true, force: true });
  });
  const headers = {
    Authorization: `Bearer ${server.token}`,
    "Content-Type": "application/json",
  };
  const url = server.origin + "/__vnve/exports/open";
  const body = JSON.stringify({ name: path.basename(file) });
  assert.equal((await fetch(url, { method: "POST", body })).status, 401);
  assert.equal(
    (
      await fetch(url, {
        method: "POST",
        headers: { ...headers, Origin: "https://elsewhere.example" },
        body,
      })
    ).status,
    403,
  );
  for (const name of [
    "../secret.mp4",
    "link.mp4",
    "run.sh",
    "foo\\bad.mp4",
    "missing.mp4",
  ]) {
    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({ name }),
    });
    assert.ok(
      [400, 404].includes(response.status),
      `${name}: ${response.status}`,
    );
  }
  assert.deepEqual(opened, []);
  const response = await fetch(url, { method: "POST", headers, body });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).path, file);
  assert.deepEqual(opened, [file]);
  const config = await (
    await fetch(server.origin + "/__vnve/config", { headers })
  ).json();
  assert.equal(config.exportsDirectory, path.join(directory, "exports"));
});

test("system opener passes the absolute file as one argument without a shell", async () => {
  const calls = [];
  await openExportFile("/tmp/a 'quoted' $file.mp4", "darwin", async (...args) =>
    calls.push(args),
  );
  assert.deepEqual(calls[0], [
    "open",
    ["/tmp/a 'quoted' $file.mp4"],
    { timeout: 10000, windowsHide: true },
  ]);
});
