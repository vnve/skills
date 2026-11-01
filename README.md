# VNVE Skill

**让 Agent 把文本做成可以预览、微调和导出 MP4 的视觉故事。**

VNVE Skill 是一个用于视觉小说（Visual Novel）与对白视频创作的 Agent Skill。把故事、角色对白或现有剧本交给宿主 Agent，由它组织场景、人物、素材、配音与演出；再打开本地编辑器，亲自检查画面和声音、调整细节并导出视频。

创作流程留在你使用的 Agent 中，作品与媒体保存在本地。Skill 提供制作方法，独立 CLI 提供确定性的作品操作，浏览器编辑器提供预览与交付。

## 可以用它做什么

- **从文本制作视觉故事**：把故事拆成幕、场景与台词，安排背景、人物和阅读节奏。
- **持续修改已有作品**：改对白、换表情、调整站位、补配音，也能围绕编辑器当前选中的对象继续创作。
- **编排画面与声音**：使用镜头、转场、音乐、音效和逐句配音，让演出跟随台词发生。
- **创作自定义演出**：由 Agent 编写确定性动画算法，烘焙成数值轨道；创作范围不限于效果预设。
- **在本地完成交付**：浏览器预览、直接微调、自动保存，最终编码导出 MP4。预览与导出共用编译、帧采样和音频语义。

适合以人物对白和场景演出为主的短篇故事、剧情短片及视觉小说式视频。输出包括可继续编辑的本地作品；MP4 由浏览器导出。

## 快速开始

### 1. 安装 Skill

公开仓库可访问后，使用支持 Agent Skills 的安装器：

```sh
npx skills add vnve/skills --skill vnve
```

按安装器提示选择宿主 Agent。维护者或使用本地源码时，也可以安装本地目录，例如安装到 Codex：

```sh
npx skills add /absolute/path/to/vnve-skill --skill vnve --agent codex --copy
```

`npx` 安装器需要 Node.js；也可手动复制 [skills/vnve](skills/vnve) 到宿主支持的 Skill 目录。

### 2. 获取独立 CLI

Skill 与 CLI **分开安装**。按 [CLI 安装指南](skills/vnve/references/installation.md)，从 [Releases](https://github.com/vnve/skills/releases) 获取与 [版本声明](skills/vnve/cli.json) 匹配的平台附件、校验 SHA-256，并将二进制放到 PATH 中，或使用绝对路径调用。

```sh
vnve doctor
```

CLI 内嵌编辑器、运行时与演出 SDK，执行无需 Node.js、Bun、源码或 `node_modules`。构建目标包含 macOS、Linux 与 Windows，具体平台是否可用以该版本已发布并验收的附件为准。若指定附件尚未发布，需要维护者提供对应构建；安装 Skill 本身不会安装 CLI。

### 3. 让 Agent 开始制作

在已安装 Skill 的宿主中，可以这样提出需求：

> 使用 VNVE Skill，把下面的故事做成约一分钟的中文视觉小说短片。先完成一个可播放场景，采用黄昏校园风格，暂时不配音。作品保存到我指定的 workspace，完成后打开本地编辑器供我预览。
>
> 故事：放学后，两位多年未见的朋友在旧教室重逢……

继续修改时，可以这样说：

> 使用 VNVE Skill，继续编辑这个作品。把第二句改得更犹豫，在“其实”之后安排人物反应，并检查修改后的阅读节奏。

提供故事文本、保存位置和你在意的风格、时长或画幅即可。Agent 会读取真实作品状态，按需使用素材与声音工具，再提供定位作品的本地编辑器链接。

### 4. 预览、微调并导出

打开 CLI 打印的完整启动链接，在编辑器中检查台词、画面、节奏与声音，调整后导出 MP4。推荐使用桌面 Chrome / Edge；宿主内置浏览器也可用于预览，导出需确认其实际编码能力。

编辑器会自动保存。Agent 从 CLI 修改作品后，页面会载入新版本；如页面仍有未保存修改，会先保存恢复副本。完整启动链接包含临时访问凭据，请勿公开分享。

## 素材、配音与本地数据

Skill 附带[可选起步素材包](skills/vnve/assets/README.md)，也支持导入自己的图片、录音、配乐、音效与字体。人物身份与媒体分开，素材可在同一 workspace 的多个作品间共享。

生图、素材检索和 TTS 由宿主 Agent 调用你选择的工具完成。VNVE 不自带网页 Agent 或云端创作服务；创建、打开作品和保存服务配置不会自动调用付费服务。没有配音服务时，可以先完成无配音作品。素材来源与许可请查阅素材包说明及各文件的来源记录。

作品与共享素材保存在你指定的 workspace，服务凭据单独保存在本机用户级配置中。项目、恢复副本和素材来源记录不承载 Provider token。保存、恢复与文件布局见 [CLI 使用指南](skills/vnve/references/cli-guide.md#文件保存在哪里)。

## 文档导航

| 你想了解 | 从这里开始 |
| --- | --- |
| Skill 的完整创作流程 | [SKILL.md](skills/vnve/SKILL.md) |
| CLI 安装、平台与版本校验 | [安装指南](skills/vnve/references/installation.md) |
| 手动使用 CLI、命令选择与保存机制 | [CLI 使用指南](skills/vnve/references/cli-guide.md) |
| 剧本组织、视听节奏与交付检查 | [制作与演出](skills/vnve/references/production.md) |
| 图片、音频与素材准备 | [美术规格](skills/vnve/references/art-direction.md) · [素材与音频](skills/vnve/references/media.md) |
| 自定义动画与对白框 | [程序演出](skills/vnve/references/animation.md) · [对白框与主题](skills/vnve/references/dialogue.md) |
| 接口、字段与原子修改 | [运行契约](skills/vnve/references/runtime.md) · [原子编辑](skills/vnve/references/editing.md) |

## 参与开发

本仓库同时维护 Skill、CLI、编辑器与测试。开发环境使用 Node.js 22.20+ 和 pnpm；固定版本 Bun 由开发依赖提供。

```sh
pnpm install --frozen-lockfile
pnpm build
mkdir -p /tmp/vnve-debug
pnpm vnve create /tmp/vnve-debug "调试作品"
# 用 create 输出的 entry.projectId 替换 PROJECT_ID
pnpm dev -- /tmp/vnve-debug --project PROJECT_ID
```

打开服务打印的完整链接。编辑器支持热更新，本地服务重启后需要使用新链接。构建产物位于 `dist/vnve-<target>`，附带 SHA-256 与来源摘要，通过 Release 附件分发，不提交到源码 Git。

常用检查：

```sh
pnpm typecheck
pnpm build
pnpm check:skill
pnpm test
pnpm test:install
```

真实浏览器验收使用 `pnpm test:browser --browser-label=codex-in-app`，操作与报告见 [浏览器验收](docs/browser-acceptance.md)。单元测试不能替代真实 MP4 编码验收，真实配音也需单独验证。

修改前阅读 [维护约定](AGENTS.md) 与 [领域术语](GLOSSARY.md)。更多内容见 [开发说明](docs/skill-development.md)、[目录架构](docs/architecture.md) 和 [发布说明](docs/publishing.md)。当前不要求兼容历史作品格式，也不自动迁移用户作品。

## 许可与发布状态

源码与项目文档采用 [MIT License](LICENSE)。第三方依赖与素材遵循各自许可，素材来源与许可见[素材包说明](skills/vnve/assets/README.md)及清单记录。CLI 版本以 [cli.json](skills/vnve/cli.json) 为准，下载可用性与平台支持以实际发布附件及验收结果为准。
