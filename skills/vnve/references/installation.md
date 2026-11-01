# CLI 安装与版本

Skill 提供制作指引，CLI 是另行获取的独立二进制。先查 PATH 中的 vnve，运行 `vnve doctor`，核对 [cli.json](../cli.json) 的 version 和 apiVersion；已有兼容版本则直接复用。

## 获取二进制

官方发布位置为 [vnve/skills Releases](https://github.com/vnve/skills/releases)，选择 cli.json 的 releaseTag，下载对应附件和同名 `.sha256`：

| 系统    | 架构          | 附件                 |
| ------- | ------------- | -------------------- |
| macOS   | Apple Silicon | vnve-darwin-arm64    |
| macOS   | Intel         | vnve-darwin-x64      |
| Linux   | x86_64        | vnve-linux-x64       |
| Linux   | ARM64         | vnve-linux-arm64     |
| Windows | x64           | vnve-windows-x64.exe |

附件发布前不会凭空存在。若指定版本尚未发布或下载失败，说明缺少该平台发行包；维护者可提供本地 dist 文件，不能拿其他架构文件或源码脚本冒充可执行文件。Windows ARM64 尚未列为支持目标。

核对下载文件的 SHA-256 与发布附件一致。macOS 使用 `shasum -a 256`，Linux 使用 `sha256sum`，Windows 使用 PowerShell `Get-FileHash -Algorithm SHA256`。仅执行官方来源且校验通过的文件。macOS/Linux 赋予执行权限后，可放到用户 PATH 目录并命名为 vnve；Windows 保留 .exe。不要修改系统目录或自动更改用户 shell 配置；也可以直接引用绝对路径运行。

首次运行 `<binary> doctor`，应返回 `ok:true`、`apiVersion:2`、声明版本和当前平台。CLI 内含 Bun 运行时、编辑器页面与 SDK，执行无需安装 Node/Bun；浏览器仍需桌面 Chrome/Edge 以完成预览与 MP4 导出。

## 本地开发

维护者在源码仓库执行 `pnpm build`，当前平台产物位于 dist，直接提供绝对路径供宿主调用。`pnpm dev`、`pnpm vnve` 是维护者便利命令，消费者不依赖它们。Skill 通过 npx skills 安装时，安装器自身需要 Node；手动复制 Skill 并下载二进制可避免该安装器依赖。
