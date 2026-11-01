# 素材与音频

先 inspect 查看实际素材及场景节点 ID。优先复用；不要仅为凑齐表情或时段生成重复媒体。

## 素材检索的参考入口

按内容、画风和可获取性选择素材。下面是参考来源，不是必须经过的白名单；用户指定的来源、已有文件和宿主生成结果均可使用。来源、作者、许可与署名信息有现成记录时一并保留，不为缺少这些字段阻断制作或要求用户补齐标准许可证。

| 用途 | 参考来源 | 制作注意 |
| --- | --- | --- |
| 简洁角色、道具、界面、基础音效 | [Kenney 素材目录](https://kenney.nl/assets) | 同一作品优先同套素材，避免混搭风格。 |
| 环境声、事件音效 | [Freesound](https://freesound.org/search/) | 按声音内容筛选；下载若需登录，由用户完成登录。 |
| 配乐 | [Incompetech 曲库](https://incompetech.com/music/royalty-free/) | 按情绪和节奏选曲；不自动购买或订阅。 |
| 写实环境参考、材质、HDRI | [Poly Haven](https://polyhaven.com/all) | 3D/HDRI 不是可直接导入的背景，先由宿主产出本地图片。 |

素材不合适时，转向其他来源、用户文件或已选的宿主生图能力，不为了满足某个许可标签而使用不匹配的画面。TTS 服务另见 [TTS 与统一凭据](services.md)。

用户文件可直接导入。网站素材先保存为本地文件，有原页面链接就记录；下载或生图失败不能移除已有资源。生成能力由宿主可用工具或用户的 Provider 提供，本 Skill 不内置平台 Key，也不自动调用未配置服务。

`license` 和 `sourceUrl` 均为可选。`license` 接受普通文字，不要求 SPDX、CC 或其他标准格式；未知时省略即可，不猜填 CC0 或“可商用”，不因未知而反复追问、报错或更换素材。已知限制按原信息保留；仅在用户明确提出商用、公开分发或许可核验要求时，进一步调查是否满足该用途。

`sourceUrl` 若提供，必须是合法的公开 HTTP/HTTPS 页面 URL；不可填“AI 生成”等描述，也不可包含账号密码或 token/key/signature 等凭据参数。没有公开来源页时省略。生成工具、模型、提示词和后处理说明写在 workspace 的制作笔记中；`license` 只记录已知的许可信息，不把生成说明当作许可。

批量生图前汇总本轮张数、尺寸及已有工具提供的费用或额度信息；沿用用户已授权的范围。实际费用未知就注明未知，不虚构固定点数，也不对已授权批次逐张重复询问。先让一张代表性素材通过验收，再扩展同套表情。

人物素材在导入前先按 [图片准备与检查](image-preparation.md) 核对透明通道与边缘；需要清理或统一画布时输出新文件并检查，保留原图及已有来源信息，不直接覆盖共享素材。

执行：

```bash
vnve import /absolute/workspace PROJECT_ID /absolute/media.json
```

同一个 JSON 文件可传单项、数组或 `{ "items": [...] }`。批次按顺序准备，成功后只提交一次项目和共享素材版本，返回 items 逐项摘要（视觉项含 groupId、variantId、replaced）；任何项失败不提交元数据，并清理本批新增文件。文件路径相对于导入 JSON 所在目录解析，也支持绝对路径。批次不是逐项独立成功；修复错误后重新执行整个批次。进程被强制终止时可能留下未引用的媒体文件。

视觉项可用 `groupName` 精确匹配唯一已有组、`variantKey` 匹配其唯一外观键；存在歧义或找不到时报错，不自动新建或模糊匹配。组名按目标作品 inspect 结果填写；替换 name 不会更改人物身份。内置素材从 [素材包](../assets/README.md) 的 manifest.json 选择，结合 inspect 的实际 ID 生成本次导入 JSON。

视觉导入文件示例：

```json
{
  "file": "/absolute/hero.png",
  "kind": "character",
  "groupId": "FROM_INSPECT",
  "variantId": "FROM_INSPECT",
  "width": 640,
  "height": 960,
  "sourceUrl": "https://source.example/item"
}
```

没有公开来源页的生成图，可直接省略 `sourceUrl`：

```json
{"file":"/absolute/hero-clean.png","kind":"character","groupId":"FROM_INSPECT","variantId":"FROM_INSPECT"}
```

kind 可为 character/background/prop/cg。默认替换 inspect 中已有 groupId/variantId（省略 variantId 为默认图），保留故事身份。共享素材替换会影响其他引用它的作品。

新建组使用 `register:true`、name，可提供 groupId/variantId 作为稳定 ID；给已有组增加表情使用 `register:true,groupId,variantId,name`。返回实际 ID，再用 subject.create / subject.state.add / subject.bind / actor.create 绑定故事，见 [原子编辑](editing.md)。导入不自动添加舞台演员。

CLI 自动探测真实尺寸、GIF/PNG/WebP/AVIF 的动画标志与音轨时长；可省略 width/height/duration，若提供则校验。格式、尺寸或时长不符会在复制前拒绝。动画最终解码与 seek 仍需浏览器验证；网页图片替换仅支持静态图片。

音频示例：

```json
{
  "file": "/absolute/line.wav",
  "kind": "voice",
  "sceneId": "FROM_INSPECT",
  "nodeId": "FROM_INSPECT",
  "expectedText": "inspect 中 getTtsText 对应的台词正文",
  "expectedActorId": "FROM_INSPECT_OR_NULL",
  "sourceUrl": "https://source.example/item"
}
```

kind=voice 绑定具体台词，必填 expectedText 和 expectedActorId（旁白为 JSON null），防止生成期间台词或说话人改变后误绑。expectedText 使用台词发音文本；包含 wait/interjection 时保留其 TTS 标记。可附 expected:{projectRevision,assetsRevision} 双版本；发生冲突先 inspect。导入保存声音快照，修改正文/说话人后旧声音失效。时长来自真实音轨，阅读停留使用 dialogue.timing，不伪造音频长度。

bgm/sfx 导入使用 kind、name、file，返回 assetId；再通过 direction.insert 的 bgm/sfx 命令安排播放、音量、淡入淡出/duck，字段以 schema patch 为准。仅导入库不等于完成编排，compile.audioPlan 与实际审听确认。

字体使用 `kind:font,file,name` 导入，支持 TTF/OTF/WOFF/WOFF2；返回 fontId。主题 fontFamily/nameFontFamily 使用注册的 name。网页等待实际使用字体加载后预览与导出；字形覆盖仍需检查，已有的字体许可信息可随素材保留。

导入会复制文件到 workspace，原文件保留。来源记录在返回的 provenance 路径；不能将 Key、签名下载链接中的凭据或本机私人文件路径写入来源记录。缺少许可时省略该字段，继续制作；无需单独追问或将其列为制作错误。

TTS：若用户选择配置好的外部 TTS，先生成代表性句子供试听，再生成需要的范围，将实际音频下载到本地后逐句导入。本地模式不提供网页选声或 TTS 生成入口；网页保留单句录音导入/替换与试听。当前版本不提供 CLI 选声、TTS 调用或内置录音器；不能虚构这些命令。

对白框 PNG 的登记、九宫格边距和主题应用见 [对白框与主题](dialogue.md)，使用 kind=dialogue-frame，不使用角色或背景的导入格式。
