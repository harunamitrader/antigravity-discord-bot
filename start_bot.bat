@echo off
title Antigravity Bot
cd /d "%~dp0"

:loop
echo ========================================
echo  Starting Antigravity Discord Bot...
echo  Press Ctrl+C to stop.
echo ========================================
node discord_bot.js %*

if %ERRORLEVEL% EQU 42 (
    echo.
    echo [RESTART] Restarting in 3 seconds...
    timeout /t 3 /nobreak >nul
    goto loop
)

echo.
echo [STOPPED] Bot stopped. (exit code: %ERRORLEVEL%)
pause
