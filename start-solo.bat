@echo off
setlocal
cd /d "%~dp0"
title CHIMERE - mode solo

where python >nul 2>nul
if errorlevel 1 (
  echo Python est introuvable.
  pause
  exit /b 1
)

echo CHIMERE solo sur http://localhost:8000
start "" "http://localhost:8000"
rem Serveur sans cache : le navigateur recharge toujours les fichiers a jour.
if exist "tools\solo-server.py" (
  python "tools\solo-server.py" 8000
) else (
  python -m http.server 8000
)
pause
