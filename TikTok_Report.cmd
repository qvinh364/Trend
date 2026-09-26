@echo off
setlocal
cd /d "%~dp0"
if errorlevel 1 (
  echo [ERROR] Cannot enter project directory.
  pause
  exit /b 1
)

where node >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Node.js was not found in PATH.
  pause
  exit /b 1
)

node "scripts\open_tiktok_trend_report.js" %*
set "RC=%ERRORLEVEL%"

if not "%RC%"=="0" (
  echo.
  echo [ERROR] TikTok report failed. Exit code: %RC%
  pause
)

exit /b %RC%
