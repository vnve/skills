import { afterEach, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { openLocalWorkspace } from "./workspace";
import { startWorkspaceServer } from "../server/server.mjs";
import { wav } from "../__tests__/media-fixtures";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});
async function setup() {
  const root = await mkdtemp(path.join(tmpdir(), "vnve-media-deletion-"));
  roots.push(root);
  const workspace = await openLocalWorkspace(root);
  const call = async (
    input: Parameters<typeof workspace.execute>[0],
  ): Promise<any> => workspace.execute(input);
  return { root, workspace, call };
}

for (const kind of ["bgm", "sfx"] as const) {
  for (const reference of ["id", "name", "url"] as const) {
    for (const op of ["save", "saveAssets"] as const) {
      it(`rejects ${op} removing ${kind} referenced by ${reference} in another project`, async () => {
        const { workspace, call } = await setup();
        const owner = await call({ op: "create", title: "引用作品" });
        const editor = await call({ op: "create", title: "另一作品" });
        const audio = {
          id: "shared-audio",
          name: "共享声音",
          url: "assets/audio/shared.wav",
          duration: 0.2,
        };
        await workspace.files.write(audio.url, wav(0.2), null);
        owner.assets.audio[kind].push(audio);
        owner.project.acts[0].scenes[0].script.nodes.push({
          id: "sound-line",
          type: "text",
          text: "声音",
          content: [
            { type: "tag", name: kind, params: { asset: audio[reference] } },
            { type: "text", text: "声音" },
          ],
        });
        await call({
          op: "save",
          projectId: owner.entry.projectId,
          project: owner.project,
          assets: owner.assets,
          expected: owner,
        });
        const before = await call({
          op: "load",
          projectId: editor.entry.projectId,
        });
        const next = structuredClone(before.assets);
        next.audio[kind] = [];
        await expect(
          call({
            op,
            projectId: editor.entry.projectId,
            ...(op === "save" ? { project: before.project } : {}),
            assets: next,
            expected: before,
          }),
        ).rejects.toMatchObject({
          code: "INVALID_DOCUMENT",
          message: expect.stringContaining("引用作品"),
        });
        const after = await call({
          op: "load",
          projectId: editor.entry.projectId,
        });
        expect(after).toEqual(before);
      });
    }
  }
}

it("HTTP deletion protects registered media, other-project voices and recovery snapshots, but cleans orphan uploads", async () => {
  const { root, workspace, call } = await setup();
  const owner = await call({ op: "create", title: "文件引用作品" });
  const editor = await call({ op: "create", title: "清理作品" });
  const media = ["registered", "voice", "recovery", "orphan"].map(
    (name) => `assets/audio/${name}.wav`,
  );
  for (const file of media) await workspace.files.write(file, wav(0.2), null);
  owner.assets.audio.bgm.push({
    id: "registered",
    name: "音乐",
    url: media[0],
    duration: 0.2,
  });
  owner.project.acts[0].scenes[0].script.nodes.push({
    id: "voice-line",
    type: "text",
    text: "配音",
    audioUrl: media[1],
    audioDuration: 0.2,
  });
  await call({
    op: "save",
    projectId: owner.entry.projectId,
    project: owner.project,
    assets: owner.assets,
    expected: owner,
  });
  const saved = await call({ op: "load", projectId: editor.entry.projectId });
  const draft = structuredClone(saved.project);
  draft.acts[0].scenes[0].script.nodes.push({
    id: "draft-voice",
    type: "text",
    text: "草稿",
    audioUrl: media[2],
    audioDuration: 0.2,
  });
  await call({
    op: "checkpoint",
    projectId: editor.entry.projectId,
    project: draft,
    assets: saved.assets,
    expected: saved,
  });
  const server = await startWorkspaceServer({ directory: root, workspace });
  try {
    const headers = { Authorization: `Bearer ${server.token}` };
    for (const file of media.slice(0, 3)) {
      const url = `${server.origin}/files?path=${encodeURIComponent(file)}`;
      const etag = (await fetch(url, { headers })).headers.get("etag")!;
      const response = await fetch(url, {
        method: "DELETE",
        headers: { ...headers, "If-Match": etag },
      });
      expect(response.status, file).toBe(400);
      expect(await workspace.files.media(file)).not.toBeNull();
    }
    const orphan = media[3];
    const url = `${server.origin}/files?path=${encodeURIComponent(orphan)}`;
    const etag = (await fetch(url, { headers })).headers.get("etag")!;
    expect(
      (
        await fetch(url, {
          method: "DELETE",
          headers: { ...headers, "If-Match": '"' + "0".repeat(64) + '"' },
        })
      ).status,
    ).toBe(409);
    expect(
      (
        await fetch(url, {
          method: "DELETE",
          headers: { ...headers, "If-Match": etag },
        })
      ).status,
    ).toBe(200);
    expect(await workspace.files.media(orphan)).toBeNull();
  } finally {
    await server.close();
  }
});

it("allows removing the final audio reference and its metadata together before orphan cleanup", async () => {
  const { workspace, call } = await setup();
  const owner = await call({ op: "create", title: "最后引用" });
  const audio = {
    id: "last-audio",
    name: "末次音乐",
    url: "assets/audio/last.wav",
    duration: 0.2,
  };
  await workspace.files.write(audio.url, wav(0.2), null);
  owner.assets.audio.bgm.push(audio);
  owner.project.acts[0].scenes[0].script.nodes.push({
    id: "line",
    type: "text",
    text: "音乐",
    content: [
      { type: "tag", name: "bgm", params: { asset: audio.id } },
      { type: "text", text: "音乐" },
    ],
  });
  await call({
    op: "save",
    projectId: owner.entry.projectId,
    project: owner.project,
    assets: owner.assets,
    expected: owner,
  });
  const loaded = await call({ op: "load", projectId: owner.entry.projectId });
  loaded.project.acts[0].scenes[0].script.nodes = [];
  loaded.assets.audio.bgm = [];
  await call({
    op: "save",
    projectId: owner.entry.projectId,
    project: loaded.project,
    assets: loaded.assets,
    expected: loaded,
  });
  const file = await workspace.files.media(audio.url);
  await workspace.removeMedia(audio.url, file!.revision);
  expect(await workspace.files.media(audio.url)).toBeNull();
});

it("rejects renaming an audio alias used by another project even when its ID stays the same", async () => {
  const { workspace, call } = await setup();
  const owner = await call({ op: "create", title: "按名称引用" });
  const editor = await call({ op: "create", title: "重命名作品" });
  const audio = {
    id: "alias-audio",
    name: "旧名称",
    url: "assets/audio/alias.wav",
    duration: 0.2,
  };
  await workspace.files.write(audio.url, wav(0.2), null);
  owner.assets.audio.sfx.push(audio);
  owner.project.acts[0].scenes[0].script.nodes.push({
    id: "line",
    type: "text",
    text: "声音",
    content: [
      { type: "tag", name: "sfx", params: { asset: audio.name } },
      { type: "text", text: "声音" },
    ],
  });
  await call({
    op: "save",
    projectId: owner.entry.projectId,
    project: owner.project,
    assets: owner.assets,
    expected: owner,
  });
  const before = await call({ op: "load", projectId: editor.entry.projectId });
  const next = structuredClone(before.assets);
  next.audio.sfx[0].name = "新名称";
  await expect(
    call({ op: "saveAssets", assets: next, expected: before }),
  ).rejects.toMatchObject({ code: "INVALID_DOCUMENT" });
});
