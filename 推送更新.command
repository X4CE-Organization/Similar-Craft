#!/bin/bash
# 双击本文件：把桌面这份游戏的改动提交并推送到 GitHub（main 分支）
cd "$(dirname "$0")" || exit 1
MSG="${1:-更新 $(date '+%Y-%m-%d %H:%M')}"
echo "西密乐方块世界 Similar Craft —— 推送到 main"
git add -A
if git diff --cached --quiet; then
  echo "没有新改动，直接推送"
else
  git commit -m "$MSG" || exit 1
fi
git push origin main && echo "已推送：https://github.com/X4CE-Organization/Similar-Craft"
