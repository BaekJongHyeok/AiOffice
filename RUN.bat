@echo off
setlocal
cd /d "%~dp0"
title AI OFFICE

where npm.cmd >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Node.js/npm is not installed.
  echo Install Node.js LTS from https://nodejs.org/
  pause
  exit /b 1
)

if not exist "node_modules\electron\dist\electron.exe" (
  echo Installing required packages...
  call npm.cmd install --no-fund --no-audit
  if errorlevel 1 (
    echo [ERROR] npm install failed.
    pause
    exit /b 1
  )
)

call npm.cmd start
if errorlevel 1 pause
endlocal
