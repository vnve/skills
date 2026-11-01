// @vitest-environment happy-dom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { CredentialsPanel } from "./CredentialsPanel";
vi.mock("../CompactSelect", () => ({ CompactSelect: () => null }));
vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
it("warns about a read-only service before accepting a key or a save", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url, options) => {
      const request = JSON.parse(String(options.body));
      return new Response(
        JSON.stringify(
          request.action === "capabilities"
            ? { writable: false, directory: "/test/user-config" }
            : { configured: false },
        ),
        { status: 200 },
      );
    }),
  );
  const host = document.createElement("div"),
    root = createRoot(host);
  try {
    await act(async () => root.render(React.createElement(CredentialsPanel)));
    expect(host.textContent).toContain("没有配置目录的写入权限");
    expect(
      host.querySelector<HTMLInputElement>('input[type="password"]')?.disabled,
    ).toBe(true);
    expect(
      [...host.querySelectorAll<HTMLButtonElement>("button")].find(
        (b) => b.textContent === "保存",
      )?.disabled,
    ).toBe(true);
  } finally {
    act(() => root.unmount());
    vi.unstubAllGlobals();
  }
});
