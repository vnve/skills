import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { lstat, realpath } from "node:fs/promises";
import path from "node:path";

export async function exportFilePath(directory, name) {
  if (
    typeof name !== "string" ||
    !name.trim() ||
    /[/\\\x00-\x1f]/.test(name) ||
    !name.toLowerCase().endsWith(".mp4")
  )
    throw Object.assign(new Error("Expected an exported MP4 filename"), {
      code: "INVALID_PATH",
    });
  const root = await realpath(directory);
  const file = path.join(root, "exports", name);
  try {
    if ((await realpath(file)) !== file || !(await lstat(file)).isFile())
      throw Object.assign(
        new Error("Expected a local export file without symbolic links"),
        { code: "INVALID_PATH" },
      );
  } catch (error) {
    if (error.code === "ENOENT")
      throw Object.assign(new Error("Export file no longer exists"), {
        code: "NOT_FOUND",
      });
    throw error;
  }
  return file;
}

/** Only called for a validated workspace MP4 after an authenticated user click. */
export async function openExportFile(
  file,
  platform = process.platform,
  run = promisify(execFile),
) {
  const command =
    platform === "darwin"
      ? "open"
      : platform === "win32"
        ? "explorer.exe"
        : "xdg-open";
  await run(command, [file], { timeout: 10000, windowsHide: true });
}
