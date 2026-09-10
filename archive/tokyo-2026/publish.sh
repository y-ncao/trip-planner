#!/usr/bin/env bash
# ============================================================
# Tokyo Trip 一键发布脚本(setup + 重建 HTML + 推送 三合一)
# source of truth = Obsidian 里的 tokyo-2026-trip-packet.md
# 第一次运行:会把仓库落到 ~/src/tokyo-trip,并把本脚本装到那儿叫 publish.sh
# 以后:改完 Obsidian,直接跑  ~/src/tokyo-trip/publish.sh  即可重新发布
# 前置:GitHub CLI 已登录 (brew install gh && gh auth login)
# ============================================================
set -e

VAULT="$HOME/Library/Mobile Documents/iCloud~md~obsidian/Documents/Personal Notes/Travel-Plan/2026-Tokyo"
MD="$VAULT/tokyo-2026-trip-packet.md"
REPO="$HOME/src/tokyo-trip"
NAME="tokyo-trip"
VENV="$HOME/.cache/tokyo-trip-venv"

command -v gh >/dev/null || { echo "需要 GitHub CLI: brew install gh && gh auth login"; exit 1; }
gh auth status >/dev/null 2>&1 || { echo "请先: gh auth login"; exit 1; }
[ -f "$MD" ] || { echo "找不到 markdown: $MD"; exit 1; }

# 0) 用独立 venv 安装 markdown(绕开 macOS PEP668,不污染系统 Python)
if ! "$VENV/bin/python3" -c "import markdown" >/dev/null 2>&1; then
  echo "==> 初始化 Python venv 并安装 markdown(一次性)…"
  python3 -m venv "$VENV"
  "$VENV/bin/python3" -m pip install --quiet --upgrade pip >/dev/null 2>&1 || true
  "$VENV/bin/python3" -m pip install --quiet markdown
fi
PYBIN="$VENV/bin/python3"

mkdir -p "$HOME/src"

# 1) 确保仓库在 ~/src/tokyo-trip
if [ ! -d "$REPO/.git" ]; then
  if [ -d "$HOME/tokyo-trip/.git" ]; then
    echo "==> 移动 ~/tokyo-trip -> $REPO(保留 git 历史/remote)"
    mv "$HOME/tokyo-trip" "$REPO"
  else
    echo "==> 克隆已发布的 $NAME 仓库 -> $REPO"
    gh repo clone "$NAME" "$REPO"
  fi
fi

# 2) 把本脚本装到仓库里,方便以后直接跑
cp "$0" "$REPO/publish.sh" 2>/dev/null || true
chmod +x "$REPO/publish.sh" 2>/dev/null || true

# 3) 同步图片(以 Obsidian 为准)
echo "==> 同步 assets/"
rsync -a --delete "$VAULT/assets/" "$REPO/assets/"
touch "$REPO/.nojekyll"

# 4) 由 Obsidian 的 markdown 生成 index.html
echo "==> 生成 index.html"
MD="$MD" REPO="$REPO" "$PYBIN" - <<'PY'
import os, re, markdown
md = open(os.environ["MD"], encoding="utf-8").read()
md = re.sub(r'([^\n])\n(#{1,6}\s)', r'\1\n\n\2', md)                       # 标题前补空行
md = re.sub(r'!\[[^\]]*\]\((https?://[^)]+)\)', r'<img class="big" src="\1">', md)
md = re.sub(r'!\[\[assets/([^\]\|\\]+)\\?(?:\|\d+)?\]\]', r'<img src="assets/\1">', md)
md = md.replace("?width=1600", "?width=640")
body = markdown.markdown(md, extensions=["tables","fenced_code","attr_list","md_in_html","sane_lists","toc"])
body = re.sub(r'\s+(width|height)="\d+"', '', body)
body = body.replace("<table>", '<div class="tw"><table>').replace("</table>", "</table></div>")
CSS = """
:root{--ink:#1f2328;--accent:#b03a2e;--blue:#1a5fb4;--line:#d8dee4;}
*{box-sizing:border-box;}
body{margin:0;background:#f6f7f5;color:var(--ink);
 font-family:"Noto Sans SC","Noto Sans JP",system-ui,-apple-system,"Hiragino Sans","Microsoft YaHei",sans-serif;line-height:1.6;}
.wrap{max-width:1000px;margin:0 auto;padding:28px 20px 80px;background:#fff;}
h1{font-size:30px;border-bottom:3px solid var(--accent);padding-bottom:10px;}
h2{font-size:22px;margin-top:36px;border-bottom:1px solid var(--line);padding-bottom:6px;color:var(--accent);}
h3{font-size:17px;margin-top:24px;color:#1f3a5f;} h4{font-size:15px;margin-top:16px;}
a{color:var(--blue);text-decoration:none;} a:hover{text-decoration:underline;}
blockquote{border-left:4px solid var(--accent);margin:12px 0;padding:6px 14px;background:#faf6f5;color:#444;}
.tw{overflow-x:auto;margin:14px 0;-webkit-overflow-scrolling:touch;}
table{border-collapse:collapse;min-width:600px;font-size:13px;}
th,td{border:1px solid var(--line);padding:7px 9px;vertical-align:top;}
th{background:#f2efe9;font-weight:600;white-space:nowrap;}
td:first-child{white-space:nowrap;}
td.merged{text-align:center;vertical-align:middle;}
td img,th img{max-height:88px;max-width:130px;width:auto;height:auto;border-radius:4px;margin:2px;}
td img.big,p img.big{max-height:150px;max-width:230px;}
ul,ol{margin:8px 0 8px 22px;} li{margin:4px 0;}
code{background:#f0f1ee;padding:1px 5px;border-radius:3px;font-size:90%;}
hr{border:none;border-top:1px solid var(--line);margin:24px 0;}
@media(max-width:640px){.wrap{padding:16px 10px 60px;}h1{font-size:24px;}table{font-size:12px;}}
"""
head = ('<!DOCTYPE html><html lang="zh"><head><meta charset="utf-8">'
        '<meta name="viewport" content="width=device-width, initial-scale=1">'
        '<title>2026 东京双人旅行计划 · Tokyo Trip</title>'
        '<link rel="preconnect" href="https://fonts.googleapis.com">'
        '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>'
        '<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400;500;700&family=Noto+Sans+JP:wght@400;500;700&display=swap" rel="stylesheet">'
        '<style>' + CSS + '</style></head><body><div class="wrap">')
html = head + body + "</div></body></html>"
open(os.path.join(os.environ["REPO"], "index.html"), "w", encoding="utf-8").write(html)
print("   index.html ok (", len(html), "bytes )")
PY

# 5) 提交并推送
cd "$REPO"
git add -A
if git diff --cached --quiet; then
  echo "(没有改动,无需发布)"
else
  git commit -q -m "update $(date '+%Y-%m-%d %H:%M')"
  git push -q
  echo "✅ 已推送"
fi
OWNER=$(gh api user -q .login)
echo ""
echo "🌐 线上地址: https://$OWNER.github.io/$NAME/"
echo "下次更新: 在 Obsidian 改 markdown -> 跑  $REPO/publish.sh"
