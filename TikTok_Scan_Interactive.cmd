@echo off
chcp 65001 >nul
title TikTok Trend Radar - Interactive Scan
cd /d "%~dp0"
echo ====================================================
echo  TikTok Trend Radar - Interactive Desktop Scan
echo ====================================================
node "scripts\run_tiktok_scan_interactive.js"
if %ERRORLEVEL% NEQ 0 (
  echo.
  echo [ERROR] Interactive scan exited with code %ERRORLEVEL%
  pause
)
