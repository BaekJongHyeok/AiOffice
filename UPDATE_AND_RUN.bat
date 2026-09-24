@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title AI OFFICE - Update and Run

set "LOG=%~dp0ai-office-launch.log"
>>"%LOG%" echo ==== UPDATE started: %date% %time% ====

echo ==============================================
echo   AI OFFICE - Update and Run
echo ==============================================
echo.

where git.exe >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Git is not installed.
  echo Install Git for Windows from https://git-scm.com/download/win
  echo Then run SETUP_GITHUB.bat once.
  pause
  exit /b 1
)

if not exist ".git" (
  echo [ERROR] This folder is not connected to GitHub yet.
  echo Run SETUP_GITHUB.bat first.
  pause
  exit /b 1
)

git remote get-url origin >nul 2>&1
if errorlevel 1 (
  echo [ERROR] GitHub remote 'origin' is not configured.
  echo Run SETUP_GITHUB.bat first.
  pause
  exit /b 1
)

echo [1/3] Checking local source changes...
for /f "delims=" %%S in ('git status --porcelain --untracked-files=no') do set "DIRTY=1"
if defined DIRTY (
  echo.
  echo [STOP] Source files have local changes.
  echo I will not overwrite them automatically.
  echo Commit/stash the changes first, or ask ChatGPT to help reconcile them.
  echo.
  git status --short
  pause
  exit /b 2
)

echo [2/3] Getting latest version from GitHub...
git pull --ff-only origin main >>"%LOG%" 2>&1
if errorlevel 1 (
  echo [ERROR] git pull failed.
  echo See: %LOG%
  type "%LOG%"
  pause
  exit /b 1
)

where npm.cmd >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Node.js/npm is not installed.
  echo Install Node.js LTS from https://nodejs.org/
  pause
  exit /b 1
)

echo [3/3] Syncing packages and starting AI OFFICE...
call npm.cmd install --no-fund --no-audit >>"%LOG%" 2>&1
if errorlevel 1 (
  echo [ERROR] npm install failed.
  echo See: %LOG%
  type "%LOG%"
  pause
  exit /b 1
)

call npm.cmd start >>"%LOG%" 2>&1
set "EXITCODE=%ERRORLEVEL%"
if not "%EXITCODE%"=="0" (
  echo [ERROR] AI OFFICE exited with code %EXITCODE%.
  echo See: %LOG%
  type "%LOG%"
  pause
  exit /b %EXITCODE%
)
endlocal
