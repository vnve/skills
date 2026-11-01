# VNVE 项目介绍站

独立静态介绍站，部署至 <https://vnve.github.io/skills/>，中文位于根路径，英文位于 `en/`。网页正文直接包含在HTML中，JS仅用于复制命令和切换演出示例。

```sh
node scripts/build-site.mjs
python3 -m http.server 8000 --bind 127.0.0.1 --directory .dev/site
```

打开 <http://127.0.0.1:8000/>。构建输出默认位于已忽略的 `.dev/site`，可通过脚本第一个参数指定其他输出目录。需要Node.js，无额外构建依赖。

- `content.mjs`：中英文文案。
- `styles.css`：响应式样式，沿用VNVE深色与蓝色视觉；提供减少动态效果支持。
- `main.js`：命令复制和媒体切换。
- `assets/`：从已有真实演出视频抽取的片段与截图；素材权利说明沿用 `docs/media/README.md`。
- `../scripts/build-site.mjs`：生成HTML、canonical/hreflang、Open Graph、JSON-LD、sitemap、robots和站点llms.txt，并复制README演示视频。

GitHub Actions工作流 `.github/workflows/pages.yml` 构建并发布，不启动创作Agent、不连接本机workspace、不读取服务凭据。若fork或更换域名，需要同步构建脚本的 `base` 与 `repo`。

项目位于GitHub组织域名的子路径，`/skills/robots.txt`无法代替整个组织域名根路径的 `/robots.txt`。站点地图和公开正文可直接访问；元数据、结构化信息和llms.txt不保证搜索引擎或AI自动收录。
