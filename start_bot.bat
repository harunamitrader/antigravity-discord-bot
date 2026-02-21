@echo off
title Antigravity Bot: Starting...
cd /d "%~dp0"
echo Starting Antigravity Discord Bot...
echo [INFO] Press Ctrl+C to stop.
node src/index.js
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Bot crashed or stopped with error.
    pause
)
pause
