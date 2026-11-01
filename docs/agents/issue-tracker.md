# Issue tracker: Local Markdown

问题与规格存放在 `.scratch/`，每个功能一个目录。

- 规格：`.scratch/<feature>/spec.md`
- 任务：`.scratch/<feature>/issues/<NN>-<slug>.md`，从 01 编号，每个任务独立文件。
- 分诊状态：文件顶部使用 `Status:`，取值见 [triage-labels.md](triage-labels.md)。
- 评论：追加到文件末尾的 `## Comments`。

技能要求“发布到问题跟踪器”时，创建相应 Markdown 文件；要求“获取任务”时，读取指定路径。

## Wayfinder

- 探索地图：`.scratch/<effort>/map.md`
- 子任务：`.scratch/<effort>/issues/NN-<slug>.md`
- 类型：`Type: research/prototype/grilling/task`
- 探索状态：`Status: open/claimed/resolved`
- 依赖：`Blocked by: NN, NN`；所有依赖均为 resolved 时解除阻塞。
- 优先领取编号最小、未阻塞且未领取的任务。
- 开始前标记 claimed；完成后追加 `## Answer`，标记 resolved，并将结论与链接追加到地图。
- 探索状态与普通任务的 triage 状态分别使用，不混用。
