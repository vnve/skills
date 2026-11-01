# VNVE Editor 模块

编辑器沿用黑灰底色、蓝色主操作和紧凑控件。Act 与场景缩略条位于画布下方。桌面台词列表位于画布右侧、可调整宽度；窄窗口回到底部、可调整高度。HUD 承担快捷操作，详细属性以按需浮层打开，不常驻占用画布宽度。

- 台词在 `ScriptPanel` 中使用 `RichEditor` 和 `PlateRichTextEditor` 原位编辑，说话人在行内切换，选中后展开独立录音试听条，仅播放已有 audioUrl，不驱动画布；行尾评论复制台词与定位上下文给宿主 Agent。保留富文本与 InlineTag，不再展示台词设置、序号、时长、句末或待配音标记。
- 对象列表与当前对象的控件由 `CanvasTools` 上下展示，不设属性/对象 Tab；人物属性与画布拖动共用当前帧及演出控制点。场景属性只展示当前场景的进入转场，隐藏默认值关联细节；背景从对象列表进入替换。顶部齿轮设置入口仅管理本地凭据。
- 对白框样式由 HUD 和按需属性浮层调整；完整主题结构由宿主通过作品接口编排。
- `stores/editor-store.tsx` 提供当前 Session 的只读快照，不另建作品 store。所有改动使用原子 Patch，图片和配音使用本机工作区服务。

画布复用 `ContextToolbar` 的选中对象快捷条，与右侧面板共用 Patch；场景对象列表提供缩略图、显隐和锁定行。创作、场景结构、共享素材管理和复杂演出由宿主 Agent 负责。

预览渲染器按作品和画幅维持实例。修改只更新序列与资源，新帧绘制后再释放旧帧资源；并行 InlineTag 使用固定高度的汇总标记，明细在浮层展开。

控件与设计语言约定见 [编辑器 AGENTS.md](../AGENTS.md)。图标动作和播放进度统一由 `EditorControls.tsx` 处理；录音试听复用 `VoicePreview`，共享控件样式位于 `editor-controls.css`。

目录按职责组织：`components/` 为工作区与通用 UI，`panels/` 为业务面板，`script-editor/` 为台词富文本与 InlineTag，`core/` 为本地服务桥接及编辑算法，`stores/` 为只读 Session 上下文与临时交互状态，`i18n/` 为当前界面使用的中文文案。`ui.css` 与 `theme.css` 定义共享控件样式和主题。
