@echo off
setlocal
cd /d "%~dp0.."
set "LOG_DIR=%cd%\logs"
set "FLOW_LOG=%LOG_DIR%\real_business_flow.log"

if not exist "%LOG_DIR%" mkdir "%LOG_DIR%"

echo This script is a smoke test only.
echo For actual gameplay, please use start_game.cmd in the version 3.0 root folder.
echo.
echo Running real business flow check...
echo A copy of this output will be appended to:
echo %FLOW_LOG%
echo.
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "& { Set-Location '%cd%'; node --experimental-strip-types .\apps\server\src\scripts\exerciseRealBusinessFlow.ts %* 2>&1 | Tee-Object -FilePath '%FLOW_LOG%' -Append }"
echo.
pause
