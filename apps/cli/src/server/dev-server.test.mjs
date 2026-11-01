import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startWorkspaceServer } from "./server.mjs";
test("development proxy serves UI while workspace APIs still require a session", async () => {
  const directory = await mkdtemp(join(tmpdir(), "vnve-dev-"));
  const vite = createServer((req, res) => {
    res.setHeader("Content-Type", "text/html");
    res.end(`<html>${req.url}</html>`);
  });
  await new Promise((resolve) => vite.listen(0, "127.0.0.1", resolve));
  let local;
  try {
    local = await startWorkspaceServer({
      directory,
      devOrigin: `http://127.0.0.1:${vite.address().port}`,
    });
    const html = await fetch(local.origin + "/src/test.tsx?x=1");
    assert.equal(html.status, 200);
    assert.match(await html.text(), /src\/test.tsx\?x=1/);
    assert.equal((await fetch(local.origin + "/__vnve/config")).status, 401);
    assert.equal(
      (await fetch(local.origin + "/files?path=assets/x.png")).status,
      401,
    );
    assert.equal((await fetch(local.origin, { method: "POST" })).status, 404);
    assert.equal(
      (
        await fetch(local.origin, {
          headers: { Origin: "https://example.com" },
        })
      ).status,
      403,
    );
  } finally {
    await local?.close();
    await new Promise((resolve) => vite.close(resolve));
    await rm(directory, { recursive: true, force: true });
  }
});
test("development proxy refuses non-loopback and ambiguous origins", async () => {
  for (const devOrigin of [
    "https://example.com",
    "http://localhost:5173",
    "http://127.0.0.1:5173/",
    "http://127.0.0.1:5173@evil.test",
  ])
    await assert.rejects(
      startWorkspaceServer({ directory: tmpdir(), devOrigin }),
      /explicit loopback/,
    );
});
