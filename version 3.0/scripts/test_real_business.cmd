@echo off
setlocal
cd /d "%~dp0.."
echo This script is a smoke test only.
echo For actual gameplay, please use start_game.cmd in the version 3.0 root folder.
echo.
echo Running real business flow check...
node --experimental-strip-types .\apps\server\src\scripts\exerciseRealBusinessFlow.ts %*
echo.
pause
