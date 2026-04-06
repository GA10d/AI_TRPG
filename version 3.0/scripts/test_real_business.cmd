@echo off
setlocal
cd /d "%~dp0.."
echo Running real business flow check...
node --experimental-strip-types .\apps\server\src\scripts\exerciseRealBusinessFlow.ts %*
echo.
pause
