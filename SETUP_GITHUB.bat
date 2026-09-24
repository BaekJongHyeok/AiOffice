@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title AI OFFICE - GitHub Setup

echo ==============================================
echo   AI OFFICE - One-time GitHub Setup
echo ==============================================
echo.

where git.exe >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Git for Windows is not installed.
  echo Install it from: https://git-scm.com/download/win
  echo Then run this file again.
  pause
  exit /b 1
)

if not exist "package.json" (
  echo [ERROR] package.json is missing. Run this from the AI OFFICE folder.
  pause
  exit /b 1
)

if not exist ".git" (
  echo [1/5] Creating local Git repository...
  git init
  if errorlevel 1 goto :fail
)

git branch -M main

echo [2/5] Checking Git identity...
for /f "delims=" %%A in ('git config user.name 2^>nul') do set "GITNAME=%%A"
for /f "delims=" %%A in ('git config user.email 2^>nul') do set "GITEMAIL=%%A"
if not defined GITNAME (
  set /p "GITNAME=Git display name (example: kh896): "
  if not defined GITNAME goto :fail
  git config user.name "%GITNAME%"
)
if not defined GITEMAIL (
  set /p "GITEMAIL=GitHub email: "
  if not defined GITEMAIL goto :fail
  git config user.email "%GITEMAIL%"
)

echo [3/5] Creating initial commit if needed...
git add .
git diff --cached --quiet
if errorlevel 1 (
  git commit -m "AI OFFICE project setup"
  if errorlevel 1 goto :fail
) else (
  echo Nothing new to commit.
)

echo.
echo Create an EMPTY GitHub repository in your browser first.
echo Do NOT add README, .gitignore, or license on GitHub.
echo Then copy its HTTPS URL, for example:
echo https://github.com/YOUR_NAME/ai-office.git
echo.
set /p "REPOURL=Paste GitHub repository HTTPS URL: "
if not defined REPOURL goto :fail

git remote get-url origin >nul 2>&1
if errorlevel 1 (
  git remote add origin "%REPOURL%"
) else (
  git remote set-url origin "%REPOURL%"
)

echo [4/5] Uploading project to GitHub...
git push -u origin main
if errorlevel 1 (
  echo.
  echo [ERROR] Push failed. GitHub may require you to sign in through Windows Credential Manager/browser.
  echo After signing in, run SETUP_GITHUB.bat again.
  pause
  exit /b 1
)

echo [5/5] Setup complete.
echo.
echo From now on, use UPDATE_AND_RUN.bat to update and start AI OFFICE.
echo You can also use the 'Update and Restart' button inside AI OFFICE.
pause
exit /b 0

:fail
echo.
echo [ERROR] Setup was not completed.
pause
exit /b 1
