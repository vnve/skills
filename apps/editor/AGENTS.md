# 编辑器组件与设计语言

VNVE Editor 使用黑灰工作区、单一蓝色强调、紧凑控件与按需面板。

- 图标动作使用 `src/EditorControls.tsx` 的 `IconButton`；普通按钮复用 `src/components/ui/button` 的既有 variant/size。
- 播放进度使用 `ProgressSlider`，值为 0–1；轨道、滑块和端点几何统一在 `editor-controls.css`。百分比端点需可到达且对齐。
- 录音试听使用 `VoicePreview`，只控制自身 audio。画布预览和导出沿用原有统一播放语义。
- 下拉框使用 `CompactSelect`，数值提交使用 `NumberField`，弹窗使用 Dialog。扩展已有组件后再处理新的控件需求。
- 共享控件外观修改 `editor-controls.css`；排版修改所属面板规则。复用既有颜色、字号和尺寸 token；同一选择器在原位置修改，清理被替代的覆盖规则。
- 验证视觉修改时检查正常、悬停、键盘焦点、禁用和溢出状态；播放进度覆盖 0%、100% 和非整数媒体时长。

## 组件维护

- 优先接入或扩展 `src/components` 和 `src/script-editor` 中的已有组件，通过 Session 读取和修改作品。
- 组件外观留在组件与共享样式中，外层 CSS 负责工作区布局。
- 修改后检查实际渲染、键盘焦点、禁用和溢出状态。
