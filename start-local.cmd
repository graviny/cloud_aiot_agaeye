@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
where node >nul 2>&1
if errorlevel 1 (
  echo Node.js가 필요합니다. README.md의 실행 안내를 확인해 주세요.
  pause
  exit /b 1
)
powershell.exe -NoProfile -Command "try { $taskPage = Invoke-WebRequest -Uri 'http://127.0.0.1:5173/' -UseBasicParsing -TimeoutSec 2; if ($taskPage.StatusCode -eq 200 -and $taskPage.Content -like '*aga-eye-web*' -and $taskPage.Content -like '*/@vite/client*') { exit 0 }; exit 2 } catch { if ($_.Exception.Response) { exit 2 }; exit 1 }" >nul 2>&1
set "task_probe=%errorlevel%"
if "%task_probe%"=="0" (
  echo 아가 아이 서버가 이미 실행 중입니다. 기존 웹 화면을 엽니다.
  echo http://127.0.0.1:5173
  start "" "http://127.0.0.1:5173"
  exit /b 0
)
if "%task_probe%"=="2" (
  echo 5173 포트에서 다른 웹 서비스가 응답하고 있습니다.
  echo 해당 서비스를 확인한 후 다시 실행해 주세요.
  pause
  exit /b 1
)
if not exist "node_modules\vite\bin\vite.js" (
  echo 처음 실행에 필요한 패키지를 설치합니다.
  call npm.cmd ci
  if errorlevel 1 (
    echo 설치에 실패했습니다. 인터넷 연결과 README.md를 확인해 주세요.
    pause
    exit /b 1
  )
)
echo.
echo 아가 아이 웹 화면: http://127.0.0.1:5173
echo 브라우저에서 위 주소를 여세요. 종료하려면 Ctrl+C를 누르세요.
echo.
call npm.cmd run dev
if errorlevel 1 pause
endlocal
