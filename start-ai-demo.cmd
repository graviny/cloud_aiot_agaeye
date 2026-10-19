@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
where node >nul 2>&1
if errorlevel 1 (
  echo Node.js가 필요합니다. README.md를 확인해 주세요.
  pause
  exit /b 1
)
if not exist "node_modules\vite\bin\vite.js" (
  call npm.cmd ci
  if errorlevel 1 exit /b 1
)
if not exist ".venv-ai\Scripts\python.exe" (
  call setup-ai-demo.cmd
  if errorlevel 1 exit /b 1
)
call npm.cmd run demo:ai -- %*
if errorlevel 1 pause
endlocal
