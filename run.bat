@echo off
chcp 65001 > nul
title 치지직 x 포켓몬 배틀 x bHaptics
cd /d "%~dp0"

echo ====================================================
echo   치지직 x 포켓몬 배틀 x bHaptics 촉각슈트 시스템
echo ====================================================
echo.

python server.py
pause