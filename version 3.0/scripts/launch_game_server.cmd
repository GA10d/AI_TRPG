@echo off
setlocal
cd /d "%~dp0.."

set "LOG_DIR=%cd%\logs"
set "SERVER_LOG=%LOG_DIR%\gameplay_server.log"
set "SERVER_ERR_LOG=%LOG_DIR%\gameplay_server.err.log"

if not exist "%LOG_DIR%" mkdir "%LOG_DIR%"
call "%~dp0organize_root_logs.cmd"

echo Writing server logs to:
echo %SERVER_LOG%
echo %SERVER_ERR_LOG%
echo.
echo Starting local gameplay server...
echo.

node --experimental-strip-types .\apps\server\src\server.ts 1>> "%SERVER_LOG%" 2>> "%SERVER_ERR_LOG%"

echo.
echo Gameplay server exited.
echo Check logs if this was unexpected:
echo %SERVER_LOG%
echo %SERVER_ERR_LOG%
echo.
pause

endlocal
