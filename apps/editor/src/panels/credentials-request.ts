/** Credentials errors are rendered from known codes, never raw response text or keys. */
export async function requestCredentials(
  id: string,
  action: string,
  fields = {},
) {
  let response: Response;
  try {
    response = await fetch("/__vnve/credentials", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, id, ...fields }),
    });
  } catch {
    throw new Error("无法连接本地服务，请确认 VNVE 服务仍在运行。");
  }
  const result = await response.json().catch(() => ({}));
  if (response.ok) return result;
  if (response.status === 401)
    throw new Error("本地会话已失效，请通过 CLI 启动链接重新打开编辑器。");
  if (response.status === 403)
    throw new Error("配置请求来源不匹配，请使用本地服务提供的启动链接。");
  const reason = [
    "EPERM",
    "EACCES",
    "EROFS",
    "ENOSPC",
    "EIO",
    "ENOENT",
    "ENOTDIR",
    "EISDIR",
    "EXDEV",
    "EBUSY",
  ].includes(result?.reason)
    ? `（${result.reason}）`
    : "";
  const messages: Record<string, string> = {
    CREDENTIAL_READ_FAILED: "无法读取本机配置，请检查用户配置目录的访问权限。",
    CREDENTIAL_FORMAT_INVALID:
      "本机配置格式无效，原文件已保留，请修复后重新打开设置。",
    CREDENTIAL_WRITE_FAILED:
      "无法写入本机配置，请检查用户配置目录权限和磁盘空间。",
    CREDENTIAL_COMMIT_FAILED:
      "配置已写入临时文件，但无法替换正式配置，请检查本地服务的文件写入权限。",
  };
  if (messages[result?.code]) throw new Error(messages[result.code] + reason);
  if (result?.code === "INVALID_DOCUMENT") {
    const fields: Record<string, string> = {
      token: "请输入有效的 API Key。",
      endpoint:
        "接口地址必须是 HTTPS，且不能含用户名、密码、查询参数或片段；模型和资源 ID 最多 256 字符。",
      resourceId: "请填写有效的资源 ID。",
    };
    throw new Error(fields[result.field] ?? "配置内容无效，请检查填写的字段。");
  }
  throw new Error(`配置请求失败（HTTP ${response.status}），请检查本地服务。`);
}
