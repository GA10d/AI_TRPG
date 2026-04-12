@echo off
setlocal
cd /d "%~dp0.."

set "ROOT_DIR=%cd%"
set "LOG_DIR=%ROOT_DIR%\logs"

if not exist "%LOG_DIR%" mkdir "%LOG_DIR%"

for %%F in ("%ROOT_DIR%\*.log") do (
  if exist "%%~fF" (
    move /Y "%%~fF" "%LOG_DIR%\%%~nxF" >nul
  )
)

endlocal
exit /b 0
