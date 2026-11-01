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

普通分支推送和 PR 运行构建、测试并上传 Actions artifacts；推送 `cli-v*` 标签还会在三个平台全部验证通过后，自动创建 GitHub Release，上传二进制、同名 `.sha256`、`.json` 及 `LICENSE`。发布步骤只使用本次运行的 artifacts，不重新构建。标签必须与根 package.json 的 version 和 skills/vnve/cli.json 的 version、releaseTag 一致，否则停止发布。带预发布后缀的版本自动标记为 prerelease；已存在的 Release 不覆盖。

例如发布 `0.3.0`，先将版本声明和代码提交、推送，再执行：

```sh
git tag -a cli-v0.3.0 -m "VNVE CLI 0.3.0"
git push origin cli-v0.3.0
```

自动附件覆盖当前 CI 矩阵中 macOS、Linux、Windows runner 的本机架构，不代表 cli.json 列出的所有架构都已有发行包。其余架构仍需在目标系统验收后另行提供。

源码与项目文档采用 [MIT License](../LICENSE)；第三方依赖与素材遵循各自许可。推送发布标签前完成真实浏览器与素材授权验收。macOS 的下载分发还需处理签名与公证，不能用本地编译通过冒充 Gatekeeper 验收。

然后在临时消费者环境，从公开 Release 下载并校验 CLI，安装 Skill、运行 doctor/create/inspect/compile/serve，完成浏览器导出。公开 GitHub 下载链路只有发布后才能验收。

## 更新

修改版本时同步根 package.json 和 skills/vnve/cli.json，重新构建、检查来源摘要和测试。CLI 功能更新通过发布附件分发，Skill 指引更新通过标准 skills 安装器更新；接口不兼容时同时升级 apiVersion。禁止把指向尚未发布附件的版本当作已可安装版本交付用户。
