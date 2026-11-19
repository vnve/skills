# 旧版备份导入与结构转换

拿到 `.vnve` 备份、需要把旧版 vnve 作品转成当前项目时读取。先确认备份格式，再决定复用已有项目还是新建；转换的是文本、人物、背景和声音，旧版演出指令不逐条迁移。

## 先识别格式

不要凭扩展名判断。读取文件开头并核对顶层字段：

| 观察 | 结论 |
| --- | --- |
| `{"formatName":"dexie",...}`，含 `databaseName:"vnve2"` | IndexedDB/Dexie 备份，旧版 vnve2 数据结构 |
| 顶层有 `project`、`assets`、`projectRevision` | 当前内核的导出，按 current schema 处理 |
| 首字节不是 `{`，而是 ZIP/二进制头 | 不是本文范围，先确认来源与导出方式 |

Dexie 备份的 `data.tables` 描述表结构与行数，`data.data[]` 按 `tableName` 存放实际行。典型表：`asset`（角色/背景/音频/字体）、`assetSource`（二进制与来源）、`project`（作品，`content` 是 JSON 字符串）、`template`。

## 解析顺序

1. 解析顶层 JSON，建立 `assetSource` 的 `id → row` 映射；旧场景里的 `https://s/26.png` 表示 **source id 26**，不是 asset id。
2. 遍历 `project` 行，解析 `content` 字符串；旧作品结构为 `{version, config, scenes[]}`。
3. 每个场景包含 `label`、`dialogues[]`、`children[]`、`sounds[]`、`config`。`children` 里的 `Sprite` 才是背景和人物；`Graphics`、`Text` 是旧版对白框/文字，当前内核不需要迁移。
4. `dialogues[].speak.speaker.name` 是说话人显示名，`speak.speaker.speakerTargetName` 是对舞台元素名；`speak.voice.targetName` 指向同场 `sounds[]` 的 `name`，再由 `sounds[].source` 找到音频 source id。
5. 台词正文在 `dialogues[].lines` 的嵌套 `children[].text`；`directive` 节点是旧版演出指令，转换时丢弃并在交付说明中标注。

## 字段映射

| 旧字段 | 当前项目对应 |
| --- | --- |
| `scenes[].label` | scene.name |
| `children[].assetType:"Background"` 的 `source` | scene.background 的图源 |
| `children[].assetType:"Character"` 的 `label`、`source` | 人物名与立绘图源 |
| `dialogues[].speak.speaker.name` | line.speaker |
| `lines` 内纯文本 | line.text |
| `sounds[].source` + `voice.targetName` | 该句的配音文件 |
| `transform:[x,y,sx,sy]` | 舞台站位的换算依据 |

## 素材提取

`assetSource.blob` 有两种序列化形态，按实际字段解码：

- `blob.data` 是 base64，按 base64 解码；
- `blob.stringContents` 是二进制字符串，按 Latin-1（单字节）写回。

解码后保留原扩展名（`png/mp3/woff2`）。同一 source 可被多个场景引用，按 id 去重后再写入文件。旧库常包含 16-bit PNG 背景与带透明通道的人物 PNG，浏览器可解码，但导入前仍要核对真实宽高与 alpha。

## 转换流程

1. 提取所有被引用的图片和音频，文件名带 source id，避免重名。
2. 按场景生成当前 `script` JSON：作品标题、`characters`、`backgrounds`、`acts[].scenes[].lines`。旁白行不写 `speaker`。
3. 用 `vnve create --script` 建立项目；一次创建多场时保持旧场景顺序。
4. `inspect` 拿到真实 sceneId、nodeId、actorId、背景 variantId。
5. `import` 批量登记图片与配音：图片替换占位 variant，配音按 `sceneId/nodeId/expectedText/expectedActorId` 绑定。
6. 用 Patch 恢复站位、入场和镜头；按 20 个 operation 一批分批应用。
7. `compile` 检查逐句时间与 `VOICE_MISSING`，`check` 检查媒体引用；最后在浏览器实际播放。

## 站位换算

旧舞台是 1920×1080，人物以脚底为基准、`transform` 的 x/y 是左上角。换算到当前百分比：

- 水平中心：`(x + width/2) / 1920 * 100`；
- 纵向：脚底对齐时 `y = 100`（旧数据常见 `-72 + 1152 = 1080`）；
- 缩放：当前内核把人物图高度归一化到画布高度的 80%，所以 `scale = 立绘高度 / (0.8 * 1080)`；1152 高的立绘约为 `1.333`。

横向位置要按每个人物的实际宽度计算，不能直接使用旧 `x`；不同场景左右站位可能互换。

## 常见陷阱

- **把 assetID 当图源**：旧库多个背景共用同一 `assetID`，但 `source` 不同；以 source id 为准。
- **文本尾部换行**：旧 `text` 常带 `\n`，新建与配音 `expectedText` 都必须使用内核实际保存的文本（通常已去除首尾空白），否则导入报 “expectedText snapshot” 错误。
- **缺配音的句**：旧库可能有 1–2 句没有声音；导入批次只包含有声音的句子，其余保留静音并在交付中列出。
- **`missingVoice` 计数误导**：只统计 `voice.targetName` 是否存在于 `sounds`，没有 voice 字段的句子不会被计入。
- **共用素材跨项目**：同一 workspace 的图组是共享的；给新项目导入同名背景会替换旧项目正在用的 variant 图。转换前确认是否接受共享替换。
- **大文件一次性解析**：几百 MB 的备份用流式或足够堆内存解析；不要用普通文本工具整文件读取。
- **旧演出丢失**：`FadeIn`、`Wait`、自定义对话框、字体不会自动等价转换；需要在新项目重新编排，并在交付说明中标注为近似重建。

## 验收

`compile` 应无错误，只有预期的静音提醒；`check` 的媒体引用应齐全。浏览器里至少抽查首场、换景场和最后一场：人物站位、入场、对白框遮挡与声音起点。旧备份解析成功不等于画面还原成功。