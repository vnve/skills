import { exportFilePath, openExportFile } from "./export-files.mjs";
import { previewBridge } from "./preview-bridge.mjs";
import { createServer } from "node:http";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { openWorkspaceFiles } from "../workspace/workspace-files.mjs";
import { credentialStore } from "./credentials.mjs";

const mime = {
  avif: "image/avif",
  m4a: "audio/mp4",
  aac: "audio/aac",
  flac: "audio/flac",
  otf: "font/otf",
  woff: "font/woff",
  html: "text/html; charset=utf-8",
  js: "text/javascript",
  css: "text/css",
  svg: "image/svg+xml",
  ico: "image/x-icon",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  mp4: "video/mp4",
  webm: "video/webm",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  ogg: "audio/ogg",
  json: "application/json",
  woff2: "font/woff2",
  ttf: "font/ttf",
};
function json(res, status, value) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(value));
}
async function body(req, max) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > max)
      throw Object.assign(new Error("Request too large"), {
        code: "TOO_LARGE",
      });
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

/** Same-origin browser editor and loopback-only workspace transport. */
export async function startWorkspaceServer({
  directory,
  port = 0,
  maxUploadBytes = 512 * 1024 * 1024,
  workspace,
  webRoot,
  devOrigin,
  credentialsDirectory = undefined,
  webFiles = Object.create(null),
  launchExport = openExportFile,
}) {
  const previews = previewBridge();
  const credentials = credentialStore(credentialsDirectory);
  if (devOrigin && !/^http:\/\/127\.0\.0\.1:\d+$/.test(devOrigin))
    throw new Error(
      "Development origin must be an explicit loopback HTTP port",
    );
  const files = workspace?.files ?? (await openWorkspaceFiles(directory));
  const staticRoot = webRoot ? await realpath(webRoot) : null;
  const token = randomBytes(32).toString("hex");
  const cookieName = `vnve_${randomBytes(8).toString("hex")}`;
  let origin;
  const matchesToken = (value) => {
    const bytes = Buffer.from(value ?? "");
    const expected = Buffer.from(token);
    return bytes.length === expected.length && timingSafeEqual(bytes, expected);
  };
  const server = createServer(async (req, res) => {
    try {
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Referrer-Policy", "no-referrer");
      res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
      if (
        req.headers.host !== new URL(origin).host ||
        (req.headers.origin && req.headers.origin !== origin) ||
        req.headers["sec-fetch-site"] === "cross-site"
      ) {
        json(res, 403, {
          code: "FORBIDDEN_ORIGIN",
          message: "Local workspace origin required",
        });
        return;
      }
      const url = new URL(req.url, origin);
      if (url.pathname === "/__vnve/session" && req.method === "POST") {
        if (!matchesToken(req.headers.authorization?.replace(/^Bearer /, ""))) {
          json(res, 401, { code: "UNAUTHORIZED" });
          return;
        }
        res.setHeader(
          "Set-Cookie",
          `${cookieName}=${token}; HttpOnly; SameSite=Strict; Path=/`,
        );
        json(res, 200, { ok: true });
        return;
      }
      const cookies = (req.headers.cookie ?? "")
        .split(";")
        .map((item) => item.trim());
      const authenticated =
        matchesToken(req.headers.authorization?.replace(/^Bearer /, "")) ||
        cookies.some((item) => item === `${cookieName}=${token}`);
      const api =
        [
          "/files",
          "/__vnve/api",
          "/__vnve/config",
          "/__vnve/credentials",
          "/__vnve/exports/open",
        ].includes(url.pathname) || url.pathname.startsWith("/__vnve/preview");
      if (api && !authenticated) {
        json(res, 401, {
          code: "UNAUTHORIZED",
          message: "Workspace session required; reopen the launch URL",
        });
        return;
      }
      if (url.pathname === "/__vnve/preview/next" && req.method === "GET") {
        json(res, 200, previews.next());
        return;
      }
      if (url.pathname === "/__vnve/preview" && req.method === "POST") {
        const input = JSON.parse((await body(req, 16384)).toString());
        json(res, 200, await previews.request(input));
        return;
      }
      if (url.pathname === "/__vnve/preview/result" && req.method === "POST") {
        const input = JSON.parse(
          (await body(req, 64 * 1024 * 1024)).toString(),
        );
        json(res, 200, { ok: previews.complete(input) });
        return;
      }
      if (url.pathname === "/__vnve/config" && req.method === "GET") {
        json(res, 200, {
          localWorkspace: true,
          exportsDirectory: path.join(await realpath(directory), "exports"),
        });
        return;
      }
      if (url.pathname === "/__vnve/exports/open" && req.method === "POST") {
        const input = JSON.parse((await body(req, 4096)).toString());
        const file = await exportFilePath(directory, input?.name);
        await launchExport(file);
        json(res, 200, { ok: true, path: file });
        return;
      }
      if (url.pathname === "/__vnve/credentials" && req.method === "POST") {
        let input;
        try {
          input = JSON.parse((await body(req, 32 * 1024)).toString());
        } catch (error) {
          if (error.code === "TOO_LARGE") throw error;
          json(res, 400, { code: "INVALID_DOCUMENT" });
          return;
        }
        if (!input || typeof input !== "object" || Array.isArray(input)) {
          json(res, 400, { code: "INVALID_DOCUMENT" });
          return;
        }
        try {
          json(res, 200, await credentials.execute(input));
        } catch (error) {
          // Return only known metadata; parsing and filesystem messages can contain secrets.
          const credentialCodes = [
            "CREDENTIAL_READ_FAILED",
            "CREDENTIAL_FORMAT_INVALID",
            "CREDENTIAL_WRITE_FAILED",
            "CREDENTIAL_COMMIT_FAILED",
          ];
          if (credentialCodes.includes(error.code))
            json(res, 500, { code: error.code, reason: error.reason });
          else if (error.code === "INVALID_DOCUMENT")
            json(res, 400, { code: error.code, field: error.field });
          else throw error;
        }
        return;
      }
      if (
        url.pathname === "/__vnve/api" &&
        req.method === "POST" &&
        workspace
      ) {
        let input;
        try {
          input = JSON.parse((await body(req, 16 * 1024 * 1024)).toString());
        } catch (error) {
          if (error.code === "TOO_LARGE") throw error;
          json(res, 400, {
            code: "INVALID_DOCUMENT",
            message: "Invalid JSON request",
          });
          return;
        }
        if (!input || typeof input !== "object" || Array.isArray(input)) {
          json(res, 400, { code: "INVALID_DOCUMENT" });
          return;
        }
        json(res, 200, await workspace.execute(input));
        return;
      }
      if (url.pathname === "/files") {
        const name = url.searchParams.get("path");
        res.setHeader("Content-Security-Policy", "sandbox");
        if (req.method === "GET" || req.method === "HEAD") {
          const file = await files.media(name);
          if (!file) {
            json(res, 404, { code: "NOT_FOUND" });
            return;
          }
          const size = file.size;
          res.setHeader("ETag", `"${file.revision}"`);
          res.setHeader("Cache-Control", "no-store");
          res.setHeader(
            "Content-Type",
            mime[name.split(".").pop()?.toLowerCase()] ??
              "application/octet-stream",
          );
          res.setHeader("Accept-Ranges", "bytes");
          let start = 0;
          let end = size - 1;
          if (req.headers.range) {
            const match = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
            if (match && (match[1] || match[2])) {
              start = match[1]
                ? Number(match[1])
                : Math.max(0, size - Number(match[2]));
              end =
                match[1] && match[2]
                  ? Math.min(Number(match[2]), size - 1)
                  : size - 1;
            }
            if (
              !match ||
              (!match[1] && !match[2]) ||
              start > end ||
              start >= size ||
              !Number.isSafeInteger(start) ||
              !Number.isSafeInteger(end)
            ) {
              res.writeHead(416, { "Content-Range": `bytes */${size}` });
              res.end();
              return;
            }
            res.statusCode = 206;
            res.setHeader("Content-Range", `bytes ${start}-${end}/${size}`);
          }
          res.setHeader("Content-Length", Math.max(0, end - start + 1));
          if (req.method === "HEAD" || size === 0) res.end();
          else await pipeline(file.stream(start, end), res);
          return;
        }
        if (req.method === "PUT" || req.method === "DELETE") {
          const expected = req.headers["if-match"];
          const creating = req.headers["if-none-match"] === "*";
          if (
            (!creating && !/^"[a-f0-9]{64}"$/.test(expected ?? "")) ||
            (creating && expected)
          ) {
            json(res, 428, {
              code: "REVISION_REQUIRED",
              message: "Use If-Match or If-None-Match: *",
            });
            return;
          }
          if (req.method === "DELETE") {
            if (!workspace?.removeMedia)
              throw Object.assign(
                new Error(
                  "Workspace reference checks required before deleting media",
                ),
                {
                  code: "INVALID_OPERATION",
                },
              );
            await workspace.removeMedia(name, expected?.slice(1, -1));
            json(res, 200, { ok: true });
            return;
          }
          // Export files can be large; both upload and media download stream through disk.
          const limit = name?.startsWith("exports/")
            ? 4 * 1024 ** 3
            : maxUploadBytes;
          const declared = Number(req.headers["content-length"]);
          if (declared > limit) {
            req.resume();
            json(res, 413, { code: "TOO_LARGE" });
            return;
          }
          json(
            res,
            200,
            await files.writeStream(
              name,
              req,
              creating ? null : expected.slice(1, -1),
              limit,
            ),
          );
          return;
        }
        res.setHeader("Allow", "GET, HEAD, PUT, DELETE");
        json(res, 405, { code: "METHOD_NOT_ALLOWED" });
        return;
      }
      if (devOrigin && !api && ["GET", "HEAD"].includes(req.method)) {
        const response = await fetch(new URL(req.url, devOrigin), {
          method: req.method,
          redirect: "error",
        });
        res.writeHead(response.status, {
          "Content-Type":
            response.headers.get("content-type") ?? "application/octet-stream",
          "Cache-Control": "no-store",
        });
        if (response.body && req.method !== "HEAD")
          await pipeline(response.body, res);
        else res.end();
        return;
      }
      if (
        Object.keys(webFiles).length &&
        ["GET", "HEAD"].includes(req.method)
      ) {
        const relative =
          decodeURIComponent(url.pathname).replace(/^\/+/, "") || "index.html";
        const embedded = Object.hasOwn(webFiles, relative)
          ? webFiles[relative]
          : undefined;
        if (!embedded) {
          json(res, 404, { code: "NOT_FOUND" });
          return;
        }
        let bytes = await readFile(embedded);
        if (relative === "index.html")
          bytes = Buffer.from(
            bytes.toString().replace("<html", '<html data-vnve-local="true"'),
          );
        res.writeHead(200, {
          "Content-Type":
            mime[path.extname(relative).slice(1)] ?? "application/octet-stream",
          "Cache-Control": "no-store",
        });
        res.end(req.method === "HEAD" ? undefined : bytes);
        return;
      }
      if (staticRoot && ["GET", "HEAD"].includes(req.method)) {
        const relative =
          decodeURIComponent(url.pathname).replace(/^\/+/, "") || "index.html";
        const file = path.resolve(staticRoot, relative);
        if (!file.startsWith(`${staticRoot}${path.sep}`)) {
          json(res, 404, { code: "NOT_FOUND" });
          return;
        }
        let resolved;
        try {
          resolved = await realpath(file);
        } catch {
          json(res, 404, { code: "NOT_FOUND" });
          return;
        }
        if (!resolved.startsWith(`${staticRoot}${path.sep}`)) {
          json(res, 404, { code: "NOT_FOUND" });
          return;
        }
        let bytes = await readFile(resolved);
        if (path.basename(file) === "index.html")
          bytes = Buffer.from(
            bytes.toString().replace("<html", '<html data-vnve-local="true"'),
          );
        res.writeHead(200, {
          "Content-Type":
            mime[path.extname(file).slice(1)] ?? "application/octet-stream",
          "Cache-Control": "no-store",
        });
        res.end(req.method === "HEAD" ? undefined : bytes);
        return;
      }
      json(res, 404, { code: "NOT_FOUND" });
    } catch (error) {
      if (res.headersSent || res.destroyed) {
        res.destroy();
        return;
      }
      const status =
        {
          INVALID_PATH: 400,
          INVALID_DOCUMENT: 400,
          INVALID_OPERATION: 400,
          NOT_FOUND: 404,
          CONFLICT: 409,
          REVISION_REQUIRED: 428,
          TOO_LARGE: 413,
          WORKSPACE_BUSY: 423,
          RECOVERY_REQUIRED: 503,
        }[error.code] ?? 500;
      json(res, status, {
        code: status === 500 ? "IO_ERROR" : error.code,
        message:
          status === 500
            ? "Workspace operation failed; reload before retrying a save"
            : error.message,
        ...(error.current ? { current: error.current } : {}),
      });
    }
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });
  origin = `http://127.0.0.1:${server.address().port}`;
  return {
    origin,
    token,
    close: () =>
      new Promise((resolve, reject) => {
        previews.close();
        server.close((error) => (error ? reject(error) : resolve()));
        server.closeIdleConnections();
      }),
  };
}
