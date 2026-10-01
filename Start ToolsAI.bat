@echo off
setlocal EnableExtensions
cd /d "%~dp0"

REM ToolsAI Control Center — desktop launcher
REM Ensures bridge is up, then opens the tools home (orbit).

REM AMD GPU (RX 5700 XT): prefer Vulkan compute for Ollama when available
if not defined OLLAMA_VULKAN set OLLAMA_VULKAN=1
if not defined OLLAMA_NUM_PARALLEL set OLLAMA_NUM_PARALLEL=1
if not defined OLLAMA_MAX_LOADED_MODELS set OLLAMA_MAX_LOADED_MODELS=1

where npm >nul 2>&1
if errorlevel 1 (
  echo npm not found. Install Node.js, then try again.
  pause
  exit /b 1
)

if not exist "node_modules\" (
  echo Installing dependencies…
  call npm install
  if errorlevel 1 (
    echo npm install failed.
    pause
    exit /b 1
  )
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0wait-and-open.ps1"
exit /b %ERRORLEVEL%
