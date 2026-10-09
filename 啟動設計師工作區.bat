@echo off
chcp 65001 >nul
rem Windows: double-click to open your Scopebook workspace in the browser.
cd /d "%~dp0"
if not exist node_modules (
  echo 第一次使用，正在安裝（只需要一次）…
  call npm install || (echo 安裝失敗。請確認已安裝 Node.js：https://nodejs.org & pause & exit /b 1)
)
echo 工作區開啟中… 使用時請保留這個視窗，關掉視窗就會停止。
call npm run dev
