# 分层、通用遮罩、混合与粒子

需要视差、裁剪人物／背景、光效、粒子或组合画面时读取。沿用 [程序演出](animation.md) 的 build → Patch 定义与标签引用 → 浏览器／MP4 验收流程。

CLI 兼容版本见 `../cli.json`。SDK 仍为 2；使用本页字段时 build 自动声明 `capabilities:["visual-primitives-v1"]`。旧 CLI 会拒绝新片段；不要删掉标识绕过校验，也不要改写用户旧作品。

可从 [分层光影](../examples/animation/layered-light.js)、[人物遮罩](../examples/animation/masked-reveal.js)、[粒子冲击](../examples/animation/particle-burst.js) 开始修改；先替换真实 sceneId／actorId。

## 容器与空间

`scene.group` 接收 `id,parentId,x,y,scaleX,scaleY,rotation,opacity,order,blur,bounds,cameraFactor,blendMode,mask,members,memberSpace,memberPlacement`。同级按 order 升序，同值保持定义顺序。Group 的子节点使用 parentId；禁止环或重复归属。

bounds 为 `{x,y,width,height}`，单位是片段参考画布像素；它决定隔离表面的固定裁剪边界。需要blur、遮罩、场景成员或组混合时必须声明 bounds。Group blur为0–30像素，可用target(group)连续动画，先在隔离内容上失焦，再由外层组施加眼睑／镜头遮罩，保持遮罩边缘清晰。声明 bounds 的组先合成子节点，再施加遮罩、组透明度与混合模式，组内重叠处不会重复衰减。超出 bounds 的内容会裁掉。所有隔离表面的参考像素面积合计最多 16777216，避免多层离屏表面耗尽内存。

顶层 Group 的 cameraFactor 为 0..1：0 固定屏幕、1 完整跟随镜头，中间值产生视差；省略时沿用片段 stage/screen。嵌套组继承，不能再次声明 factor。顺序、factor、bounds 和混合模式是静态结构；位置、缩放、旋转与透明度通过既有 target/timeline/sample 编排。

## 遮罩真实人物、背景和组合

Group 的 members 引用真实对象，不创建图片副本：

- `{kind:"actor",actorId:"ACTOR_ID"}`
- `{kind:"background"}`、`{kind:"cg"}`
- `{kind:"dialogue"}`：框体、姓名与正文一起作用，不包括编辑器控件。
- `{kind:"visual",nodeId:"ROOT_VISUAL_ID"}`：本片段尚无 parentId 的视觉根节点。

进入容器的对象不在原位置重复绘制，片段结束恢复原归属；未出场人物不会因此出现。容器仍使用片段 behindActors/aboveActors 插槽。members 的顺序决定成员前后关系；本组普通子节点先绘制、members 随后绘制。需要在两个角色之间插入效果时，将该效果作为 visual member 列在两个 actor member 之间。

`memberPlacement:"original"` 让单人物根容器保留在该人物原舞台层位，可用于光影而不越过其他演员和CG。要求stage空间、仅一个actor及可选visual成员，不能有parentId、cameraFactor，也不能被其他组作为visual member引用。省略／overlay时沿用演出插槽。

默认 memberSpace 为 stage：遮罩在容器参考画布中定位，可用于屏幕光圈与整场构图。单人物可用 `memberSpace:"local"`，此时容器以人物适配后的图片左上角为局部原点，跟随位移、旋转、缩放和翻转；坐标使用参考画布分辨率下的显示像素。全场遮罩显式列出 background、cg、各 actor 和需要的 visual；对话框只有显式列入才受影响。需要固定屏幕遮罩时使用片段 `space:"screen"`。

```js
const group = scene.group({
  id: "reveal",
  bounds: { x: 0, y: 0, width: 1920, height: 1080 },
  members: [{ kind: "actor", actorId: "ACTOR_ID" }],
  mask: { type: "ellipse", x: 960, y: 540, radiusX: 120, radiusY: 300 },
});
timeline().to(mask(group), { radiusX: 1000, duration: 0.8 });
```

build 回调需要解构 `mask`。`mask(group)` 注册遮罩数值目标，与 `target(group)` 的容器运动分开。支持 x/y、scaleX/scaleY、rotation、opacity，以及对应形状的 width/height 或 radiusX/radiusY。几何尺寸必须非负。

mask 类型：

- rect：width、height，原点为左上。
- ellipse：radiusX、radiusY，原点为中心。
- path：静态 SVG Path data，可变换但不形变。
- image：assetId、width、height，仅使用图片 alpha，RGB 无关；柔边由图片 alpha 提供。

`invert:true` 在 bounds 内反向。不能同时使用旧 clip 和 mask；嵌套容器可叠加多个遮罩。蒙版素材须先导入共享素材，缺失会阻止导出。跨片段同时接管同一真实对象被拒绝；合并进同一片段明确编排。

## 混合模式

节点／组的 blendMode 支持 normal、add、screen、multiply、source-atop。add 用于火星与高光，screen 用于反光，multiply 用于阴影。子节点只与当前父组内部已绘制内容混合；如果阴影需要作用于外部背景，将 multiply 设在整组上，而非透明隔离组里的子节点上。

source-atop 按当前父容器已经绘制的alpha上色。用于人物光影时，让人物先绘制，再把source-atop图形作为后续visual member放入同一隔离Group；不能只设parentId，因为普通子节点先于场景members绘制：

```js
const shade = scene.group({
  id: "shade",
  bounds: { x: 0, y: 0, width: 1920, height: 1080 },
  blendMode: "source-atop",
});
scene.rect({
  id: "band",
  parentId: shade.id,
  x: 0,
  y: 0,
  width: 320,
  height: 1080,
  fill: "#ffe0ad",
  opacity: 0.35,
});
scene.group({
  id: "lit-person",
  memberPlacement: "original",
  bounds: { x: 0, y: 0, width: 1920, height: 1080 },
  members: [
    { kind: "actor", actorId: "ACTOR_ID" },
    { kind: "visual", nodeId: shade.id },
  ],
});
timeline().to(target(shade), { x: 1500, duration: 3 });
```

创建场景阴影并且不接管人物时，用独立multiply图形组；该组可以与其他成员容器并行。source-atop只在具有目标alpha的隔离边界内使用，空透明组中不会产生可见图形。

## 任意算法粒子

`scene.particles` 是批量节点，可放进 Group、被遮罩、指定 blendMode。每个粒子声明稳定 id、birth（默认 0）、lifetime、圆形 radius 或图片 assetId/width/height、可选静态 fill，以及 sampleRate（默认 30）和 sample 回调。

```js
scene.particles({
  id: "dust",
  parentId: "LIGHT_GROUP",
  blendMode: "add",
  particles: Array.from({ length: 80 }, (_, i) => ({
    id: `dust-${i}`,
    birth: 0,
    lifetime: 4,
    radius: 2,
    sampleRate: 15,
    sample: ({ localTime, random }) => ({
      x: random(1) * 1920 + Math.sin(localTime + random(3) * 6) * 20,
      y: random(2) * 1080 - localTime * 12,
      opacity: 0.35,
    }),
  })),
});
```

sample 可返回 x/y、scaleX/scaleY、rotation、opacity 的稳定集合。random(index) 由片段 seed、粒子 id 和 index 决定；重排粒子不会改变其他粒子轨迹。回调只在 CLI 执行，浏览器读取烘焙数据。不要使用帧计数、历史状态或 Math.random。

生命周期为 `[birth,birth+lifetime)`，片段结束即消失，hold 不延续粒子；纹理与颜色首版静态。单片段最多 4096 粒子、同时活跃最多 2048，粒子与普通轨道共享 500000 数值样本预算；超限明确失败，不丢粒子。减少采样率、时长或轨道数可以降低体积；运动算法不受预设限制。

## 表情淡化

使用既有 `{name:"set",params:{target:"ACTOR_ID",variant:"VARIANT_ID",with:"fade",dur:0.15,await:false}}`。省略 dur 沿用既有默认；cut 或 dur=0 即时切换。它只改变同一人物的素材，不改变身份、声音、站位或台词。

连续 A→B→C 时从触发 C 时的 A/B 混合状态继续，最多同时贡献 8 个变体。相同素材不启动额外过渡；人物透明度作用于混合后的整体，不应看到中间穿透背景。无需眼嘴拆层，不宣称口型同步。

完成后核对任意时间跳转、片段结束恢复、素材透明边缘，再用真实浏览器导出 MP4。帧图不代替编码或声音验收。
