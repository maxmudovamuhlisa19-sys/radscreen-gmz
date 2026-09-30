@echo off
chcp 65001 >nul
title RadSkrin - server
cd /d "%~dp0"

rem RadSkrin avtomatik ishga tushiruvchi skript (Windows)
rem 1) Node bormi  2) Server turibmi  3) Ishga tushiradi  4) Brauzerda ochadi

where node >nul 2>nul
if errorlevel 1 (
  echo [XATO] Node topilmadi. https://nodejs.org orqali o'rnating.
  pause
  exit /b 1
)

rem server allaqachon ishlayaptimi? (port 3000)
netstat -ano | findstr ":3000 " | findstr "LISTENING" >nul
if not errorlevel 1 (
  echo Server allaqachon ishlab turibdi - sahifa ochilmoqda...
  start "" "http://localhost:3000"
  exit /b 0
)

echo RadSkrin server ishga tushirilmoqda...
start "RadSkrin server" /min node server.js --port 3000

set tries=0
:wait
curl -s http://localhost:3000/api/health >nul 2>nul
if not errorlevel 1 goto ready
set /a tries+=1
if %tries% geq 20 goto failed
timeout /t 1 /nobreak >nul
goto wait

:ready
echo.
echo   [OK] RadSkrin server tayyor: http://localhost:3000
echo.
start "" "http://localhost:3000"
exit /b 0

:failed
echo.
echo [XATO] server 20 soniyada ishga tushmadi.
echo        Qoldiq buyruq: node server.js --port 3000
pause
exit /b 1
