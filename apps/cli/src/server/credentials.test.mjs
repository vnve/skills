import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, stat, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { startWorkspaceServer } from "./server.mjs";
import { credentialStore } from "./credentials.mjs";

test("domestic TTS credentials preserve provider fields without exposing tokens", async (context) => {
  const root = await mkdtemp(path.join(tmpdir(), "vnve-tts-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const store = credentialStore(root);
  const minimax = {
    action: "save",
    id: "minimax-tts",
    token: "minimax-secret",
    endpoint: "https://api.minimax.cn/v1/t2a_v2",
    model: "chosen-model",
    voice: "chosen-voice",
  };
  await store.execute(minimax);
  assert.deepEqual(await store.execute({ action: "status", id: minimax.id }), {
    configured: true,
    endpoint: minimax.endpoint,
    model: minimax.model,
    resourceId: "",
  });
  const volcengine = {
    ...minimax,
    id: "volcengine-tts",
    endpoint: "https://openspeech.bytedance.com/api/v3/tts/unidirectional",
    token: "volcengine-secret",
    resourceId: "chosen-resource",
  };
  await assert.rejects(store.execute({ ...volcengine, resourceId: "" }), {
    code: "INVALID_DOCUMENT",
  });
  await assert.rejects(store.execute({ ...volcengine, resourceId: {} }), {
    code: "INVALID_DOCUMENT",
  });
  await store.execute(volcengine);
  const saved = JSON.parse(
    await readFile(path.join(root, "setting.json"), "utf8"),
  );
  assert.equal(saved.services[volcengine.id].resourceId, volcengine.resourceId);
  const status = await store.execute({ action: "status", id: volcengine.id });
  assert.equal(status.resourceId, volcengine.resourceId);
  assert.equal(JSON.stringify(status).includes(volcengine.token), false);
});

test("credentials require a local session, remain outside workspace and never echo secrets", async (context) => {
  const root = await mkdtemp(path.join(tmpdir(), "vnve-credentials-"));
  const directory = path.join(root, "workspace");
  const credentialsDirectory = path.join(root, "credentials");
  await mkdir(directory);
  const server = await startWorkspaceServer({
    directory,
    credentialsDirectory,
  });
  context.after(async () => {
    await server.close();
    await rm(root, { recursive: true, force: true });
  });
  const url = `${server.origin}/__vnve/credentials`;
  const input = {
    action: "save",
    id: "azure-tts",
    token: "test-secret",
    endpoint: "https://eastasia.tts.speech.microsoft.com/cognitiveservices/v1",
    model: "",
    voice: "test",
  };
  const send = (value, headers = { Authorization: `Bearer ${server.token}` }) =>
    fetch(url, { method: "POST", headers, body: JSON.stringify(value) });
  assert.equal((await send(input, {})).status, 401);
  assert.equal(
    (
      await send(input, {
        Authorization: `Bearer ${server.token}`,
        Origin: "https://other.example",
      })
    ).status,
    403,
  );
  assert.equal((await send({ ...input, id: "../escape" })).status, 400);
  assert.equal(
    (await send({ ...input, endpoint: "https://example.org/?key=secret" }))
      .status,
    400,
  );
  assert.equal((await send(input)).status, 200);
  const file = path.join(credentialsDirectory, "setting.json");
  assert.equal(
    JSON.parse(await readFile(file, "utf8")).services[input.id].token,
    "test-secret",
  );
  // Windows does not implement POSIX owner/group/other mode bits. Keep the
  // exact 0600 check on POSIX; all credential behavior checks run on every OS.
  if (process.platform !== "win32")
    assert.equal((await stat(file)).mode & 0o777, 0o600);
  const status = await (await send({ action: "status", id: input.id })).json();
  assert.equal(status.configured, true);
  assert.equal(JSON.stringify(status).includes("test-secret"), false);
  assert.equal(
    (
      await fetch(`${server.origin}/files?path=../credentials/azure-tts.json`, {
        headers: { Authorization: `Bearer ${server.token}` },
      })
    ).status,
    400,
  );
  assert.equal((await send({ action: "remove", id: input.id })).status, 200);
  assert.deepEqual(
    await (await send({ action: "status", id: input.id })).json(),
    { configured: false },
  );
});

test("setting.json keeps concurrent service edits and reuses saved keys", async (context) => {
  const root = await mkdtemp(path.join(tmpdir(), "vnve-settings-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const store = credentialStore(root);
  const base = {
    action: "save",
    token: "test-key",
    endpoint: "https://example.org/api",
    model: "model",
  };
  await Promise.all([
    store.execute({ ...base, id: "minimax-tts" }),
    store.execute({ ...base, id: "volcengine-image" }),
  ]);
  await store.execute({
    ...base,
    id: "minimax-tts",
    token: "",
    model: "updated",
  });
  let settings = JSON.parse(
    await readFile(path.join(root, "setting.json"), "utf8"),
  );
  assert.equal(settings.services["minimax-tts"].token, "test-key");
  assert.equal(settings.services["minimax-tts"].model, "updated");
  assert.equal(settings.services["volcengine-image"].model, "model");
  assert.equal("voice" in settings.services["minimax-tts"], false);
  await store.execute({ action: "remove", id: "minimax-tts" });
  settings = JSON.parse(
    await readFile(path.join(root, "setting.json"), "utf8"),
  );
  assert.equal(settings.services["minimax-tts"], undefined);
  assert.ok(settings.services["volcengine-image"]);
});

test("failed credential commit preserves the old configuration and reports a safe stage", async (context) => {
  const root = await mkdtemp(path.join(tmpdir(), "vnve-commit-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const input = {
    action: "save",
    id: "minimax-tts",
    token: "test-key",
    endpoint: "https://api.minimaxi.com/v1/t2a_v2",
    model: "speech-2.8-hd",
  };
  await credentialStore(root).execute(input);
  const before = await readFile(path.join(root, "setting.json"), "utf8");
  const store = credentialStore(root, {
    commit: async () => {
      throw Object.assign(new Error("private-token-must-not-appear"), {
        code: "EPERM",
      });
    },
  });
  await assert.rejects(
    store.execute({ ...input, model: "updated" }),
    (error) => {
      assert.equal(error.code, "CREDENTIAL_COMMIT_FAILED");
      assert.equal(error.reason, "EPERM");
      assert.equal(error.message.includes("private-token"), false);
      return true;
    },
  );
  assert.equal(await readFile(path.join(root, "setting.json"), "utf8"), before);
});

test("malformed credential files are preserved without exposing their contents", async (context) => {
  const root = await mkdtemp(path.join(tmpdir(), "vnve-invalid-setting-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const { writeFile } = await import("node:fs/promises");
  const file = path.join(root, "setting.json");
  const text = '{"secret":"private-token-must-not-appear",';
  await writeFile(file, text);
  await assert.rejects(
    credentialStore(root).execute({ action: "status", id: "minimax-tts" }),
    (error) =>
      error.code === "CREDENTIAL_FORMAT_INVALID" &&
      !error.message.includes("private-token"),
  );
  assert.equal(await readFile(file, "utf8"), text);
});

test("checks configuration write capability with non-secret disposable files", async (context) => {
  const root = await mkdtemp(path.join(tmpdir(), "vnve-write-capability-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const { readdir } = await import("node:fs/promises");
  const store = credentialStore(root);
  assert.deepEqual(
    await store.execute({ action: "capabilities", id: "minimax-tts" }),
    { writable: true, directory: root },
  );
  assert.deepEqual(await readdir(root), []);
  const blocked = credentialStore(root, {
    commit: async () => {
      throw Object.assign(new Error("private-token"), { code: "EPERM" });
    },
  });
  assert.deepEqual(
    await blocked.execute({ action: "capabilities", id: "minimax-tts" }),
    {
      writable: false,
      directory: root,
      code: "CREDENTIAL_COMMIT_FAILED",
      reason: "EPERM",
    },
  );
  assert.deepEqual(await readdir(root), []);
});
