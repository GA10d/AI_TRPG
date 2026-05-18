@echo off
setlocal
cd /d "%~dp0.."

set "CSC=%WINDIR%\Microsoft.NET\Framework64\v4.0.30319\csc.exe"
if not exist "%CSC%" set "CSC=%WINDIR%\Microsoft.NET\Framework\v4.0.30319\csc.exe"

if not exist "%CSC%" (
  echo Could not find the .NET Framework C# compiler.
  echo Expected csc.exe under %%WINDIR%%\Microsoft.NET\Framework64\v4.0.30319
  exit /b 1
)

"%CSC%" /nologo /target:winexe /platform:anycpu /out:"AI_TRPG_3_Launcher.exe" /reference:System.Windows.Forms.dll /reference:System.dll "scripts\AiTrpgLauncher.cs"
if errorlevel 1 exit /b 1

echo Built AI_TRPG_3_Launcher.exe
endlocal
