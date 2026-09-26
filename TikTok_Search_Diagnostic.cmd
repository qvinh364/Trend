@echo off
chcp 65001 >nul
title TikTok Trend Radar - Search Diagnostic
cd /d "%~dp0"
echo ====================================================
echo  TikTok Trend Radar - Search Diagnostic
echo ====================================================
node "scripts\run_tiktok_search_diagnostic_interactive.js"
if %ERRORLEVEL% NEQ 0 (
  echo.
  echo [ERROR] Search diagnostic exited with code %ERRORLEVEL%
  pause
)
