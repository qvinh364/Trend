@echo off
chcp 65001 > nul
title Anti PTIT Server
cd /d "%~dp0"
cls
echo ========================================================
echo  🐧 ANTI PTIT SERVER ĐANG KHỞI ĐỘNG (chi mat 1 giay)...
echo ========================================================
echo.
:: Tu dong mo file start.html tren trinh duyet
start "" "start.html"

echo  Server dang hoat dong tai http://localhost:3000
echo  Trang start.html da duoc mo tren trinh duyet.
echo.
echo  -------------------------------------------------------
echo  [Luu y] KHI DUNG XONG:
echo  Ban chi can DONG cua so nay (bam dau X) de tat server!
echo  -------------------------------------------------------
echo.
node src/server.js
pause
