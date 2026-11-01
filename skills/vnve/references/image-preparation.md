# 人物生图、抠图与素材清理

人物生成后带底色、下载立绘不透明、边缘有白边、同套表情跳位，或需要清理图片标记时读取。先生成一张代表性立绘并完成此流程，再批量制作表情。保留原图，处理结果写到新文件；在导入前完成检查，不直接改作品或共享素材文件。

## 选择路线

| 收到的图片 | 处理方式 | 不应据此宣布完成 |
| --- | --- | --- |
| 真透明 PNG/WebP、边缘干净 | 检查 alpha，统一画布，合成试摆 | 扩展名是 PNG，或看见棋盘格 |
| 纯色背景、轮廓清楚 | 明确指定背景色，试用边界连通抠底；失败改用分割工具 | 全局删除白色，可能连白衣和眼白一起删掉 |
| 发丝、半透明衣物、复杂背景 | 宿主透明背景编辑/分割工具；本地可选 rembg，必要时 alpha matting | 模型已输出文件，或仅有一个硬轮廓 |
| 白边、绿边、旧背景残色 | 宿主边缘修复，或可用分割工具的去色污染能力；在浅/深底检查 | 扩大羽化，可能让整个轮廓发虚 |
| 来源站点的预览水印、作者署名 | 取得无水印原件或改用可用来源；保留许可和署名记录 | 把清理标记当成获得使用许可 |
| 自有标记或明确允许清理的图片 | 小范围裁切或蒙版局部修复，按下面流程校验 | 声称推测补全的纹理就是原始细节 |

生图提示要明确人物身份/参考图、服装、构图、所需表情、统一身体基准；人物要求真实透明背景、无场景、无文字或标记。宿主提供透明背景参数时实际启用它，提示词本身不保证 alpha。背景场景与人物分别生产，避免从一张完整场景图中反复抽取角色。

## 透明背景与抠图

1. 先查看原图，再检查 alpha。`inspect --require-transparent` 非零退出表示不透明或空图；成功只表示可进入目视检查，不代表抠图质量合格。带 alpha 通道但所有像素255仍是不透明；被画进图片的棋盘格也不是真透明。读取实际尺寸、源 mode、alpha extrema 与非透明包围盒；RGB 转为 RGBA 后的全255 alpha 也不能算透明。
2. 优先使用当前宿主提供的透明背景生图/编辑或分割工具，要求保留发型、五官、服饰和姿态，只处理背景。已有可用本地分割环境时复用，不为了导入图片自动安装大模型。
3. 可选本地方案为 [rembg 官方 CLI](https://github.com/danielgatis/rembg)。先运行该环境的 `rembg i --help`；官方当前声明 Python >=3.11、<3.14，安装命令为 `python -m pip install "rembg[cpu,cli]"`。使用兼容的隔离环境，模型首次运行可能需要下载与额外磁盘空间；根据宿主环境和用户的工具选择按需准备，不启动 HTTP 服务或云端模式。

```sh
# 明确输出路径，保留原图。先测试一张，不直接批量覆盖。
rembg i /absolute/raw/hero.png /absolute/cutout/hero.png
# 轮廓/发丝不理想时，检查本地版本支持后尝试 alpha matting。
rembg i -a /absolute/raw/hero.png /absolute/cutout/hero-matting.png
```

不同画风/模型结果可能不同。不要因为例子给出某个模型就为全项目固定它；也不要将图像分割失败归结为 CLI 导入错误。蒙版已由宿主提供时，使用下方 `mask` 应用它；蒙版与图片须同尺寸、同方向，白色保留、黑色透明，灰色保留半透明。棋盘格有两色甚至带压缩纹理，不能直接套用单色 key。轮廓清楚且背景双色与人物明显可分时，宿主可试以边界连通的双色分类生成蒙版，再逐张检查浅/深底；衣服与棋盘格同色、发丝半透明或轮廓不稳时改用分割/重新生成，不全图删除两种颜色。

复杂背景使用分割模型，`key` 仅处理与画布边缘连通的近似纯色，不修复发丝、内部背景孔洞或反光。

## 水印、文字与局部瑕疵

先确定标记属于来源预览水印、需要保留的署名，还是自有/获准修改的内容；来源不明时先取得无水印原件或换素材，不默认批量擦除。保留原文件及原许可记录。

对允许修复的区域：

1. 在原尺寸上画局部灰度蒙版，只覆盖标记及必要过渡边缘。标记在纯背景留白处可局部修复；位于非必要画布边缘可显式裁切，但同套立绘要使用一致的裁切与基准。不要为了去角标裁掉人物手脚或改变背景关键构图。
2. 使用宿主可用的局部图像编辑工具补全蒙版内内容，保持画幅、姿态和人物身份。文字压住脸/发丝/衣物时属于推测重绘；检查身份和纹理，效果不稳定时重新生成素材。
3. 修复图必须与原图同尺寸、同方向。`patch` 仅将修复结果的蒙版区域合回原图，蒙版外像素与原 alpha 保留。脚本负责合成，不自动识别水印或凭空重建纹理；透明边缘修复应回到抠图/蒙版路线。
4. 放大检查残字、重复纹理、边缘断裂、脸型与手部，再做整张合成预览。不得将裁掉可见文字等同于清除隐形标记或修改许可。

## 自带离线脚本

脚本：[image_prep.py](../scripts/image_prep.py)。这是宿主侧可选图片准备工具，需要 Python 3.10+ 和 Pillow；vnve 独立 CLI 仍不依赖 Python。优先复用现有宿主环境，缺依赖时才创建隔离环境，不全局改装 Python。脚本不联网、不下载模型、不调用服务、不导入作品，输出只允许新 PNG；目标已存在则失败。

下面的 `PREP` 指向实际安装的 Skill，不依赖本源码仓库：

```sh
PREP=/absolute/installed-skill/scripts/image_prep.py
# 若宿主没有 Pillow，可按需在隔离环境安装；之后用该环境的 python 替代 python3。
python3 -m venv /absolute/media-tools
/absolute/media-tools/bin/python -m pip install Pillow
PY=/absolute/media-tools/bin/python

# 检查。require-transparent 在不透明或空图时退出2。
"$PY" "$PREP" inspect /absolute/cutout/hero.png --require-transparent

# 纯色抠底：明确指定颜色与容差；白衣、发丝或复杂背景不默认用此路线。
"$PY" "$PREP" key /absolute/raw/hero.png --color '#00ff00' --tolerance 12 --output /absolute/cutout/hero.png

# 应用宿主给出的不透明灰度蒙版，不把 RGB 棋盘格当作 alpha。
"$PY" "$PREP" mask /absolute/raw/hero.png --mask /absolute/masks/hero.png --output /absolute/cutout/hero-masked.png

# 将允许修复的局部区域合回原图，蒙版外保持原样。
"$PY" "$PREP" patch /absolute/raw/hero.png --mask /absolute/masks/mark.png --replacement /absolute/repaired/hero.png --output /absolute/clean/hero.png

# 统一立绘：输出目录必须不存在。尺寸、目标高度和基线按实际镜头选，不照搬数值。
"$PY" "$PREP" normalize /absolute/cutout/hero.png /absolute/cutout/hero-happy.png --reference /absolute/cutout/hero.png --canvas 768 1024 --height 900 --baseline 980 --output-dir /absolute/normalized

# 浅底、深底、棋盘格及实际背景合成检查图（最多20张）。
"$PY" "$PREP" review /absolute/normalized/hero.png /absolute/normalized/hero-happy.png --background /absolute/background.png --output /absolute/review.png
```

`normalize` 使用参考图确定统一缩放与锚点，所有输入必须已经有相同画布和相同人物尺度。它不会分别把每张可见包围盒拉成相同大小，因为举手、头发或表情差异会导致身体跳位。需要补偿原图平移时，传 `--anchors /absolute/anchors.json`，JSON 按完整文件名给出源图像素坐标，例如 `{"hero.png":[320,940],"hero-happy.png":[322,938]}`；锚点应是相同语义的脚底中心或半身裁切基准。原图人物尺度/姿态本身不一致时先修复或重做，脚本不会猜测身体关键点。会裁掉非透明像素时拒绝输出；像素级外观变化仍需检查。不同源图尺寸拒绝处理，不静默拉伸。

## 完成标准与导入

查看检查图并以实际显示尺寸试摆：发丝/半透明处无明显背景残色，脸与身体不跳位，无裁切缺肢；背景留白、光向和对白安全区匹配。`review` 是缩略图拼图，不替代原尺寸边缘检查或网页预览，也不自动判断水印是否清除。

先让一张代表性素材通过，再处理同套其余状态。只有处理后文件已检查，才用 `vnve import` 登记并绑定实际 ID。记录生成来源、分割/修复方法与已知缺陷，记录中不含密钥或签名URL；路径和检查报告留作本地制作记录，不直接复制到 provenance。保留原图，复用故事身份；不因新素材失败删除已有媒体。没有可用分割/编辑工具，或无法保证关键部位质量时，明确缺口，不把带底图和残留标记当成已完成。
