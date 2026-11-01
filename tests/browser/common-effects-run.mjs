import { build } from "esbuild";
import { createServer } from "node:http";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
const root = process.cwd(),
  directory = path.join(root, ".scratch/common-effects/acceptance");
await mkdir(directory, { recursive: true });
await build({
  entryPoints: ["tests/browser/common-effects-fixture.ts"],
  outfile: path.join(directory, "fixture.mjs"),
  bundle: true,
  platform: "node",
  format: "esm",
});
const { commonProjects } = await import(path.join(directory, "fixture.mjs"));
const projects = JSON.stringify(commonProjects());
await build({
  entryPoints: ["tests/browser/common-effects-page.ts"],
  outfile: path.join(directory, "page.js"),
  bundle: true,
  platform: "browser",
  format: "esm",
});
const art = {
  neutral: "character/校园-女1/默认.webp",
  serious: "character/校园-男1/愤怒.webp",
  classroom: "background/校园-教室/默认.webp",
  corridor: "background/校园-走廊/默认.webp",
};
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://localhost").pathname;
    const name = url.match(/^\/art\/([a-z]+)\.webp$/)?.[1];
    if (name && art[name]) {
      res.setHeader("Content-Type", "image/webp");
      return res.end(
        await readFile(path.join(root, "skills/vnve/assets", art[name])),
      );
    }
    if (url === "/projects.json") {
      res.setHeader("Content-Type", "application/json");
      return res.end(projects);
    }
    if (url === "/page.js") {
      res.setHeader("Content-Type", "application/javascript");
      return res.end(await readFile(path.join(directory, "page.js")));
    }
    if (url.startsWith("/out/") && req.method === "POST") {
      const name = url.slice(5);
      if (
        !/^(transition-cut|transition-dissolve|transition-fade-black|transition-fade-white|transition-wipe-left|transition-wipe-right|transition-soft-dissolve|camera-push|camera-pull|camera-duo|camera-rackfocus|camera-parallax|portrait-soft)(-[0-2])?\.(png|mp4)$/.test(
          name,
        )
      )
        throw Error("Invalid output");
      const chunks = [];
      for await (const c of req) chunks.push(c);
      await writeFile(path.join(directory, name), Buffer.concat(chunks));
      return res.end("ok");
    }
    if (url === "/report" && req.method === "POST") {
      let body = "";
      for await (const c of req) body += c;
      await writeFile(path.join(directory, "report.json"), body);
      res.end("ok");
      return;
    }
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.end(
      '<!doctype html><title>常用演出与精选转场验收</title><style>body{background:#151619;color:#eee;font:15px system-ui;padding:30px}</style><pre>开始验收</pre><script type="module" src="/page.js"></script>',
    );
  } catch (e) {
    res.statusCode = 500;
    res.end(String(e));
  }
});
server.listen(0, "127.0.0.1", () =>
  console.log(
    JSON.stringify({
      url: `http://127.0.0.1:${server.address().port}`,
      directory,
    }),
  ),
);
