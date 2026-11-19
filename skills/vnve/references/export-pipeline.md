# MP4 导出链路与失败排查

导出卡在 0%、进度极慢、报 `getDirectory` 或 `showSaveFilePicker` 错误、想评估“去掉临时文件”是否值得时读取。导出由浏览器完成，CLI 的 `compile` 只给时间报告，不是视频。

## 正常链路

1. 编辑器按项目 `width/height/fps` 逐帧渲染画布；
2. 用 WebCodecs 的 `VideoEncoder` 编码视频，音频单独编码后封装为 MP4；
3. 编码结果先写入 OPFS 临时文件（`navigator.storage.getDirectory()`）；
4. 关闭临时文件后，把整份文件 `PUT` 到 `/files?path=exports/<name>.mp4`；
5. 服务端写入 workspace 的 `exports/`，页面提示完成；`另存为` 只是把同一文件复制到用户选择的位置。

因此导出耗时主要与帧数成正比：时长 × fps。12 分钟、30fps 的片子约 22,000 帧，1080p 下十几分钟属正常量级，与“是否联网”无关。

## 安全上下文

OPFS 与 File System Access API 只在安全上下文可用：

- `http://<LAN-IP>` 下 `navigator.storage` 不存在，导出第一步就报 `Cannot read properties of undefined (reading 'getDirectory')`；
- 解决方式是 HTTPS 或 `localhost` 访问，而不是改导出参数；
- 证书不受信、被浏览器当作不安全来源时，API 也可能不可用。

## 另存为失败

`showSaveFilePicker` 抛 `NotAllowedError` 的常见原因是站点“文件编辑”权限被禁用，而不是用户手势过期（编辑器在点击事件里同步调用）。原逻辑只处理 `AbortError`，其他错误直接冒泡。

可行的前端兜底：在 `NotAllowedError`/`SecurityError` 时先弹确认框，确认后用 `<a download>` 走浏览器下载；取消则返回。不要静默下载，也不要把系统选择器不可用误报成导出失败。

## 不要轻易替换 OPFS 为流式上传

曾尝试把临时文件改为“编码分块直接 `PUT` 到服务端”，结果导出卡在 0%，取消无响应。原因不是编码器，而是流式请求体与背压/代理链路没有按预期推进：请求未开始消费，编码循环等待写入完成，主流程被阻塞。

如果仍要重试，先满足这些条件：

- 浏览器支持 `fetch(..., { body: ReadableStream, duplex: "half" })`，且服务端接受 chunked PUT；
- 代理不会把 `/files?path=...` 的 PUT 当成 `/files/<name>` 的下载 GET；
- 写端按 `desiredSize`/`pull` 做背压，阻塞时有超时退避，避免死等；
- 取消或失败时能中断请求，并清理服务端可能留下的半文件；
- 先在短项目上验证，再用于长片。

长片文件可达 1 GB 以上，整段缓存进内存不可行；没有可靠流式链路时保留 OPFS 是更稳的选择。

## 提速选项

| 方案 | 影响 | 适用 |
| --- | --- | --- |
| 1080p / 24fps | 帧数减少约 20% | 成片几乎无损 |
| 1600×900 / 24fps | 像素与帧数都下降 | 审片 |
| 1280×720 / 24fps | 编码量约降至三分之一 | 快速预览 |

分辨率与 fps 是项目级设置（`project.update` 的 `width/height/fps`），不是导出对话框选项；改完要重新 `compile` 核对时间，导出后按需还原。

环境侧同样重要：保持导出标签页在前台、关闭占显存的标签、确认 `chrome://gpu` 的 Video Encode 为硬件加速、使用高性能电源计划。后台标签被节流时，导出会明显变慢甚至看似卡住。

## 陷阱清单

- 用 HTTP 局域网地址导出，误判为“编码器坏了”；
- 修改了前端 bundle 后没有强制刷新，仍在跑缓存的旧逻辑；
- 取消导出后服务端留下不完整 mp4，下次导出触发覆盖确认；
- 把 `compile` 的时长当作导出耗时，或把 `check` 通过当作视频验收；
- 在导出期间用 CLI 修改项目，导致页面载入新 revision；
- 只测 10 秒短片就认为长片流式方案可用。

导出完成后仍需实际播放检查首帧、长对白、转场两侧和声音尾部；文件结构正确不等于视听验收通过。