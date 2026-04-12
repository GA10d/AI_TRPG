@echo off
setlocal
cd /d "%~dp0"

set "FLOW_ARGS=%*"
if "%~1"=="" set "FLOW_ARGS=--mode=server_proxy"

call "%~dp0scripts\organize_root_logs.cmd"

echo AI TRPG 3.0 real business flow
echo Working directory: %cd%
echo Arguments: %FLOW_ARGS%
echo.

call .\scripts\test_real_business.cmd %FLOW_ARGS%

endlocal
