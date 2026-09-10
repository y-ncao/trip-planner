# Google Maps source photo workflow

记录日期：2026-06-29

用途：给东京行程页面补本地特色图片时，从 Google Maps 页面请求里抓取真实照片资源，保存到本地 `assets/`，再由 `index.html` 引用本地文件。这个流程避免使用远程 Google 图片 URL，也避免只截到 Maps 页面里的小卡片。

## 这次成功的关键

- 用 Playwright 打开 Google Maps search 页面，而不是直接拼图片 URL。
- 监听页面加载过程中的 image response，并过滤 `googleusercontent.com` 图片资源。
- 同时读取页面上实际展示的 `document.images`，优先选择自然尺寸大、页面中实际显示过、文件体积足够的图片。
- 下载时把 Google 图片尺寸参数替换成较大的 `=w1600-h1200-k-no`，保存为本地文件。
- 对失败 query 用更具体的日文/英文店名、建筑名、菜品名做 fallback。
- 餐厅单独跑一轮 `店名 + 菜品` query，尽量从店面图换成餐食图。
- 最后做全页图片引用检查、重复图检查、浏览器渲染检查。

## 主要脚本

### 下载 Google Maps source photo

脚本：

```bash
scripts/download_google_maps_photos.mjs
```

输入是一个 JSON array，每项至少包含：

```json
{
  "query": "Tsubame Grill Shinagawa",
  "outputBase": "001-tsubame-grill-shinagawa"
}
```

如果没有 `outputBase`，脚本会按目标顺序自动生成：

```text
001-query-slug.jpg
```

常用命令：

```bash
NODE_PATH=/Users/yanc/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules \
/Users/yanc/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node \
scripts/download_google_maps_photos.mjs \
/private/tmp/tokyo_itinerary_image_targets.json \
assets/itinerary-photos
```

只跑前几个样本：

```bash
NODE_PATH=/Users/yanc/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules \
LIMIT=2 \
/Users/yanc/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node \
scripts/download_google_maps_photos.mjs \
/private/tmp/tokyo_itinerary_image_targets.json \
assets/itinerary-photos
```

避免覆盖主结果 JSON 时，用 `RESULT_PREFIX`：

```bash
NODE_PATH=/Users/yanc/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules \
RESULT_PREFIX=_fallback \
/Users/yanc/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node \
scripts/download_google_maps_photos.mjs \
scripts/google_maps_photo_fallback_targets.json \
assets/itinerary-photos
```

### Section 4 批量替换图片引用

脚本：

```bash
scripts/apply_itinerary_feature_photos.mjs
```

作用：

- 读取 `/private/tmp/tokyo_itinerary_image_targets.json`
- 按 row index 找到 Section 4 每日 itinerary 表格行
- 只替换每行的“特色图片”列
- 写入 `assets/itinerary-photos/NNN-*.jpg|png|webp`

命令：

```bash
node scripts/apply_itinerary_feature_photos.mjs
```

### Contact sheet review

脚本：

```bash
scripts/make_itinerary_photo_contact_sheet.py
```

命令：

```bash
/Users/yanc/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3 \
scripts/make_itinerary_photo_contact_sheet.py
```

输出：

```text
/private/tmp/tokyo-itinerary-photo-contact.jpg
```

用途：

- 一眼扫 108 张图是否相关。
- 找菜单牌、太小图、店门过多、错误地点。
- 检查同编号多文件和临时 `place.*` 文件。

### 浏览器渲染检查

脚本：

```bash
scripts/verify_page_render.mjs
```

命令：

```bash
NODE_PATH=/Users/yanc/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules \
/Users/yanc/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node \
scripts/verify_page_render.mjs
```

检查：

- `brokenImages` 必须为空。
- `.itinerary-table-wrap td` 不应有 overflow。

## Fallback target 文件

这次保留了三组 target 文件，方便复跑：

- `scripts/google_maps_photo_fallback_targets.json`
- `scripts/google_maps_photo_fallback_targets_2.json`
- `scripts/google_maps_food_photo_targets.json`

经验：

- 组合 query 容易失败，例如 `Freitag Store Tokyo GINZA BONGENCOFFEE Ginza Brazil`，应拆成主店名。
- 日文地点常比英文 query 稳，例如 `東京駅丸の内駅舎`、`河口湖駅`、`新宿中央公園`。
- 餐厅要加菜品关键词，例如 `海鮮丼`、`とんかつ`、`ほうとう`、`おにぎり`。

## 质量规则

补每日行程特色图时：

- 酒店早餐、入住、整理行李、纯通勤、航班、机场、TBD 泛餐不补图。
- 具体地点、店、景点、餐厅应该至少有 1 张本地图片。
- 一行多个地点时，可以只选最有代表性的 1 张；必要时再扩展到多图。
- 餐厅优先餐食，不优先菜单牌；如果 Google Maps 不稳定给菜品图，店面/店内图可以作为 fallback。
- HTML 里不要引用远程 Google 图片 URL，只引用本地 `assets/...`。
- 全页不要重复使用同一张 `img src`。

## 最后 sanity check

本次用过的检查：

```bash
python3 - <<'PY'
from html.parser import HTMLParser
from pathlib import Path
from collections import Counter

class P(HTMLParser):
    def __init__(self):
        super().__init__()
        self.src = []
    def handle_starttag(self, tag, attrs):
        if tag == "img":
            self.src.append(dict(attrs).get("src", ""))

html = Path("index.html").read_text()
p = P()
p.feed(html)
missing = [
    s for s in p.src
    if s and not s.startswith(("http://", "https://")) and not Path(s).exists()
]
dups = [(s, c) for s, c in Counter(p.src).items() if c > 1]
print("images", len(p.src), "missing", len(missing), "duplicate src", len(dups))
for s in missing[:20]:
    print("MISSING", s)
for s, c in dups[:80]:
    print(c, s)
PY
```

期望：

```text
missing 0
duplicate src 0
```

再跑：

```bash
NODE_PATH=/Users/yanc/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules \
/Users/yanc/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node \
scripts/verify_page_render.mjs
```

期望：

```json
{
  "brokenImages": [],
  "overflowingCells": []
}
```

## 这次结果

- 新增本地图片目录：`assets/itinerary-photos/`
- 新增本地 source photos：108 张
- Section 4 替换图片格：108 个
- 全页本地图片缺失：0
- 全页重复 `img src`：0
- 浏览器渲染：无 broken image，无 itinerary cell overflow
- Commit：`331f03a Add local itinerary feature photos`
