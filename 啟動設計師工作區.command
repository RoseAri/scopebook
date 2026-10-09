#!/bin/bash
# Mac: double-click to open your Scopebook workspace in the browser.
cd "$(dirname "$0")"
if [ ! -d node_modules ]; then
  echo "第一次使用，正在安裝（只需要一次）…"
  npm install || { echo "安裝失敗。請確認已安裝 Node.js：https://nodejs.org"; read -n 1; exit 1; }
fi
echo "工作區開啟中… 使用時請保留這個視窗，關掉視窗就會停止。"
npm run dev
