# 运行与制作接口

CLI 用途、人与 Agent 的分工及快速上手见 [CLI 使用指南](cli-guide.md)。

先执行 `vnve doctor`，核对 JSON 中 `ok:true`、`apiVersion:2` 与本 Skill 的 [cli.json](../cli.json) 声明版本。CLI 是独立二进制，执行不需要 Node.js、Bun、源码或 node_modules。未安装时读取 [CLI 安装](installation.md)，选择当前平台的版本并使用绝对路径调用；不要临时安装 Node 或回溯寻找源码。命令中的 `vnve` 表示 PATH 中的兼容二进制，或已定位的绝对路径。路径含空格时正确引用。

服务启动权限：同一工作区已有可用且获授权的服务时优先复用。启动新服务时，向宿主申请工作区与用户配置目录 `~/.config/vnve` 的写入权限（包括临时文件的原子重命名），按宿主的目录授权或启动审批执行。设置页会在输入密钥前，用无密钥临时文件探测目录写入能力；权限不足时只读显示已有配置，提示授权后重启。不能授权时可让用户从普通本机终端启动服务，不把凭据移入作品目录，也不修改宿主的隔离策略。

```bash
vnve --help
vnve schema script
vnve schema patch
vnve inspect /absolute/workspace
vnve create /absolute/workspace "故事标题" --script /absolute/script.json
vnve inspect /absolute/workspace PROJECT_ID
vnve compile /absolute/workspace PROJECT_ID
vnve check /absolute/workspace PROJECT_ID
vnve patch /absolute/workspace PROJECT_ID /absolute/plan.json
vnve apply /absolute/workspace /absolute/preview.json
vnve serve /absolute/workspace --project PROJECT_ID
```

创作、生图、配音和资源检索由宿主 Agent 调用用户选择的工具完成，随后通过 import 导入。编辑器提供本机统一凭据面板，调用服务仍由宿主执行；没有网页 Agent 或 AI Gateway。

workspace 目录须已存在。首次访问初始化 `.vnve` 布局；损坏 JSON 会报错，不重建覆盖。inspect 返回原数据与 revision；patch 返回实际修改后的项目、原版本和原计划。将 patch 的标准输出直接保存成预览文件，再交给 apply；不要重写里面的 ID 或版本。CLI 的标准输出为 JSON（serve 输出启动链接），直接调用独立二进制，避免包管理器日志混入 JSON。失败向 stderr 输出 JSON（ok:false、code、message、command、path、expected；schema 校验另含 issues），退出码为 1。path/expected 无可用上下文时为 null。

serve 持续运行，打印带临时会话信息的回环地址。用户打开后用 HttpOnly cookie 访问同源服务，会话信息从地址栏移除。服务是前台进程，宿主结束会话或终止进程后链接失效；重启服务后使用新的启动链接。不要将完整会话链接公开发布。

create 的 script 文件遵循运行时 schema，最小例子：

```json
{
  "title": "公园里的约定",
  "characters": [
    { "name": "小夏", "description": "明快的女孩" },
    { "name": "阿明", "description": "温和的男孩" }
  ],
  "backgrounds": [{ "name": "公园", "description": "白天的公园" }],
  "acts": [
    {
      "name": "约定",
      "scenes": [
        {
          "name": "重逢",
          "background": "公园",
          "lines": [
            { "speaker": "小夏", "text": "你终于来了。" },
            { "speaker": "阿明", "text": "我们出发吧。" }
          ]
        }
      ]
    }
  ]
}
```

Skill 是制作工作流，不是另一套项目格式。人物身份、素材和 ScriptDoc 由内核构建并持久化；预览与导出继续使用网页共享的播放编译和帧采样逻辑。

编辑器停手约2秒后自动保存，持续输入约10秒尝试一次；输入法组字与未提交的数值字段等编辑完成。页面检查项目和共享素材版本，CLI 外部更新优先载入；若网页仍有未保存修改，先将完整快照写入 `.vnve/recovery/<作品目录名>.json`（每作品最近一份），再替换页面，通知提供“保存之前修改”导出副本。备份失败保留页面并报错；正常自动保存保留撤销历史，外部载入清空旧撤销栈。网页保存会校验载入时的项目及共享素材版本，冲突时不覆盖旧内容。本地服务与 CLI 共用跨进程锁；多文件保存用事务日志回滚并在进程退出后恢复，读取也等待恢复完成。RECOVERY_REQUIRED 时保留日志和原文件，不删除日志强行继续。其他程序直接写盘不参与互斥，避免并行编辑同一 workspace；硬件断电持久性仍不作保证。IO 失败后先 inspect，不盲目重放。

`inspect --brief` 返回版本、人物身份、场景节点数量及视觉组/变体 ID、名称和 key，省去完整剧本与媒体细节；修改台词或声音时仍读取完整 inspect。

## 成功返回值与 inspect 数据地图

成功输出不是统一的 `{ok,projectId}` 包装；按命令解析下面的字段，不从错误 JSON 猜成功结构。

| 命令                   | 成功返回的关键字段                                                                                                                                                                                                                                                    |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `create`               | `entry.projectId` 是作品 ID，`entry.dirName` 是作品目录名；另有 `project`、`assets`、`projectRevision`、`assetsRevision`。也可从 `project.meta.id` 核对 ID。                                                                                                          |
| `inspect WORKSPACE`    | `projects[]`，每项包含 `projectId`、`title`、`dirName` 等索引信息。                                                                                                                                                                                                   |
| `inspect WORKSPACE ID` | 顶层 `project`、`assets`、`projectRevision`、`assetsRevision`；项目文档本身不内嵌共享 assets。                                                                                                                                                                        |
| `import`               | 单对象输入直接返回该项摘要与新双版本；数组或 `{items:[…]}` 输入返回 `ok:true`、`items[]`、新双版本。视觉项包含 `groupId`、`variantId`、`replaced`，音频含 `assetId`，字体含 `fontId`；普通媒体项还返回 `path`、`provenance`、`metadata`。                             |
| `compile`              | `ok`、`duration`（秒）、`scope`、`scenes[]`、`lines[]`、`audioPlan`（对象）、`resources[]`、`issues[]`、`issueSummary[]`、`pending[]` 等。audioPlan 含 `duration`、`bgmSegments[]`、`sfxTriggers[]`、`voiceSegments[]`、`speechWindows[]`；总时长不叫 totalDuration。 |

以完整 inspect 为基准：

| 我要做什么                 | 读取位置                                                                                                                                        |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| 定位一句台词、配音绑定目标 | `project.acts[].scenes[].id` 与该场 `script.nodes[].id`；节点的 `actorId` 是舞台演员 ID，旁白通常省略此字段，voice 导入用 JSON null。           |
| 改台词、保留演出           | `script.nodes[].content` 中 text/tag 段；`text` 是纯文字兼容字段，不能代替整段 content。没有 content 时使用 text。                              |
| 确定说话人的故事身份与声音 | 将 node.actorId 对应到同场 `actors[].id`，再读其 `subjectId` 与 `project.visualSubjects[]`；勿把 subject ID 当 actor ID。                       |
| 增加外观、换媒体           | `assets.visual.character/background/prop/cg[].id`、`defaultVariantId`、`variants[].id/key/url`；故事身份及状态另见 `project.visualSubjects[]`。 |
| 换背景                     | 同场 `backgroundId` 是素材变体 ID，`backgroundSubjectId/backgroundStateId` 是故事身份与状态；通过 Patch 更新。                                  |
| 获取已有配音与防止误绑     | 节点 `audioUrl/audioDuration`、`audioImportSnapshot`；绑定检查使用当前发音文本和 actorId，不能复用过期快照。                                    |
| 防止覆盖外部修改           | 顶层 `projectRevision/assetsRevision`，不是 project.meta.updatedAt。                                                                            |

`getTtsText` 是内核 helper，不是 inspect 自带字段，也不是 CLI 命令。其发音文本构建规则：content 存在时按顺序拼接 text 段，wait 转 `<#seconds#>`，interjection 转 `(kind)`，其他演出不发音；没有 content 时使用 node.text。仅等待而无文字/感叹词的节点不配音。这些标记是 MiniMax 约定，其他 TTS 需要显式适配；不得让 edge-tts 将其逐字读出。保留 ScriptDoc 中原 tag，voice 的 expectedText 始终绑定内核发音文本。处理不支持的停顿/感叹词时读 [服务与批量配音](services.md)。

## 时间和诊断

compile 是只读共享编译，返回 lines（nodeId、全局 start/end、revealDuration、voice 区间）、scenes、已解析 motions、transitions、events、audioPlan、resources 与 issues。`--scene ID` / `--act ID` 限定范围；动画的 start 仍是场景局部时间，逐句 start 是全片时间，换算时使用 scene.contentStart。check 在同一报告上检查实际引用文件、真实尺寸与音轨时长。两者遇 error 返回退出码1，同时保留 JSON 报告；warning 不等于完成。check/compile 均返回按 code 和 level 聚合的 issueSummary；`--issues=summary` 省略逐条 issues，`--issues=all`（默认）保留全部诊断。占位图、缺配音和过期声音分别报告，静默作品允许缺配音。

仅当前范围实际引用的媒体参与预加载和文件检查，含后续行内换图及转场。未用到的共享资源缺失不应阻断本片。`pending: BROWSER_LAYOUT_REQUIRED` 表示 CLI 未验收真实字体、构图、混音；打开网页，等待字体加载后按实际画面检查正文/姓名牌是否溢出，再实际观看和审听。check 的头信息探测不能代替浏览器完整解码。
