import type { Project } from "@vnve/core";
import { checkSequenceLayout, type CompiledSequence } from "@vnve/renderer";
import { openLocalExportFile } from "./local-export-file";

export function getBrowserLayoutProblem(
  sequence: CompiledSequence,
  project: Project,
): string | undefined {
  const context = document.createElement("canvas").getContext("2d");
  if (!context) return "无法测量对白排版，请恢复浏览器画布能力后重试导出。";
  const issue = checkSequenceLayout(
    sequence,
    project.meta.width,
    project.meta.height,
    context,
    document.fonts,
  ).find((item) => item.level === "error");
  if (!issue) return;
  const scene = project.acts
    .flatMap((act) => act.scenes)
    .find((scene) => scene.id === issue.sceneId);
  const guidance =
    issue.code === "TEXT_OVERFLOW"
      ? "台词超出对白框，请拆分台词或调整字号、对白框布局后导出。"
      : issue.code === "NAMEPLATE_OVERFLOW"
        ? "姓名超出姓名牌，请调整姓名字号或姓名牌布局后导出。"
        : "对白框超出画面，请调整对白框布局后导出。";
  return `「${scene?.name ?? "未知场景"}」${issue.at.toFixed(1)} 秒：${guidance}`;
}

export async function openCheckedExportFile(
  name: string,
  confirmOverwrite: () => boolean,
  sequence: CompiledSequence,
  project: Project,
) {
  await document.fonts.ready;
  const problem = getBrowserLayoutProblem(sequence, project);
  if (problem) throw new Error(problem);
  return openLocalExportFile(name, confirmOverwrite);
}
