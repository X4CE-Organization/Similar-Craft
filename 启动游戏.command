#!/bin/bash
# 双击本文件：启动本地服务器并打开游戏（浏览器会禁止本地文件的存档读写，所以要走 http）
cd "$(dirname "$0")" || exit 1
PORT=8931
URL="http://localhost:$PORT/"
echo "西密乐方块世界 Similar Craft —— 制作人：武士芝士"
if nc -z 127.0.0.1 $PORT 2>/dev/null; then
  echo "本地服务器已经在运行，直接打开 $URL"
  open "$URL"
  exit 0
fi
echo "本地服务器：$URL   （关掉这个终端窗口就能停止服务器）"
(sleep 1 && open "$URL") &
python3 -m http.server $PORT
