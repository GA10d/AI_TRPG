@echo off
setlocal
cd /d "%~dp0"

set "GAME_URL=http://127.0.0.1:4316/"
set "HEALTH_URL=http://127.0.0.1:4316/api/health"
set "LOG_DIR=%~dp0logs"
set "SERVER_LOG=%LOG_DIR%\gameplay_server.log"
set "SERVER_ERR_LOG=%LOG_DIR%\gameplay_server.err.log"

if not exist "%LOG_DIR%" mkdir "%LOG_DIR%"

echo Starting AI TRPG 3.0 gameplay server...
start "AI TRPG 3.0 Server" cmd /k call "%~dp0scripts\launch_game_server.cmd"

echo Waiting for local server...
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$deadline=(Get-Date).AddSeconds(20);" ^
  "$ready=$false;" ^
  "do {" ^
  "  try {" ^
  "    $resp=Invoke-WebRequest -UseBasicParsing -Uri '%HEALTH_URL%' -TimeoutSec 2;" ^
  "    if($resp.StatusCode -ge 200 -and $resp.StatusCode -lt 500) {" ^
  "      $ready=$true;" ^
  "      break" ^
  "    }" ^
  "  } catch {}" ^
  "  Start-Sleep -Milliseconds 500" ^
  "} while((Get-Date) -lt $deadline);" ^
  "if($ready) {" ^
  "  Start-Process '%GAME_URL%';" ^
  "  exit 0" ^
  "} else {" ^
  "  exit 1" ^
  "}"

if errorlevel 1 (
  echo.
  echo The gameplay server did not become ready within 20 seconds.
  echo Please check:
  echo %SERVER_LOG%
  echo %SERVER_ERR_LOG%
  echo.
  pause
  exit /b 1
)

echo.
echo Gameplay server is ready.
echo The browser should open automatically to:
echo %GAME_URL%
echo.
pause

endlocal
