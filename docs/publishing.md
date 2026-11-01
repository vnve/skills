# Skill 与 CLI 发布

在同一个仓库维护两个分发单元：skills/vnve 是创作指引和可选素材，dist 中的 Bun 二进制是 CLI。源码不提交平台二进制；通过 GitHub Release 附件分发。Skill 的 cli.json 固定 version、apiVersion 和 releaseTag。

## 构建与验证

```sh
pnpm install --frozen-lockfile
pnpm typecheck
pnpm build
pnpm check:skill
pnpm test
pnpm test:install
pnpm test:browser --browser-label=codex-in-app
```

浏览器命令输出验收地址，Agent 用内置浏览器打开并点击一次声音授权手势按钮，后续自动执行；细节及非零退出规则见 [浏览器验收](browser-acceptance.md)。归档本版本的报告与 MP4，再判断该平台是否通过。

构建默认使用本机平台。显式目标为 darwin-arm64、darwin-x64、linux-x64、linux-arm64、windows-x64，例如：

```sh
pnpm build linux-arm64
pnpm check:skill linux-arm64
```

产物为 dist/vnve-<target>（Windows 为 .exe），附同名 .sha256 和 .json。二进制内嵌编辑器，doctor 校验嵌入资源并报告版本和来源摘要。构建清单用于维护者检查过期源码；SHA-256 用于消费者核对下载完整性，不替代发布来源信任。

CI 在 macOS、Linux、Windows 的本机目标构建并运行完整测试，上传二进制附件供维护者审阅。其他架构可交叉编译，但必须在目标系统验收后才声称支持。真实浏览器 MP4、真实 TTS 和素材许可单独验收。各平台的支持声明以该版本的目标系统运行验收为准。

## 自动创建 Release

分支推送和 PR 运行构建、测试并上传 Actions artifacts。`main` 的三个平台全部验证通过后，发布 job 读取根 package.json 的 version 及 skills/vnve/cli.json 的 version、releaseTag；三者必须一致，标签格式为 `cli-v<version>`。

- 版本已公开发布：跳过，保留原标签和附件。
- 版本未发布：为本次通过验证的提交创建标签，再创建 Release 草稿、上传附件，全部上传成功后公开发布。
- 同一提交的发布中途失败：重新运行 workflow，可继续上传草稿附件并发布。
- 标签已指向其他提交：停止，修复后升级版本，不移动旧标签。

发布只使用本次运行的 artifacts，不重新构建。附件包含二进制、同名 `.sha256`、`.json` 及 `LICENSE`；带预发布后缀的版本标记为 prerelease。网络或认证错误会使发布失败，不会被当作「版本不存在」。

发布时手动更新两个版本文件，例如 `0.3.1`：

```text
package.json: version = 0.3.1
skills/vnve/cli.json: version = 0.3.1, releaseTag = cli-v0.3.1
```

将版本变更随代码合并到 `main`（直接推送也会触发），CI 通过后自动打标签并发布，无需手动执行 `git tag`。首次启用时，若当前版本尚未发布，也会自动发布。普通功能或文档提交未升级版本、且该版本已发布时，只运行验证并跳过发布。

标签和 Release 在同一次 workflow 内完成；不依赖自动创建的标签再次触发 workflow。

自动附件覆盖当前 CI 矩阵中 macOS、Linux、Windows runner 的本机架构，不代表 cli.json 列出的所有架构都已有发行包。其余架构仍需在目标系统验收后另行提供。

源码与项目文档采用 [MIT License](../LICENSE)；第三方依赖与素材遵循各自许可。合并版本变更前完成真实浏览器与素材授权验收。macOS 的下载分发还需处理签名与公证，不能用本地编译通过冒充 Gatekeeper 验收。

然后在临时消费者环境，从公开 Release 下载并校验 CLI，安装 Skill、运行 doctor/create/inspect/compile/serve，完成浏览器导出。公开 GitHub 下载链路只有发布后才能验收。

## 更新

修改版本时同步根 package.json 和 skills/vnve/cli.json，重新构建、检查来源摘要和测试。CLI 功能更新通过发布附件分发，Skill 指引更新通过标准 skills 安装器更新；接口不兼容时同时升级 apiVersion。禁止把指向尚未发布附件的版本当作已可安装版本交付用户。
