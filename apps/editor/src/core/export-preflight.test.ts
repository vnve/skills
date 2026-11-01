// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createDefaultProject } from "@vnve/core";
import { compilePlaybackScope } from "@vnve/renderer/playback";
import {
  getBrowserLayoutProblem,
  openCheckedExportFile,
} from "./export-preflight";
import { openLocalExportFile } from "./local-export-file";
vi.mock("./local-export-file", () => ({
  openLocalExportFile: vi.fn(async () => ({ commit: vi.fn() })),
}));
beforeEach(() => {
  Object.defineProperty(document, "fonts", {
    configurable: true,
    value: { ready: Promise.resolve(), check: () => true },
  });
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    font: "",
    measureText: (text: string) => ({ width: [...text].length * 36 }),
  } as unknown as CanvasRenderingContext2D);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});
function fixture(text: string) {
  const project = createDefaultProject();
  project.acts[0].scenes[0].name = "长对白场景";
  project.acts[0].scenes[0].script.nodes.push({
    id: "line",
    type: "text",
    text,
  });
  return {
    project,
    sequence: compilePlaybackScope({
      project,
      scope: { type: "project" },
      resolvedUrlMap: new Map(),
    }).sequence,
  };
}
it("rejects an overflowing compiled dialogue before creating or replacing an export file", async () => {
  const { project, sequence } = fixture("检查正文是否完整。".repeat(30));
  await expect(
    openCheckedExportFile("test.mp4", () => true, sequence, project),
  ).rejects.toThrow(/长对白场景.*台词超出对白框/);
  expect(openLocalExportFile).not.toHaveBeenCalled();
  expect(getBrowserLayoutProblem(sequence, project)).toContain("拆分台词");
});
it("waits for fonts before measuring and still exports a corrected short dialogue", async () => {
  const { project, sequence } = fixture("短对白。");
  let ready!: () => void;
  Object.defineProperty(document, "fonts", {
    configurable: true,
    value: {
      ready: new Promise<void>((resolve) => {
        ready = resolve;
      }),
      check: () => true,
    },
  });
  const result = openCheckedExportFile(
    "test.mp4",
    () => true,
    sequence,
    project,
  );
  expect(openLocalExportFile).not.toHaveBeenCalled();
  ready();
  await result;
  expect(openLocalExportFile).toHaveBeenCalledOnce();
  expect(getBrowserLayoutProblem(sequence, project)).toBeUndefined();
});
it("does not bypass preflight when canvas measurement is unavailable", async () => {
  vi.mocked(HTMLCanvasElement.prototype.getContext).mockReturnValue(null);
  const { project, sequence } = fixture("短对白。");
  await expect(
    openCheckedExportFile("test.mp4", () => true, sequence, project),
  ).rejects.toThrow(/测量/);
  expect(openLocalExportFile).not.toHaveBeenCalled();
});
