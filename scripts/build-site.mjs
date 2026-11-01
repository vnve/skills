import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import content from "../site/content.mjs";
const out = resolve(process.argv[2] || ".dev/site");
const base = "https://vnve.github.io/skills/";
const repo = "https://github.com/vnve/skills";
const doc = `${repo}/blob/main/skills/vnve/`;
const esc = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (x) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        x
      ],
  );
const file = async (name, text) => {
  const dest = resolve(out, name);
  await mkdir(dirname(dest), { recursive: true });
  await writeFile(dest, text);
};
await mkdir(out, { recursive: true });
await cp("site/assets", resolve(out, "assets"), { recursive: true });
await cp("site/styles.css", resolve(out, "assets/styles.css"));
await cp("site/main.js", resolve(out, "assets/main.js"));
await cp("docs/media/vnve-demo-1080p.mp4", resolve(out, "assets/demo.mp4"));
for (const [locale, c] of Object.entries(content)) {
  const prefix = locale === "zh" ? "./" : "../";
  const current = locale === "zh" ? base : `${base}en/`;
  const language = locale === "zh" ? "en/" : "../";
  const labels = ["darwin-arm64", "linux-x64", "windows-x64.exe"];
  const types = ["introduce", "comic", "particles"];
  const jsonld = [
    {
      "@context": "https://schema.org",
      "@type": "SoftwareSourceCode",
      name: "VNVE Skill",
      description: c.description,
      codeRepository: repo,
      programmingLanguage: "TypeScript",
      license: "https://opensource.org/license/mit",
      url: current,
    },
    {
      "@context": "https://schema.org",
      "@type": "VideoObject",
      name: c.demo,
      description: c.description,
      thumbnailUrl: `${base}assets/story.jpg`,
      contentUrl: `${base}assets/demo.mp4`,
      uploadDate: "2026-11-01T00:00:00+08:00",
      duration: "PT25S",
    },
  ];
  const html = `<!doctype html>
<html lang="${c.lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(c.title)}</title><meta name="description" content="${esc(c.description)}"><meta name="theme-color" content="#0b0e13"><link rel="canonical" href="${current}"><link rel="alternate" hreflang="zh-CN" href="${base}"><link rel="alternate" hreflang="en" href="${base}en/"><link rel="alternate" hreflang="x-default" href="${base}"><meta property="og:type" content="website"><meta property="og:site_name" content="VNVE"><meta property="og:title" content="${esc(c.title)}"><meta property="og:description" content="${esc(c.description)}"><meta property="og:url" content="${current}"><meta property="og:image" content="${base}assets/story.jpg"><meta name="twitter:card" content="summary_large_image"><link rel="icon" href="${prefix}assets/favicon.svg" type="image/svg+xml"><link rel="stylesheet" href="${prefix}assets/styles.css"><link rel="preload" href="${prefix}assets/story.jpg" as="image"><script type="application/ld+json">${JSON.stringify(jsonld).replace(/</g, "\\u003c")}</script><script src="${prefix}assets/main.js" defer></script></head><body>
<a class="skip" href="#main">${c.accessibility}</a><header class="header"><nav class="nav wrap" aria-label="${locale === "zh" ? "主导航" : "Main navigation"}"><a class="brand" href="${prefix}" aria-label="VNVE home">VNV<span>E</span></a><div class="nav-links"><a href="#capabilities">${c.nav[0]}</a><a href="#workflow">${c.nav[1]}</a><a href="#install">${c.nav[2]}</a><a href="${repo}">GitHub ↗</a></div><a class="language" href="${language}" lang="${locale === "zh" ? "en" : "zh-CN"}">${c.switch}</a></nav></header>
<main id="main"><section class="hero wrap" lang="${c.lang}"><div class="hero-copy"><p class="eyebrow">${c.eyebrow}</p><h1>${c.hero}</h1><p class="intro">${c.intro}</p><div class="actions"><a class="primary" href="#install">${c.start}</a><a class="secondary" href="${repo}">${c.repo}<span aria-hidden="true">↗</span></a></div></div><figure class="hero-media" style="margin:0"><div class="media-top"><span>VNVE / VISUAL STORIES</span><span>${c.demo}</span></div><video controls muted playsinline preload="none" poster="${prefix}assets/story.jpg" width="1920" height="1080" aria-label="${c.demo}"><source src="${prefix}assets/demo.mp4" type="video/mp4"><a href="${prefix}assets/demo.mp4">MP4</a></video><figcaption class="caption">${c.demoNote}</figcaption></figure></section>
<section class="section" id="capabilities"><div class="wrap"><h2>${c.features}</h2><p class="section-intro">${c.featureIntro}</p><div class="showcase"><div><div class="tabs" role="group" aria-label="${c.demoPlay}">${c.tabs.map((t, i) => `<button type="button" aria-pressed="${i === 0}" data-example="${prefix}assets/${types[i]}.mp4">${esc(t)}</button>`).join("")}</div><video id="example-video" controls muted loop playsinline preload="none" poster="${prefix}assets/introduce.jpg" width="960" height="540" aria-label="${c.tabs[0]}"><source src="${prefix}assets/introduce.mp4" type="video/mp4"></video><p class="caption">${c.demoPlay}</p></div><div class="capabilities">${c.capabilities.map(([h, p]) => `<article><h3>${h}</h3><p>${p}</p></article>`).join("")}</div></div></div></section>
<section class="section" id="workflow"><div class="wrap"><h2>${c.workflow}</h2><div class="flow">${c.flow.map(([h, p]) => `<article class="flow-item"><h3>${h}</h3><p>${p}</p></article>`).join("")}</div><div class="editor-frame"><div class="editor-note"><p>${c.flow[2][1]}</p><a href="${repo}/blob/main/README${locale === "en" ? ".en" : ""}.md">${c.docs} ↗</a></div><img src="${prefix}assets/editor.jpg" alt="${c.editorAlt}" width="1280" height="720" loading="lazy"></div><p class="caption">${c.technicalNote}</p></div></section>
<section class="section" id="install"><div class="wrap install-grid"><div class="install-copy"><h2>${c.install}</h2><p>${c.installIntro}</p></div><div class="install-box"><p class="field-label">${c.promptLabel}</p><p class="prompt">${c.prompt}</p><p class="field-label command-label">${c.cliLabel}</p><div class="command"><code>npx skills add vnve/skills --skill vnve</code><button class="copy" type="button" data-copy="npx skills add vnve/skills --skill vnve" data-label="${c.copy}" data-success="${c.copied}" data-failure="${c.failed}" aria-live="polite">${c.copy}</button></div><div class="binary"><h3>${c.binaryTitle}</h3><p>${c.binaryText}</p><div class="downloads">${c.binaries.map((name, i) => `<a href="${repo}/releases/download/cli-v0.3.0/vnve-${labels[i]}">${name} ↗</a>`).join("")}</div><a class="guide" href="${doc}references/installation.md">${c.guide} ↗</a><p>${c.morePlatforms}</p></div></div></div></section>
<section class="section"><div class="wrap faq-grid"><h2>${c.faqTitle}</h2><div>${c.faqs.map(([q, a], i) => `<details${i === 0 ? " open" : ""}><summary>${q}</summary><p>${a}</p></details>`).join("")}</div></div></section></main>
<footer><div class="wrap"><div><a class="brand" href="${prefix}">VNV<span>E</span></a><p>${c.footer}</p></div><nav aria-label="${locale === "zh" ? "相关链接" : "Related links"}"><a href="${repo}">GitHub</a><a href="${doc}SKILL.md">${c.docs}</a><a href="${prefix}llms.txt">${c.index}</a><a href="${repo}/blob/main/LICENSE">${c.license}</a></nav></div></footer></body></html>`;
  await file(locale === "zh" ? "index.html" : "en/index.html", html);
}
await file(
  "assets/favicon.svg",
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="12" fill="#0b0e13"/><text x="11" y="47" font-family="sans-serif" font-weight="800" font-size="45" fill="#357df2">V</text></svg>',
);
await file(
  "sitemap.xml",
  `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${base}</loc></url><url><loc>${base}en/</loc></url></urlset>`,
);
await file(
  "robots.txt",
  `User-agent: *\nAllow: /skills/\nSitemap: ${base}sitemap.xml\n`,
);
let index = await readFile("llms.txt", "utf8");
index = index.replace(
  /\]\((?!https?:)([^)#]+)(#[^)]*)?\)/g,
  (_, path, hash = "") => `](${repo}/blob/main/${path}${hash})`,
);
await file(
  "llms.txt",
  `# VNVE website\n\n- [中文首页](${base})\n- [English homepage](${base}en/)\n- [Sitemap](${base}sitemap.xml)\n\n${index}`,
);
await file(
  "404.html",
  `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Page not found | VNVE</title><body style="background:#0b0e13;color:#f2f3f6;font:20px system-ui;padding:10vw"><h1>Page not found</h1><p><a style="color:#93baff" href="${base}">VNVE 首页 / Home</a></p></body></html>`,
);
await file(".nojekyll", "");
console.log(`Built bilingual static site: ${out}`);
