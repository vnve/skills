# 目录与模块职责

vnve 在一个仓库中维护 Skill 和独立 CLI 两个发布单元。Skill 可复制安装；CLI 通过平台二进制分发。

```text
apps/
  editor/                 VNVE Editor：浏览器预览、微调、保存与 MP4 导出
    src/components/       工作区、画布属性与通用 UI
    src/panels/           台词、场景导航与凭据面板
    src/script-editor/    富文本台词与 InlineTag 编辑
    src/core/             本地文件服务桥接、导出与编辑算法
    src/stores/           只读 Session 上下文和临时交互状态
  cli/src/
    cli/                  宿主命令入口
    server/               回环 HTTP、会话与媒体传输
    workspace/            文件访问、版本检查、锁和事务保存
    media/                媒体探测、导入、对白框导入和文件检查
packages/
  core/                   作品/animation schema、原子编辑、身份与引用
  authoring/              CLI 源码执行、GSAP 调用记录和算法烘焙
  parser/                 InlineTag 解析
  runtime/                状态与音频时间语义、轨道采样
  compiler/               时间线、对白锚点与轨道编译
  renderer/               帧准备、场景绘制与转场
    src/playback/         编译结果、资源上下文、音轨与序列的统一组装
  media/                  浏览器音视频编码
skills/vnve/
  SKILL.md                宿主创作入口
  references/             按需读取的制作与运行说明
  examples/               按 animation、dialogue 分类的可复制示例
  scripts/                宿主按需执行的图片和语音工具
  agents/                 宿主元数据
  cli.json                CLI 版本、接口版本与发布目标
  references/installation.md  平台二进制获取与版本校验
  assets/                  内置图片、音频与媒体清单
scripts/                  开发、构建与来源校验
tests/                   见下方测试约定
```

## 依赖方向

`authoring → core`；`parser → core`；`runtime → core`；`compiler → parser/runtime/core`；`renderer → compiler/runtime/core`；`media → renderer/runtime/core`。应用组合这些模块，内核不依赖应用。编译模块不导入 renderer，避免纯剧本编译隐含加载绘制模块。

`@vnve/compiler` 暴露 TimelineService 与 cues。`@vnve/renderer/playback` 暴露 compilePlaybackScope、createProjectReport 和报告序列化。CLI 与网页都调用这一播放组装入口，预览和导出继续共享 CompiledSequence 与 sampleSequence。

故事与程序演出使用一棵 GSAP master timeline。parser 将 ScriptDoc/InlineTag 语义组织为有限子时间线；compiler 统一安排场景、台词、音频和转场，并导出数值轨道、事件、区间及 inputFingerprint。runtime 和 renderer 只采样这些数据，不再推导场景/转场的时间位置。

`packages/authoring` 是仅 CLI 使用的源码执行入口，输出纯数据 TimelineRecipe 和确定性算法段；`animation build` 校验项目与素材版本，输出未应用 artifact。人物、镜头与视觉节点统一使用 animationClips 及 animation.set/remove/override，不保留 motion/visual 创作入口。

网页通过可信编译 worker 运行相同 compiler 与 GSAP，可在改台词后重新排程；不导入 authoring，不执行项目中保存的 source。异步编译按 Session generation 接受，过期结果丢弃，失败保留页面并阻止使用失效结果导出。

## 素材与安装

素材只存于 `skills/vnve/assets/`，提供内置图片，包含 16 位人物及 20 类校园、办公、居家和出行背景，直接按 character/background 分类。manifest.json 枚举媒体相对路径并记录音频作者、许可与外部来源页面；bgm/sfx 提供 10 首配乐与 41 个音效。图片以压缩 WebP、音频以 Ogg/Opus 随 Skill 离线安装，用户选择使用后才导入 workspace，不自动修改新作品。可选素材不嵌入 CLI；构建来源摘要覆盖 assets 目录。

## 测试与产物

单模块测试与源码就近存放。`tests/integration/` 验证剧本编译、播放组装和帧采样组合；`tests/install/` 验证复制安装与标准 skills 安装器；`tests/browser/` 使用发行二进制、隔离作品和离线语音，驱动真实浏览器编辑、恢复、预览及 MP4 导出，再核验解码、关键帧和语音对齐。浏览器套件单独运行和出具报告，不替代其他发布验收。

构建脚本先生成 `.dev/runtime/`，再将 CLI、SDK 和网页编译为 `dist/vnve-<target>`，附带来源摘要与 SHA-256。临时目录和二进制不提交 Git；CI 在目标系统构建验收后上传附件。Skill 与 CLI 的接口版本由 cli.json 和 doctor 校验。
