@echo off
setlocal
cd /d "%~dp0"
title CHIMERE - serveur

where node >nul 2>nul
if errorlevel 1 goto fallback

echo Demarrage de CHIMERE sur http://localhost:8787
start "" "http://localhost:8787"
node server.js
goto end

:fallback
set "NODE=%USERPROFILE%\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe"
if not exist "%NODE%" (
  echo Node.js est introuvable.
  echo Installe Node.js 18+ depuis https://nodejs.org puis relance ce fichier.
  pause
  exit /b 1
)
echo Demarrage de CHIMERE sur http://localhost:8787
start "" "http://localhost:8787"
"%NODE%" server.js

:end
pause
