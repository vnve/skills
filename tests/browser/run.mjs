import assert from "node:assert/strict";
import { createServer, request } from "node:http";
import { spawn, execFileSync } from "node:child_process";
import { randomBytes, createHash } from "node:crypto";
import { mkdir, readFile, writeFile, copyFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { sourceDigest } from "../../scripts/source-digest.mjs";
import { prepareFixture, title } from "./fixture.mjs";
import { verifyVideo } from "./verify-video.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const target = `${process.platform === "win32" ? "windows" : process.platform}-${process.arch}`;
const binary = path.join(
  root,
  `dist/vnve-${target}${process.platform === "win32" ? ".exe" : ""}`,
);
const args = process.argv.slice(2).filter((arg) => arg !== "--");
const browserLabel =
  args.find((arg) => arg.startsWith("--browser-label="))?.split("=")[1] ??
  "unidentified";
const timeoutSeconds = Number(
  args.find((arg) => arg.startsWith("--timeout="))?.split("=")[1] ?? 300,
);
if (
  args.some((arg) => !/^--(browser-label|timeout)=/.test(arg)) ||
  !Number.isFinite(timeoutSeconds) ||
  timeoutSeconds < 30 ||
  timeoutSeconds > 1800
) {
  throw new Error(
    "Usage: pnpm test:browser [--browser-label=codex-in-app] [--timeout=300]",
  );
}
const directory = path.join(
  root,
  ".scratch/browser-acceptance/runs",
  `${new Date().toISOString().replace(/[:.]/g, "-")}-${randomBytes(3).toString("hex")}`,
);
await mkdir(directory, { recursive: true });
await writeFile(
  path.join(directory, ".vnve-acceptance-owned"),
  "Disposable test run. No user works or credentials.\n",
);
const report = {
  status: "running",
  startedAt: new Date().toISOString(),
  target,
  browserLabel,
  checks: [],
  limitations: [
    "Not an independent host/Skill behavior evaluation or external Provider test.",
    "Programmatic DOM editing does not validate the native OS input method.",
    "One short landscape fixture; not long-film stress, portrait or a cross-platform claim.",
    "Frame checks use the product browser preview bridge and compare image regions, not every pixel of every frame.",
  ],
};
let child,
  server,
  deadline,
  finishing = false,
  fixture,
  origin,
  upstream,
  sessionToken;
let externalApplied = false,
  exportCount = 0;
let delayedExportOpen = false;
const nonce = randomBytes(24).toString("hex");
const prefix = `/__acceptance/${nonce}`;
const nodes = (value) =>
  value.project.acts
    .flatMap((act) => act.scenes)
    .flatMap((scene) => scene.script.nodes);
const plain = (node) =>
  (node.content ?? [{ type: "text", text: node.text }])
    .filter((item) => item.type === "text")
    .map((item) => item.text)
    .join("");
const tags = (node) =>
  (node.content ?? []).filter((item) => item.type === "tag");

async function finish(status, error) {
  if (finishing) return;
  finishing = true;
  clearTimeout(deadline);
  report.status = status;
  if (!report.checks.some((check) => check.id) && report.progress) {
    report.checks.push(...report.progress.checks);
    report.browser = report.progress.browser;
  }
  report.finishedAt = new Date().toISOString();
  if (error)
    report.error = String(error.message ?? error).replaceAll(
      sessionToken ?? nonce,
      "<redacted>",
    );
  if (child && child.exitCode === null && child.signalCode === null) {
    const exited = new Promise((resolve) => child.once("exit", resolve));
    child.kill();
    await Promise.race([
      exited,
      new Promise((resolve) =>
        setTimeout(() => {
          child.kill("SIGKILL");
          resolve();
        }, 2000).unref(),
      ),
    ]);
  }
  server?.close();
  server?.closeAllConnections();
  await writeFile(
    path.join(directory, "report.json"),
    JSON.stringify(report, null, 2),
  );
  const lines = [
    "# 浏览器核心链路验收",
    "",
    `状态：${status}。开始：${report.startedAt}。`,
    `平台：${target}；浏览器标记：${browserLabel}。`,
    "",
    ...report.checks.map(
      (check) =>
        `- ${check.status}: ${check.name}${check.error ? ` — ${check.error}` : ""}`,
    ),
    "",
    ...(report.error ? [`失败原因：${report.error}`, ""] : []),
    "完整环境、源码摘要、视频参数和判定数值见 report.json；workspace 与 inputs 为本次隔离测试产物。",
    "",
    "未覆盖范围：",
    ...report.limitations.map((item) => `- ${item}`),
    "",
  ];
  await writeFile(path.join(directory, "report.md"), lines.join("\n"));
  console.log(
    JSON.stringify({ status, report: path.join(directory, "report.json") }),
  );
  process.exitCode = status === "pass" ? 0 : 1;
}
async function body(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 32 * 1024 * 1024)
      throw new Error("Acceptance request too large");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString() || "{}");
}
function json(res, value, status = 200) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(value));
}
async function productRequest(input) {
  const response = await fetch(`${upstream}/__vnve/api`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${sessionToken}`,
    },
    body: JSON.stringify(input),
    signal: AbortSignal.timeout(15_000),
  });
  const value = await response.json();
  assert.equal(response.ok, true, JSON.stringify(value));
  return value;
}
async function control(input) {
  if (input.action === "progress") {
    report.progress = {
      checks: input.checks,
      browser: input.browser,
      stage: input.stage,
    };
    await writeFile(
      path.join(directory, "report.json"),
      JSON.stringify(report, null, 2),
    );
    return { ok: true };
  }
  if (input.action === "inspect") return fixture.inspect();
  if (input.action === "external") {
    assert.equal(externalApplied, false);
    await fixture.patch([
      { type: "project.update", title: `${title}·外部更新` },
    ]);
    externalApplied = true;
    return { ok: true };
  }
  if (input.action === "recovery")
    return productRequest({ op: "recovery", projectId: fixture.id });
  if (input.action === "compile") return fixture.compile();
  if (input.action === "cancelled") {
    const { readdir } = await import("node:fs/promises");
    const files = await readdir(path.join(fixture.workspace, "exports")).catch(
      (error) => {
        if (error.code === "ENOENT") return [];
        throw error;
      },
    );
    assert.equal(
      files.filter((name) => name.endsWith(".mp4")).length,
      0,
      "Cancelled export committed an MP4",
    );
    return { ok: true };
  }
  if (input.action === "frames") {
    assert.equal(input.frames.length, 3);
    for (const [index, frame] of input.frames.entries()) {
      assert.match(frame.png, /^data:image\/png;base64,/);
      assert.ok(Number.isFinite(frame.time));
      await writeFile(
        path.join(directory, `preview-${index}.png`),
        Buffer.from(frame.png.split(",")[1], "base64"),
      );
    }
    report.frameTimes = input.frames.map((frame) => frame.time);
    return { ok: true };
  }
  if (input.action === "complete") {
    report.checks.push(...input.checks);
    report.browser = input.browser;
    assert.deepEqual(
      input.checks.map((check) => check.id),
      [
        "boot",
        "edit",
        "undo",
        "redo",
        "autosave",
        "reload",
        "external",
        "playback",
        "frames",
        "cancel",
        "export",
        "console",
      ],
    );
    assert.ok(
      input.checks.every((check) => check.status === "pass"),
      "Browser checks failed",
    );
    assert.ok(
      externalApplied && exportCount === 1,
      "Core workflow was not exercised",
    );
    const final = fixture.inspect();
    assert.equal(final.project.meta.title, `${title}·外部更新`);
    assert.ok(
      nodes(final).find((node) => node.id === fixture.line1).audioUrl,
      "Undo did not restore voice",
    );
    const line2 = nodes(final).find((node) => node.id === fixture.line2);
    assert.ok(plain(line2).endsWith("已保存。"));
    assert.deepEqual(tags(line2), fixture.line2Tags);
    await writeFile(
      path.join(directory, "final-inspect.json"),
      JSON.stringify(final, null, 2),
    );
    const compiled = fixture.compile();
    await writeFile(
      path.join(directory, "compile.json"),
      JSON.stringify(compiled, null, 2),
    );
    report.video = await verifyVideo({
      directory,
      fixture,
      compiled,
      frameTimes: report.frameTimes,
    });
    report.checks.push({
      name: "MP4 codecs/duration/decode/frame regions/real speech alignment",
      status: "pass",
    });
    return { done: true };
  }
  if (input.action === "failed") {
    report.checks.push(...input.checks);
    report.browser = input.browser;
    throw new Error(input.error ?? "Browser failure");
  }
  throw new Error("Unknown acceptance action");
}

try {
  execFileSync("ffmpeg", ["-version"], { stdio: "ignore", timeout: 5000 });
  execFileSync("ffprobe", ["-version"], { stdio: "ignore", timeout: 5000 });
  execFileSync(process.execPath, ["scripts/check-skill.mjs"], {
    cwd: root,
    stdio: "pipe",
  });
  report.sourceDigest = await sourceDigest(new URL("../../", import.meta.url));
  report.git = {
    commit: execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: root,
      encoding: "utf8",
    }).trim(),
    dirty:
      execFileSync("git", ["status", "--porcelain"], {
        cwd: root,
        encoding: "utf8",
      }).trim().length > 0,
  };
  report.suiteDigest = createHash("sha256")
    .update(await readFile(fileURLToPath(import.meta.url)))
    .update(await readFile(new URL("./suite.js", import.meta.url)))
    .update(await readFile(new URL("./fixture.mjs", import.meta.url)))
    .update(await readFile(new URL("./verify-video.mjs", import.meta.url)))
    .digest("hex");
  report.voiceSha256 = createHash("sha256")
    .update(await readFile(new URL("./fixtures/voice.wav", import.meta.url)))
    .digest("hex");
  assert.equal(
    report.voiceSha256,
    "051d777b58b052155ad7a4f7777fc60d90755d9322dd90c8ef4706d789a25cb9",
    "Voice fixture changed",
  );
  fixture = await prepareFixture({ root, directory, binary });
  report.doctor = fixture.doctor;
  await copyFile(fixture.voice, path.join(directory, "voice.wav"));
  report.checks.push({
    name: "Fresh standalone binary, isolated real-media fixture, deterministic animation",
    status: "pass",
  });
  const launch = await new Promise((resolve, reject) => {
    child = spawn(
      binary,
      ["serve", fixture.workspace, "--project", fixture.id],
      {
        cwd: directory,
        stdio: ["ignore", "pipe", "pipe"],
        env: { ...process.env, BUN_BE_BUN: "0" },
      },
    );
    let output = "";
    const timer = setTimeout(
      () => reject(new Error("CLI serve startup timed out")),
      15_000,
    );
    child.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`CLI serve exited (${code})`));
    });
    // Never persist the launch URL, cookies or raw server stderr.
    child.stderr.resume();
    child.stdout.on("data", (chunk) => {
      output += chunk;
      const match = output.match(/http:\/\/127\.0\.0\.1:\d+\/[^\s]+/);
      if (match) {
        clearTimeout(timer);
        resolve(new URL(match[0]));
      }
    });
  });
  upstream = launch.origin;
  sessionToken = new URLSearchParams(launch.hash.slice(1)).get("session");
  assert.ok(sessionToken);
  const suite = await readFile(new URL("./suite.js", import.meta.url));
  server = createServer(async (req, res) => {
    try {
      if (
        req.headers.host !== new URL(origin).host ||
        (req.headers.origin && req.headers.origin !== origin) ||
        req.headers["sec-fetch-site"] === "cross-site"
      )
        return json(res, { error: "Origin refused" }, 403);
      const url = new URL(req.url, origin);
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("Referrer-Policy", "no-referrer");
      if (url.pathname === `${prefix}/suite.js` && req.method === "GET") {
        res.writeHead(200, { "Content-Type": "text/javascript" });
        return res.end(suite);
      }
      if (url.pathname === `${prefix}/run` && req.method === "POST") {
        try {
          const input = await body(req);
          const result = await control(input);
          json(res, result);
          if (result.done) setImmediate(() => void finish("pass"));
        } catch (error) {
          json(res, { error: error.message }, 500);
          setImmediate(() => void finish("fail", error));
        }
        return;
      }
      if (url.pathname === `${prefix}/` && req.method === "GET") {
        const config = {
          prefix,
          id: fixture.id,
          scene1: fixture.scene1,
          scene2: fixture.scene2,
          line1: fixture.line1,
          line2: fixture.line2,
          launch: `/?project=${fixture.id}#session=${sessionToken}`,
        };
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        return res.end(
          `<!doctype html><html lang="zh"><meta charset="utf-8"><title>vnve 浏览器验收</title><style>body{margin:0;background:#141518;color:#ddd;font:13px system-ui}header{padding:8px 16px;height:36px}iframe{width:100%;height:calc(100vh - 56px);border:0}</style><header id="status">正在自动验收；请保持此页打开。结果写入本地报告。</header><iframe id="editor" allow="autoplay"></iframe><script>window.acceptance=${JSON.stringify(config)}</script><script type="module" src="${prefix}/suite.js"></script></html>`,
        );
      }
      // Test-only same-origin proxy: production HTML and APIs are unchanged. Credentials and system openers are never accessible.
      if (
        url.pathname === "/__vnve/credentials" ||
        url.pathname === "/__vnve/exports/open"
      )
        return json(res, { error: "Outside acceptance scope" }, 403);
      if (url.pathname.startsWith("/__acceptance/"))
        return json(res, { error: "Not found" }, 404);
      // Delay the first real file HEAD so cancellation during asynchronous output
      // preparation is reproducible even on a fast disk. No response is mocked.
      if (
        !delayedExportOpen &&
        req.method === "HEAD" &&
        url.pathname === "/files" &&
        url.searchParams.get("path")?.startsWith("exports/")
      ) {
        delayedExportOpen = true;
        await new Promise((resolve) => setTimeout(resolve, 400));
      }
      if (
        req.method === "PUT" &&
        url.pathname === "/files" &&
        url.searchParams.get("path")?.endsWith(".mp4")
      )
        exportCount++;
      const headers = { ...req.headers, host: new URL(upstream).host };
      if (headers.origin) headers.origin = upstream;
      if (headers.referer) headers.referer = `${upstream}/`;
      const proxied = request(
        `${upstream}${req.url}`,
        { method: req.method, headers },
        (response) => {
          res.writeHead(response.statusCode, response.headers);
          response.pipe(res);
        },
      );
      proxied.on("error", () => {
        if (!res.headersSent) json(res, { error: "CLI transport failed" }, 502);
        else res.destroy();
      });
      req.pipe(proxied);
    } catch (error) {
      json(res, { error: error.message }, 500);
    }
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  origin = `http://127.0.0.1:${server.address().port}`;
  console.log(
    JSON.stringify({
      status: "ready",
      url: `${origin}${prefix}/`,
      reportDirectory: directory,
      timeoutSeconds,
    }),
  );
  deadline = setTimeout(
    () =>
      void finish(
        "blocked",
        new Error(
          "No browser completion before deadline; open the ready URL in a real browser.",
        ),
      ),
    timeoutSeconds * 1000,
  );
  child.once("exit", () => {
    if (!finishing)
      void finish(
        "fail",
        new Error("CLI server stopped before browser completion"),
      );
  });
} catch (error) {
  await finish(fixture ? "fail" : "blocked", error);
}
process.once("SIGINT", () => void finish("blocked", new Error("Interrupted")));
process.once("SIGTERM", () => void finish("blocked", new Error("Terminated")));
