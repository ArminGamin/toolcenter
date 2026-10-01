@echo off
setlocal EnableExtensions
cd /d "%~dp0"

REM ToolsAI Control Center: opens the desktop app (it starts its own services).

where npm >nul 2>&1
if errorlevel 1 (
  echo npm not found. Install Node.js, then try again.
  pause
  exit /b 1
)

if not exist "node_modules\electron\dist\electron.exe" (
  echo Installing dependencies...
  call npm install
  if errorlevel 1 (
    echo npm install failed.
    pause
    exit /b 1
  )
)

start "" "%~dp0node_modules\electron\dist\electron.exe" "%~dp0."
exit /b 0
