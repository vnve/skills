import { wav } from "../__tests__/media-fixtures";
import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { openLocalWorkspace } from "./workspace";
import { startWorkspaceServer } from "../server/server.mjs";
const roots: string[] = [];
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});
async function setup() {
  const root = await mkdtemp(path.join(tmpdir(), "vnve-model-"));
  roots.push(root);
  await mkdir(path.join(root, "assets/fonts"), { recursive: true });
  await writeFile(
    path.join(root, "assets/fonts/new.ttf"),
    "transaction fixture",
  );
  return { root, workspace: await openLocalWorkspace(root) };
}
// execute() is intentionally a JSON command dispatcher; narrow result types in the transport test only.
async function call(
  workspace: Awaited<ReturnType<typeof openLocalWorkspace>>,
  input: Parameters<typeof workspace.execute>[0],
) {
  return (await workspace.execute(input)) as any;
}
describe("local workspace persistence", () => {
  it("creates existing-layout documents, strips derived state, and reopens", async () => {
    const { root, workspace } = await setup();
    const result = await call(workspace, { op: "create", title: "本地故事" });
    const doc = result.project;
    doc.acts[0].scenes[0].timeline = [{ invalid: "derived" }];
    doc.assets = result.assets;
    doc.meta.title = "修改后";
    await call(workspace, {
      op: "save",
      projectId: result.entry.projectId,
      project: doc,
      assets: result.assets,
      expected: result,
    });
    const reopened = await call(await openLocalWorkspace(root), {
      op: "load",
      projectId: result.entry.projectId,
    });
    expect(reopened.project.meta.title).toBe("修改后");
    expect(reopened.project.assets).toBeUndefined();
    expect(reopened.project.acts[0].scenes[0].timeline).toBeUndefined();
    const listing = await call(workspace, { op: "list" });
    expect(listing.projects[0].title).toBe("修改后");
  });
  it("rejects stale shared-assets snapshots before writing the project", async () => {
    const { workspace } = await setup();
    const result = await call(workspace, { op: "create", title: "Original" });
    const changed = {
      ...result.assets,
      fonts: [{ id: "font1", name: "Font", url: "assets/fonts/example.ttf" }],
    };
    await call(workspace, {
      op: "saveAssets",
      assets: changed,
      expected: result,
    });
    await expect(
      call(workspace, {
        op: "save",
        projectId: result.entry.projectId,
        project: {
          ...result.project,
          meta: { ...result.project.meta, title: "stale" },
        },
        assets: result.assets,
        expected: result,
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    const loaded = await call(workspace, {
      op: "load",
      projectId: result.entry.projectId,
    });
    expect(loaded.project.meta.title).toBe("Original");
    expect(loaded.assets.fonts).toHaveLength(1);
  });
  it("preserves corrupt metadata rather than reinitializing it", async () => {
    const { root } = await setup();
    await writeFile(path.join(root, ".vnve/assets.json"), "{broken");
    await expect(openLocalWorkspace(root)).rejects.toMatchObject({
      code: "INVALID_DOCUMENT",
    });
    expect(await readFile(path.join(root, ".vnve/assets.json"), "utf8")).toBe(
      "{broken",
    );
  });
  it("rejects invalid content without applying any asset change", async () => {
    const { workspace } = await setup();
    const result = await call(workspace, { op: "create", title: "Original" });
    result.project.acts[0].scenes[0].script.nodes = [{ type: "bad" }];
    await expect(
      call(workspace, {
        op: "save",
        projectId: result.entry.projectId,
        project: result.project,
        assets: result.assets,
        expected: result,
      }),
    ).rejects.toMatchObject({ code: "INVALID_DOCUMENT" });
    const loaded = await call(workspace, {
      op: "load",
      projectId: result.entry.projectId,
    });
    expect(loaded.projectRevision).toBe(result.projectRevision);
    expect(loaded.assetsRevision).toBe(result.assetsRevision);
  });
  it("exchanges launch credentials for an HttpOnly session used by editor and media", async () => {
    const { root, workspace } = await setup();
    const server = await startWorkspaceServer({ directory: root, workspace });
    try {
      const session = await fetch(`${server.origin}/__vnve/session`, {
        method: "POST",
        headers: { Authorization: `Bearer ${server.token}` },
      });
      expect(session.status).toBe(200);
      const setCookie = session.headers.get("set-cookie")!;
      expect(setCookie).toContain("HttpOnly");
      expect(setCookie).toContain("SameSite=Strict");
      const headers = {
        Cookie: setCookie.split(";")[0],
        "Content-Type": "application/json",
      };
      const response = await fetch(`${server.origin}/__vnve/api`, {
        method: "POST",
        headers,
        body: JSON.stringify({ op: "create", title: "Session project" }),
      });
      expect(response.status).toBe(200);
      expect((await response.json()).project.meta.title).toBe(
        "Session project",
      );
      const foreign = await fetch(`${server.origin}/__vnve/api`, {
        method: "POST",
        headers: { ...headers, Origin: "https://foreign.example" },
        body: "{}",
      });
      expect(foreign.status).toBe(403);
    } finally {
      await server.close();
    }
  });
});

it("builds two story characters through the shared script constructor and rejects stale patch previews", async () => {
  const { workspace } = await setup();
  const script = {
    title: "Two speakers",
    characters: [
      { name: "A", description: "First" },
      { name: "B", description: "Second" },
    ],
    backgrounds: [{ name: "Park", description: "Day" }],
    acts: [
      {
        name: "Act",
        scenes: [
          {
            name: "Meeting",
            background: "Park",
            lines: [
              { speaker: "A", text: "Hello" },
              { speaker: "B", text: "Hi" },
            ],
          },
        ],
      },
    ],
  };
  const created = await call(workspace, {
    op: "create",
    title: script.title,
    script,
  });
  const scene = created.project.acts[0].scenes[0];
  expect(scene.actors).toHaveLength(2);
  const plan = {
    summary: "Move first speaker",
    operations: [
      {
        type: "actor.update" as const,
        sceneId: scene.id,
        actorId: scene.actors[0].id,
        x: 20,
      },
    ],
  };
  const preview = await call(workspace, {
    op: "patch",
    projectId: created.entry.projectId,
    plan,
  });
  expect(preview.project.acts[0].scenes[0].actors[0].x).toBe(20);
  expect(
    (await workspace.loadProject(created.entry.projectId)).projectRevision,
  ).toBe(created.projectRevision);
  await call(workspace, {
    op: "patch",
    projectId: created.entry.projectId,
    plan,
    expected: preview.expected,
    apply: true,
  });
  await expect(
    call(workspace, {
      op: "patch",
      projectId: created.entry.projectId,
      plan,
      expected: preview.expected,
      apply: true,
    }),
  ).rejects.toMatchObject({ code: "CONFLICT" });
});

it("imports recordings with a text/speaker snapshot and keeps the source file", async () => {
  const { importMedia } = await import("../media/media-import");
  const { root, workspace } = await setup();
  const created = await call(workspace, { op: "create", title: "Recording" });
  const scene = created.project.acts[0].scenes[0];
  scene.script.nodes = [
    { id: "line", type: "text", text: "Recorded narration" },
  ];
  await call(workspace, {
    op: "save",
    projectId: created.entry.projectId,
    project: created.project,
    expected: created,
  });
  const source = path.join(root, "recording.wav");
  await writeFile(source, wav(1));
  const result = await importMedia(workspace, created.entry.projectId, {
    file: source,
    kind: "voice",
    sceneId: scene.id,
    nodeId: "line",
    duration: 1,
    expectedText: "Recorded narration",
    expectedActorId: null,
  });
  const loaded = await workspace.loadProject(created.entry.projectId);
  expect(
    loaded.project.acts[0].scenes[0].script.nodes[0].audioImportSnapshot,
  ).toEqual({ text: "Recorded narration" });
  expect(loaded.project.acts[0].scenes[0].script.nodes[0].audioUrl).toBe(
    result.path,
  );
  expect(await readFile(source)).toEqual(wav(1));
  expect(await readFile(path.join(root, result.path))).toEqual(wav(1));
});

it("rolls back assets when a later project write fails", async () => {
  const { workspace } = await setup();
  const created = await call(workspace, { op: "create", title: "Original" });
  const originalWrite = workspace.files.write.bind(workspace.files);
  let failed = false;
  vi.spyOn(workspace.files, "write").mockImplementation(
    async (name, bytes, expected) => {
      if (name.endsWith("/project.json") && !failed) {
        failed = true;
        throw Object.assign(new Error("Injected write failure"), {
          code: "EIO",
        });
      }
      return originalWrite(name, bytes, expected);
    },
  );
  await expect(
    call(workspace, {
      op: "save",
      projectId: created.entry.projectId,
      project: {
        ...created.project,
        meta: { ...created.project.meta, title: "Rejected save" },
      },
      assets: {
        ...created.assets,
        fonts: [
          { id: "new", name: "Should roll back", url: "assets/fonts/new.ttf" },
        ],
      },
      expected: created,
    }),
  ).rejects.toThrow("Injected write failure");
  const loaded = await workspace.loadProject(created.entry.projectId);
  expect(loaded.assets.fonts).toHaveLength(0);
  expect(loaded.project.meta.title).toBe("Original");
  expect(loaded.projectRevision).toBe(created.projectRevision);
  expect(loaded.assetsRevision).toBe(created.assetsRevision);
});

it("serializes workspace writers from separate instances until the whole save commits", async () => {
  const { root, workspace } = await setup();
  const second = await openLocalWorkspace(root);
  const created = await call(workspace, { op: "create", title: "Original" });
  const originalWrite = workspace.files.write.bind(workspace.files);
  let entered!: () => void;
  const enteredPromise = new Promise<void>((resolve) => {
    entered = resolve;
  });
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  vi.spyOn(workspace.files, "write").mockImplementation(
    async (name, bytes, expected) => {
      const result = await originalWrite(name, bytes, expected);
      if (name === ".vnve/assets.json") {
        entered();
        await gate;
      }
      return result;
    },
  );
  const firstSave = call(workspace, {
    op: "save",
    projectId: created.entry.projectId,
    project: {
      ...created.project,
      meta: { ...created.project.meta, title: "First writer" },
    },
    assets: {
      ...created.assets,
      fonts: [{ id: "new", name: "Font", url: "assets/fonts/new.ttf" }],
    },
    expected: created,
  });
  await enteredPromise;
  const secondSave = call(second, {
    op: "save",
    projectId: created.entry.projectId,
    project: {
      ...created.project,
      meta: { ...created.project.meta, title: "Stale writer" },
    },
    expected: created,
  });
  // Attach the rejection assertion before releasing the first writer.
  const rejected = expect(secondSave).rejects.toMatchObject({
    code: "CONFLICT",
  });
  release();
  await firstSave;
  await rejected;
  expect(
    (await second.loadProject(created.entry.projectId)).project.meta.title,
  ).toBe("First writer");
});

it("rolls back its own writes while preserving an out-of-band conflicting project edit", async () => {
  const { root, workspace } = await setup();
  const created = await call(workspace, { op: "create", title: "Original" });
  const originalWrite = workspace.files.write.bind(workspace.files);
  let injected = false;
  vi.spyOn(workspace.files, "write").mockImplementation(
    async (name, bytes, expected) => {
      const result = await originalWrite(name, bytes, expected);
      if (name === ".vnve/assets.json" && !injected) {
        injected = true;
        await writeFile(
          path.join(root, "projects", created.entry.dirName, "project.json"),
          JSON.stringify({
            ...created.project,
            meta: { ...created.project.meta, title: "External writer" },
          }),
        );
      }
      return result;
    },
  );
  await expect(
    call(workspace, {
      op: "save",
      projectId: created.entry.projectId,
      project: created.project,
      assets: {
        ...created.assets,
        fonts: [
          { id: "new", name: "Rejected font", url: "assets/fonts/new.ttf" },
        ],
      },
      expected: created,
    }),
  ).rejects.toMatchObject({ code: "CONFLICT" });
  const loaded = await workspace.loadProject(created.entry.projectId);
  expect(loaded.assetsRevision).toBe(created.assetsRevision);
  expect(loaded.project.meta.title).toBe("External writer");
});

it.each(["prepared", "committed"] as const)(
  "recovers a %s journal before reopening the workspace",
  async (state) => {
    const { root, workspace } = await setup();
    const created = await call(workspace, { op: "create", title: "Original" });
    const file = `projects/${created.entry.dirName}/project.json`;
    const before = await workspace.files.read(file);
    const after = Buffer.from(
      JSON.stringify({
        ...created.project,
        meta: { ...created.project.meta, title: "Interrupted save" },
      }),
    );
    await workspace.files.write(
      ".vnve/.transaction.json",
      Buffer.from(
        JSON.stringify({
          version: 1,
          state,
          entries: [
            {
              path: file,
              before: before!.bytes.toString("base64"),
              after: after.toString("base64"),
              expected: before!.revision,
            },
          ],
        }),
      ),
      null,
    );
    await workspace.files.write(file, after, before!.revision);
    const reopened = await openLocalWorkspace(root);
    const loaded = await reopened.loadProject(created.entry.projectId);
    expect(loaded.project.meta.title).toBe(
      state === "prepared" ? "Original" : "Interrupted save",
    );
    expect(await workspace.files.read(".vnve/.transaction.json")).toBeNull();
  },
);

it("rolls back the project and assets when updating the manifest fails", async () => {
  const { workspace } = await setup();
  const created = await call(workspace, { op: "create", title: "Original" });
  const originalWrite = workspace.files.write.bind(workspace.files);
  let failed = false;
  vi.spyOn(workspace.files, "write").mockImplementation(
    async (name, bytes, expected) => {
      if (name === ".vnve/workspace.json" && !failed) {
        failed = true;
        throw Object.assign(new Error("Manifest write failed"), {
          code: "EIO",
        });
      }
      return originalWrite(name, bytes, expected);
    },
  );
  await expect(
    call(workspace, {
      op: "save",
      projectId: created.entry.projectId,
      project: {
        ...created.project,
        meta: { ...created.project.meta, title: "Rejected rename" },
      },
      assets: {
        ...created.assets,
        fonts: [{ id: "new", name: "Font", url: "assets/fonts/new.ttf" }],
      },
      expected: created,
    }),
  ).rejects.toThrow("Manifest write failed");
  const loaded = await workspace.loadProject(created.entry.projectId);
  expect(loaded.projectRevision).toBe(created.projectRevision);
  expect(loaded.assetsRevision).toBe(created.assetsRevision);
  expect((await call(workspace, { op: "list" })).projects[0].title).toBe(
    "Original",
  );
});

it("preserves a tampered recovery journal and current files instead of restoring invalid backup bytes", async () => {
  const { root, workspace } = await setup();
  const created = await call(workspace, { op: "create", title: "Original" });
  const file = `projects/${created.entry.dirName}/project.json`;
  const before = await workspace.files.read(file);
  const after = Buffer.from(
    JSON.stringify({
      ...created.project,
      meta: { ...created.project.meta, title: "Pending" },
    }),
  );
  await workspace.files.write(
    ".vnve/.transaction.json",
    Buffer.from(
      JSON.stringify({
        version: 1,
        state: "prepared",
        entries: [
          {
            path: file,
            before: Buffer.from("damaged backup").toString("base64"),
            after: after.toString("base64"),
            expected: before!.revision,
          },
        ],
      }),
    ),
    null,
  );
  await workspace.files.write(file, after, before!.revision);
  await expect(openLocalWorkspace(root)).rejects.toMatchObject({
    code: "RECOVERY_REQUIRED",
  });
  expect((await workspace.files.read(file))!.bytes.toString()).toBe(
    after.toString(),
  );
  expect(await workspace.files.read(".vnve/.transaction.json")).not.toBeNull();
});

it("keeps the recovery journal when rollback fails and completes recovery on reopen", async () => {
  const { root, workspace } = await setup();
  const created = await call(workspace, { op: "create", title: "Original" });
  const originalWrite = workspace.files.write.bind(workspace.files);
  let assetsWrites = 0;
  vi.spyOn(workspace.files, "write").mockImplementation(
    async (name, bytes, expected) => {
      if (name.endsWith("/project.json"))
        throw Object.assign(new Error("Project write failed"), { code: "EIO" });
      if (name === ".vnve/assets.json" && ++assetsWrites === 2)
        throw Object.assign(new Error("Rollback write failed"), {
          code: "EIO",
        });
      return originalWrite(name, bytes, expected);
    },
  );
  await expect(
    call(workspace, {
      op: "save",
      projectId: created.entry.projectId,
      project: {
        ...created.project,
        meta: { ...created.project.meta, title: "Rejected" },
      },
      assets: {
        ...created.assets,
        fonts: [{ id: "new", name: "Font", url: "assets/fonts/new.ttf" }],
      },
      expected: created,
    }),
  ).rejects.toMatchObject({ code: "RECOVERY_REQUIRED" });
  expect(await workspace.files.read(".vnve/.transaction.json")).not.toBeNull();
  const recovered = await openLocalWorkspace(root);
  const loaded = await recovered.loadProject(created.entry.projectId);
  expect(loaded.projectRevision).toBe(created.projectRevision);
  expect(loaded.assetsRevision).toBe(created.assetsRevision);
  expect(await recovered.files.read(".vnve/.transaction.json")).toBeNull();
});

it("preserves visual overrides across save/reopen and protects shared references from another project", async () => {
  const { workspace } = await setup();
  const first = await call(workspace, { op: "create", title: "Visual" });
  const { buildAnimation } =
    await import("../../../../packages/authoring/src");
  first.project.acts[0].scenes[0].script.nodes = [
    { id: "line", type: "text", text: "Hello", timing: { revealDuration: 2 } },
  ];
  first.project.acts[0].scenes[0].animationClips = [
    buildAnimation(
      {
        sdkVersion: 2, sceneId:first.project.acts[0].scenes[0].id,
        id: "v",
        name: "V",
        width: 100,
        height: 100,
        duration: 1,
        build({ scene }) {
          scene.text({ id: "title", text: "TITLE", fontId: "font" });
        },
      },
      "",
      {width:1920,height:1080,cues:[]},
    ),
  ];
  first.project.acts[0].scenes[0].animationClips[0].overrides = {
    x: 20,
    enabled: false,
  };
  first.assets.fonts = [
    { id: "font", name: "Shared", url: "assets/fonts/new.ttf" },
  ];
  await call(workspace, {
    op: "save",
    projectId: first.entry.projectId,
    project: first.project,
    assets: first.assets,
    expected: first,
  });
  const reopened = await call(workspace, {
    op: "load",
    projectId: first.entry.projectId,
  });
  expect(reopened.project.acts[0].scenes[0].animationClips[0].overrides).toEqual({
    x: 20,
    enabled: false,
  });
  const second = await call(workspace, { op: "create", title: "Other" });
  const before = await call(workspace, { op: "assets" });
  await expect(
    call(workspace, {
      op: "save",
      projectId: second.entry.projectId,
      project: second.project,
      assets: { ...before.assets, fonts: [] },
      expected: {
        projectRevision: second.projectRevision,
        assetsRevision: before.assetsRevision,
      },
    }),
  ).rejects.toThrow("referenced");
});

it("rejects saving a disabled visual Image with an unregistered asset", async () => {
  const { workspace } = await setup(),
    created = await call(workspace, { op: "create", title: "Invalid image" });
  const { buildAnimation } =
    await import("../../../../packages/authoring/src");
  created.project.acts[0].scenes[0].script.nodes = [
    { id: "line", type: "text", text: "A", timing: { revealDuration: 2 } },
  ];
  created.project.acts[0].scenes[0].animationClips = [
    buildAnimation(
      {
        sdkVersion: 2, sceneId:created.project.acts[0].scenes[0].id,
        id: "v",
        name: "V",
        width: 100,
        height: 100,
        duration: 1,
        overrides: { enabled: false },
        build({ scene }) {
          scene.image({
            id: "image",
            assetId: "missing",
            width: 100,
            height: 100,
          });
        },
      },
      "",
      {width:1920,height:1080,cues:[]},
    ),
  ];
  await expect(
    call(workspace, {
      op: "save",
      projectId: created.entry.projectId,
      project: created.project,
      expected: created,
    }),
  ).rejects.toThrow("Unknown image");
});

it("checkpoints an out-of-date page without overwriting disk project or asset revisions", async () => {
  const { root, workspace } = await setup();
  const created = await call(workspace, { op: "create", title: "original" });
  const projectId = created.entry.projectId;
  await call(workspace, {
    op: "save",
    projectId,
    project: {
      ...created.project,
      meta: { ...created.project.meta, title: "external" },
    },
    expected: created,
  });
  const before = await workspace.loadProject(projectId);
  const backup = await call(workspace, {
    op: "checkpoint",
    projectId,
    project: {
      ...created.project,
      meta: { ...created.project.meta, title: "page draft" },
    },
    assets: created.assets,
    expected: created,
  });
  const saved = JSON.parse(
    await readFile(path.join(root, backup.path), "utf8"),
  );
  expect(saved.project.meta.title).toBe("page draft");
  expect(saved.baseRevision.projectRevision).toBe(created.projectRevision);
  expect(await workspace.loadProject(projectId)).toEqual(before);
  expect(
    (await call(workspace, { op: "recovery", projectId })).project.meta.title,
  ).toBe("page draft");
});
