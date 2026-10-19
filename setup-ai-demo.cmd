@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
if not exist ".venv-ai\Scripts\python.exe" (
  where py >nul 2>&1
  if errorlevel 1 (
    echo Windows용 Python 3.11 또는 3.12가 필요합니다. docs\LAPTOP_AI_DEMO.md를 확인하세요.
    pause
    exit /b 1
  )
  py -3 -m venv .venv-ai
  if errorlevel 1 exit /b 1
)
.venv-ai\Scripts\python.exe -m pip install --disable-pip-version-check -r requirements-laptop-demo.lock.txt
if errorlevel 1 (
  echo 설치 실패. 인터넷 연결과 Python 버전을 확인해 주세요.
  pause
  exit /b 1
)
echo CPU 분석 환경 준비가 끝났습니다. start-ai-demo.cmd로 실행하세요.
endlocal
