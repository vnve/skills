// @vitest-environment happy-dom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { createDefaultProject } from "@vnve/core";
import { RichEditor } from "./RichEditor";
import "../i18n";
vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
vi.stubGlobal(
  "ResizeObserver",
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
);
it("opens editable tag parameters without first selecting its dialogue text", async () => {
  const project = createDefaultProject();
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const onEnter = vi.fn();
  const onPreview = vi.fn();
  try {
    await act(async () =>
      root.render(
        React.createElement(RichEditor, {
          content: [
            { type: "tag", name: "wait", params: { seconds: 1 } },
            { type: "text", text: "hello" },
          ],
          nodeId: "line",
          project,
          scene: project.acts[0].scenes[0],
          readOnly: true,
          onChange: () => true,
          onEnter,
          onPreview,
        }),
      ),
    );
    const remove = host.querySelector<HTMLButtonElement>(
      '[data-tag-index] [aria-label="删除标签"]',
    )!;
    const enter = new KeyboardEvent("keydown", {
      key: "Enter",
      bubbles: true,
      cancelable: true,
    });
    await act(async () => {
      remove.dispatchEvent(enter);
    });
    expect(enter.defaultPrevented).toBe(false);
    expect(onEnter).not.toHaveBeenCalled();
    const tag = host.querySelector<HTMLButtonElement>(
      "[data-tag-index] button",
    )!;
    await act(async () => tag.click());
    const input = host.querySelector<HTMLInputElement>(
      "[data-tag-config-popover] input",
    )!;
    expect(input).not.toBeNull();
    expect(input.disabled || input.closest("fieldset")?.disabled).not.toBe(
      true,
    );
    const play = host.querySelector<HTMLButtonElement>('[title="预览此效果"]')!;
    await act(async () => play.click());
    expect(onPreview).toHaveBeenCalledWith({
      type: "tag",
      name: "wait",
      params: { seconds: 1 },
    });
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});
it("edits an animation tag and renders a check icon for its serial checkbox", async () => {
  const project = createDefaultProject(),
    scene = project.acts[0].scenes[0];
  const { buildAnimation } = await import("../../../../packages/authoring/src");
  const source =
    '({ sdkVersion: 2, name: "<script>display only</script>", build({ camera, timeline }) { timeline().to(camera(), { x: 2, duration: 1 }); } })';
  scene.animationClips = [
    buildAnimation(
      {
        sdkVersion: 2,
        id: "effect",
        name: "镜头推进",
        sceneId: scene.id,
        duration: 1,
        build({ camera, timeline }) {
          timeline().to(camera(), { x: 2, duration: 1 });
        },
      },
      source,
      { width: 1920, height: 1080, cues: [] },
    ),
  ];
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () =>
      root.render(
        React.createElement(RichEditor, {
          content: [
            { type: "tag", name: "animation", params: { clipId: "effect" } },
            { type: "text", text: "hello" },
          ],
          nodeId: "line",
          project,
          scene,
          onChange: () => true,
          onEnter: () => {},
        }),
      ),
    );
    const pill = host.querySelector<HTMLButtonElement>(
      "[data-tag-index] button",
    )!;
    expect(pill.textContent).toContain("镜头推进");
    await act(async () => pill.click());
    const checkbox =
      host.querySelector<HTMLButtonElement>('[aria-label="串行"]')!;
    expect(checkbox.getAttribute("aria-checked")).toBe("true");
    expect(
      checkbox.querySelector('[data-slot="checkbox-indicator"] svg'),
    ).not.toBeNull();
    expect(
      host.querySelector('[aria-label="演出片段"]')?.textContent,
    ).toContain("镜头推进");
    const panel = host.querySelector("[data-tag-config-popover]")!;
    expect(panel.querySelector('input[type="number"]')).toBeNull();
    expect(panel.textContent).not.toContain("人物与镜头强度");
    const code = panel.querySelector('[aria-label="演出代码"]')!;
    expect(code.textContent).toBe(source);
    expect(code.querySelector("script")).toBeNull();
    expect(
      code.querySelector('textarea, input, [contenteditable="true"]'),
    ).toBeNull();
    await act(async () => checkbox.click());
    expect(checkbox.getAttribute("aria-checked")).toBe("false");
    expect(
      checkbox.querySelector('[data-slot="checkbox-indicator"]'),
    ).toBeNull();
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});
it("hides the internal stateId without removing it from the tag", async () => {
  const project = createDefaultProject();
  const content = [
    {
      type: "tag" as const,
      name: "set" as const,
      params: {
        target: "$background",
        variant: "variant",
        stateId: "internal-state",
      },
    },
  ];
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const onChange = vi.fn(() => true);
  try {
    await act(async () =>
      root.render(
        React.createElement(RichEditor, {
          content,
          nodeId: "line",
          project,
          scene: project.acts[0].scenes[0],
          onChange,
          onEnter: () => {},
        }),
      ),
    );
    await act(async () =>
      host.querySelector<HTMLButtonElement>("[data-tag-index] button")!.click(),
    );
    const panel = host.querySelector("[data-tag-config-popover]")!;
    expect(panel.textContent).not.toContain("stateId");
    expect(panel.querySelector('input[value="internal-state"]')).toBeNull();
    expect(content[0].params.stateId).toBe("internal-state");
    expect(onChange).not.toHaveBeenCalled();
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});
it("exposes editable native direction controls and hides wipe's meaningless serial switch", async () => {
  const project = createDefaultProject(),
    scene = project.acts[0].scenes[0];
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  try {
    for (const tag of [
      {
        type: "tag" as const,
        name: "introduce" as const,
        params: { actor: "hero", title: "小夏", accent: "#526875" },
      },
      {
        type: "tag" as const,
        name: "memory" as const,
        params: { images: ["image"] },
      },
      {
        type: "tag" as const,
        name: "wipe" as const,
        params: { nextScene: "next" },
      },
    ]) {
      await act(async () =>
        root.render(
          React.createElement(RichEditor, {
            key: tag.name,
            content: [tag],
            nodeId: "line",
            project,
            scene,
            onChange: () => true,
            onEnter: () => {},
          }),
        ),
      );
      await act(async () =>
        host
          .querySelector<HTMLButtonElement>("[data-tag-index] button")!
          .click(),
      );
      const panel = host.querySelector("[data-tag-config-popover]")!;
      expect(panel).not.toBeNull();
      if (tag.name === "introduce") {
        expect(panel.querySelector('input[type="color"]')).not.toBeNull();
        expect(panel.textContent).toContain("标题");
      }
      if (tag.name === "memory") {
        expect(
          panel.querySelector('[aria-label="记忆图片顺序"]'),
        ).not.toBeNull();
        expect(
          panel.querySelector('[aria-label="添加记忆图片"]'),
        ).not.toBeNull();
      }
      if (tag.name === "wipe") {
        expect(panel.querySelector('[aria-label="下一场景"]')).not.toBeNull();
        expect(panel.querySelector('[aria-label="串行"]')).toBeNull();
      }
    }
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});
it("edits focus targets and optional foreground media", async () => {
  const project = createDefaultProject(),
    scene = project.acts[0].scenes[0];
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  try {
    for (const tag of [
      {
        type: "tag" as const,
        name: "rackfocus" as const,
        params: { toTarget: "hero" },
      },
      { type: "tag" as const, name: "parallax" as const, params: {} },
    ]) {
      await act(async () =>
        root.render(
          React.createElement(RichEditor, {
            key: tag.name,
            content: [tag],
            nodeId: "line",
            project,
            scene,
            onChange: () => true,
            onEnter: () => {},
          }),
        ),
      );
      await act(async () =>
        host
          .querySelector<HTMLButtonElement>("[data-tag-index] button")!
          .click(),
      );
      const panel = host.querySelector("[data-tag-config-popover]")!;
      if (tag.name === "rackfocus") {
        expect(panel.querySelector('[aria-label="起始焦点"]')).not.toBeNull();
        expect(panel.querySelector('[aria-label="结束焦点"]')).not.toBeNull();
      }
      if (tag.name === "parallax")
        expect(
          panel.querySelector('[aria-label="透明前景素材"]'),
        ).not.toBeNull();
    }
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});
