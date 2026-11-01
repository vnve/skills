// Runs only in the acceptance harness, against the unmodified production editor iframe.
const config = window.acceptance;
const frame = document.querySelector("#editor");
const checks = [];
const errors = [];
const layoutNotifications = [];
let previewFrames = [];
const label = document.querySelector("#status");
const browser = {
  userAgent: navigator.userAgent,
  platform: navigator.platform,
  viewport: [innerWidth, innerHeight],
};
const doc = () => frame.contentDocument;
const context = () => {
  const pre = doc()?.querySelector("[data-vnve-context] pre");
  return pre ? JSON.parse(pre.textContent) : undefined;
};
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function wait(name, predicate, timeout = 15_000) {
  const deadline = performance.now() + timeout;
  while (performance.now() < deadline) {
    const result = await predicate();
    if (result) return result;
    await pause(100);
  }
  throw new Error(`Timed out: ${name}`);
}
async function host(action, extra = {}) {
  const response = await fetch(`${config.prefix}/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...extra }),
  });
  const value = await response.json();
  if (!response.ok) throw new Error(value.error ?? "Acceptance host failed");
  return value;
}
const allNodes = (value) =>
  value.project.acts
    .flatMap((act) => act.scenes)
    .flatMap((scene) => scene.script.nodes);
const node = (value, id) => allNodes(value).find((item) => item.id === id);
const plain = (value) =>
  (value.content ?? [{ type: "text", text: value.text }])
    .filter((item) => item.type === "text")
    .map((item) => item.text)
    .join("");
const tags = (value) =>
  (value.content ?? []).filter((item) => item.type === "tag");
const button = (name) =>
  [...doc().querySelectorAll("button")].find(
    (item) =>
      (item.getAttribute("aria-label") ?? item.textContent.trim()) === name,
  );
async function click(name) {
  const target = await wait(`button ${name}`, () => {
    const target = button(name);
    return target && !target.disabled && target;
  });
  target.click();
}
async function step(id, name, run) {
  label.textContent = `正在验收：${name}`;
  await host("progress", { checks, browser, stage: id });
  const startedAt = performance.now();
  try {
    const evidence = await run();
    checks.push({
      id,
      name,
      status: "pass",
      milliseconds: Math.round(performance.now() - startedAt),
      ...evidence,
    });
  } catch (error) {
    checks.push({ id, name, status: "fail", error: error.message });
    throw error;
  }
}
function watch() {
  frame.contentWindow.addEventListener("error", (event) => {
    // Chromium emits this scheduling notice without a thrown Error when a
    // ResizeObserver delivery is deferred. Preserve it separately; never hide
    // thrown exceptions or console.error, even if their text is identical.
    if (
      !event.error &&
      event.message ===
        "ResizeObserver loop completed with undelivered notifications."
    ) {
      layoutNotifications.push(event.message);
    } else errors.push(event.message);
  });
  frame.contentWindow.addEventListener("unhandledrejection", (event) =>
    errors.push(String(event.reason)),
  );
  const original = frame.contentWindow.console.error;
  frame.contentWindow.console.error = (...args) => {
    errors.push(args.map(String).join(" "));
    original.apply(frame.contentWindow.console, args);
  };
}
frame.addEventListener("load", watch);
async function append(id, text) {
  const row = await wait("dialogue row", () =>
    doc().querySelector(`[data-vnve-kind="dialogue"][data-vnve-id="${id}"]`),
  );
  row.click();
  const editor = await wait("editable dialogue", () =>
    row.querySelector('[contenteditable="true"]'),
  );
  editor.focus();
  const selection = frame.contentWindow.getSelection();
  const range = doc().createRange();
  range.selectNodeContents(editor);
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
  // Rich editors handle beforeinput; execCommand alone can mutate only the DOM.
  // A multi-character edit takes Slate's controlled input path, through its DOM listener.
  await pause(100);
  const event = new frame.contentWindow.InputEvent("beforeinput", {
    bubbles: true,
    cancelable: true,
    inputType: "insertText",
    data: text,
  });
  editor.dispatchEvent(event);
  assert(event.defaultPrevented, "Rich editor did not handle beforeinput");
  await wait(
    "rich-text buffer updated",
    () => context()?.pendingTextEdits || context()?.unsaved,
  );
}
async function saved(predicate) {
  return wait("persisted project and settled page", async () => {
    if (context()?.unsaved || context()?.pendingTextEdits) return false;
    const value = await host("inspect");
    return predicate(value) && value;
  });
}
async function selectScope(labelText, optionText) {
  const select = doc().querySelector(`[aria-label="${labelText}"]`);
  assert(select, `Missing ${labelText}`);
  if (select.tagName === "SELECT") {
    const option = [...select.options].find(
      (item) => item.textContent === optionText,
    );
    assert(option, `Missing option ${optionText}`);
    select.value = option.value;
    select.dispatchEvent(
      new frame.contentWindow.Event("change", { bubbles: true }),
    );
  } else {
    select.click();
    const option = await wait("scope option", () =>
      [...doc().querySelectorAll('[role="option"]')].find(
        (item) => item.textContent.trim() === optionText,
      ),
    );
    option.click();
  }
}
async function openExport() {
  await click("导出");
  await wait("export dialog", () => doc().querySelector('[role="dialog"]'));
  await selectScope("导出范围", "整个作品（2 个场景）");
  await click("导出整个作品");
}

try {
  frame.src = config.launch;
  let original, originalVoice, originalTags, originalSubjects, originalActors;
  await step("boot", "发行编辑器加载、真实素材与编码能力", async () => {
    await wait("editor loaded", () => context()?.project.id === config.id);
    await wait(
      "preview canvas and enabled export",
      () =>
        doc().querySelector("canvas") &&
        button("导出") &&
        !button("导出").disabled,
    );
    await doc().fonts.ready;
    assert(
      typeof frame.contentWindow.VideoEncoder === "function",
      "VideoEncoder unavailable",
    );
    assert(
      typeof frame.contentWindow.AudioEncoder === "function",
      "AudioEncoder unavailable",
    );
    assert(
      typeof frame.contentWindow.navigator.storage.getDirectory === "function",
      "OPFS unavailable",
    );
    assert(
      !frame.contentWindow.location.hash.includes("session"),
      "Launch session was not removed from address",
    );
    original = await host("inspect");
    originalVoice = node(original, config.line1).audioUrl;
    originalTags = tags(node(original, config.line1));
    originalSubjects = JSON.stringify(original.project.visualSubjects);
    originalActors = JSON.stringify(
      original.project.acts
        .flatMap((act) => act.scenes)
        .map((scene) => scene.actors),
    );
    assert(
      originalVoice && originalTags.length,
      "Fixture lacks voice or inline direction",
    );
    return { canvasCount: doc().querySelectorAll("canvas").length };
  });
  await step("edit", "修改富文本保留演出并使配音失效", async () => {
    await append(config.line1, "修改。");
    await click("保存");
    const value = await saved((value) =>
      plain(node(value, config.line1)).endsWith("修改。"),
    );
    assert(
      !node(value, config.line1).audioUrl,
      "Text change retained stale voice",
    );
    assert(
      JSON.stringify(tags(node(value, config.line1))) ===
        JSON.stringify(originalTags),
      "Editing destroyed InlineTags",
    );
    assert(
      JSON.stringify(value.project.visualSubjects) === originalSubjects,
      "Editing changed identities",
    );
    assert(
      JSON.stringify(
        value.project.acts
          .flatMap((act) => act.scenes)
          .map((scene) => scene.actors),
      ) === originalActors,
      "Editing changed actor staging",
    );
  });
  await step("undo", "一次撤销恢复正文、演出与录音", async () => {
    await click("撤销");
    await click("保存");
    await saved(
      (value) =>
        node(value, config.line1).audioUrl === originalVoice &&
        plain(node(value, config.line1)) ===
          plain(node(original, config.line1)),
    );
  });
  await step("redo", "重做及再次撤销不丢失录音", async () => {
    await click("重做");
    await click("保存");
    await saved(
      (value) =>
        !node(value, config.line1).audioUrl &&
        plain(node(value, config.line1)).endsWith("修改。"),
    );
    await click("撤销");
    await click("保存");
    await saved(
      (value) => node(value, config.line1).audioUrl === originalVoice,
    );
  });
  let savedRevision;
  await step("autosave", "停手后自动保存，不点击保存按钮", async () => {
    const start = performance.now();
    await append(config.line2, "已保存。");
    const value = await saved((value) =>
      plain(node(value, config.line2)).endsWith("已保存。"),
    );
    assert(
      JSON.stringify(tags(node(value, config.line2))) ===
        JSON.stringify(tags(node(original, config.line2))),
      "Autosave lost InlineTags",
    );
    savedRevision = value.projectRevision;
    return {
      elapsedMs: Math.round(performance.now() - start),
      projectRevision: savedRevision,
    };
  });
  await step("reload", "真实重新载入后读取已保存正文及双版本", async () => {
    const oldDocument = doc();
    frame.contentWindow.location.reload();
    await wait(
      "new document",
      () =>
        doc() &&
        doc() !== oldDocument &&
        context()?.revision?.projectRevision === savedRevision,
    );
    assert(
      doc()
        .querySelector(`[data-vnve-id="${config.line2}"]`)
        .textContent.includes("已保存。"),
      "Reload lost saved text",
    );
    assert(context().revision.assetsRevision, "Missing assets revision");
  });
  await step(
    "external",
    "外部更新前恢复草稿、载入新版并清空旧撤销",
    async () => {
      await append(config.line2, "未保存草稿。");
      await host("external");
      await wait("external title", () =>
        context()?.project.title.endsWith("·外部更新"),
      );
      const recovery = await host("recovery");
      const recovered = recovery.value ?? recovery;
      assert(
        plain(node(recovered, config.line2)).endsWith("未保存草稿。"),
        "Recovery copy lost unsaved draft",
      );
      const current = await host("inspect");
      assert(
        plain(node(current, config.line2)).endsWith("已保存。"),
        "External update overwrote disk with page draft",
      );
      assert(
        !doc()
          .querySelector(`[data-vnve-id="${config.line2}"]`)
          .textContent.includes("未保存草稿。"),
        "External page retained stale draft",
      );
      assert(button("撤销").disabled, "External update entered undo history");
    },
  );
  await step("playback", "全片播放时间前进、暂停和停止", async () => {
    await selectScope("播放范围", "所有场景");
    await wait("project scope", () => context()?.playback.scope === "project");
    // A trusted click is required for browser audio. The agent clicks this one
    // harness control; no autoplay policy flags or mocked AudioContext are used.
    const activate = document.createElement("button");
    activate.textContent = "启用声音并继续验收";
    label.replaceChildren(activate);
    await new Promise((resolve) =>
      activate.addEventListener("click", (event) => {
        if (!event.isTrusted) return;
        button("播放").click();
        activate.remove();
        label.textContent = "正在验收：全片播放时间前进、暂停和停止";
        resolve();
      }),
    );
    await wait(
      "playback advances",
      () => context()?.playback.playing && context()?.playback.time > 0.4,
    );
    await click("暂停");
    await wait("paused", () => !context()?.playback.playing);
    const time = context().playback.time;
    await pause(350);
    assert(
      Math.abs(context().playback.time - time) < 0.1,
      "Pause continued advancing",
    );
    await click("停止");
    await wait("stopped at zero", () => context()?.playback.time === 0);
  });
  await step("frames", "真实浏览器采样对白、镜头动画与场景转场", async () => {
    const compiled = await host("compile");
    const animation = compiled.animations[0].clips[0];
    const rawTimes = [
      compiled.lines[0].revealDuration + 0.2,
      animation.start + animation.duration / 2,
      compiled.scenes[1].contentStart,
    ];
    const times = rawTimes.map((time) => Math.floor(time * 30) / 30);
    const response = await fetch("/__vnve/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId: config.id, times }),
    });
    const result = await response.json();
    assert(
      response.ok && result.ok && result.verifiedBrowser,
      "Product browser frame capture failed",
    );
    previewFrames = result.frames;
    await host("frames", { frames: result.frames });
    return { times };
  });
  await step("cancel", "取消真实导出不提交视频，页面可继续使用", async () => {
    await openExport();
    await click("取消导出");
    await wait(
      "export cancelled",
      () =>
        doc().body.textContent.includes("已取消导出") && !button("取消导出"),
    );
    await host("cancelled");
  });
  await step("export", "通过正式面板导出整个作品 MP4", async () => {
    await openExport();
    await wait(
      "export completed",
      () => {
        const failure = [...doc().querySelectorAll("[data-sonner-toast]")].find(
          (item) => item.textContent.includes("导出失败"),
        );
        if (failure) throw new Error(failure.textContent);
        return (
          doc().querySelector(".export-result") ||
          (doc().body.textContent.includes("已导出：") && !button("取消导出"))
        );
      },
      120_000,
    );
  });
  await step("console", "没有页面异常与 console.error", async () => {
    assert(errors.length === 0, `Browser errors: ${errors.join("; ")}`);
    return { layoutNotifications };
  });
  await host("complete", { checks, browser });
  label.textContent = "验收通过；报告、预览帧和 MP4 已写入本地运行目录。";
  // Stop the editor's polling when the test server shuts down, and leave a
  // reviewable result instead of stale network-failure toasts.
  frame.remove();
  const summary = document.createElement("section");
  summary.style.cssText = "padding:0 16px 16px;line-height:1.8";
  for (const check of checks) {
    const line = document.createElement("div");
    line.textContent = `✓ ${check.name}`;
    summary.append(line);
  }
  const image = document.createElement("img");
  image.alt = "本轮真实浏览器预览帧";
  image.src = previewFrames[0].png;
  image.style.cssText = "display:block;max-width:100%;margin-top:12px";
  summary.append(image);
  document.body.append(summary);
} catch (error) {
  label.textContent = `验收失败：${error.message}`;
  await host("failed", { checks, browser, error: error.message }).catch(
    () => {},
  );
}
