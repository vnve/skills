# TTS 与统一凭据

## 服务选择

用户已有服务时沿用。用户想快速试音、避免配置密钥时，建议由宿主使用下述 edge-tts 工作流。需要正式角色配音、特定情绪或用户已配置付费服务时，中文作品优先提供 MiniMax 和火山引擎豆包语音；SiliconFlow、Azure 作为已配置或明确选择时的备选。面板默认 MiniMax。先选服务和声音，试听代表性台词，再按已授权范围批量制作。付费接口调用前核对当前模型、音色、费用和使用条款。

## edge-tts 免密钥试音

[edge-tts](https://github.com/rany2/edge-tts) 是调用 Microsoft Edge 在线语音服务的第三方 Python 工具；不需要 Edge、Windows 或 API key，合成需要联网，台词会发送到 Microsoft。它适合快速样片，不是本地离线模型。由宿主检查工具是否已安装；缺失时可用 `pipx install edge-tts` 安装，vnve CLI 本身不新增 Python 依赖。

1. 先运行 `edge-tts --list-voices`，从实际返回的中文音色中选择角色声音；不要把示例音色当作长期保证。
2. 用一条代表性台词试音，例如 `edge-tts --voice zh-CN-XiaoxiaoNeural --text "明天，我们一起去看海。" --write-media line-001.mp3`，仅在列表含该音色时执行。可用 `--rate`、`--pitch`、`--volume` 调整；不支持任意自定义 SSML。
3. 批量制作时逐句使用 `getTtsText(node)` 的发音文本（其中 MiniMax 标记需先按下节适配），演出标签保留在 ScriptDoc；按 actorId 固定音色。按 [素材与音频](media.md) 导入真实文件、实际时长和台词快照，再 compile 校验时间并在浏览器试听。
4. 连接、限流或接口变化导致失败时，保留现有配音，报告失败句；经用户选择后切换已配置服务。不要把第三方客户端描述为有稳定性承诺的官方 API，也不要把开源工具许可证当作音频使用权保证。商用交付另行核对服务及音色使用条款。

edge-tts 不使用 vnve 凭据面板，不创建虚构 token 配置。用户授权配音制作后由宿主调用，网页打开和保存不会触发合成。

## edge-tts 批量模板

使用可选宿主脚本 [edge_tts_batch.py](../scripts/edge_tts_batch.py)，不增加 vnve CLI 依赖。先运行实际环境的 `edge-tts --help` 和 `--list-voices` 并试听，按 actorId 固定声音；旁白显式填写 null。下面音色仅作为列表存在时的试音候选，角色年龄与风格以试听为准：旁白 Yunyang（可试 -8%）、较有力度男声 Yunjian、轻快男声 Yunxi（可试 -4%）、另一路男声 Yunxia。完整名称形如 `zh-CN-YunyangNeural`；不把这套候选固定为所有作品默认。

先从完整 inspect 核对场景、节点、发音文本与演员，写成本次计划；同一个 actorId 在计划中保持相同 voice。脚本只处理普通文本，不翻译 MiniMax 的 `<#…#>` 停顿或 `(kind)` 感叹词。含这类标记的句子需要宿主适配停顿、表演与音频合成，或改用支持标记的服务；不删除 ScriptDoc 演出、不把标记交给 Edge 朗读，也不把未处理句标为已配音。

```json
{
  "items": [
    {
      "sceneId": "FROM_INSPECT",
      "nodeId": "FROM_INSPECT",
      "expectedText": "明天，我们一起去看海。",
      "expectedActorId": null,
      "voice": "zh-CN-YunyangNeural",
      "rate": "-8%",
      "pitch": "+0Hz"
    }
  ]
}
```

```sh
# 默认只验证计划，不联网，不创建输出目录。
python3 /absolute/installed-skill/scripts/edge_tts_batch.py /absolute/voice-plan.json --output-dir /absolute/voices-new
# 用户已授权这些台词由 Edge 合成后执行，输出目录必须不存在。
python3 /absolute/installed-skill/scripts/edge_tts_batch.py /absolute/voice-plan.json --output-dir /absolute/voices-new --execute
# 核对 report.json 的失败句；重新 inspect 之后导入成功项，generated=0 时不执行 import。
vnve import /absolute/workspace PROJECT_ID /absolute/voices-new/import.json
```

模板顺序执行，句间等待 1.5 秒，失败后按 2/5/8 秒退避，最多四次；按 `sceneId/nodeId.mp3` 输出，仅成功项进入 import.json，失败句写 report.json 并非零退出。保留已有配音和输出；重做失败句时建一个只含失败目标的新计划和新输出目录。先完成一小段试听再跑已授权范围，反复限流或服务不可用时停下报告，不无限重试。

命令使用参数数组，`--voice` 紧跟音色；负数选项写成 `--rate=-8%`、`--pitch=-2Hz`，避免负号被当作选项。参数不要求固定先后顺序，要保证每个选项和值绑定；依据 [edge-tts CLI 源码](https://github.com/rany2/edge-tts/blob/master/src/edge_tts/util.py)。模板的初步成功条件为退出码 0 且文件至少 1KB；文件大小不能证明内容有效，随后仍须 vnve import 探测真实音轨、compile 核对时窗并在网页实际审听。模板不自动导入、不覆盖项目，也不代表已验证真实配音质量。

## 付费服务接口

| 服务与配置 ID                          | 请求地址                                                         | 宿主请求方式与官方说明                                                                                                                                                                                                                                                                                                                                                      |
| -------------------------------------- | ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| MiniMax / `minimax-tts`                | `https://api.minimaxi.com/v1/t2a_v2`                             | POST JSON，Bearer token；填写 `model`、`text`、`voice_setting.voice_id`、`stream:false` 和音频格式。检查 `base_resp.status_code`，将 `data.audio` 的十六进制解码为真实音频文件。[同步合成官方文档](https://platform.minimax.cn/docs/api-reference/speech-t2a-http)。                                                                                                        |
| 火山引擎 · 豆包语音 / `volcengine-tts` | `https://openspeech.bytedance.com/api/v3/tts/unidirectional`     | POST JSON；新版控制台 API Key 放入 `X-Api-Key`，`resourceId` 放入 `X-Api-Resource-Id`，另生成 UUID 作为 `X-Api-Request-Id`。`req_params` 填 `text`、`speaker`、`audio_params`；按 HTTP Chunked 返回逐条解析 JSON，校验业务状态并解码、拼接 base64 音频。[官方接口文档](https://docs.volcengine.com/docs/DoubaoVoice/unidirectional-streaming-text-to-speech-http?lang=zh)。 |
| Azure Speech / `azure-tts`             | `https://<region>.tts.speech.microsoft.com/cognitiveservices/v1` | POST SSML；`Ocp-Apim-Subscription-Key` 使用 token，`Content-Type: application/ssml+xml`，`X-Microsoft-OutputFormat: riff-24khz-16bit-mono-pcm`。region 必须匹配用户资源，音色使用官方支持列表；转义台词 XML。[REST 接口](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/rest-text-to-speech)。                                                          |
| SiliconFlow / `siliconflow-tts`        | `https://api.siliconflow.cn/v1/audio/speech`                     | POST JSON；`Authorization: Bearer <token>`，使用当前支持的 `model`、`voice`、`input`、`response_format`，逐句获取音频二进制。[接口](https://docs.siliconflow.cn/docs/api/audio-speech-post)、[模型与音色](https://docs.siliconflow.cn/docs/userguide/capabilities/text-to-speech)。                                                                                         |

模型和音色从账户当前支持列表选择并保存，不将示例名称当作长期保证。声音克隆仅使用用户有授权的样本。失败时记录不含凭据的状态摘要，避免打印请求头、完整响应或配置文件。获得真实音频后按 [素材与音频](media.md) 导入并校验台词快照；浏览器真实试听仍是必需步骤。

## 用户级凭据位置

编辑器「API 设置」分为「TTS 设置」与「生图设置」。TTS 提供 MiniMax、火山引擎；生图提供 Seedream、MiniMax。统一配置文件为 `~/.config/vnve/setting.json`，结构为 `{ "services": { "minimax-tts": { "token": "…", "endpoint": "…", "model": "…", "resourceId": "" } } }`。服务 ID 包括 `minimax-tts`、`volcengine-tts`、`volcengine-image`、`minimax-image`。`~` 指本地服务用户主目录。配置不保存角色音色。

MiniMax TTS 使用 Bearer token 认证，`/v1/t2a_v2` 合成；由宿主调用 `POST https://api.minimaxi.com/v1/get_voice`，请求体 `{ "voice_type": "all" }`，读取 `system_voice`、`voice_cloning`、`voice_generation` 中实际返回的音色，再为角色选择，将 ID 传入 `voice_setting.voice_id`。不要让用户在全局设置手填音色，也不要编造固定音色列表。参见[官方音色管理](https://platform.minimaxi.com/docs/api-reference/voice-management-get)。

火山 TTS 使用新版 API Key：`X-Api-Key`、`X-Api-Resource-Id`、随机 UUID `X-Api-Request-Id`；`req_params.speaker` 从[官方音色列表](https://www.volcengine.com/docs/6561/1257544)或控制台音色库选择。资源 ID 默认 `seed-tts-2.0`，复刻声音按已开通资源选择；模型仅在所选音色需要时填写。旧版 App ID / Access Token 不能作为新版 Key。参见[官方 HTTP 合成接口](https://docs.volcengine.com/docs/DoubaoVoice/unidirectional-streaming-text-to-speech-http?lang=zh)。

生图接口：MiniMax `/v1/image_generation`，Seedream `/api/v3/images/generations`，均使用 Bearer token；按各自官方 API 组装请求，不能混用请求体。TTS 与生图的账户密钥分开配置。

目录权限 0700、文件权限 0600，原子写入并串行更新，保留其他服务配置。网页只读非密钥元数据；API Key 留空保留已保存密钥。保存、打开与删除均不调用外部服务。旧分散凭据文件不自动迁移或删除，需要在新面板重新配置。

本地服务若由隔离的 Agent 启动，工作区写权限不等于用户配置目录写权限。应在启动时由宿主授权 `~/.config/vnve` 的写入与原子重命名；设置页会先做无密钥能力探测，无权限时禁止输入密钥与保存并说明原因。保持用户级统一存储，不回退到项目文件；已有有效服务优先复用。

宿主只在用户选择并授权服务调用后，在进程内读取 `setting.json` 的 `services[配置ID]`；不要通过 cat、命令行参数、聊天或日志展示 token。只向用户选择的服务发送密钥，调用前核对 endpoint。配音与生图仍由宿主执行，保存配置不代表授权产生费用。

凭据不进入 project、共享素材、provenance、制作笔记、撤销记录、导出或源码提交。制作笔记只记配置 ID、模型与音色。AI 宿主处于另一台机器或不能读取该目录时，明确说明无法复用本机凭据，使用该宿主的安全凭据配置。
