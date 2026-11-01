let exportsDirectory: string | undefined;
export function isLocalWorkspace(): boolean {
  return (
    typeof document !== "undefined" &&
    document.documentElement.dataset.vnveLocal === "true"
  );
}
export async function initializeLocalWorkspace(): Promise<void> {
  if (!isLocalWorkspace()) return;
  const fragment = new URLSearchParams(location.hash.slice(1));
  const token = fragment.get("session");
  if (token) {
    const response = await fetch("/__vnve/session", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok)
      throw new Error("Local workspace session expired; reopen the launch URL");
    fragment.delete("session");
    history.replaceState(
      null,
      "",
      `${location.pathname}${location.search}${fragment.size ? `#${fragment}` : ""}`,
    );
  }
  const response = await fetch("/__vnve/config");
  if (!response.ok)
    throw new Error("Local workspace session expired; reopen the launch URL");
  exportsDirectory = (await response.json()).exportsDirectory;
}
export async function workspaceRequest<T>(input: unknown): Promise<T> {
  const response = await fetch("/__vnve/api", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const result = await response.json();
  if (!response.ok)
    throw Object.assign(
      new Error(result.message ?? "Local workspace operation failed"),
      { code: result.code },
    );
  return result as T;
}
export function localMediaUrl(relativePath: string): string {
  return `/files?path=${encodeURIComponent(relativePath)}`;
}
export async function mediaRevision(
  relativePath: string,
): Promise<string | null> {
  const response = await fetch(localMediaUrl(relativePath), { method: "HEAD" });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error("Unable to read workspace media");
  return response.headers.get("ETag");
}
export async function putLocalMedia(
  relativePath: string,
  data: Blob,
  expected: string | null,
): Promise<void> {
  const response = await fetch(localMediaUrl(relativePath), {
    method: "PUT",
    headers: expected ? { "If-Match": expected } : { "If-None-Match": "*" },
    body: data,
  });
  if (!response.ok) {
    const result = await response.json();
    throw Object.assign(
      new Error(result.message ?? "Unable to save workspace media"),
      { code: result.code },
    );
  }
}

export function localExportPath(name: string): string {
  return exportsDirectory
    ? `${exportsDirectory}${exportsDirectory.includes("\\") ? "\\" : "/"}${name}`
    : `exports/${name}`;
}
export async function openLocalExport(name: string): Promise<void> {
  const response = await fetch("/__vnve/exports/open", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  if (!response.ok)
    throw new Error(
      "无法打开本地视频，请使用另存副本或在文件管理器中打开路径。",
    );
}
