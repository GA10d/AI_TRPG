@echo off
setlocal
cd /d "%~dp0"

set "GAME_URL=http://127.0.0.1:4316/"
set "HEALTH_URL=http://127.0.0.1:4316/api/health"

echo Starting AI TRPG 3.0 gameplay server...
start "AI TRPG 3.0 Server" cmd /k "cd /d ""%~dp0"" && node --experimental-strip-types .\apps\server\src\server.ts"

echo Waiting for local server...
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$deadline=(Get-Date).AddSeconds(20);" ^
  "do {" ^
  "  try {" ^
  "    $resp=Invoke-WebRequest -UseBasicParsing -Uri '%HEALTH_URL%' -TimeoutSec 2;" ^
  "    if($resp.StatusCode -ge 200 -and $resp.StatusCode -lt 500) {" ^
  "      Start-Process '%GAME_URL%';" ^
  "      exit 0" ^
  "    }" ^
  "  } catch {}" ^
  "  Start-Sleep -Milliseconds 500" ^
  "} while((Get-Date) -lt $deadline);" ^
  "Start-Process '%GAME_URL%';" ^
  "exit 0"

echo.
echo Gameplay server has been launched.
echo The browser should open automatically to:
echo %GAME_URL%
echo.
pause

endlocal
