# 统一作品时间线与程序演出

常用人物动作、镜头、氛围和转场先按 [常用视觉入口](common-effects.md) 选择；复杂构图与算法继续使用原子 SDK。

台词、配音、停顿、人物、镜头、图形和转场都进入一棵暂停的 GSAP master timeline。VNVE 负责故事语义、人物身份、引用和项目事务，GSAP 求值所有时间位置；预览与 MP4 使用同一次编译的画面、音频和场景区间。

## 创建和应用

1. `vnve inspect WORKSPACE PROJECT_ID --brief` 读取真实 sceneId、actorId 和素材引用；`vnve compile` 查看现有台词与场景时间。`vnve schema animation` 是当前数据契约。
2. 从 [章节开场](../examples/animation/chapter.js)、[镜头推进](../examples/animation/gentle-camera.js)、[漫画冲击](../examples/animation/comic-impact.js)、[路径图形](../examples/animation/path-memory.js) 或 [标题](../examples/animation/title.js) 复制源码到临时工作文件，填写 sceneId 和需要的 actorId。
3. `vnve animation build WORKSPACE PROJECT_ID source.js artifact.json` 在独立进程中执行已授权的本地源码，输出未应用 artifact。输出文件必须不存在。消费者不需要 Node/Bun 或 node_modules。
4. artifact 包含 `projectId`、构建时 `expected` 双版本和 `clip`。用 `animation.set` 保存片段定义，同时用 `dialogue.content.update` 将 `{type:"tag",name:"animation",params:{clipId:clip.id,await:true}}` 插入目标台词的 content；保留原有文本和其他标签。**定义与引用必须在同一 Patch 内完成；只做 `animation.set` 不会播放。** 通过现有 patch/preview/apply 原子校验，只有一个撤销节点。构建后若双版本变化，重新 inspect。
5. 应用后等待编辑器自动载入，核对 revision。通过真实预览、关键帧和 MP4 检查结果，不把 compile 通过当作视觉或声音验收。

片段定义保存在场景的 `animationClips`，只有剧本中的 animation InlineTag 会触发播放。未引用的定义保留在作品中，不自动播放，也不自动改写已有作品。删除标签只取消该次播放；删除定义时在同一 Patch 中移除其所有引用，再使用 `animation.remove`。相同 clip.id 重建替换，保留标签的位置和各次播放的微调。停用或未引用的定义仍保留素材引用保护。

## 标签应落在动作发生的字词处

先为每个演出指定叙事触发点，再插标签。开场、布景与整句铺底适合句首；消失、转身、变表情、强调或揭示，优先跟随句中具体词语，而不是把所有演出堆在 contentIndex:0。

使用 `dialogue.content.update` 直接把标签插到对应字词后，保留原有文字、格式和其他标签。例如原句“我该走了，再见。”可写成：

```json
{
  "type": "dialogue.content.update",
  "sceneId": "SCENE_ID",
  "nodeId": "LINE_ID",
  "content": [
    { "type": "text", "text": "我该走了" },
    {
      "type": "tag",
      "name": "hide",
      "params": { "actor": "ACTOR_ID", "await": false }
    },
    { "type": "text", "text": "，再见。" }
  ]
}
```

已有 content 段边界可用 `direction.insert` 的 `contentIndex` 插入；它是段下标，不是字符下标。只调整不影响发音的演出标签且正文不变时保留配音；wait、interjection 等会改变发音内容的标签变化仍使配音失效。

独立启动节点用 `dialogue.insert` 的 `content`，无需填假台词，也无需直改 project.json：

```json
{
  "type": "dialogue.insert",
  "sceneId": "SCENE_ID",
  "id": "OPENING_NODE",
  "index": 0,
  "content": [
    {
      "type": "tag",
      "name": "animation",
      "params": { "clipId": "CLIP_ID", "await": false }
    }
  ]
}
```

`direction.insert` 的 direction 是 `{name,params}`，不带 `type:"tag"`；完整 content 数组中的标签才带 `type:"tag"`。以当前二进制 `schema patch` 为准。

应用后运行 compile/check：`ANIMATION_UNREFERENCED` 表示定义未被标签引用，应补引用后再验收；关闭播放仍用保留引用的 `enabled:false` 标签。文字锚点对应文字显示时刻，不宣称是录音逐字强制对齐；需要按配音某个字触发时，结合真实音频听验或由宿主提供实际切点。

## SDK 2

源码是 JS 对象表达式：`sdkVersion:2,id,name,sceneId,duration?,sampleRate?,seed?,parameters?,parameterDefinitions?,build`。不需要 import。

```js
({
  sdkVersion: 2,
  id: "reaction",
  name: "人物与镜头配合",
  sceneId: "SCENE_ID",
  duration: 1,
  build({ actor, camera, timeline }) {
    const hero = actor("ACTOR_ID"),
      shot = camera();
    timeline()
      .addLabel("reaction", 0)
      .to(hero, { x: 4, duration: 0.3, ease: "power2.out" }, "reaction")
      .to(shot, { scale: 1.04, duration: 1, ease: "sine.inOut" }, "reaction");
  },
});
```

- `actor(id)` 引用本场既有人物，`camera()` 引用本场镜头。人物、台词、声音和媒体身份不会因动画变化而改变。
- `scene.group/rect/circle/ellipse/line/path/text/image` 创建非人物视觉节点。Image 用已导入的 assetId，Text 的 fontId 用共享字体 ID；不以这些节点替代角色或 ScriptDoc。
- `target(node, initial)` 声明视觉节点可动画化的数值属性与初值。省略 initial 时使用节点已有数值属性。同节点复用返回的 target。
- `timeline({defaults?})` 记录 GSAP 的 to/from/fromTo/set/addLabel 调用，由可信编译器使用真实 GSAP 3.15.0 求值。支持位置字符串、easing、数值 stagger、有限 repeat/repeatDelay 与 yoyo。
- 不开放任意 GSAP 方法、DOM/CSS 插件、timeScale、回调、无限重复或无种子 random 字符串。不支持的方法直接报错，不用 onUpdate 修改对象或触发音频。

人物 x/y 为舞台百分比偏移，rotation 为角度增量，blur 为增量，scale/opacity/brightness 为倍率。镜头 x/y 为百分比偏移，scale 为倍率。视觉节点用参考画布像素和 scaleX/scaleY，不能用 CSS scale/autoAlpha/transform 字符串。

数值 opacity 不替代 show/hide 的在场语义。人物需要通过剧本或场景状态出场；动画不能让一个未出场人物绕过这些规则出现。

需要分层视差、遮罩真实人物／背景／对话框、混合光效、通用粒子或表情淡化时，读取 [视觉原子能力](visual-primitives.md)。这些能力可组合，使用同一条构建、Patch 和帧采样链。

## 时间关系与自动重排

`at.line(nodeId,"start"|"end",offset?)` 是符号引用；`at.scene("start"|"storyEnd",offset?)` 引用叙事场景的起点或终点。它们不是 JS 数字，不在源码中做加减；使用 offset 参数。源码的时间位置、GSAP label 与相对位置会保存为可重编译数据。

- 台词或配音变化后，可信编译器重新构建同一 master，符号锚点和后续场景一起重排，无须执行 source。
- 播放位置由 animation 标签在台词中的字符位置与文字显示时长决定；前面的串行标签会推迟它。配音长度影响整句停留和后续台词，不拉长本句的打字速度或字间标签位置。修改台词或移动整句后自动重排。片段定义中的 start/anchor 不控制标签播放位置。
- `await:true`（省略时同样为串行）等待片段结束再继续台词；`await:false` 与后续台词并行。两种方式都由场景自然容纳演出尾部，后续场景和转场随 master 延后，无须开启额外的延长开关。串行停顿同时作用于文字和配音；句中暂停后从录音原偏移续播，保持录音速度。
- duration 显式指定时是片段的有限有效时长；省略时从本地 tween 与数值采样段推导。使用台词/场景符号锚点或只有静态节点、set 操作时显式提供 duration，避免播放等待与片段长度相互依赖。
- endBehavior 默认为 restore；hold 让人物和镜头保持终值至本场结束，视觉节点仍只在本片段区间存在。
- 不同片段/不同 timeline 对同一人物或镜头属性的重叠写入被拒绝，算法与 GSAP 重叠同样拒绝。需要叠加的数学效果由同一 sample 明确合成。

## 数学算法

超出常规 tween 时可使用任意确定性算法：

```js
sample(
  camera(),
  {
    start: 0,
    duration: 1.2,
    sampleRate: 60,
    sample: ({ localTime, random }) => ({
      x: Math.sin(localTime * 28) * random(7) * 0.2,
    }),
  },
  at.line("LINE_ID", "end"),
);
```

算法在 CLI 生成数值段，随后和其他演出一样挂到主时间线；浏览器不执行 sample 源码。sample 必须返回稳定的属性集合，使用固定 seed 与 random(index)，不依赖 Date、Math.random、前帧或全局计数器。`interpolation:"step"` 可声明离散数值段。

`query.width()`、`query.height()`、`query.cueDuration(nodeId)` 可显式读取创作输入并登记依赖。输入改变时产生 `ANIMATION_REBUILD_REQUIRED`，由宿主重新运行源码；不允许使用失效结果导出。仅改变符号位置不需要重跑算法。

math 提供 random、lerp、解析 spring、连续 noise 和折线路径 path。颜色、文字内容和路径形状保持静态；人物和媒体语义仍使用 ScriptDoc/Patch。

## 预算、微调与验收

默认 60Hz，允许 1–120Hz，单片段最多 300 秒、512 节点、4096 轨道和 500000 数值样本。源码按 UTF-8 字节限制为 100000，创作进程默认 5 秒超时。输出拒绝非法引用、非有限数值和未声明属性。

网页通过 `/程序演出` 插入标签。标签弹窗只提供片段名称、启用/停用和串行/并行；“查看代码”按需展示保存的原始源码，只读且不执行。演出的其他参数和编排由宿主修改源码并重建片段。`enabled:false` 保留标签和引用，但不播放、不等待。重复标签是独立播放实例；相同人物/镜头属性的重叠写入仍会被拒绝。

`vnve preview frames 'LAUNCH_URL' PROJECT_ID times.json output-dir` 请求已打开的真实浏览器截图。times 最多 12 个非负秒数；未取得浏览器结果返回 PREVIEW_UNVERIFIED。启动链接包含临时会话凭据，仅在本机使用。帧截图不验证声音和编码；最终在内置浏览器实际导出 MP4，并单独核对配音和音轨。
