@echo off
setlocal
cd /d "%~dp0"

node "scripts\tiktok_manual_login.js"

if errorlevel 1 (
  echo.
  echo [ERROR] TikTok login script failed.
  echo.
  pause
  exit /b 1
)

endlocal
exit /b 0
