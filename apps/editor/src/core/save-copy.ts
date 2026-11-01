import { localMediaUrl, workspaceRequest } from "./local-workspace";

type SavePicker = (options: {
  suggestedName: string;
  types: { description: string; accept: Record<string, string[]> }[];
}) => Promise<FileSystemFileHandle>;
function picker(): SavePicker | undefined {
  return (window as Window & { showSaveFilePicker?: SavePicker })
    .showSaveFilePicker;
}
export const supportsNativeSaveAs = () => typeof picker() === "function";
function download(href: string, name: string) {
  const link = document.createElement("a");
  link.href = href;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
}
export async function saveExportCopy(
  name: string,
): Promise<"saved" | "download" | "cancelled"> {
  const pick = picker();
  if (!pick) {
    download(localMediaUrl(`exports/${name}`), name);
    return "download";
  }
  let file: FileSystemFileHandle;
  try {
    // Invoke the picker before IO so the browser retains the click's activation.
    file = await pick.call(window, {
      suggestedName: name,
      types: [{ description: "MP4 视频", accept: { "video/mp4": [".mp4"] } }],
    });
  } catch (error) {
    if ((error as Error).name === "AbortError") return "cancelled";
    throw error;
  }
  const response = await fetch(localMediaUrl(`exports/${name}`));
  if (!response.ok || !response.body) throw new Error("无法读取已导出的视频");
  const writable = await file.createWritable();
  await response.body.pipeTo(writable);
  return "saved";
}
export async function saveRecoveryCopy(projectId: string): Promise<void> {
  const name = `vnve-${projectId}-recovery.json`;
  const pick = picker();
  let file: FileSystemFileHandle | undefined;
  if (pick) {
    try {
      file = await pick.call(window, {
        suggestedName: name,
        types: [
          {
            description: "vnve 恢复副本",
            accept: { "application/json": [".json"] },
          },
        ],
      });
    } catch (error) {
      if ((error as Error).name === "AbortError") return;
      throw error;
    }
  }
  const value = await workspaceRequest({ op: "recovery", projectId });
  const blob = new Blob([JSON.stringify(value, null, 2)], {
    type: "application/json",
  });
  if (file) {
    const stream = await file.createWritable();
    try {
      await stream.write(blob);
      await stream.close();
    } catch (error) {
      await stream.abort();
      throw error;
    }
  } else {
    const url = URL.createObjectURL(blob);
    download(url, name);
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
