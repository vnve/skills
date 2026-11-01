import { build } from "esbuild";
import { createServer } from "node:http";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../../", import.meta.url));
const directory = path.join(root, ".scratch/visual-primitives/acceptance");
await mkdir(directory, { recursive: true });
await build({
  entryPoints: [path.join(root, "tests/browser/visual-primitives-fixture.ts")],
  outfile: path.join(directory, "fixture.mjs"),
  bundle: true,
  platform: "node",
  format: "esm",
});
const { visualFixtures, scenarioProjects } = await import(
  path.join(directory, "fixture.mjs")
);
const fixture = JSON.stringify(visualFixtures());
const scenarios = JSON.stringify(scenarioProjects());
await build({
  entryPoints: [path.join(root, "tests/browser/visual-primitives-page.ts")],
  outfile: path.join(directory, "page.js"),
  bundle: true,
  platform: "browser",
  format: "esm",
});
const server = createServer(async (req, res) => {
  try {
    const art = {
      neutral: "character/校园-女1/默认.webp",
      happy: "character/校园-女1/开心.webp",
      surprised: "character/校园-女1/惊讶.webp",
      classroom: "background/校园-教室/默认.webp",
    };
    const artName = req.url?.match(/^\/art\/([a-z]+)\.webp$/)?.[1];
    if (artName && art[artName]) {
      res.setHeader("Content-Type", "image/webp");
      return res.end(
        await readFile(path.join(root, "skills/vnve/assets", art[artName])),
      );
    }
    if (req.url === "/scenarios.json") {
      res.setHeader("Content-Type", "application/json");
      return res.end(scenarios);
    }
    if (req.url?.startsWith("/video/") && req.method === "POST") {
      const name = req.url.slice(7);
      if (!/^(daily|impact|dream)\.mp4$/.test(name))
        throw Error("Invalid video");
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      await writeFile(path.join(directory, name), Buffer.concat(chunks));
      res.end("ok");
      return;
    }
    if (req.url === "/fixture.json") {
      res.setHeader("Content-Type", "application/json");
      return res.end(fixture);
    }
    if (req.url === "/page.js") {
      res.setHeader("Content-Type", "application/javascript");
      return res.end(await readFile(path.join(directory, "page.js")));
    }
    if (req.url === "/report" && req.method === "POST") {
      let body = "";
      for await (const chunk of req) body += chunk;
      await writeFile(path.join(directory, "report.json"), body);
      res.end("ok");
      server.close();
      return;
    }
    if (req.url?.startsWith("/frame/") && req.method === "POST") {
      const name = req.url.slice(7);
      if (!/^[a-z0-9-]+\.png$/.test(name)) throw Error("Invalid frame name");
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      await writeFile(path.join(directory, name), Buffer.concat(chunks));
      res.end("ok");
      return;
    }
    res.setHeader("Content-Type", "text/html");
    res.end(
      '<!doctype html><meta charset="utf-8"><title>视觉原子能力验收</title><style>body{background:#15171b;color:#eee;font:14px system-ui}canvas{max-width:960px}</style><h1>视觉原子能力验收</h1><pre id="status">运行中</pre><div id="preview"></div><script type="module" src="/page.js"></script>',
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
