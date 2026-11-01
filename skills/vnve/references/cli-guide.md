# vnve CLI 使用指南

vnve CLI 是作品与素材的本机操作入口，也负责启动编辑器。它可以由人直接使用，也可以由宿主 Agent 按 Skill 的制作流程调用。拿到对应平台的二进制后，执行不依赖 Node.js、Bun、源码或 node_modules；安装与兼容检查见 [CLI 安装](installation.md)。

## Skill、CLI 和编辑器各管什么

| 入口 | 用途 | 什么时候用 |
| --- | --- | --- |
| Skill | 告诉宿主如何理解故事、选择素材与声音、编排并验收作品 | 让 Agent 从文本创作或继续修改作品 |
| CLI | 用真实 ID 与版本读取、导入、编译、原子修改和保存本地作品 | 人或 Agent 批量操作、检查数据、接入外部素材和算法演出 |
| 本地编辑器 | 实时看画面、播放审听、直接微调、自动保存、浏览器编码 MP4 | 调整最终效果及导出视频 |

AI 创作、生图、检索和配音由宿主调用已选工具完成；CLI 接收实际结果文件。`compile` 产出播放报告，不是 MP4。MP4 在编辑器中使用与预览相同的编译、帧采样及音频语义编码。

## 第一次使用

先获取当前平台兼容二进制，用 `vnve doctor` 核对版本和 apiVersion。下面的 vnve 可替换成二进制绝对路径，路径含空格时引用整个路径。

```sh
vnve doctor
vnve --help
mkdir -p /absolute/my-workspace
vnve create /absolute/my-workspace "我的故事"
vnve inspect /absolute/my-workspace
vnve serve /absolute/my-workspace --project PROJECT_ID
```

`create` 的 stdout 是 JSON，作品 ID 位于 `entry.projectId`。首次例子创建空场景，之后可在编辑器添加台词。已有结构化剧本时，用 `create ... --script /absolute/script.json`；格式通过 `vnve schema script` 获取，最小剧本及返回字段见 [运行与制作接口](runtime.md)。

`serve` 是持续运行的本机进程，会打印临时启动链接。打开后浏览器通过会话 cookie 使用同源 API；服务退出后链接失效，重启后使用新链接。完整启动链接包含临时访问凭据，勿公开发布。

## 日常制作的命令选择

| 要做的事 | 命令 | 下一步 |
| --- | --- | --- |
| 找作品、对象与版本 | `inspect WORKSPACE [PROJECT_ID] [--brief]` | 要改台词/声音时读完整输出；brief 用于快速查找稳定 ID |
| 查支持的输入字段 | `schema script` / `schema patch` / `schema theme` / `schema animation` | 以当前二进制 schema 为准 |
| 导入实际图片/音频/字体 | `import WORKSPACE PROJECT_ID media.json` | 核对返回实际 ID，必要时用 Patch 绑定人物、场景和演出 |
| 预览结构化修改 | `patch WORKSPACE PROJECT_ID plan.json` | 将完整 stdout 保存为预览文件，核对目标与变化 |
| 应用同一份预览 | `apply WORKSPACE preview.json` | 版本变化时重新 inspect 和生成预览 |
| 查看逐句时间与音轨 | `compile WORKSPACE PROJECT_ID` | 读 duration、lines 与 audioPlan，不把报告当视频 |
| 核对实际引用媒体 | `check WORKSPACE PROJECT_ID` | 按错误和提醒修正，再到浏览器检查字体、画面与混音 |
| 打开目标作品 | `serve WORKSPACE --project PROJECT_ID` | 预览、微调和导出 |
| 从打开的浏览器取帧 | `preview frames LAUNCH_URL PROJECT_ID times.json OUTPUT_DIR` | 依赖真实浏览器和会话，不是独立渲染器 |
| 烘焙自定义算法演出 | `animation build WORKSPACE PROJECT_ID source.js artifact.json` | 按 animation schema 通过 Patch 原子应用 |

`compile` / `check` 可用 `--scene ID` 或 `--act ID` 限定范围，`--issues=summary` 汇总诊断。媒体格式与绑定见 [素材与音频](media.md)，修改协议见 [原子编辑](editing.md)，自定义算法见 [程序演出](animation.md) / [程序视觉](animation.md)。

例如一轮修改：

```sh
vnve inspect /absolute/my-workspace PROJECT_ID
vnve schema patch
# 根据实际 ID 写 plan.json 后：
vnve patch /absolute/my-workspace PROJECT_ID /absolute/plan.json > /absolute/preview.json
# 核对预览中的真实改动后：
vnve apply /absolute/my-workspace /absolute/preview.json
vnve compile /absolute/my-workspace PROJECT_ID
vnve check /absolute/my-workspace PROJECT_ID
```

成功 stdout 的 JSON 结构按命令区分。失败输出 stderr JSON，并以退出码1结束；compile/check 有错误时仍保留 stdout 报告。不要往 stdout 混入包管理器日志。字段地图、批次返回与错误规则集中在 [运行与制作接口](runtime.md)。

## 文件保存在哪里

```text
my-workspace/
  .vnve/workspace.json             作品索引
  .vnve/assets.json                跨作品共享素材索引
  .vnve/recovery/<作品目录名>.json   外部更新前最近一份未保存页面副本
  projects/<作品目录名>/project.json 作品文档
  assets/                         导入后的真实媒体与来源记录
  exports/                        浏览器完成编码的 MP4
```

导入会保留原媒体文件。项目与共享素材分别落盘，保存同时检查双版本；跨进程锁与事务保护正式作品更新。凭据保存在用户级配置目录，与 workspace、恢复副本和导出分开。

编辑器在停手约2秒后自动保存；持续输入时约10秒检查一次保存，输入法组字和未完成的数值字段会等编辑完成。外部 CLI 更新优先载入；若页面仍有未保存修改，先写最近恢复副本再替换，并在通知提供“保存之前修改”。恢复副本是完整项目与素材索引快照，不自动当正式作品应用。备份或保存失败时保留页面并报告错误。正常自动保存保留网页撤销历史；外部载入建立新会话，CLI 改动不进入网页撤销历史。

导出完成后，点击绝对本地路径用系统播放器打开原文件；“另存为…”复制同一个 MP4，不重新编码。浏览器不提供原生文件选择器时显示“保存副本”，按浏览器下载设置保存。

## 为什么分成这些层

当前设计继续保持 CLI 与 Skill 独立发布：确定性的操作和检查放在 CLI，创作决策放在 Skill，真实交互与编码放在编辑器。使用者通过本指南理解用途；Agent 从 SKILL.md 进入，再按任务读取运行契约或专门参考。这样无需把所有命令和 schema 塞进主 Skill，也能让 CLI 脱离 Agent 单独使用。

这采用了 Agent Skills 的 [按需加载参考资料](https://agentskills.io/specification#progressive-disclosure) 结构；具体的独立二进制、版本声明和浏览器边界是 vnve 的工程选择，并非 Skill 格式强制要求。
