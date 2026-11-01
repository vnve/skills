# 开发与发布验证

## 安装单元

本仓库通过 `npx skills add vnve/skills` 分发，根 package.json 是私有开发工作区，不发布 npm 包。`skills` 仅作为开发依赖用于真实安装验证；安装用户使用通用 `npx skills` CLI。发布步骤见 [发布说明](publishing.md)。

`npx skills` 安装 `skills/vnve` 的创作说明和可选素材。CLI 独立发布；Skill 的 cli.json 声明版本和接口版本，宿主先运行 `vnve doctor`。执行二进制不需要 Node/Bun；npx 安装器本身仍依赖 Node，也可以手动复制 Skill。

`pnpm build` 使用固定版本 Bun 生成 `dist/vnve-<target>`（Windows 为 .exe），内嵌 CLI、SDK 与 Vite 网页。`.dev/runtime/` 是临时构建目录，dist 不提交源码仓库，通过发布附件分发。`pnpm check:skill` 检查二进制哈希、来源摘要和 Skill 版本；`vnve doctor` 校验嵌入资源。

## 数据与服务

服务只监听 127.0.0.1，启动链接中的随机会话值换成 HttpOnly cookie，随后从地址栏移除。Host/Origin、媒体路径、上传大小、条件写入与 Range 由同一文件服务校验。不要把完整启动链接发到公开渠道。

Project 不包含全局 assets，保存校验 projectRevision 与 assetsRevision；跨文件变更经锁和事务日志提交。网页 Session 记录一次具体操作的完整快照，撤销恢复台词和录音。保存过程中的后续编辑保持 dirty；冲突不覆盖当前页面。

系统不迁移旧项目。目录仍命名为 `.vnve`，这一名称不是对历史数据的兼容承诺。损坏数据报错并保留文件，不能以“不兼容历史项目”为由覆盖用户数据。

网页停手约 2 秒自动保存，持续输入约 10 秒尝试保存。外部版本到来时，先将未保存页面写入 `.vnve/recovery`，再提示并载入；备份或保存失败时保留页面。外部更新不进入撤销历史。CLI 冲突时重新读取并处理，不重复提交旧版本。

## 调试

`pnpm dev -- WORKSPACE --project ID` 在同源文件服务后代理 Vite 页面与模块，API 和媒体留在文件服务；Vite HMR 直连回环 5173。浏览器接口与生产一致。仅开发模式允许代理到显式 127.0.0.1 HTTP 端口。

浏览器预览和导出共同使用 TimelineService → compilePlaybackScope → CompiledSequence → sampleSequence。不要在导出端重写演出解释器。创作源码由 CLI 的 authoring worker 生成纯数据 animation recipe 与算法段；可信 compiler 使用 GSAP master 编译整部作品，网页编译 worker 复用相同实现，但不执行创作源码。

## 验收

1. `pnpm typecheck` 覆盖保留的内核、编辑器和本地服务生产源码。
2. `pnpm test` 覆盖内核、保存冲突/撤销、认证和文件传输，以及复制安装后脱离源码的 create/inspect/patch/apply/compile/check/doctor。损坏产物应被 doctor 拒绝。
3. `pnpm test:install` 使用标准 `skills` CLI，从临时仓库目录发现并安装 vnve，验证默认方式、全局复制和重复安装，再删除来源目录，验证 doctor/create/inspect/compile 可独立运行。所有消费者目录和用户配置都隔离在临时目录。
4. 在临时消费者目录用官方 `npx skills add /ABS/REPO --skill vnve --agent codex --copy`，从该目录调用安装后的 doctor 和 CLI。
5. 真实浏览器创建两个角色，导入图片与音轨，制作运动，预览、调整、保存重开并导出 MP4。检查实际输出的视频和音频轨道；测试音不能标为真实配音。
6. 分别检查取消、保存冲突和失败后的继续编辑。真实 Provider、录音内容质量和外部素材许可不由本仓库单元测试证明。

可重复执行的核心浏览器链路已集中到 `pnpm test:browser`，见 [运行与判定说明](browser-acceptance.md)。脚本使用新 workspace 和真实媒体，通过实际编辑器导出并解码 MP4，单独生成报告；不把它等同于原生输入法、Provider、宿主行为或所有平台的完整发布验收。

网页提供常用微调，完整结构化演出和场景编排由 Skill 完成。网页替换图片不更改故事身份。角色初始站位可能被台词内 show/move 演出覆盖，调整演出轨迹应由宿主读取实际 InlineTag 后使用原子 Patch。

## 当前制作能力与验证边界

`@vnve/compiler` 只负责时间线、对白锚点与演出轨道编译；`@vnve/renderer/playback` 由 CLI 和编辑器共用，负责播放组装与报告。compile 返回逐句时间、音轨区间、解析后的节点锚点动画与资源引用；check 追加实际媒体文件和元数据检查。预加载仅覆盖所选范围使用的资源，包括后续行内切图。正文排版由网页等待实际字体加载后检查，CLI 报告保留浏览器待验项。

续写与素材绑定、逐句节奏、BGM/SFX、字体和主题使用 Skill 的 [原子编辑说明](../skills/vnve/references/editing.md) 及运行时 schema。自动分页、嘴型/眼睛独立图层、粒子/遮罩和语音逐词强制对齐尚未实现；人物整图留白与构图、声音听感仍需实际复核。

## 编辑面板

编辑器提供画布下方的 Act/场景横向条、可调大小的台词列表，以及按需打开的详细属性浮层。`ScriptPanel` 使用 `script-editor/` 中的富文本组件原位编辑台词，保留 InlineTag；说话人和录音试听直接在台词行操作。`CanvasTools` 和 `CanvasInspector` 提供对象、人物、场景及对白框微调，人物属性和画布拖动共用当前帧及演出控制点。场景设置浮层中的程序演出可微调启用、视觉偏移/缩放，以及人物与镜头强度。

所有持久编辑通过 Session 进入原子 Patch、同一撤销和保存流程；`stores/editor-store.tsx` 只提供读取上下文。凭据面板只管理本机配置，配音仍由宿主调用。模块职责见 [VNVE Editor](../apps/editor/src/README.md)，样式约定见 [编辑器维护约定](../apps/editor/AGENTS.md)。

## 可选图片准备脚本

`skills/vnve/scripts/image_prep.py` 随 Skill 分发，由宿主按需使用 Python 3.10+ 与 Pillow 执行；不进入 vnve 二进制，不改变消费者运行 CLI 的依赖。脚本不联网、下载模型或调用服务。图像准备流程见 Skill 的 `references/image-preparation.md`。

有 Pillow 的隔离环境中运行：

```sh
PYTHONDONTWRITEBYTECODE=1 /absolute/media-tools/bin/python -m unittest discover -s tests/skill-image-prep -v
```

此测试覆盖透明度、边界连通抠底、蒙版、局部修复、共享缩放对齐、拒绝覆盖/裁切和检查图。`pnpm test:install` 另验证脚本与流程文档可随标准 skills 安装器复制。真实分割模型、发丝质量与去标记结果需按实际图片目视验收。
