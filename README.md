# Trip Planner · 旅行计划网站

纯静态网站，托管在 GitHub Pages。**根目录永远放「当前行程」**，旧行程搬进 `archive/<行程名>/` 归档。

- 当前行程（2026-10-10 → 10-18 巴黎 + 南法生日旅行）：https://y-ncao.github.io/trip-planner/
- 已归档（2026 东京）：https://y-ncao.github.io/trip-planner/archive/tokyo-2026/

## 文件夹结构

```text
trip-planner/
├── index.html            当前行程页面（单文件，CSS / JS 内联）
├── assets/photos/        当前行程图片（Wikimedia Commons，作者与协议列在页面 §8）
├── archive/
│   └── tokyo-2026/       2026 东京：index.html + assets/ + scripts/，自包含
├── publish.sh            提交并推送，GitHub Pages 自动更新
├── .nojekyll             让 GitHub Pages 跳过 Jekyll，按原样托管
└── README.md
```

页面结构沿用东京版：左侧导航、旅程总览、机票、酒店、每日行程表（模块 / 地点 / 图片 / 备注）、必吃榜、景点清单、出发前准备、Archive。

- **每日地图**读取当天行程表里地点链接的 `data-lat` / `data-lng`。改了表格里的地点，地图编号和「Google Maps 路线」按钮会自动跟着变，不用单独维护地图数据。底图来自 OpenStreetMap / CARTO，Leaflet 从 cdnjs 加载。
- **图片**全部存在本地 `assets/`，不引用远程图片。

## 更新并发布

直接编辑 `index.html`（或往 `assets/` 加图片），然后运行：

```bash
./publish.sh "更新说明"
```

脚本只提交网站相关的文件（`index.html`、`assets/`、`archive/`、`README.md`、`publish.sh`、`.nojekyll`）。推送后大约 1 分钟线上生效。

本地预览：

```bash
python3 -m http.server 8765
```

然后打开 http://localhost:8765/ 。

## 归档当前行程，开始下一个

```bash
mkdir -p archive/paris-2026
git mv index.html archive/paris-2026/index.html
git mv assets archive/paris-2026/assets
```

然后在根目录放新行程的 `index.html` 和 `assets/`，并在新旧两个页面左侧导航的「Trip Planner」区块里互相加上链接。页面里的图片都用相对路径，整个文件夹一起搬过去就不会断图。

## 注意

- GitHub Pages 免费版的页面是**公开**的，拿到 URL 的人都能打开。确认号、护照号这类敏感信息尽量不要写进页面。
- 这个仓库原名 `tokyo-trip`，2026-09 改名为 `trip-planner`。旧地址 `https://y-ncao.github.io/tokyo-trip/` 已经失效，东京行程改在上面的 archive 地址访问。
