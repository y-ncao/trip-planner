#!/usr/bin/env bash
# ============================================================
# Trip Planner 发布脚本：提交网站改动并推送，GitHub Pages 自动更新
# 用法：./publish.sh ["提交说明"]
# 前置：GitHub CLI 已登录 (brew install gh && gh auth login)
# ============================================================
set -euo pipefail

cd "$(dirname "$0")"
command -v gh >/dev/null || { echo "需要 GitHub CLI: brew install gh && gh auth login"; exit 1; }

# 只提交网站相关文件，避免把本地杂项带进仓库
paths=()
for p in index.html assets archive README.md publish.sh .nojekyll; do
  [ -e "$p" ] && paths+=("$p")
done
git add -A -- "${paths[@]}"

if git diff --cached --quiet; then
  echo "(没有改动，无需发布)"
else
  git commit -q -m "${1:-update $(date '+%Y-%m-%d %H:%M')}"
  git push -q
  echo "✅ 已推送"
fi

repo=$(gh repo view --json nameWithOwner -q .nameWithOwner)
echo "🌐 线上地址: https://${repo%%/*}.github.io/${repo##*/}/"
