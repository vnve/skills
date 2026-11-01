# 常用视觉演出

创作时先从本页选叙事目的，再填写参数。默认只推荐下列16个视觉入口；全量schema还包含可编辑的细粒度标签，不能把它们都当成常用效果推荐。复杂算法用animation自由SDK。

| 入口       | name         | 常用参数与用途                                                    |
| ---------- | ------------ | ----------------------------------------------------------------- |
| 出场／退场 | presence     | action:show/hide、actor，with:fade或slide-left等；介绍人物或离开  |
| 移动／站位 | move         | actor、to或toX/toY、dur；改人物位置                               |
| 表情切换   | set          | target、variant、with:cut/fade、dur；人物反应，淡化一般0.15–0.3秒 |
| 动作强调   | reaction     | action:shake/hop、actor、amp、dur；轻抖／跳动                     |
| 镜头构图   | camera       | 见下文，统一构图与可选深度增强                                    |
| 画面震动   | vibrate      | amp、dur；撞击／惊吓，避免日常对白滥用                            |
| 闪光       | flash        | color、dur；瞬时强调                                              |
| 雨／雪     | weather      | kind:rain/snow、intensity:light/normal/heavy、stop、dur           |
| 情绪符号   | interjection | 依schema填写kind、actor；会影响发音的符号变更须重做录音           |
| 漫画切入   | comic        | 人物瞬时特写，详见performance.md                                  |
| 双人对峙   | duel         | 对立构图，详见performance.md                                      |
| 人物介绍   | introduce    | 标题／身份，详见performance.md                                    |
| 记忆碎片   | memory       | 已导入图片蒙太奇，详见performance.md                              |
| 主观苏醒   | awake        | 眼睑与失焦恢复，详见performance.md                                |
| 场景转场   | transition   | effect、nextScene、dur；见下文                                    |
| 自定义演出 | animation    | 宿主通过animation build生成片段，再原子保存定义及标签             |

bgm/sfx/wait是音频和控制入口，不计入视觉效果。新入口不自动附带声音。show/hide/shake/hop/rain/snow等旧细粒度标签仍能编辑，独立rackfocus/parallax/wipe也保留；创作时优先上述统一入口，不自动迁移或改写已有作品。

## 镜头：先确定关注谁

camera的action只选需要的动作，其他参数按动作提供：

| action    | 目的                 | 参数与默认                                                                                                         |
| --------- | -------------------- | ------------------------------------------------------------------------------------------------------------------ |
| push      | 靠近画面、轻微强调   | zoom:1.08，dur:0.8；可选x/y，默认画面中心50/50                                                                     |
| pull      | 从近景拉回全景       | zoom:1，dur:0.8；可选x/y                                                                                           |
| focus     | 聚焦一个人物或点     | actor或x/y；默认zoom:1.5、dur:0.6；小幅镜头可显式填1.1–1.2                                                         |
| duo       | 同时关注两个人       | actor、other（不同）；不填zoom时按当前人物中点和水平间距自动取景，可显式覆盖                                       |
| reset     | 回到默认镜头         | dur，复位为50/50、倍率1                                                                                            |
| rackfocus | 转移注意力、揭示线索 | fromTarget默认$background、toTarget必填；blur:12、dur:4，可加moveX/moveY/zoom完成轻推拉焦                          |
| parallax  | 短暂增加空间纵深     | moveX:3、moveY:0、zoom:1.04、dur:6；backgroundDepth:0.2、actorDepth:0.6、foregroundDepth:1；foreground可选透明图片 |

普通镜头最低倍率为1，避免露出底图之外的黑边；pull默认从已有近景拉回全景，初始已是全景时不会凭空缩小。双人间距过大时先调站位，自动取景不生成画外背景。

普通push/pull/focus/duo/reset是持久相机事件：结束后保持构图，直到下一镜头。深度增强rackfocus/parallax沿用短时容器，末尾恢复原构图；不要用它代替长镜头持久状态。深度模式zoom限1–1.2，moveX/Y单位为画幅百分比（-15–15／-10–10）；简单推进拉焦用一个camera标签，不能同时插两个争抢同一人物的深度片段。图层隔离受像素预算约束，复杂连续运镜使用一个自由SDK片段。

所有人物使用当前scene的actorId；焦点层$background/$cg必须真实存在。duo只计算当前人物位置与水平间距，不理解素材中的脸部或自动改变站位；隐藏人物仍隐藏，先show再构图。

## 转场：七个选项

| effect                 | 用途                                       |
| ---------------------- | ------------------------------------------ |
| cut                    | 普通叙事直切                               |
| dissolve               | 柔和换景、时间流逝                         |
| fade-black             | 段落结束／较长时间跳跃                     |
| fade-white             | 回忆边界、意识变化，适量使用               |
| wipe-left / wipe-right | 明确的方向移动／换场                       |
| soft-dissolve          | 失焦中溶解，回忆／意识过渡；固定精选GL效果 |

普通入场转场可用scene.settings.update设置；需要按剧本显式声明，用transition标签独占源场最后一个纯演出节点，nextScene为紧邻下一场ID。dur由真实过渡区间承担，await不再加一份等待；enabled:false恢复原场景设置。无下一场或位置不对会拒绝，不偷偷移动台词。

柔化溶解使用固定GL Transition shader；WebGL不可用／丢失时明确报错，改选dissolve后重新预览导出。它只改变两场画面合成，人物身份和音频速度不变。只有这一种GL效果进入常用目录，不随意推荐整库名称或接收作品中的shader代码。

## 应用顺序

1. inspect取真实人物、场景、素材和双版本，compile读触发时刻；缺素材先导入。新作品先create，再inspect/Patch编排本页指令；create生成脚本的方向子集以schema script为准。
2. 标签放在发生动作的字词边界。用direction.insert或dialogue.content.update保留正文、其他标签和已有录音；正文变化按正常规则使录音失效。
3. 一个Patch预览并应用；锁定对象须先由用户决定解锁。CLI更改后等待编辑器载入并核对revision。
4. 看真实人物构图、长对白、首中末、跳转和MP4，再判断效果是否有叙事价值。schema通过不能替代真实视觉验收。

以下operation把注意力从背景交给人物，并轻微推进；SCENE/LINE/ACTOR须替换为inspect取得的真实ID：

```json
{
  "type": "direction.insert",
  "sceneId": "SCENE",
  "nodeId": "LINE",
  "contentIndex": 0,
  "direction": {
    "name": "camera",
    "params": {
      "action": "rackfocus",
      "fromTarget": "$background",
      "toTarget": "ACTOR",
      "blur": 14,
      "moveX": 3,
      "zoom": 1.04,
      "dur": 6,
      "await": false
    }
  }
}
```

场尾转场operation（index须等于源场当前节点数）：

```json
{
  "type": "dialogue.insert",
  "sceneId": "SOURCE",
  "index": 3,
  "id": "EXIT",
  "content": [
    {
      "type": "tag",
      "name": "transition",
      "params": { "nextScene": "NEXT", "effect": "soft-dissolve", "dur": 0.8 }
    }
  ]
}
```

特殊构图参数见[特殊演出](performance.md)，任意分层/遮罩/混合/粒子算法见[原子SDK](animation.md)。
