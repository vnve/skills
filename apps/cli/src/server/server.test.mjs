import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { startWorkspaceServer } from "./server.mjs";

test("HTTP authentication, revisions, media ranges and size limit", async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), "vnve-http-"));
  const server = await startWorkspaceServer({ directory, maxUploadBytes: 16 });
  t.after(async () => {
    await server.close();
    await rm(directory, { recursive: true, force: true });
  });
  const url = `${server.origin}/files?path=assets/audio/voice.mp3`;
  const headers = { Authorization: `Bearer ${server.token}` };
  assert.equal((await fetch(url)).status, 401);
  assert.equal(
    (
      await fetch(url, {
        headers: { ...headers, Origin: "https://other.example" },
      })
    ).status,
    403,
  );
  assert.equal(
    (await fetch(url, { method: "PUT", headers, body: "abc" })).status,
    428,
  );
  assert.equal(
    (
      await fetch(url, {
        method: "PUT",
        headers: { ...headers, "If-None-Match": "*" },
        body: "0123456789",
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await fetch(url, {
        method: "PUT",
        headers: { ...headers, "If-None-Match": "*" },
        body: "stale",
      })
    ).status,
    409,
  );
  const full = await fetch(url, { headers });
  const etag = full.headers.get("etag");
  assert.equal(await full.text(), "0123456789");
  const partial = await fetch(url, {
    headers: { ...headers, Range: "bytes=2-4" },
  });
  assert.equal(partial.status, 206);
  assert.equal(partial.headers.get("content-range"), "bytes 2-4/10");
  assert.equal(await partial.text(), "234");
  assert.equal(
    await (
      await fetch(url, { headers: { ...headers, Range: "bytes=-2" } })
    ).text(),
    "89",
  );
  assert.equal(
    (await fetch(url, { headers: { ...headers, Range: "bytes=20-" } })).status,
    416,
  );
  const head = await fetch(url, { method: "HEAD", headers });
  assert.equal(head.headers.get("content-length"), "10");
  assert.equal(await head.text(), "");
  assert.equal(
    (
      await fetch(url, {
        method: "PUT",
        headers: { ...headers, "If-Match": etag },
        body: "x".repeat(17),
      })
    ).status,
    413,
  );
  assert.equal(
    (
      await fetch(url, {
        method: "PUT",
        headers: { ...headers, "If-Match": etag },
        body: "updated",
      })
    ).status,
    200,
  );
  assert.equal(
    (await fetch(`${server.origin}/files?path=..%2Fsecret`, { headers }))
      .status,
    400,
  );
});

test("preview requests require authorization and are fulfilled only by a browser client", async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), "vnve-preview-"));
  const server = await startWorkspaceServer({ directory });
  t.after(async () => {
    await server.close();
    await rm(directory, { recursive: true, force: true });
  });
  assert.equal(
    (await fetch(`${server.origin}/__vnve/preview/next`)).status,
    401,
  );
  const headers = {
    Authorization: `Bearer ${server.token}`,
    "Content-Type": "application/json",
  };
  const pending = fetch(`${server.origin}/__vnve/preview`, {
    method: "POST",
    headers,
    body: JSON.stringify({ projectId: "p", times: [0, 0.5] }),
  });
  let job;
  for (let i = 0; i < 20; i++) {
    job = await (
      await fetch(`${server.origin}/__vnve/preview/next`, { headers })
    ).json();
    if (job.id) break;
    await new Promise((r) => setTimeout(r, 5));
  }
  assert.equal(job.projectId, "p");
  await fetch(`${server.origin}/__vnve/preview/result`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      id: job.id,
      result: { ok: true, frames: [], verifiedBrowser: true },
    }),
  });
  assert.equal((await (await pending).json()).verifiedBrowser, true);
});
