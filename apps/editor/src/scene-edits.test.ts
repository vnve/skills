import { describe, expect, it } from "vitest";
import { createDefaultProject, createDefaultScene } from "@vnve/core";
import { removeScene } from "./scene-edits";
describe("local scene removal", () => {
  it("retains shared assets, remaining scene identity and the undo snapshot", () => {
    const project = createDefaultProject();
    const retained = createDefaultScene("保留");
    project.acts[0].scenes.push(retained);
    const removed = project.acts[0].scenes[0];
    const next = removeScene(project, removed.id);
    expect(next.assets).toBe(project.assets);
    expect(next.acts[0].scenes).toEqual([retained]);
    expect(next.acts[0].scenes[0]).toBe(retained);
    expect(project.acts[0].scenes).toEqual([removed, retained]);
    expect(() => removeScene(next, retained.id)).toThrow("至少保留一个场景");
    expect(() => removeScene(next, removed.id)).toThrow("场景不存在");
  });
});
