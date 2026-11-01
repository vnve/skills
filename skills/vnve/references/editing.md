# 续写与原子制作

常用人物动作、镜头、氛围和转场先按 [常用视觉入口](common-effects.md) 选择；复杂构图与算法继续使用原子 SDK。

续写已有作品、增加演员/地点/表情、调整故事结构或编排声音时读取。先 inspect 原项目、版本与共享素材；字段约束以 `schema patch` 为准。通过 patch 产生完整预览，再 apply 同一文件；一项失败则整份计划不应用。插入台词的缺省 ID 在预览阶段固定，也可显式给稳定 id 便于重试识别。

## 结构与身份

1. 新媒体先 import：`register:true` 登记新图组，或给已有组增加 variant。保留返回的真实 groupId/variantId。直接引用未导入的 assets 文件会被拒绝。
2. 新增故事身份用 subject.create（subjectId、subjectType、name、groupId、stateId）。subjectType 为 character/location/prop/cg，首个状态是默认状态；后续 subject.state.add 传 subjectId、stateId、name、variantId。
3. act.create / scene.create 使用显式 ID 和 name，scene.create 指定 actId。scene.move 指定目标 actId、sceneId、index（移除源场后计算索引）。已有台词与声音保持原 ID，不重建整片。
4. actor.create 指定 sceneId、actorId、subjectId，可选 stateId 与舞台坐标。location/CG 用 scene.layer.bind 指定 sceneId、subjectId、可选 stateId。需要直接换物理背景/CG 可用 scene.update 的 backgroundId/cgId；这会解除该层故事身份绑定。null 清空。
5. dialogue.insert 指定 sceneId、index、可选 id/actorId，并提供非空 text 或完整 content；纯演出节点用含标签的 content。direction.insert 使用 contentIndex 段下标；句中插入可用 dialogue.content.update 将文字拆成前后两段，在中间放入标签。direction 对象是 {name,params}，不带 type。之后使用 direction.insert/update/remove 和 dialogue.segment.update 保留正文中的其他行内标签。普通 dialogue.update 不用于含有要保留演出的富文本句。需要同时调整文字格式和标签位置时，可用 dialogue.content.update 传完整 content 数组，逐项保留仍需存在的 InlineTag；该操作仍校验素材、人物引用及锁定演出，并按正文变化使配音失效。

subject.bind 用 subjectId、groupId、可选 stateMap 换整套图。保留身份、状态、默认状态、台词及录音；新组未映射状态回退新默认图。演员、绑定场景层和行内 set 一起重映射，锁定演员拒绝替换。新建 set 可填 stateId 与匹配 variant，保留回退到同一图后的语义；旧 set 只能从旧图推断状态。

actor.update 的 x/y 支持 -200–300 百分比，用于画外入场；scale 等范围以 schema 为准。舞台微调仍优先网页直接操作。

## 场景设置联动

场景设置统一包含转场、台词显示方式/阅读节奏/句间停顿、自动出场/默认效果、非说话人物亮度与说话人物放大。`scene.settings.update` 传 sceneId 和 settings；链接场景会修改作品默认，独立场景只修改本场。要仅改某个链接场景，先在同一计划中 `scene.settings.link`（linked:false）快照当前效果，再 update。恢复 linked:true 后重新采用作品设置，不改变对白主题、字号或位置。已有作品的独立状态保持不变。阅读节奏不会加速音频；配音时长仍优先于无配音阅读估时。

## 台词节奏与声音

```json
{
  "summary": "调整停留并安排声音",
  "operations": [
    {
      "type": "dialogue.timing",
      "sceneId": "SCENE",
      "nodeId": "LINE",
      "timing": { "leadIn": 0.2, "revealDuration": 1.4, "holdDuration": 0.6 }
    },
    {
      "type": "direction.insert",
      "sceneId": "SCENE",
      "nodeId": "LINE",
      "contentIndex": 0,
      "direction": {
        "name": "bgm",
        "params": {
          "asset": "IMPORTED_BGM_ID",
          "volume": 0.2,
          "fade": 0.5,
          "loop": true,
          "duck": 0.4
        }
      }
    },
    {
      "type": "direction.insert",
      "sceneId": "SCENE",
      "nodeId": "LINE",
      "contentIndex": 1,
      "direction": {
        "name": "sfx",
        "params": { "asset": "IMPORTED_SFX_ID", "volume": 0.5 }
      }
    }
  ]
}
```

timing 的秒数有限且非负：leadIn 在文本/声音开始前等待，revealDuration 控制文字揭示，holdDuration 在基本展示窗口之后增加阅读停留；声音窗口保持真实媒体长度。未设置 timing 沿用阅读速度估时；有 inline wait/阻塞演出时由共享编译计算最终时长。compile 返回逐句及 voice 区间，再到网页 seek 核对。

所有现有合法行内命令均可通过 direction 操作；使用 schema patch 查询参数，不凭经验编造命令。bgm/sfx 引用已登记音频，set 必须属于目标素材组，角色演出校验当前场景及锁定。程序演出 InlineTag 见 [程序演出](animation.md)。字体与媒体导入见 [素材与音频](media.md)，框图与主题见 [对白框与主题](dialogue.md)。
