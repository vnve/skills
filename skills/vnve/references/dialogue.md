# 对白框与主题制作

当用户要求文字排版、旁白版式、自定义框图、姓名牌或显示节奏时读取本参考。对白框属于作品的视觉设计；先根据画幅、语言、文本长度和角色遮挡确定布局，再决定是否需要框图。不要把以下示例变成固定风格。源图不烘焙台词、角色姓名或按钮，文字由编辑器绘制。

## 结构化主题

执行 `vnve schema theme` 查看完整字段和范围；`schema patch` 查看操作。主题由 `{id,name,baseThemeId,data}` 构成。baseThemeId 目前支持 classic/scifi/elegant/mystery/detective/daily/xianxia/wasteland，均可用作可组合基础；主题 data 显式字段覆盖基础值。

| 属性                                                                            | 单位与语义                                                                                   |
| ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| boxFill/boxStroke/textColor/nameColor/nameplateFill                             | 渲染器支持的颜色字符串，透明色可用 rgba(0,0,0,0)                                             |
| boxGradient | `{top,middle,bottom}` 颜色，垂直渐变在 0%、42%、100% 采样；null 为纯色。显式 boxFill 且未提供渐变时使用纯色 |
| boxBottomGap | 底部间距像素；默认随画幅缩放，经典为 0。仅用于默认底部锚定，手动移动 Y 后按中心位置 |
| boxDecoration/boxAccent | 可选边缘装饰 none/rule/corners/double-rule/side 及其颜色，不影响正文区域；也可导入任意框图 |
| fontFamily/nameFontFamily                                                       | 字体族，允许字体回退列表；字体必须已安装或已在项目共享字体库导入。CLI 此版本没有字体导入命令 |
| fontSize/nameFontSize、paddingX/Y、nameplatePaddingX/Y、cornerRadius、boxHeight | 项目参考画布像素，随渲染尺寸缩放                                                             |
| boxWidthPercent、dialogueX/Y                                                    | 相对于项目画布的百分比；X/Y 为对白框中心                                                     |
| nameplateX/Y/Width/Height、bodyX/Y/Width/Height                                 | 相对于对白框的百分比；X/Y 为各文字区域左上角。正文与姓名牌分别布局                           |
| nameplateVisible                                                                | 是否显示姓名牌，旁白可关闭                                                                   |
| lineHeight                                                                      | 行高乘数                                                                                     |
| defaultDisplayMode                                                              | typewriter（逐字）、line（逐行）、instant（即时）；不代表新增动画算法                        |
| boxImageAssetId/Url、boxImageFit/Opacity/Slice                                  | 已导入框图引用，填充方式 stretch/contain/cover、透明度0–1，以及源图像素的九宫格边距          |

底部框、居中文字、字幕或全屏文字可以组合现有尺寸、位置和区域参数。还没有人物锚定气泡、任意形状文字环绕、对白框程序运动或自动长文本分页接口，不要承诺这些能力。示例 [对白主题示例](../examples/dialogue/cinematic-theme.json) 是1920×1080下的参考，不是其他画幅的固定规格。

## 中文 ADV 阅读基线

内置横屏主题以 1920×1080 为参考：正文 36px、姓名 33px、行高 1.5；1280×720 等比对应 24px、22px。经典为全宽底部渐变，高约 28%，上沿透明、正文背后较深、底边最深；文字左右各留约 11%，每行约 41 个全角字。其余七套使用内置框图，框宽约 79%–83%、高约 26%，保留底部留白；科幻、典雅、悬疑保留原图，侦探、日常、仙侠、废土使用新版生成框图。八套主题统一采用上述字号，深色框用浅字，日常和仙侠使用浅底深字。把这些作为普通中文对话的起点，根据字体和画幅验证实际效果；已有作品显式覆盖的像素值保留。

先确定正文与姓名层级，再核对文字区域和两行台词的高度。长台词优先按语义拆句；调整字号后同步检查换行、姓名牌高度和框体底部留白。用真实短句、约50字双行、长姓名及混排做浏览器预览与导出检查。人物景别按叙事决定：普通对话优先看清表情，远景保留环境；素材透明边会影响可见尺寸，以画面中的人物而不是 scale 数字判断。

## 创建并应用

先 inspect 取得真实 sceneId 和共享主题，优先复用已存在主题。`dialogue.theme.apply` 的 scope=scene 为本场独立样式；scope=default 只更新项目默认，已有独立场景保留；scope=project 为显式覆盖全部场景。`dialogue.theme.link` 传 sceneId，将本场重新设为跟随项目默认，并清除本场的对白样式和阅读节奏覆盖。使用新 ID 创建主题，不覆盖旧主题；因为主题素材跨项目共享。编辑器从内置主题创建自定义时会固定完整排版快照，并把框图复制到共享素材，保存后不依赖生图目录。修改现有主题时复制其 data/baseThemeId，使用新 ID，再只应用到授权场景。

```json
{
  "summary": "改为浅色旁白版式",
  "operations": [
    {
      "type": "dialogue.theme.create",
      "sceneId": "FROM_INSPECT",
      "theme": {
        "id": "narration-light-v1",
        "name": "浅色旁白",
        "baseThemeId": "classic",
        "data": {
          "boxFill": "rgba(248,246,240,0.96)",
          "textColor": "#20242b",
          "nameplateVisible": false,
          "fontSize": 38,
          "boxHeight": 240,
          "boxWidthPercent": 86,
          "dialogueX": 50,
          "dialogueY": 82,
          "bodyX": 5,
          "bodyY": 12,
          "bodyWidth": 90,
          "bodyHeight": 76,
          "lineHeight": 1.5,
          "defaultDisplayMode": "line"
        }
      }
    },
    {
      "type": "dialogue.theme.apply",
      "sceneId": "FROM_INSPECT",
      "themeId": "narration-light-v1",
      "scope": "scene"
    }
  ]
}
```

沿用 runtime.md 的 patch → apply，不直接改 project.json/assets.json。预览结果包含作品和实际共享主题数据；应用时同一事务保存。任一引用错误或版本冲突不写入作品。

scope 默认 scene；project 明确重设全片场景的默认主题以及新场景的项目默认值。应用会清除目标场景旧的外观/位置 overrides，使用新主题布局；未指定的阅读节奏与句间隔按场景保留。可显式给 apply 提供 displayMode、readingPace、lineGap。操作不改台词、已有录音和行内指令；已有行内 theme/displayMode 仍可能覆盖场景默认值。全片范围需要用户已授权，不把单场请求扩展为全片。

## 自定义框图

当前 CLI 框图入口支持静态 PNG，拒绝 APNG 动画以避免预览和逐帧导出依赖播放历史；自动读取PNG头中的真实宽高；不要求固定尺寸。建议可伸缩边框使用九宫格，保留中央文字安全区。装饰性不规则框可用完整图像填充；框内文字区域仍为矩形。透明通道与风格一致性需要实际检查，导入接口不替代视觉验收。

准备 import JSON：

```json
{
  "file": "/absolute/frame.png",
  "kind": "dialogue-frame",
  "theme": {
    "id": "frame-v1",
    "name": "自定义对白框",
    "baseThemeId": "classic",
    "data": {
      "boxFill": "rgba(0,0,0,0)",
      "boxStroke": "rgba(0,0,0,0)",
      "boxWidthPercent": 88,
      "boxHeight": 250,
      "dialogueX": 50,
      "dialogueY": 83,
      "bodyX": 4,
      "bodyY": 34,
      "bodyWidth": 92,
      "bodyHeight": 58,
      "boxImageFit": "stretch",
      "boxImageOpacity": 1,
      "boxImageSlice": { "left": 48, "right": 48, "top": 48, "bottom": 48 }
    }
  }
}
```

通过 `vnve import <workspace> <project-id> <import.json>` 导入。框图复制到 workspace，主题仅注册，不自动应用；再用 dialogue.theme.apply 应用授权范围。可选 width/height 若提供必须与PNG头一致；九宫格左右/上下边距之和必须小于源图宽/高。theme ID 必须为新值。theme.create 引用框图时只能复用项目已登记图像，不能凭空编造路径。

PNG解码和文字可读性仍要在真实浏览器检查；文件头校验不是完整图像解码。失败后先 inspect，勿无脑重试相同 ID；冲突可能留下未绑定的复制文件，保留原作品，不自动清理未知引用素材。

## 交付检查

外部修改后先确保网页没有未保存编辑，再重开作品。选中画布对白框后，HUD 可切换主题，更多属性按需提供字号、宽度等本场微调；位置可直接拖动；字号和宽度通过 `dialogue.style.update` 写入本场 overrides，保留现有主题、位置和阅读节奏，不新增共享主题。高级样式可打开完整主题工作室；全片范围由宿主使用主题 schema 与 Patch 完成。

至少检查最长台词、中文/英文混排、换行与姓名牌、人物遮挡、当前画幅和九宫格拉伸。这里的数值校验只能拒绝非法区域，不能证明所有字体和台词都放得下。发现溢出时调整字号、区域或拆分台词，拆分须保留语义并重新配音；不能静默裁掉文字。预览与MP4使用同一现有编译/渲染链，交付前实际导出并检查代表帧、声音与保存重开。

网页底部「检查」使用实际加载字体、共享正文矩形与排版算法检查长对白及姓名牌溢出；正文可用 dialogue.timing 独立设置揭示与读后停留。CLI check 不会将字数估算冒充浏览器排版通过。
