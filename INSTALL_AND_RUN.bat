@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title AI OFFICE v0.2.1 Launcher

set "LOG=%~dp0ai-office-launch.log"
>"%LOG%" echo ==== AI OFFICE launcher started: %date% %time% ====

echo ==============================================
echo   AI OFFICE v0.2.1 Subscription Edition
echo ==============================================
echo.
echo Current folder:
echo %CD%
echo.

where node.exe >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Node.js was not found.
  echo [ERROR] Node.js was not found.>>"%LOG%"
  echo.
  echo Please install Node.js LTS from https://nodejs.org/
  echo Then run this file again.
  echo.
  pause
  exit /b 1
)

where npm.cmd >nul 2>&1
if errorlevel 1 (
  echo [ERROR] npm.cmd was not found.
  echo [ERROR] npm.cmd was not found.>>"%LOG%"
  echo Reinstall Node.js LTS and try again.
  echo.
  pause
  exit /b 1
)

for /f "delims=" %%V in ('node --version') do set "NODEVER=%%V"
for /f "delims=" %%V in ('npm.cmd --version') do set "NPMVER=%%V"
echo Node: %NODEVER%
echo npm : %NPMVER%
echo Node: %NODEVER%>>"%LOG%"
echo npm : %NPMVER%>>"%LOG%"
echo.

if not exist "package.json" (
  echo [ERROR] package.json is missing from this folder.
  echo [ERROR] package.json is missing.>>"%LOG%"
  echo Please extract the entire ZIP before running this file.
  echo.
  pause
  exit /b 1
)

if not exist "node_modules\electron\dist\electron.exe" (
  echo [1/2] Installing required package...
  echo [1/2] npm install>>"%LOG%"
  call npm.cmd install >>"%LOG%" 2>&1
  if errorlevel 1 (
    echo.
    echo [ERROR] Package installation failed.
    echo Open this log file and send it to me:
    echo %LOG%
    echo.
    type "%LOG%"
    echo.
    pause
    exit /b 1
  )
) else (
  echo [1/2] Required package is already installed.
  echo [1/2] package already installed>>"%LOG%"
)

echo [2/2] Starting AI OFFICE...
echo [2/2] npm start>>"%LOG%"
call npm.cmd start >>"%LOG%" 2>&1
set "EXITCODE=%ERRORLEVEL%"

echo Electron exit code: %EXITCODE%>>"%LOG%"
if not "%EXITCODE%"=="0" (
  echo.
  echo [ERROR] AI OFFICE failed to start. Exit code: %EXITCODE%
  echo Open this log file and send it to me:
  echo %LOG%
  echo.
  type "%LOG%"
  echo.
  pause
  exit /b %EXITCODE%
)

endlocal
