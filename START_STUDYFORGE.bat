@echo off
setlocal
cd /d "%~dp0"

echo ========================================
echo        STUDYFORGE - LOCAL MODE
echo ========================================
echo.

echo Checking JavaScript...
call npm.cmd run check
if errorlevel 1 (
  echo.
  echo JavaScript validation failed.
  pause
  exit /b 1
)

echo.
echo Starting StudyForge...
start "" "http://localhost:8787"
call npm.cmd start
