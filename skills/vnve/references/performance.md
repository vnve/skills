# 特殊演出参数

本页为特殊演出和细粒度标签的参数参考；常用入口与选择顺序以 [常用视觉入口](common-effects.md) 为准。这些效果是现有剧本 InlineTag，参数直接参与可信编译，网页可修改并即时预览。它们适合快速获得稳定的常用演出；分层、任意人物/画面遮罩、混合、粒子、表情淡化和数值轨道仍可由宿主通过 [原子 SDK](animation.md) 自由组合。原子演出使用 `animation build`，这些指令无需生成脚本或保存 animationClips。

## 选择与参数

所有指令支持 `enabled`（默认 true）、`dur`（秒，0.2–30）；除 wipe 外，`await` 默认 true，false 表示与后续台词并行。停用后不播放、不占时，但保留引用检查。颜色为 `#RRGGBB`，方向为 `left` 或 `right`。

| 指令      | 适用节拍                       | 必填                                    | 可选参数与默认值                                                                                                                                                                 |
| --------- | ------------------------------ | --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| comic     | 强调、反应、短促人物特写       | actor                                   | text（最多120字）、direction:left、accent:#a44a42、dur:3                                                                                                                         |
| duel      | 两人冲突、问答对峙             | actor、other（不同演员）                | text、reply（各最多120字）、split:0.5（0.3–0.7）、pressure:0（-0.25–0.25，分界移动占画幅比例）、accent:#a44a42、dur:4                                                            |
| introduce | 首次正式亮相、人物档案         | actor、title（1–60字）                  | subtitle（最多160字）、direction:left、accent:#a44a42、dur:4                                                                                                                     |
| memory    | 回忆、线索图、蒙太奇           | images（1–6个不同 variantId，依次展示） | caption（最多160字）、dur:5                                                                                                                                                      |
| awake     | 主观睁眼、意识恢复             | 无                                      | actor（可选在场人物引用）、blur:18（0–30）、blinks:2（数字1或2）、dur:6                                                                                                          |
| wipe      | 遮挡中换场                     | nextScene（紧邻下一场 ID）              | direction:left、dur:1                                                                                                                                                            |
| rackfocus | 焦点揭示、人物之间的注意力转移 | toTarget                                | fromTarget:$background、blur:12（0–30）、moveX:0、moveY:0、zoom:1、dur:4                                                                                                         |
| parallax  | 空间推进、悬念、前景掠过       | 无                                      | moveX:3（-15–15）、moveY:0（-10–10，均为画幅%）、zoom:1.04（1–1.2）、backgroundDepth:0.2、actorDepth:0.6、foregroundDepth:1（各0–1）、foreground（可选透明图片variantId）、dur:6 |

awake 将背景、CG 与所有在场人物一起模糊，再在眼睑遮罩内恢复清晰；指定 actor 仍保留整个场景的主观视野。wipe 只能作为源场景最后一个纯演出节点中的唯一标签，dur 是下一场入场转场时长，标签自身不额外等待，await 不参与。关闭 wipe 恢复该场原来的转场设置。最后一场不能使用 wipe。

这些效果不附带声音。强调文字与标题由创作者填写；不自动从姓名或台词推断。依据作品风格选择颜色、字幕与频率，普通对话优先保留阅读空间。

## 景深与空间镜头

rackfocus 的 fromTarget/toTarget 是实际存在的 `$background`、`$cg` 或当前 actorId，且两者不同。首帧fromTarget清晰，其他层已经失焦，随后焦点连续转向toTarget，并留出终点停留；末段平滑恢复普通画面。它不是持久景深状态。人物隐藏状态不变，想让人物被看见须先show。没有背景时显式选择两个在场人物，不能沿用默认 `$background`。

需要“推进并拉焦”，直接在同一个rackfocus中设置moveX/moveY/zoom。平移单位为画幅百分比、范围-15–15与-10–10，zoom范围1–1.2；默认0/0/1保持原地。它复用视差的分层运动，不会让两个片段争抢同一人物。小幅度如moveX:3、zoom:1.04通常足够；用一个具体人物或线索作为焦点目的，避免每句都加镜头。

parallax使用普通背景与人物即可产生相对运动，不要求额外生图；无人物时退化为轻微运镜。深度越大运动幅度越大，背景提供超扫防露边。透明前景是可选增强，先检查素材真实alpha和遮挡面积；不把整张不透明背景当作透明前景。默认运动更克制，末35%平缓回到原构图，适合短时强调。素材尺寸不足时避免大幅放大。

景深与视差都接管真实成员，两个独立指令同时接管同一对象会被拒绝。简单推进拉焦用单个camera（action:rackfocus），复杂分层轨迹与持续构图使用一个完整自由SDK片段。所有这些短时指令结束会恢复，不依赖残留状态。逐层景深沿用隔离缓存像素预算，很多大人物同时隔离可能被预算检查拒绝，应减少隔离层数。

以下是单个推进拉焦的direction.insert operation；把SCENE、LINE、ACTOR替换为inspect取得的真实ID，再进入正常Patch预览／apply流程：

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

## 应用流程

1. inspect 获取真实 sceneId、nodeId、actorId、素材 variantId 和双版本，compile 核对台词时刻。人物使用当前场景 actorId；图片使用已导入的 variantId。
2. 选择发生动作的字词与效果。已有段边界用 direction.insert；句中需拆段时用 dialogue.content.update 保留全文和其他标签。新纯演出节点用 dialogue.insert。新建作品先 create，再 inspect 和 Patch 加这些指令。
3. 通过 patch 预览及 apply 同一计划应用；同时保留人物身份、台词、配音与站位。只改变演出而正文不变会保留配音。锁定对象需先由用户决定解锁。
4. compile/check 后在网页查看进入、中段、结束与跳转；核对相邻台词和转场，交付前实际导出 MP4。同一演员、背景或 CG 上重叠的合成演出会冲突，按编译诊断错开时段或改为一个原子片段。

以下是 Patch 的单条 operation（放进正常含 expected 的计划），在已有节点段首插入人物介绍：

```json
{
  "type": "direction.insert",
  "sceneId": "SCENE_ID",
  "nodeId": "LINE_ID",
  "contentIndex": 0,
  "direction": {
    "name": "introduce",
    "params": {
      "actor": "ACTOR_ID",
      "title": "林夏",
      "subtitle": "图书管理员",
      "accent": "#526875",
      "dur": 4,
      "await": true
    }
  }
}
```

新增场尾换场节点的 operation：

```json
{
  "type": "dialogue.insert",
  "sceneId": "SOURCE_SCENE_ID",
  "index": 3,
  "id": "EXIT_WIPE_ID",
  "content": [
    {
      "type": "tag",
      "name": "wipe",
      "params": {
        "nextScene": "ADJACENT_SCENE_ID",
        "direction": "left",
        "dur": 1
      }
    }
  ]
}
```

index 必须等于源场景当前节点数，不能照抄示例。编辑器 `/` 菜单只展示收敛后的常用入口；参数弹层提供人物、下一场、图片顺序、颜色与数值控件。原子 animation 标签仍由宿主构建，网页只微调已暴露的绑定。
